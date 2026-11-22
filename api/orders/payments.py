"""
Money in and out of orders (M6). Every payment and refund goes through record_payment():

- It points at the cashier's open shift at the order's branch, so the cash-up counts it.
- Cash needs an open shift: cash taken or given back outside a shift could never be
  counted. Card and bank need none (they are still linked when a shift is open).
- order.paid_amount follows: + a payment, − a refund.
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import F
from rest_framework import serializers

from cashier.models import Shift
from masters.models import CommonMaster
from masters.registry import PAYMENT_METHOD
from .models import Order, Payment

PAID_NOW = {Order.PaymentMethod.CASH, Order.PaymentMethod.CARD, Order.PaymentMethod.BANK}
MONEY = {'max_digits': 10, 'decimal_places': 2}

NO_SHIFT = 'Open your cash shift (Cash-up page) before taking or giving back cash.'


def open_shift(user, branch_id):
    return Shift.objects.filter(opened_by=user, branch_id=branch_id, closed_at__isnull=True).first()


def record_payment(order, amount, method, user, *, kind=Payment.Kind.PAYMENT, reason=''):
    shift = open_shift(user, order.branch_id)
    if method == Order.PaymentMethod.CASH and shift is None:
        raise serializers.ValidationError({'payment_method': NO_SHIFT})
    payment = Payment.objects.create(order=order, kind=kind, amount=amount, method=method, reason=reason,
                                     shift=shift, received_by=user)
    order.paid_amount += amount if kind == Payment.Kind.PAYMENT else -amount
    order.save(update_fields=['paid_amount', 'updated_at'])
    return payment


def usable_methods():
    """Cash, card and bank, unless hidden in Common Masters."""
    active = set(CommonMaster.of(PAYMENT_METHOD).filter(is_active=True).values_list('code', flat=True))
    return PAID_NOW & active


def outstanding_orders(customer):
    """A customer's orders with money still due (not cancelled), oldest first."""
    return (Order.objects.filter(customer=customer).exclude(status=Order.Status.CANCELLED)
            .filter(total__gt=F('paid_amount')).order_by('created_at'))


class _MoneyIn(serializers.Serializer):
    amount = serializers.DecimalField(**MONEY, min_value=Decimal('0.01'))
    payment_method = serializers.CharField(max_length=20)

    def validate_payment_method(self, value):
        if value not in usable_methods():
            raise serializers.ValidationError('Choose cash, card or bank transfer.')
        return value


class PaySerializer(_MoneyIn):
    """POST /api/orders/<id>/pay/ — take money for one order (up to its balance)."""

    def validate(self, attrs):
        order = self.context['order']
        if order.status == Order.Status.CANCELLED:
            raise serializers.ValidationError({'detail': 'This order is cancelled.'})
        if attrs['amount'] > order.balance:
            raise serializers.ValidationError({'amount': f'The balance is AED {order.balance}.'})
        return attrs

    @transaction.atomic
    def save(self, user):
        order = Order.objects.select_for_update().get(pk=self.context['order'].pk)
        return record_payment(order, self.validated_data['amount'], self.validated_data['payment_method'], user)


class RefundSerializer(_MoneyIn):
    """POST /api/orders/<id>/refund/ — give money back (up to what was paid), with a reason."""

    reason = serializers.CharField(max_length=200)

    def validate_reason(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Say why the money is given back.', code='blank')
        return value

    def validate(self, attrs):
        if attrs['amount'] > self.context['order'].paid_amount:
            raise serializers.ValidationError(
                {'amount': f'Only AED {self.context["order"].paid_amount} was paid on this order.'})
        return attrs

    @transaction.atomic
    def save(self, user):
        order = Order.objects.select_for_update().get(pk=self.context['order'].pk)
        data = self.validated_data
        return record_payment(order, data['amount'], data['payment_method'], user,
                              kind=Payment.Kind.REFUND, reason=data['reason'])


class SettleSerializer(_MoneyIn):
    """
    POST /api/customers/<id>/settle/ — one payment for what a customer owes, spread over
    their unpaid orders oldest first (an order may end part-paid).
    """

    def validate(self, attrs):
        due = sum((o.balance for o in outstanding_orders(self.context['customer'])), Decimal('0'))
        if due == 0:
            raise serializers.ValidationError({'detail': 'This customer owes nothing.'})
        if attrs['amount'] > due:
            raise serializers.ValidationError({'amount': f'The customer owes AED {due}.'})
        return attrs

    @transaction.atomic
    def save(self, user):
        left = self.validated_data['amount']
        payments = []
        for order in outstanding_orders(self.context['customer']).select_for_update():
            if left <= 0:
                break
            part = min(left, order.balance)
            payments.append(record_payment(order, part, self.validated_data['payment_method'], user))
            left -= part
        return payments
