"""CSV price list import, price history, pieces per item, ready-by rules per service and branch."""
from datetime import date, datetime, time
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.test import SimpleTestCase

from accounts.test_management import Base
from accounts.tests import body, error_fields
from orders.models import Order
from orders.pricing import suggested_ready_by
from orders.tests import OrderFixture
from .models import Item, Price, PriceChange, PriceList, Service
from .tests import make_item

D = Decimal
DUBAI = ZoneInfo('Asia/Dubai')

CSV = '''section,product,price_aed,express_price_aed,pieces,active,online
Dry Cleaning,Abaya,13.65,27.30,1,Y,
Dry Cleaning,"Suit, 2pc",21.00,42.00,2,Y,
Wash Laundry,Kandura,7.08,14.16,1,Y,
Wash Laundry,Kandura,9.00,18.00,1,Y,
Wash Laundry,Old item,5.00,,1,N,
Dryclean online,Abaya,12.00,24.00,1,Y,Y
Laundry online,Kandura,6.50,13.00,1,Y,Y
'''


class ImportTests(Base):
    def setUp(self):
        super().setUp()
        self.as_owner()

    def post(self, **data):
        return self.client.post('/api/catalogue/import/', {'csv': CSV, **data}, format='json')

    def test_preview_then_import(self):
        res = self.post()
        self.assertEqual(res.status_code, 200, res.data)
        preview = body(res)
        self.assertFalse(preview['imported'])
        self.assertEqual([(s['section'], s['service'], s['price_list']) for s in preview['sections']], [
            ('Dry Cleaning', 'Dry Cleaning', 'main'), ('Wash Laundry', 'Wash Laundry', 'main'),
            ('Dryclean online', 'Dry Cleaning', 'online'), ('Laundry online', 'Wash Laundry', 'online'),
        ])
        self.assertEqual(preview['summary']['skipped_inactive'], 1)
        self.assertEqual(len(preview['warnings']), 1)  # Kandura twice in Wash Laundry
        self.assertEqual(preview['summary']['prices']['main']['new'], 3)
        self.assertFalse(Service.objects.exists())  # nothing written yet

        imported = body(self.post(commit=True))
        self.assertTrue(imported['imported'])
        walk_in = PriceList.objects.get(is_default=True)
        online = PriceList.objects.get(name='Online')
        abaya, suit = Item.objects.get(name='Abaya'), Item.objects.get(name='Suit, 2pc')
        dry = Service.objects.get(name='Dry Cleaning')
        self.assertEqual(suit.pieces, 2)
        self.assertEqual(Price.objects.get(price_list=walk_in, item=abaya, service=dry).price, D('13.65'))
        self.assertEqual(Price.objects.get(price_list=online, item=abaya, service=dry).price, D('12.00'))
        self.assertEqual(Price.objects.get(price_list=walk_in, item__name='Kandura').price, D('7.08'))
        self.assertEqual(PriceChange.objects.filter(source='import').count(), 5)

        # again: nothing changes
        again = body(self.post(commit=True))['summary']['prices']
        self.assertEqual((again['main']['same'], again['main']['new'], again['online']['same']), (3, 0, 2))
        self.assertEqual(PriceChange.objects.count(), 5)

    def test_section_choices_and_errors(self):
        res = self.post(sections=[{'section': 'Dryclean online', 'service': 'Dry Clean Online', 'price_list': 'main'}])
        names = {s['section']: s['service'] for s in body(res)['sections']}
        self.assertEqual(names['Dry Cleaning'], 'Dry Cleaning')  # suggestions for the rest
        bad = self.client.post('/api/catalogue/import/', {'csv': 'name,price\nShirt,5'}, format='json')
        self.assertEqual(error_fields(bad), {'csv'})
        broken = 'section,product,price_aed\nRepairs,Shirt,abc\n'
        res = self.client.post('/api/catalogue/import/', {'csv': broken, 'commit': True}, format='json')
        self.assertFalse(body(res)['imported'])
        self.assertIn('not a number', body(res)['errors'][0]['message'])

    def test_price_history_from_the_grid(self):
        walk_in = PriceList.objects.create(name='Walk-in', is_default=True)
        shirt = make_item('Shirt')
        wash = Service.objects.create(name='Wash')
        url = f'/api/prices/{walk_in.id}/'
        cell = {'item': str(shirt.id), 'service': str(wash.id)}
        self.client.put(url, {'prices': [{**cell, 'price': '5'}]}, format='json')
        self.client.put(url, {'prices': [{**cell, 'price': '6', 'extra_days': 1}]}, format='json')
        self.client.put(url, {'prices': [{**cell, 'price': '6', 'extra_days': 2}]}, format='json')  # not money
        self.client.put(url, {'prices': [{**cell, 'price': None}]}, format='json')
        history = body(self.client.get(f'{url}history/'))
        self.assertEqual([(h['old_price'], h['new_price']) for h in history],
                         [('6.00', None), ('5.00', '6.00'), (None, '5.00')])
        self.assertEqual((history[0]['changed_by_name'], history[0]['source']), ('Owner', 'grid'))


