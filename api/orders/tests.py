from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.test import SimpleTestCase
from django.utils import timezone

from accounts.test_management import PASSWORD, Base, make_role
from accounts.tests import body, error_fields
from cashier.models import Shift
from catalogue.models import Price, PriceList, Service
from catalogue.tests import make_item, make_upcharge
from company.models import CompanySettings
from customers.models import Customer
from .models import Order, OrderStatusHistory, Payment
from .pricing import LineInput, UpchargeRate, order_totals, price_line, suggested_ready_by

D = Decimal
DUBAI = ZoneInfo('Asia/Dubai')


class PricingRuleTests(SimpleTestCase):
    def test_line(self):
        self.assertEqual(price_line(LineInput(D('8.50'), D('3'))).total, D('25.50'))
        # minimum price: 2 kg × 12 = 24 → at least 30
        self.assertEqual(price_line(LineInput(D('12'), D('2'), min_price=D('30'))).total, D('30.00'))
        # upcharges: fixed once per line, percent of the base
        line = price_line(LineInput(D('10'), D('2'), upcharges=[
            UpchargeRate('Stain', 'fixed', D('5')), UpchargeRate('Urgent', 'percent', D('50'))]))
        self.assertEqual((line.base, line.upcharge_amounts, line.total), (D('20.00'), [D('5.00'), D('10.00')], D('35.00')))

    def test_totals_and_vat_inclusive(self):
        t = order_totals([D('100'), D('5')])
        self.assertEqual((t.subtotal, t.total, t.vat_amount), (D('105.00'), D('105.00'), D('5.00')))
        t = order_totals([D('105')], 'percent', D('10'))
        self.assertEqual((t.discount_amount, t.total, t.vat_amount), (D('10.50'), D('94.50'), D('4.50')))
        self.assertEqual(order_totals([D('20')], 'amount', D('50')).total, D('0.00'))  # never below zero

    def test_ready_by(self):
        morning = datetime(2026, 11, 22, 9, 0, tzinfo=DUBAI)
        rules = {'ready_days': 2, 'express_ready_days': 0, 'ready_time': time(18, 0)}
        self.assertEqual(suggested_ready_by(morning, express=False, extra_days=0, **rules),
                         datetime(2026, 11, 24, 18, 0, tzinfo=DUBAI))
        self.assertEqual(suggested_ready_by(morning, express=False, extra_days=3, **rules),
                         datetime(2026, 11, 27, 18, 0, tzinfo=DUBAI))
        self.assertEqual(suggested_ready_by(morning, express=True, extra_days=0, **rules),
                         datetime(2026, 11, 22, 18, 0, tzinfo=DUBAI))  # same day
        evening = datetime(2026, 11, 22, 19, 0, tzinfo=DUBAI)
        self.assertEqual(suggested_ready_by(evening, express=True, extra_days=0, **rules),
                         datetime(2026, 11, 23, 18, 0, tzinfo=DUBAI))  # too late today: tomorrow


class OrderFixture(Base):
    """A priced catalogue, a customer and a counter user logged in at Dubai Marina."""

    def setUp(self):
        super().setUp()
        self.dry = Service.objects.create(name='Dry Clean', sort_order=1)
        self.wash = Service.objects.create(name='Wash & Iron', sort_order=2)
        self.kandura = make_item('Kandura', category='men')
        self.laundry = make_item('Laundry by weight', pricing_type='per_kg')
        self.walk_in = PriceList.objects.create(name='Walk-in', is_default=True)
        Price.objects.create(price_list=self.walk_in, item=self.kandura, service=self.dry,
                             price=D('15'), express_price=D('25'), extra_days=1)
        Price.objects.create(price_list=self.walk_in, item=self.kandura, service=self.wash, price=D('8.50'))
        Price.objects.create(price_list=self.walk_in, item=self.laundry, service=self.wash,
                             price=D('12'), min_price=D('30'))
        self.stain = make_upcharge('Stain removal', D('5'))
        self.customer = Customer.objects.create(name='Fatima', phone='+971501234567', branch=self.dxb)

        self.counter = make_role('Counter', ['orders.view', 'orders.create', 'customers.view', 'production.view',
                                             'production.edit', 'collection.view', 'collection.create',
                                             'payments.view', 'payments.create', 'shifts.view', 'shifts.create'])
        self.cashier_user = self.make_user('cashier@shop.com', roles=[(self.counter, self.dxb), (self.counter, self.shj)])
        # cash needs an open shift (M6 cash-up)
        Shift.objects.create(branch=self.dxb, opened_by=self.cashier_user, opening_float=D('100'))
        self.login(self.dxb)

    def login(self, branch):
        res = self.client.post('/api/auth/login/', {'email': 'cashier@shop.com', 'password': PASSWORD,
                                                   'branch_id': str(branch.id)}, format='json')
        self.assertEqual(res.status_code, 200, res.data)

    def order(self, **overrides):
        data = {
            'customer': str(self.customer.id),
            'lines': [
                {'item': str(self.kandura.id), 'service': str(self.wash.id), 'quantity': '3',
                 'upcharges': [str(self.stain.id)]},
                {'item': str(self.laundry.id), 'service': str(self.wash.id), 'quantity': '2.5'},
            ],
        }
        data.update(overrides)
        return self.client.post('/api/orders/', data, format='json')


