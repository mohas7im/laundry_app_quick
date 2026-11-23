"""The counter extras: piece notes, saved notes, preferences, customer prices and discounts,
manager approval, editing and cancelling orders, most-used items."""
from decimal import Decimal

from accounts.pins import hash_pin
from accounts.test_management import PASSWORD, make_role
from accounts.tests import body, error_fields
from catalogue.models import Price, PriceList
from roles.models import Permission
from .models import Order, OrderStatusHistory
from .tests import OrderFixture

D = Decimal


class CounterExtrasTests(OrderFixture):

    def setUp(self):
        super().setUp()
        self.counter.max_discount_percent = D('10')
        self.counter.save()
        self.counter.permissions.add(Permission.objects.get(code='orders.edit'))
        self.login(self.dxb)  # a new token with orders.edit
        # a manager with an approval PIN (and refunds: payments.edit)
        manager_role = make_role('Manager', ['orders.view', 'orders.edit', 'payments.edit'])
        self.manager = self.make_user('manager@shop.com', roles=[(manager_role, self.dxb)])
        self.manager.pin_hash = hash_pin(self.manager.id, '4321')
        self.manager.save()

    def edit(self, order, **overrides):
        data = {
            'customer': str(self.customer.id), 'reason': 'Customer added a piece',
            'ready_by': order['ready_by'],
            'lines': [{'item': str(self.kandura.id), 'service': str(self.wash.id), 'quantity': '4'}],
        }
        data.update(overrides)
        return self.client.put(f"/api/orders/{order['id']}/", data, format='json')

    def test_piece_notes(self):
        res = self.order(lines=[{
            'item': str(self.kandura.id), 'service': str(self.wash.id), 'quantity': '2',
            'pieces': [{'colours': ['Navy', 'Navy'], 'damage': ['Button missing'], 'note': ' collar '},
                       {'colours': ['White']}, {}],
        }])
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(body(res)['lines'][0]['pieces'], [
            {'colours': ['Navy'], 'damage': ['Button missing'], 'stains': [], 'note': 'collar'},
            {'colours': ['White'], 'damage': [], 'stains': [], 'note': ''},
        ])
        too_many = self.order(lines=[{'item': str(self.kandura.id), 'service': str(self.wash.id), 'quantity': '1',
                                      'pieces': [{'note': 'a'}, {'note': 'b'}]}])
        self.assertEqual(error_fields(too_many), {'lines[0].pieces'})
        unknown = self.order(lines=[{'item': str(self.kandura.id), 'service': str(self.wash.id), 'quantity': '1',
                                     'pieces': [{'colours': ['Sky']}]}])
        self.assertEqual(error_fields(unknown), {'lines[0].pieces'})

    def test_saved_notes_and_preferences(self):
        self.customer.preferences = {'PREF_SHIRT': 'boxed', 'PREF_STARCH': 'none'}
        self.customer.save()
        order = body(self.order(notes='Gutra hanger', save_notes=True))
        self.assertEqual(order['preferences'], 'Shirt: Boxed / Starch: No starch')
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.notes, 'Gutra hanger')
        self.order(notes='Just this once')  # not saved
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.notes, 'Gutra hanger')

    def test_customer_price_list_and_discount(self):
        corporate = PriceList.objects.create(name='Corporate')
        Price.objects.create(price_list=corporate, item=self.kandura, service=self.wash, price=D('6'))
        self.customer.price_list = corporate
        self.customer.discount_percent = D('20')
        self.customer.save()
        # kandura from the corporate list (3 × 6 + 5), laundry from the default (30 minimum)
        order = body(self.order())
        self.assertEqual((order['price_list_name'], order['subtotal']), ('Corporate', '53.00'))
        # their own 20% is over the counter's 10% limit, but needs no approval
        res = self.order(discount_type='percent', discount_value='20', discount_reason='Customer discount')
        self.assertEqual((res.status_code, body(res)['total']), (201, '42.40'))

    def test_discount_over_the_limit_needs_a_manager(self):
        big = {'discount_type': 'percent', 'discount_value': '25', 'discount_reason': 'Complaint'}
        res = self.order(**big)
        self.assertEqual(error_fields(res), {'approval_pin'})
        self.assertIn('over your limit', res.data['errors'][0]['description'])
        self.assertEqual(error_fields(self.order(approval_pin='0000', **big)), {'approval_pin'})  # wrong PIN
        res = self.order(approval_pin='4321', **big)
        self.assertEqual((res.status_code, body(res)['discount_approved_by_name']), (201, self.manager.full_name))
        # within the limit: no PIN
        self.assertEqual(self.order(discount_type='percent', discount_value='10', discount_reason='x').status_code, 201)
        # the manager role has no limit set (empty = no limit); a 0 limit means no discounts at all
        self.counter.max_discount_percent = D('0')
        self.counter.save()
        self.assertEqual(error_fields(self.order(discount_type='amount', discount_value='1', discount_reason='x')),
                         {'approval_pin'})

    def test_edit_an_order(self):
        order = body(self.order())
        self.assertEqual(error_fields(self.edit(order, reason='')), {'reason'})
        res = self.edit(order)
        self.assertEqual(res.status_code, 200, res.data)
        edited = body(res)
        self.assertEqual((edited['number'], edited['total'], len(edited['lines'])), (order['number'], '34.00', 1))
        self.assertEqual(edited['history'][-1]['note'], 'Edited: Customer added a piece')

        # bag drop: count now, add the items later by editing
        bag = body(self.order(lines=[], bag_drop_pieces=5))
        res = self.edit(bag, bag_drop_pieces=0)
        self.assertEqual((res.status_code, body(res)['pieces']), (200, 4))

    def test_editing_a_paid_order_needs_a_manager(self):
        order = body(self.order(payment_method='cash', paid_amount='20'))
        self.assertEqual(error_fields(self.edit(order)), {'approval_pin'})
        res = self.edit(order, approval_pin='4321')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertIn(f'approved by {self.manager.full_name}', body(res)['history'][-1]['note'])
        # never below what was paid
        res = self.edit(order, approval_pin='4321',
                        lines=[{'item': str(self.kandura.id), 'service': str(self.wash.id), 'quantity': '1'}])
        self.assertEqual(res.status_code, 400)
        self.assertIn('Refund the difference first', res.data['message'])

    def test_cancel(self):
        order = body(self.order())
        url = f"/api/orders/{order['id']}/cancel/"
        self.assertEqual(self.client.post(url, {'reason': 'x'}, format='json').status_code, 403)  # no orders.delete
        self.counter.permissions.add(Permission.objects.get(code='orders.delete'))
        self.login(self.dxb)  # new token with the new permission
        self.assertEqual(error_fields(self.client.post(url, {'reason': ''}, format='json')), {'reason'})
        res = self.client.post(url, {'reason': 'Customer changed their mind'}, format='json')
        self.assertEqual((res.status_code, body(res)['status']), (200, 'cancelled'))
        self.assertEqual(OrderStatusHistory.objects.filter(order_id=order['id']).last().note,
                         'Cancelled: Customer changed their mind')
        self.assertEqual(self.edit(order).status_code, 400)  # can't change a cancelled order

        paid = body(self.order(payment_method='cash', paid_amount='10'))
        res = self.client.post(f"/api/orders/{paid['id']}/cancel/", {'reason': 'x'}, format='json')
        self.assertIn('Refund it first', res.data['message'])
        self.assertEqual(Order.objects.get(pk=paid['id']).status, 'received')

    def test_pos_catalogue_extras(self):
        self.order()
        self.order(lines=[{'item': str(self.kandura.id), 'service': str(self.wash.id), 'quantity': '1'}])
        pos = body(self.client.get('/api/pos/catalogue/'))
        usage = {(u['item'], u['service']): u['count'] for u in pos['usage']}
        self.assertEqual(usage[(str(self.kandura.id), str(self.wash.id))], 2)
        self.assertIn({'code': 'navy', 'name': 'Navy'}, pos['piece_tags']['colours'])
        self.assertEqual(pos['preferences'][0]['code'], 'PREF_SHIRT')
        self.assertEqual(pos['discount_limit'], '10.00')


