from datetime import timedelta

from django.utils import timezone

from accounts.test_management import PASSWORD, make_role
from accounts.tests import body, error_fields
from orders.models import Order
from orders.tests import OrderFixture
from roles.models import UserRole


class ReportsTests(OrderFixture):
    """Each test order: 3 Kandura (8.50) + stain 5 + 2.5 kg laundry (30 minimum) = 60.50, 4 pieces."""

    def setUp(self):
        super().setUp()
        viewer = make_role('Reports', ['dashboard.view', 'reports.view', 'reports.print'])
        UserRole.objects.create(user=self.cashier_user, role=viewer, branch=self.dxb)
        self.login(self.dxb)

    def move(self, order, to):
        return self.client.post('/api/production/move/', {'orders': [order['id']], 'to': to}, format='json')

    def test_dashboard(self):
        a = body(self.order(payment_method='cash', paid_amount='20'))
        body(self.order())
        self.move(a, 'ready')

        d = body(self.client.get('/api/dashboard/'))
        today = d['today']
        self.assertEqual((today['sales']['orders'], today['sales']['pieces'], today['sales']['sales']), (2, 8, '121.00'))
        self.assertEqual((today['sales']['vat'], today['sales']['sales_excl_vat']), ('5.76', '115.24'))
        self.assertEqual((today['collected']['net'], today['collected']['methods'][0]['method']), ('20.00', 'cash'))
        self.assertEqual(d['yesterday']['sales']['orders'], 0)

        ops = d['operations']
        self.assertEqual([(w['code'], w['orders']) for w in ops['wip']],
                         [('received', 1), ('washing', 0), ('ironing', 0), ('packing', 0), ('ready', 1)])
        self.assertEqual((ops['ready_to_collect'], ops['overdue']), (1, 0))
        self.assertEqual(ops['uncollected_aging'][0], {'days': '0-2', 'orders': 1})

        self.assertEqual(d['on_time_30_days'], {'ready': 1, 'on_time': 1, 'percent': 100})
        self.assertEqual((d['receivables']['total'], d['receivables']['customers']), ('101.00', 1))
        self.assertEqual(len(d['last_7_days']), 7)
        self.assertEqual((d['last_7_days'][-1]['sales'], d['last_7_days'][-1]['collected']), ('121.00', '20.00'))
        self.assertEqual([i['item_name'] for i in d['top_items_30_days']], ['Kandura', 'Laundry by weight'])

    def test_overdue_and_late(self):
        late = body(self.order())
        Order.objects.filter(pk=late['id']).update(ready_by=timezone.now() - timedelta(hours=3))
        ops = body(self.client.get('/api/dashboard/'))['operations']
        self.assertEqual((ops['overdue'], ops['oldest_overdue']['number']), (1, late['number']))
        self.move(late, 'ready')  # ready after its ready-by: not on time
        self.assertEqual(body(self.client.get('/api/dashboard/'))['on_time_30_days']['percent'], 0)

    def test_daily_summary_with_cash_up(self):
        self.order(payment_method='cash', paid_amount='60.50')
        self.client.post('/api/shifts/close/', {'counted_cash': '160.50'}, format='json')  # float 100 + 60.50
        day = body(self.client.get('/api/reports/daily/'))
        self.assertEqual((day['sales']['orders'], day['collected']['net'], day['branch_code']), (1, '60.50', 'DXB1'))
        self.assertEqual([(c['expected_cash'], c['difference']) for c in day['cash_ups']], [('160.50', '0.00')])

        empty = body(self.client.get('/api/reports/daily/?date=2020-01-01'))
        self.assertEqual((empty['sales']['orders'], empty['sales']['sales'], empty['collected']['net']),
                         (0, '0.00', '0.00'))
        self.assertEqual(error_fields(self.client.get('/api/reports/daily/?date=today')), {'date'})

    def test_orders_csv(self):
        self.order(payment_method='cash', paid_amount='20')
        today = timezone.localdate().isoformat()
        res = self.client.get(f'/api/reports/orders.csv?from={today}&to={today}')
        self.assertEqual(res.status_code, 200)
        self.assertIn('text/csv', res['Content-Type'])
        self.assertIn('attachment; filename="orders-DXB1-', res['Content-Disposition'])
        lines = res.content.decode('utf-8-sig').strip().splitlines()
        self.assertTrue(lines[0].startswith('Order,Taken,Customer,Phone,Status'))
        self.assertEqual(len(lines), 2)
        self.assertIn('DXB1-00001', lines[1])
        self.assertIn('60.50', lines[1])

        self.assertEqual(error_fields(self.client.get('/api/reports/orders.csv?from=2026-02-01&to=2026-01-01')), {'to'})

    def test_permissions(self):
        clerk = make_role('Clerk', ['orders.view', 'reports.view'])
        self.make_user('clerk@shop.com', roles=[(clerk, self.dxb)])
        self.client.post('/api/auth/login/', {'email': 'clerk@shop.com', 'password': PASSWORD}, format='json')
        self.assertEqual(self.client.get('/api/dashboard/').status_code, 403)
        self.assertEqual(self.client.get('/api/reports/daily/').status_code, 200)
        self.assertEqual(self.client.get('/api/reports/orders.csv').status_code, 403)  # export needs reports.print
