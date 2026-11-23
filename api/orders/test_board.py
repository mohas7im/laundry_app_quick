"""The board's extras (items, deadstock) and the order search."""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from accounts.tests import body, error_fields
from .models import Order
from .tests import OrderFixture

D = Decimal


class BoardAndSearchTests(OrderFixture):

    def move(self, order, to, rack=''):
        res = self.client.post('/api/production/move/', {'orders': [order['id']], 'to': to, 'rack': rack},
                               format='json')
        self.assertEqual(res.status_code, 200, res.data)

    def search(self, query=''):
        return [o['number'] for o in body(self.client.get(f'/api/orders/?{query}'))]

    def test_board_rows_and_ready_at(self):
        order = body(self.order(notes='No starch'))
        board = body(self.client.get('/api/production/'))
        row = board['orders'][0]
        self.assertEqual([(s['item_name'], s['quantity']) for s in row['summary']],
                         [('Kandura', '3'), ('Laundry by weight', '2.5')])
        self.assertEqual((row['notes'], row['created_by_name'], row['deadstock']), ('No starch', 'Staff', False))
        self.assertEqual([s['name'] for s in board['services']], ['Dry Clean', 'Wash & Iron'])
        self.assertEqual(board['deadstock_days'], 45)

        self.move(order, 'ready', 'B-1')
        ready_at = Order.objects.get(pk=order['id']).ready_at
        self.assertIsNotNone(ready_at)
        self.move(order, 'ready')  # already ready: the time stays
        self.assertEqual(Order.objects.get(pk=order['id']).ready_at, ready_at)
        self.move(order, 'received')
        self.assertIsNone(Order.objects.get(pk=order['id']).ready_at)

    def test_deadstock(self):
        old, fresh = body(self.order()), body(self.order())
        self.move(old, 'ready')
        self.move(fresh, 'ready')
        Order.objects.filter(pk=old['id']).update(ready_at=timezone.now() - timedelta(days=46))
        rows = {o['number']: o['deadstock'] for o in body(self.client.get('/api/collection/'))}
        self.assertEqual(rows, {old['number']: True, fresh['number']: False})
        self.assertEqual(self.search('deadstock=true'), [old['number']])

    def test_search_filters(self):
        cash = body(self.order(payment_method='cash', paid_amount='60.50'))
        express = body(self.order(is_express=True, lines=[
            {'item': str(self.kandura.id), 'service': str(self.dry.id), 'quantity': '1'}]))
        plain = body(self.order())
        self.move(plain, 'ready')

        self.assertEqual(self.search(), [plain['number'], express['number'], cash['number']])  # newest first
        self.assertEqual(self.search('express=true'), [express['number']])
        self.assertEqual(self.search('payment=paid'), [cash['number']])
        self.assertEqual(self.search('payment_method=cash'), [cash['number']])
        self.assertEqual(self.search('status=ready'), [plain['number']])
        today = timezone.localdate().isoformat()
        self.assertEqual(self.search(f'ready_from={today}&ready_to={today}'), [plain['number']])
        self.assertEqual(len(self.search(f'paid_from={today}')), 1)
        self.assertEqual(self.search('placed_to=2020-01-01'), [])
        self.assertEqual(error_fields(self.client.get('/api/orders/?placed_from=yesterday')), {'placed_from'})

        row = next(o for o in body(self.client.get('/api/orders/')) if o['number'] == plain['number'])
        self.assertEqual([s['step'] for s in row['staff']], ['Taken', 'Cleaned'])