class PinAndPreferenceApiTests(OrderFixture):

    def test_user_pin(self):
        self.client.post('/api/auth/login/', {'email': 'owner@shop.com', 'password': PASSWORD}, format='json')
        user = self.cashier_user
        url = f'/api/users/{user.id}/'
        self.assertEqual(error_fields(self.client.patch(url, {'pin': '12'}, format='json')), {'pin'})
        res = self.client.patch(url, {'pin': '2468'}, format='json')
        self.assertEqual((res.status_code, body(res)['has_pin']), (200, True))
        self.assertNotIn('pin', body(res))
        other = self.make_user('other@shop.com', roles=[(self.counter, self.dxb)])
        taken = self.client.patch(f'/api/users/{other.id}/', {'pin': '2468'}, format='json')
        self.assertEqual(error_fields(taken), {'pin'})
        self.assertFalse(body(self.client.patch(url, {'pin': None}, format='json'))['has_pin'])

    def test_customer_preferences(self):
        url = f'/api/customers/{self.customer.id}/'
        res = self.client.patch(url, {'preferences': {'PREF_SHIRT': 'boxed', 'PREF_STARCH': ''}}, format='json')
        self.assertEqual(res.status_code, 403)  # the counter role can't edit customers
        self.client.post('/api/auth/login/', {'email': 'owner@shop.com', 'password': PASSWORD,
                                             'branch_id': str(self.dxb.id)}, format='json')
        res = self.client.patch(url, {'preferences': {'PREF_SHIRT': 'boxed', 'PREF_STARCH': ''}}, format='json')
        self.assertEqual(body(res)['preferences'], {'PREF_SHIRT': 'boxed'})
        self.assertEqual(body(res)['preferences_text'], 'Shirt: Boxed')
        self.assertEqual(error_fields(self.client.patch(url, {'preferences': {'PREF_SHIRT': 'rolled'}},
                                                        format='json')), {'preferences'})
        self.assertEqual(error_fields(self.client.patch(url, {'preferences': {'COLOUR': 'x'}}, format='json')),
                         {'preferences'})
        options = body(self.client.get('/api/customers/options/'))
        self.assertEqual([p['name'] for p in options['price_lists']], ['Walk-in'])
        self.assertEqual(options['preferences'][2]['name'], 'Starch')
