from decimal import Decimal

from accounts.test_management import PASSWORD, make_role
from accounts.tests import body, error_fields
from customers.models import Customer
from orders.models import Order, Payment
from orders.tests import OrderFixture
from .models import Shift

D = Decimal


class CashUpTests(OrderFixture):
    """M6: shifts, payments, refunds, customer balances. The fixture's cashier has a shift open at Dubai Marina."""

    def shift(self):
        return body(self.client.get('/api/shifts/current/'))

    def test_cash_needs_an_open_shift(self):
        Shift.objects.all().delete()
        res = self.order(payment_method='cash', paid_amount='20')
        self.assertEqual(error_fields(res), {'payment_method'})
        self.assertFalse(Order.objects.exists())  # nothing half-saved
        self.assertIsNone(self.shift())
        self.assertEqual(self.order(payment_method='card', paid_amount='20').status_code, 201)  # card needs none

    def test_full_shift_and_cash_up(self):
        Shift.objects.all().delete()
        res = self.client.post('/api/shifts/open/', {'opening_float': '100'}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(error_fields(self.client.post('/api/shifts/open/', {'opening_float': '0'}, format='json')),
                         {None})  # already open

        order = body(self.order(payment_method='cash', paid_amount='20'))          # +20 cash
        pay = self.client.post(f"/api/orders/{order['id']}/pay/", {'amount': '10', 'payment_method': 'card'},
                               format='json')                                        # +10 card
        self.assertEqual((pay.status_code, body(pay)['balance']), (200, '30.50'))
        self.assertEqual([p['method'] for p in body(pay)['payments']], ['cash', 'card'])

        # a manager refunds 5 cash, in the same shift (the manager is the cashier here)
        manager = make_role('Refunds', ['payments.edit'])
        from roles.models import UserRole
        UserRole.objects.create(user=self.cashier_user, role=manager, branch=self.dxb)
        self.login(self.dxb)
        refund = self.client.post(f"/api/orders/{order['id']}/refund/",
                                  {'amount': '5', 'payment_method': 'cash', 'reason': 'Stain not removed'},
                                  format='json')
        self.assertEqual(refund.status_code, 200, refund.data)
        self.assertEqual(body(refund)['paid_amount'], '25.00')

        live = self.shift()
        self.assertEqual((live['cash_taken'], live['cash_refunded'], live['expected_cash']),
                         ('20.00', '5.00', '115.00'))
        self.assertEqual({m['method']: m['net'] for m in live['methods']}, {'cash': '15.00', 'card': '10.00'})

        res = self.client.post('/api/shifts/close/', {'counted_cash': '114', 'notes': 'One coin missing'},
                               format='json')
        self.assertEqual(res.data['message'], 'Shift closed. The drawer is short by AED 1.00.')
        closed = body(res)
        self.assertEqual((closed['expected_cash'], closed['counted_cash'], closed['difference'], closed['is_open']),
                         ('115.00', '114.00', '-1.00', False))
        self.assertIsNone(self.shift())
        self.assertEqual(len(body(self.client.get('/api/shifts/'))), 1)
        self.assertEqual(error_fields(self.client.post('/api/shifts/close/', {'counted_cash': '0'},
                                                       format='json')), {None})  # nothing open

    def test_pay_and_refund_rules(self):
        order = body(self.order())  # 60.50 due
        url = f"/api/orders/{order['id']}"
        self.assertEqual(error_fields(self.client.post(f'{url}/pay/', {'amount': '70', 'payment_method': 'cash'},
                                                       format='json')), {'amount'})
        self.assertEqual(error_fields(self.client.post(f'{url}/pay/', {'amount': '10', 'payment_method': 'on_account'},
                                                       format='json')), {'payment_method'})
        self.client.post(f'{url}/pay/', {'amount': '60.50', 'payment_method': 'cash'}, format='json')
        self.assertEqual(Order.objects.get(pk=order['id']).balance, D('0.00'))

        # refunds need payments.edit (the counter role doesn't have it)
        res = self.client.post(f'{url}/refund/', {'amount': '5', 'payment_method': 'cash', 'reason': 'x'},
                               format='json')
        self.assertEqual(res.status_code, 403)
        manager = make_role('Manager', ['payments.view', 'payments.edit', 'shifts.create'])
        boss = self.make_user('boss@shop.com', roles=[(manager, self.dxb)])
        Shift.objects.create(branch=self.dxb, opened_by=boss, opening_float=D('0'))
        self.client.post('/api/auth/login/', {'email': 'boss@shop.com', 'password': PASSWORD}, format='json')
        self.assertEqual(error_fields(self.client.post(f'{url}/refund/', {'amount': '5', 'payment_method': 'cash',
                                                                          'reason': ' '}, format='json')), {'reason'})
        self.assertEqual(error_fields(self.client.post(f'{url}/refund/', {'amount': '99', 'payment_method': 'cash',
                                                                          'reason': 'x'}, format='json')), {'amount'})

    def test_customer_balance_and_settle(self):
        a, b = body(self.order()), body(self.order())  # 60.50 + 60.50 owed
        url = f'/api/customers/{self.customer.id}'
        balance = body(self.client.get(f'{url}/balance/'))
        self.assertEqual((balance['balance'], [o['number'] for o in balance['orders']]),
                         ('121.00', ['DXB1-00001', 'DXB1-00002']))

        self.assertEqual(error_fields(self.client.post(f'{url}/settle/', {'amount': '500', 'payment_method': 'cash'},
                                                       format='json')), {'amount'})
        res = self.client.post(f'{url}/settle/', {'amount': '100', 'payment_method': 'cash'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['message'], 'AED 100.00 received (DXB1-00001, DXB1-00002).')
        self.assertEqual(Order.objects.get(pk=a['id']).balance, D('0.00'))    # oldest paid first
        self.assertEqual(Order.objects.get(pk=b['id']).balance, D('21.00'))
        self.assertEqual(body(self.client.get(f'{url}/balance/'))['balance'], '21.00')

        # the customers list shows what's still owed
        listed = body(self.client.get('/api/customers/'))
        self.assertEqual(D(listed[0]['balance']), D('21.00'))

    def test_payments_list(self):
        order = body(self.order(payment_method='cash', paid_amount='20'))
        self.client.post(f"/api/orders/{order['id']}/pay/", {'amount': '10.50', 'payment_method': 'card'},
                         format='json')
        day = body(self.client.get('/api/payments/'))
        self.assertEqual([(p['order_number'], p['method'], p['amount']) for p in day['payments']],
                         [('DXB1-00001', 'card', '10.50'), ('DXB1-00001', 'cash', '20.00')])
        self.assertEqual({t['method']: t['net'] for t in day['totals']}, {'card': '10.50', 'cash': '20.00'})
        self.assertEqual(body(self.client.get('/api/payments/?date=2020-01-01'))['payments'], [])
        self.assertEqual(error_fields(self.client.get('/api/payments/?date=yesterday')), {'date'})
        self.assertEqual(Payment.objects.filter(shift__isnull=False).count(), 2)  # both linked to the shift