class OrderApiTests(OrderFixture):

    def test_create_order(self):
        res = self.order(notes='No starch', payment_method='cash', paid_amount='20')
        self.assertEqual(res.status_code, 201, res.data)
        order = body(res)
        self.assertEqual(res.data['message'], 'Order DXB1-00001 created.')
        # 3 × 8.50 + 5 stain = 30.50; 2.5 kg × 12 = 30 (= the 30 minimum) → 60.50
        self.assertEqual([l['line_total'] for l in order['lines']], ['30.50', '30.00'])
        self.assertEqual([l['quantity'] for l in order['lines']], ['3', '2.5'])
        self.assertEqual(order['lines'][0]['upcharges'],
                         [{'upcharge': str(self.stain.id), 'name': 'Stain removal', 'amount': '5.00'}])
        self.assertEqual((order['subtotal'], order['total'], order['vat_amount']), ('60.50', '60.50', '2.88'))
        self.assertEqual((order['paid_amount'], order['balance']), ('20.00', '40.50'))
        self.assertEqual((order['status'], order['pieces'], order['branch_code']), ('received', 4, 'DXB1'))
        self.assertEqual(Payment.objects.get().amount, D('20.00'))
        self.assertEqual(OrderStatusHistory.objects.get().status, 'received')

        # ready-by: 2 days at 18:00 shop time (no extra days on these items)
        ready = timezone.localtime(Order.objects.get().ready_by)
        self.assertEqual((ready.date(), ready.time()),
                         (timezone.localdate() + timedelta(days=2), time(18, 0)))

        # numbering per branch
        self.assertEqual(body(self.order())['number'], 'DXB1-00002')
        self.login(self.shj)
        self.assertEqual(body(self.order())['number'], 'SHJ1-00001')

    def test_one_sequence_for_all_branches(self):
        settings = CompanySettings.current()
        settings.invoice_numbering = CompanySettings.InvoiceNumbering.COMPANY
        settings.last_invoice_number = 3000
        settings.save()
        self.login(self.dxb)
        self.assertEqual(body(self.order())['number'], '3001')
        # the second branch continues the same sequence: no clash with the first
        self.login(self.shj)
        self.assertEqual(body(self.order())['number'], '3002')
        # a number already used (the next number set back by hand) is skipped, not an error
        CompanySettings.objects.update(last_invoice_number=3000)
        res = self.order()
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(body(res)['number'], '3003')
        self.assertEqual(CompanySettings.current().last_invoice_number, 3003)

    def test_prices_come_from_the_price_list(self):
        res = self.order(lines=[{'item': str(self.kandura.id), 'service': str(self.dry.id), 'quantity': '1',
                                 'unit_price': '0.01', 'line_total': '0.01'}])  # ignored
        self.assertEqual(body(res)['total'], '15.00')
        # express uses the express price and the item's extra days still apply
        res = self.order(is_express=True,
                         lines=[{'item': str(self.kandura.id), 'service': str(self.dry.id), 'quantity': '2'}])
        self.assertEqual(body(res)['total'], '50.00')
        # no express price for Kandura / Wash & Iron
        res = self.order(is_express=True)
        self.assertEqual(error_fields(res), {'lines[0].item', 'lines[1].item'})
        # no price at all for Laundry / Dry Clean
        res = self.order(lines=[{'item': str(self.laundry.id), 'service': str(self.dry.id), 'quantity': '1'}])
        self.assertIn('has no Dry Clean price', res.data['errors'][0]['description'])

    def test_validation(self):
        self.assertEqual(error_fields(self.order(lines=[])), {'lines'})
        bag = self.order(lines=[], bag_drop_pieces=12)  # bag drop: count now, items later
        self.assertEqual((bag.status_code, body(bag)['total'], body(bag)['pieces']), (201, '0.00', 12))

        half = self.order(lines=[{'item': str(self.kandura.id), 'service': str(self.wash.id), 'quantity': '1.5'}])
        self.assertEqual(error_fields(half), {'lines[0].quantity'})
        self.assertEqual(error_fields(self.order(discount_type='amount', discount_value='5')), {'discount_reason'})
        self.assertEqual(error_fields(self.order(discount_type='percent', discount_value='150', discount_reason='x')),
                         {'discount_value'})
        self.assertEqual(error_fields(self.order(payment_method='cash', paid_amount='999')), {'paid_amount'})
        self.assertEqual(error_fields(self.order(paid_amount='10')), {'payment_method'})  # pay on collection
        self.assertEqual(error_fields(self.order(payment_method='card')), {'paid_amount'})
        self.assertEqual(error_fields(self.order(ready_by='2020-01-01T10:00:00Z')), {'ready_by'})

        # a time without an offset is shop time (Asia/Dubai), whatever the browser's time zone
        day = (timezone.localdate() + timedelta(days=5)).isoformat()
        res = self.order(ready_by=f'{day}T11:30')
        ready = timezone.localtime(Order.objects.get(pk=body(res)['id']).ready_by)
        self.assertEqual((ready.isoformat()[:16], str(ready.tzinfo)), (f'{day}T11:30', 'Asia/Dubai'))

        res = self.order(discount_type='percent', discount_value='10', discount_reason='Regular customer')
        self.assertEqual((body(res)['discount_amount'], body(res)['total']), ('6.05', '54.45'))

    def test_branch_scope_and_permissions(self):
        dxb_order = body(self.order())
        self.login(self.shj)
        self.assertEqual(body(self.client.get('/api/orders/')), [])  # Sharjah sees its own orders only
        self.assertEqual(self.client.get(f"/api/orders/{dxb_order['id']}/").status_code, 404)
        self.login(self.dxb)
        listed = body(self.client.get('/api/orders/?search_term=fatima'))
        self.assertEqual([o['number'] for o in listed], ['DXB1-00001'])

        self.assertEqual(self.client.get('/api/pos/catalogue/').status_code, 200)
        pos = body(self.client.get('/api/pos/catalogue/'))
        self.assertEqual((pos['price_list']['name'], len(pos['prices']), pos['settings']['ready_time']),
                         ('Walk-in', 3, '18:00'))

        viewer = make_role('Viewer', ['orders.view'])
        self.make_user('viewer@shop.com', roles=[(viewer, self.dxb)])
        self.client.post('/api/auth/login/', {'email': 'viewer@shop.com', 'password': PASSWORD}, format='json')
        self.assertEqual(self.client.get('/api/orders/').status_code, 200)
        self.assertEqual(self.order().status_code, 403)
        self.assertEqual(self.client.get('/api/pos/catalogue/').status_code, 403)

    def test_no_default_price_list(self):
        PriceList.objects.all().delete()
        res = self.order()
        self.assertEqual(res.status_code, 400)
        self.assertIn('no default price list', res.data['message'])
        self.assertEqual(self.client.get('/api/pos/catalogue/').data['errors'][0]['error_code'],
                         'OPERATION_NOT_ALLOWED')

    def test_customer_with_orders_cannot_be_deleted(self):
        self.order()
        self.client.post('/api/auth/login/', {'email': 'owner@shop.com', 'password': PASSWORD,
                                             'branch_id': str(self.dxb.id)}, format='json')
        res = self.client.delete(f'/api/customers/{self.customer.id}/')
        self.assertEqual((res.status_code, res.data['referenced_tables']), (409, ['orders']))