class ReadyByCalendarTests(SimpleTestCase):
    rules = {'ready_days': 2, 'express_ready_days': 0, 'ready_time': time(18, 0)}

    def test_cutoff_closing_closed_days_and_holidays(self):
        sunday_9 = datetime(2026, 11, 22, 9, 0, tzinfo=DUBAI)  # a Sunday
        sunday_20 = datetime(2026, 11, 22, 20, 0, tzinfo=DUBAI)
        self.assertEqual(suggested_ready_by(sunday_9, express=False, extra_days=0, **self.rules),
                         datetime(2026, 11, 24, 18, 0, tzinfo=DUBAI))
        # after the 19:00 cut-off: counted from Monday
        self.assertEqual(suggested_ready_by(sunday_20, express=False, extra_days=0, cutoff=time(19, 0), **self.rules),
                         datetime(2026, 11, 25, 18, 0, tzinfo=DUBAI))
        # the branch closes at 17:00
        self.assertEqual(suggested_ready_by(sunday_9, express=False, extra_days=0, closes_at=time(17, 0),
                                            **self.rules).time(), time(17, 0))
        # Tuesday is a holiday and Wednesday a closed weekday: Thursday
        self.assertEqual(suggested_ready_by(sunday_9, express=False, extra_days=0, closed_weekdays=[2],
                                            holidays=[date(2026, 11, 24)], **self.rules).date(), date(2026, 11, 26))


class ServiceReadyDaysAndPiecesTests(Base):
    def test_branch_hours_and_holidays_api(self):
        self.as_owner()
        url = f'/api/branches/{self.dxb.id}/'
        res = self.client.patch(url, {'opens_at': '08:00', 'closes_at': '22:00', 'cutoff_time': '20:00',
                                      'closed_weekdays': [4, 4],
                                      'holidays': [{'date': '2026-12-02', 'name': 'National Day'}]}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        data = body(res)
        self.assertEqual((data['closed_weekdays'], data['holidays']),
                         ([4], [{'date': '2026-12-02', 'name': 'National Day'}]))
        self.assertEqual(error_fields(self.client.patch(url, {'closes_at': '07:00'}, format='json')), {'closes_at'})
        res = self.client.patch(url, {'holidays': [{'date': '2026-12-02'}, {'date': '2026-12-02'}]}, format='json')
        self.assertEqual(error_fields(res), {'holidays'})


class OrderPiecesAndServiceDaysTests(OrderFixture):
    def test_pieces_per_item_and_service_ready_days(self):
        from django.utils import timezone
        from datetime import timedelta

        self.kandura.pieces = 2  # say, a two-piece set
        self.kandura.save()
        self.wash.ready_days = 1
        self.wash.save()
        order = body(self.order(lines=[{'item': str(self.kandura.id), 'service': str(self.wash.id), 'quantity': '3',
                                        'pieces': [{'note': f'tag {n}'} for n in range(6)]}]))
        self.assertEqual(order['pieces'], 6)
        ready = timezone.localtime(Order.objects.get(pk=order['id']).ready_by)
        self.assertEqual(ready.date(), timezone.localdate() + timedelta(days=1))  # Wash: 1 day, not 2
        pos = body(self.client.get('/api/pos/catalogue/'))
        self.assertEqual({i['name']: i['pieces'] for i in pos['items']}['Kandura'], 2)
        self.assertIn('holidays', pos['settings'])
