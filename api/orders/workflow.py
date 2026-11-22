"""
M5 production and collection rules.

The board's columns: Received (no stage yet) → each active PRODUCTION_STAGE in order
→ Ready. Moving targets: "received", a stage code, "ready", or "next" (the order's
next column: what a scan or the → button does).

Collecting: ready orders are handed back. Their balance is paid in full now (cash,
card, bank: one payment per order), or left on the customer's account (on account).
"""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from masters.models import CommonMaster
from masters.registry import PAYMENT_METHOD, PRODUCTION_STAGE
from .models import Order, OrderStatusHistory, Payment

RECEIVED, READY, NEXT = 'received', 'ready', 'next'
OPEN = (Order.Status.RECEIVED, Order.Status.READY)  # on the production board
PAID_NOW = {Order.PaymentMethod.CASH, Order.PaymentMethod.CARD, Order.PaymentMethod.BANK}


def active_stages():
    return list(CommonMaster.of(PRODUCTION_STAGE).filter(is_active=True))


def next_column(order, stages):
    """Where "next" takes an order: the next stage, or Ready after the last one. None when ready."""
    if order.status == Order.Status.READY:
        return None
    codes = [s.code for s in stages]
    if order.stage is None or order.stage.code not in codes:
        return codes[0] if codes else READY
    position = codes.index(order.stage.code)
    return codes[position + 1] if position + 1 < len(codes) else READY


def _log(order, user, note=''):
    OrderStatusHistory.objects.create(order=order, status=order.status,
                                      stage_name=order.stage.name if order.stage else '', note=note,
                                      changed_by=user)


class MoveSerializer(serializers.Serializer):
    """POST /api/production/move/ — move one or more open orders of the active branch."""

    orders = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=200)
    to = serializers.CharField(max_length=50)
    rack = serializers.CharField(max_length=30, required=False, allow_blank=True, default='')

    def validate(self, attrs):
        branch_id = self.context['branch_id']
        found = {o.pk: o for o in Order.objects.filter(pk__in=attrs['orders'], branch_id=branch_id)
                 .select_related('stage')}
        missing = [str(pk) for pk in attrs['orders'] if pk not in found]
        if missing:
            raise serializers.ValidationError({'orders': 'Some orders were not found in this branch.'})
        closed = [o.number for o in found.values() if o.status not in OPEN]
        if closed:
            raise serializers.ValidationError(
                {'orders': f'{", ".join(closed)} already collected or cancelled: they can\'t move.'})

        stages = active_stages()
        by_code = {s.code: s for s in stages}
        to = attrs['to']
        if to not in (RECEIVED, READY, NEXT) and to not in by_code:
            raise serializers.ValidationError({'to': 'Choose Received, a production stage or Ready.'})
        if to == NEXT and all(o.status == Order.Status.READY for o in found.values()):
            raise serializers.ValidationError({'to': 'These orders are already ready.'})

        attrs['orders'] = [found[pk] for pk in attrs['orders']]
        attrs['stages'] = stages
        attrs['by_code'] = by_code
        return attrs

    @transaction.atomic
    def save(self, user):
        data = self.validated_data
        moved = []
        for order in data['orders']:
            target = next_column(order, data['stages']) if data['to'] == NEXT else data['to']
            if target is None:
                continue  # already ready
            if target == READY:
                order.status, order.stage, order.rack = Order.Status.READY, None, data['rack'].strip()
            elif target == RECEIVED:
                order.status, order.stage, order.rack = Order.Status.RECEIVED, None, ''
            else:
                order.status, order.stage, order.rack = Order.Status.RECEIVED, data['by_code'][target], ''
            order.save(update_fields=['status', 'stage', 'rack', 'updated_at'])
            _log(order, user, note=f'Rack {order.rack}' if order.rack else '')
            moved.append(order)
        return moved


class CollectSerializer(serializers.Serializer):
    """
    POST /api/collection/collect/ — hand back ready orders of the active branch.
    payment_method: cash / card / bank (amount = the whole balance), or on_account
    (the balance stays on the customer's account). Not needed when nothing is due.
    """

    orders = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=100)
    payment_method = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0'), default=Decimal('0'))

    def validate(self, attrs):
        orders = list(Order.objects.filter(pk__in=attrs['orders'], branch_id=self.context['branch_id'])
                      .select_related('customer').order_by('number'))
        if len(orders) != len(set(attrs['orders'])):
            raise serializers.ValidationError({'orders': 'Some orders were not found in this branch.'})
        not_ready = [o.number for o in orders if o.status != Order.Status.READY]
        if not_ready:
            raise serializers.ValidationError({'orders': f'{", ".join(not_ready)} not ready yet.'})
        if len({o.customer_id for o in orders}) > 1:
            raise serializers.ValidationError({'orders': 'Collect one customer\'s orders at a time.'})

        due = sum((o.balance for o in orders), Decimal('0'))
        method, amount = attrs['payment_method'], attrs['amount']
        if due > 0:
            usable = set(CommonMaster.of(PAYMENT_METHOD).filter(is_active=True).values_list('code', flat=True))
            if method not in (PAID_NOW | {Order.PaymentMethod.ON_ACCOUNT}) or method not in usable:
                raise serializers.ValidationError(
                    {'payment_method': f'AED {due} is due. Choose cash, card, bank transfer or on account.'})
            if method in PAID_NOW and amount != due:
                raise serializers.ValidationError({'amount': f'Take the whole balance: AED {due}.'})
            if method == Order.PaymentMethod.ON_ACCOUNT and amount:
                raise serializers.ValidationError({'amount': 'Nothing is paid now when it goes on account.'})
        elif amount:
            raise serializers.ValidationError({'amount': 'Nothing is due on these orders.'})

        attrs['orders'], attrs['due'] = orders, due
        return attrs

    @transaction.atomic
    def save(self, user):
        data = self.validated_data
        now = timezone.now()
        method_name = dict(CommonMaster.of(PAYMENT_METHOD).values_list('code', 'name')).get(data['payment_method'], '')
        for order in data['orders']:
            balance = order.balance
            if balance > 0 and data['payment_method'] in PAID_NOW:
                Payment.objects.create(order=order, amount=balance, method=data['payment_method'], received_by=user)
                order.paid_amount += balance
                order.payment_method = data['payment_method']
            elif balance > 0:
                order.payment_method = Order.PaymentMethod.ON_ACCOUNT
            order.status, order.collected_at = Order.Status.COLLECTED, now
            order.save(update_fields=['status', 'collected_at', 'paid_amount', 'payment_method', 'updated_at'])
            note = (f'Paid AED {balance} ({method_name})' if balance > 0 and data['payment_method'] in PAID_NOW
                    else f'AED {balance} on account' if balance > 0 else '')
            _log(order, user, note=note)
        return data['orders']
