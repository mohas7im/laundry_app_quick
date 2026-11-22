from decimal import Decimal

from accounts.test_management import Base, make_role
from accounts.tests import body, error_fields
from masters.models import CommonMaster
from .models import Item, Price, PriceList, Service, Upcharge


def make_item(name, category='other', pricing_type='unit', **fields):
    """An item with common master values given by code."""
    return Item.objects.create(name=name, category=CommonMaster.get('ITEM_CATEGORY', category),
                               pricing_type=CommonMaster.get('PRICING_TYPE', pricing_type), **fields)


def make_upcharge(name, amount, charge_type='fixed', **fields):
    return Upcharge.objects.create(name=name, amount=amount,
                                   charge_type=CommonMaster.get('UPCHARGE_TYPE', charge_type), **fields)


class CatalogueApiTests(Base):
    def setUp(self):
        super().setUp()
        self.as_owner()

    def post(self, url, data):
        return self.client.post(url, data, format='json')

    def test_services_and_items_crud_with_unique_names(self):
        res = self.post('/api/services/', {'name': ' Dry Clean ', 'sort_order': 1})
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(body(res)['name'], 'Dry Clean')
        self.assertEqual(error_fields(self.post('/api/services/', {'name': 'dry clean'})), {'name'})

        res = self.post('/api/items/', {'name': 'Kandura', 'category': 'men', 'pricing_type': 'unit'})
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(error_fields(self.post('/api/items/', {'name': 'X', 'pricing_type': 'per_day'})),
                         {'pricing_type'})

        item_id = body(res)['id']
        self.assertEqual(self.client.patch(f'/api/items/{item_id}/', {'is_active': False}, format='json')
                         .status_code, 200)
        self.assertEqual(self.client.delete(f'/api/items/{item_id}/').status_code, 200)

    def test_exactly_one_default_price_list(self):
        walk_in = body(self.post('/api/price-lists/', {'name': 'Walk-in'}))
        self.assertTrue(walk_in['is_default'])  # the first one is the default

        online = body(self.post('/api/price-lists/', {'name': 'Online'}))
        self.assertFalse(online['is_default'])

        # make Online the default: Walk-in stops being it
        res = self.client.patch(f"/api/price-lists/{online['id']}/", {'is_default': True}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(body(res)['is_default'])
        self.assertEqual(list(PriceList.objects.filter(is_default=True).values_list('name', flat=True)), ['Online'])

        # the default can't be switched off, made inactive or deleted
        url = f"/api/price-lists/{online['id']}/"
        res = self.client.patch(url, {'is_default': False}, format='json')
        self.assertEqual(res.data['errors'][0]['error_code'], 'OPERATION_NOT_ALLOWED')
        self.assertEqual(error_fields(self.client.patch(url, {'is_active': False}, format='json')), {'is_active'})
        res = self.client.delete(url)
        self.assertEqual((res.status_code, res.data['errors'][0]['error_code']), (400, 'OPERATION_NOT_ALLOWED'))
        self.assertEqual(self.client.delete(f"/api/price-lists/{walk_in['id']}/").status_code, 200)

    def test_price_grid(self):
        dry = Service.objects.create(name='Dry Clean', sort_order=1)
        wash = Service.objects.create(name='Wash & Iron', sort_order=2)
        Service.objects.create(name='Old service', is_active=False)
        shirt = make_item('Shirt', category='men')
        laundry = make_item('Laundry by weight', pricing_type='per_kg')
        walk_in = PriceList.objects.create(name='Walk-in', is_default=True)
        url = f'/api/prices/{walk_in.id}/'

        grid = body(self.client.get(url))
        self.assertEqual([s['name'] for s in grid['services']], ['Dry Clean', 'Wash & Iron'])  # active only
        self.assertEqual({i['name'] for i in grid['items']}, {'Shirt', 'Laundry by weight'})
        self.assertEqual(grid['prices'], [])

        res = self.client.put(url, {'prices': [
            {'item': str(shirt.id), 'service': str(dry.id), 'price': '15.00', 'express_price': '25.00'},
            {'item': str(shirt.id), 'service': str(wash.id), 'price': '8.5', 'extra_days': 1},
            {'item': str(laundry.id), 'service': str(wash.id), 'price': '12', 'min_price': '30'},
        ]}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['message'], 'Prices saved successfully.')
        self.assertEqual(len(body(res)['prices']), 3)
        cell = Price.objects.get(item=shirt, service=wash)
        self.assertEqual((cell.price, cell.extra_days), (Decimal('8.50'), 1))

        # change one, clear one
        self.client.put(url, {'prices': [
            {'item': str(shirt.id), 'service': str(dry.id), 'price': '16'},
            {'item': str(shirt.id), 'service': str(wash.id), 'price': None},
        ]}, format='json')
        self.assertEqual(Price.objects.get(item=shirt, service=dry).price, Decimal('16.00'))
        self.assertEqual(Price.objects.get(item=shirt, service=dry).express_price, None)
        self.assertFalse(Price.objects.filter(item=shirt, service=wash).exists())

        # bad input
        bad = self.client.put(url, {'prices': [
            {'item': str(shirt.id), 'service': str(dry.id), 'price': '-1'},
        ]}, format='json')
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(error_fields(bad), {'prices[0].price'})
        dupe = self.client.put(url, {'prices': [
            {'item': str(shirt.id), 'service': str(dry.id), 'price': '1'},
            {'item': str(shirt.id), 'service': str(dry.id), 'price': '2'},
        ]}, format='json')
        self.assertEqual(error_fields(dupe), {'prices'})

    def test_upcharge_percent_limit(self):
        self.assertEqual(self.post('/api/upcharges/', {'name': 'Stain removal', 'amount': '5'}).status_code, 201)
        res = self.post('/api/upcharges/', {'name': 'Urgent', 'charge_type': 'percent', 'amount': '150'})
        self.assertEqual(error_fields(res), {'amount'})
        self.assertEqual(self.post('/api/upcharges/', {'name': 'Urgent', 'charge_type': 'percent',
                                                       'amount': '50'}).status_code, 201)

    def test_permissions(self):
        # prices.view alone can read the grid and the lists it needs, not change anything
        viewer = make_role('Price viewer', ['prices.view'])
        self.client.force_authenticate(self.make_user('pv@shop.com', roles=[(viewer, None)]))
        walk_in = PriceList.objects.create(name='Walk-in', is_default=True)
        self.assertEqual(self.client.get(f'/api/prices/{walk_in.id}/').status_code, 200)
        for url in ('/api/services/', '/api/items/', '/api/price-lists/'):
            self.assertEqual(self.client.get(url).status_code, 200, url)
        self.assertEqual(self.client.get('/api/upcharges/').status_code, 403)
        self.assertEqual(self.client.put(f'/api/prices/{walk_in.id}/', {'prices': []}, format='json').status_code, 403)
        self.assertEqual(self.post('/api/services/', {'name': 'X'}).status_code, 403)

        # nothing without a catalogue permission
        self.client.force_authenticate(self.make_user('none@shop.com', roles=[(self.cashier, self.dxb)]))
        self.assertEqual(self.client.get('/api/services/').status_code, 403)

    def test_paging_and_search(self):
        for i in range(1, 13):
            make_item(f'Item {i:02}', sort_order=i)
        page = body(self.client.get('/api/items/?page_number=2&page_size=5&search_term=item'))
        self.assertEqual(([i['name'] for i in page['items']], page['total_count']),
                         (['Item 06', 'Item 07', 'Item 08', 'Item 09', 'Item 10'], 12))
