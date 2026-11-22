from accounts.test_management import Base, make_role
from accounts.tests import body, error_fields
from catalogue.tests import make_item
from .models import CommonMaster


class CommonMasterApiTests(Base):
    def setUp(self):
        super().setUp()
        self.as_owner()

    def values(self, type_code, query=''):
        return [m['code'] for m in body(self.client.get(f'/api/common-masters/?type={type_code}{query}'))]

    def test_lists_come_from_the_migration(self):
        types = {t['code']: t for t in body(self.client.get('/api/common-master-types/'))}
        self.assertEqual(set(types), {'ITEM_CATEGORY', 'PRICING_TYPE', 'UPCHARGE_TYPE', 'DISCOUNT_TYPE',
                                      'PAYMENT_METHOD', 'ORDER_NOTE', 'PRODUCTION_STAGE'})
        self.assertFalse(types['ITEM_CATEGORY']['is_fixed'])
        self.assertTrue(types['PRICING_TYPE']['is_fixed'])
        self.assertEqual(self.values('PRICING_TYPE'), ['unit', 'per_kg', 'per_m2'])
        self.assertEqual(self.values('ITEM_CATEGORY'), ['men', 'women', 'kids', 'household', 'other'])

    def test_open_list_add_rename_hide_delete(self):
        res = self.client.post('/api/common-masters/', {'type': 'ITEM_CATEGORY', 'name': 'Kids Wear',
                                                        'sort_order': 9}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        kids_wear = body(res)
        self.assertEqual((kids_wear['code'], kids_wear['type_name']), ('kids_wear', 'Item category'))
        url = f"/api/common-masters/{kids_wear['id']}/"

        self.assertEqual(error_fields(self.client.post('/api/common-masters/', {'type': 'ITEM_CATEGORY',
                                                                               'name': 'kids wear'},
                                                       format='json')), {'name'})  # same name
        res = self.client.patch(url, {'name': 'Children', 'code': 'children'}, format='json')
        self.assertEqual(error_fields(res), {'code'})  # the code never changes
        self.client.patch(url, {'name': 'Children', 'is_active': False}, format='json')
        self.assertNotIn('kids_wear', self.values('ITEM_CATEGORY', '&active=true'))  # hidden from forms
        self.assertIn('kids_wear', self.values('ITEM_CATEGORY'))

        # in use → can't delete (hide it instead); unused → deleted
        make_item('Kids shirt', category='kids_wear')
        res = self.client.delete(url)
        self.assertEqual((res.status_code, res.data['referenced_tables']), (409, ['items']))
        unused = CommonMaster.get('ITEM_CATEGORY', 'kids')
        self.assertEqual(self.client.delete(f'/api/common-masters/{unused.id}/').status_code, 200)

    def test_fixed_list_rename_and_hide_only(self):
        res = self.client.post('/api/common-masters/', {'type': 'PRICING_TYPE', 'name': 'Per day'}, format='json')
        self.assertEqual((res.status_code, res.data['errors'][0]['error_code']), (400, 'OPERATION_NOT_ALLOWED'))

        per_kg = CommonMaster.get('PRICING_TYPE', 'per_kg')
        url = f'/api/common-masters/{per_kg.id}/'
        self.assertEqual(self.client.patch(url, {'name': 'By weight (kg)'}, format='json').status_code, 200)
        res = self.client.delete(url)
        self.assertEqual(res.data['errors'][0]['error_code'], 'OPERATION_NOT_ALLOWED')

        # items show the new name
        make_item('Laundry', pricing_type='per_kg')
        item = body(self.client.get('/api/items/'))[0]
        self.assertEqual((item['pricing_type'], item['pricing_type_name']), ('per_kg', 'By weight (kg)'))

    def test_everyone_reads_only_managers_change(self):
        staff = self.make_user('staff@shop.com', roles=[(self.cashier, self.dxb)])
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.get('/api/common-masters/?type=ORDER_NOTE').status_code, 200)
        self.assertEqual(self.client.post('/api/common-masters/', {'type': 'ORDER_NOTE', 'name': 'Rush'},
                                          format='json').status_code, 403)
        manager = make_role('Masters admin', ['common_masters.view', 'common_masters.create'])
        self.client.force_authenticate(self.make_user('m@shop.com', roles=[(manager, None)]))
        self.assertEqual(self.client.post('/api/common-masters/', {'type': 'ORDER_NOTE', 'name': 'Rush'},
                                          format='json').status_code, 201)

    def test_items_use_master_codes(self):
        res = self.client.post('/api/items/', {'name': 'Abaya', 'category': 'women', 'pricing_type': 'unit'},
                               format='json')
        self.assertEqual((body(res)['category'], body(res)['category_name']), ('women', 'Women'))
        self.assertEqual(error_fields(self.client.post('/api/items/', {'name': 'X', 'category': 'pets'},
                                                       format='json')), {'category'})
        default = body(self.client.post('/api/items/', {'name': 'Plain'}, format='json'))
        self.assertEqual((default['category'], default['pricing_type']), ('other', 'unit'))
