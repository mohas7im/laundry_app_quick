from decimal import Decimal

from accounts.test_management import PASSWORD, make_role
from accounts.tests import body, error_fields
from customers.models import Customer
from masters.models import CommonMaster
from .models import Order, OrderStatusHistory, Payment
from .tests import OrderFixture


class ProductionTests(OrderFixture):
    """M5 production board: Received → Washing → Ironing → Packing → Ready."""

    def move(self, orders, to, **extra):
        return self.client.post('/api/production/move/', {'orders': [o['id'] for o in orders], 'to': to, **extra},
                                format='json')

    def stage_of(self, order):
        o = Order.objects.select_related('stage').get(pk=order['id'])
        return o.status, o.stage.code if o.stage else None

    def test_board_and_moving_step_by_step(self):
        order = body(self.order())
        board = body(self.client.get('/api/production/'))
        self.assertEqual([s['code'] for s in board['stages']], ['washing', 'ironing', 'packing'])
        self.assertEqual([(o['number'], o['status'], o['stage']) for o in board['orders']],
                         [('DXB1-00001', 'received', None)])

        # "next" walks the stages, then Ready
        for expected in [('received', 'washing'), ('received', 'ironing'), ('received', 'packing'), ('ready', None)]:
            res = self.move([order], 'next')
            self.assertEqual(res.status_code, 200, res.data)
            self.assertEqual(self.stage_of(order), expected)
        self.assertEqual(error_fields(self.move([order], 'next')), {'to'})  # already ready

        history = list(OrderStatusHistory.objects.filter(order_id=order['id']).values_list('status', 'stage_name'))
        self.assertEqual(history, [('received', ''), ('received', 'Washing'), ('received', 'Ironing'),
                                   ('received', 'Packing'), ('ready', '')])

    def test_bulk_move_rack_and_back(self):
        a, b = body(self.order()), body(self.order())
        res = self.move([a, b], 'ironing')
        self.assertEqual((res.status_code, res.data['message']), (200, '2 orders moved.'))
        self.move([a, b], 'ready', rack='B-12')
        self.assertEqual(Order.objects.get(pk=a['id']).rack, 'B-12')
        detail = body(self.client.get(f"/api/orders/{a['id']}/"))
        self.assertEqual((detail['status'], detail['rack'], detail['history'][-1]['note']), ('ready', 'B-12', 'Rack B-12'))

        self.move([a], 'received')  # back to the start: rack cleared
        self.assertEqual((self.stage_of(a), Order.objects.get(pk=a['id']).rack), (('received', None), ''))
        self.assertEqual(error_fields(self.move([a], 'drying')), {'to'})  # not a stage

    def test_renamed_and_hidden_stages(self):
        order = body(self.order())
        CommonMaster.objects.filter(type__code='PRODUCTION_STAGE', code='washing').update(is_active=False)
        self.move([order], 'next')
        self.assertEqual(self.stage_of(order), ('received', 'ironing'))  # hidden stage skipped

    def test_branch_scope_and_permissions(self):
        order = body(self.order())
        self.login(self.shj)
        self.assertEqual(body(self.client.get('/api/production/'))['orders'], [])
        self.assertEqual(error_fields(self.move([order], 'next')), {'orders'})  # not in this branch

        viewer = make_role('Board viewer', ['production.view'])
        self.make_user('viewer@shop.com', roles=[(viewer, self.dxb)])
        self.client.post('/api/auth/login/', {'email': 'viewer@shop.com', 'password': PASSWORD}, format='json')
        self.assertEqual(self.client.get('/api/production/').status_code, 200)
        self.assertEqual(self.move([order], 'next').status_code, 403)

    def test_stage_names_cannot_be_board_columns(self):
        self.as_owner()
        res = self.client.post('/api/common-masters/', {'type': 'PRODUCTION_STAGE', 'name': 'Ready'}, format='json')
        self.assertEqual(error_fields(res), {'name'})
        res = self.client.post('/api/common-masters/', {'type': 'PRODUCTION_STAGE', 'name': 'Drying'}, format='json')
        self.assertEqual(res.status_code, 201)


class CollectionTests(OrderFixture):
    def ready(self, **order_fields):
        order = body(self.order(**order_fields))
        self.client.post('/api/production/move/', {'orders': [order['id']], 'to': 'ready'}, format='json')
        return order

    def collect(self, orders, **extra):
        return self.client.post('/api/collection/collect/', {'orders': [o['id'] for o in orders], **extra},
                                format='json')

    def test_ready_list_and_collect_with_payment(self):
        a = self.ready(payment_method='cash', paid_amount='20')  # 60.50 − 20 = 40.50 due
        b = self.ready()                                          # 60.50 due
        body(self.order())                                        # not ready: not listed
        listed = body(self.client.get('/api/collection/?search_term=4567'))
        self.assertEqual(sorted(o['number'] for o in listed), ['DXB1-00001', 'DXB1-00002'])

        self.assertEqual(error_fields(self.collect([a, b])), {'payment_method'})          # 101.00 due
        self.assertEqual(error_fields(self.collect([a, b], payment_method='cash', amount='50')), {'amount'})
        res = self.collect([a, b], payment_method='card', amount='101.00')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['message'], 'Collected DXB1-00001, DXB1-00002.')

        for order in (a, b):
            o = Order.objects.get(pk=order['id'])
            self.assertEqual((o.status, o.balance, o.payment_method), ('collected', Decimal('0.00'), 'card'))
            self.assertIsNotNone(o.collected_at)
        self.assertEqual(sorted(Payment.objects.filter(method='card').values_list('amount', flat=True)),
                         [Decimal('40.50'), Decimal('60.50')])
        self.assertEqual(body(self.client.get('/api/collection/')), [])  # nothing left to collect
        self.assertEqual(self.client.post('/api/production/move/', {'orders': [a['id']], 'to': 'ready'},
                                          format='json').data['errors'][0]['field_name'], 'orders')  # closed

    def test_on_account_and_already_paid(self):
        due = self.ready()
        res = self.collect([due], payment_method='on_account')
        self.assertEqual(res.status_code, 200, res.data)
        o = Order.objects.get(pk=due['id'])
        self.assertEqual((o.status, o.balance, o.payment_method), ('collected', Decimal('60.50'), 'on_account'))

        paid = self.ready(payment_method='cash', paid_amount='60.50')
        self.assertEqual(self.collect([paid]).status_code, 200)  # nothing due: no payment needed

    def test_rules(self):
        not_ready = body(self.order())
        self.assertEqual(error_fields(self.collect([not_ready], payment_method='cash', amount='60.50')), {'orders'})
        other = Customer.objects.create(name='Ali', phone='+971500000009', branch=self.dxb)
        a, b = self.ready(), self.ready(customer=str(other.id))
        self.assertEqual(error_fields(self.collect([a, b], payment_method='cash', amount='121')), {'orders'})
        self.assertEqual(error_fields(self.collect([a], payment_method='on_collection')), {'payment_method'})

        viewer = make_role('Collection viewer', ['collection.view'])
        self.make_user('cv@shop.com', roles=[(viewer, self.dxb)])
        self.client.post('/api/auth/login/', {'email': 'cv@shop.com', 'password': PASSWORD}, format='json')
        self.assertEqual(self.client.get('/api/collection/').status_code, 200)
        self.assertEqual(self.collect([a], payment_method='cash', amount='60.50').status_code, 403)
