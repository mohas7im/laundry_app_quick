from datetime import time
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from catalogue.models import Item, Price, PriceList, Service, Upcharge
from customers.models import Customer
from masters.models import CommonMaster
from masters.registry import DISCOUNT_TYPE, PAYMENT_METHOD
from .models import BranchOrderCounter, Order, OrderLine, OrderLineUpcharge, OrderStatusHistory, Payment
from .payments import record_payment
from .pricing import LineInput, UpchargeRate, order_totals, price_line, suggested_ready_by

MONEY = {'max_digits': 10, 'decimal_places': 2, 'min_value': Decimal('0')}
PAID_NOW = {Order.PaymentMethod.CASH, Order.PaymentMethod.CARD, Order.PaymentMethod.BANK}


def order_settings():
    conf = settings.ORDERS
    hours, minutes = (int(p) for p in conf['READY_TIME'].split(':'))
    return {
        'vat_rate': Decimal(conf['VAT_RATE']),
        'ready_days': conf['READY_DAYS'],
        'express_ready_days': conf['EXPRESS_READY_DAYS'],
        'ready_time': time(hours, minutes),
    }


def default_price_list():
    return PriceList.objects.filter(is_default=True, is_active=True).first()


def master_names(type_code):
    """{code: name} of a common master list, e.g. {"cash": "Cash"}."""
    return dict(CommonMaster.of(type_code).values_list('code', 'name'))


def active_codes(type_code):
    return set(CommonMaster.of(type_code).filter(is_active=True).values_list('code', flat=True))


def quantity_text(value: Decimal) -> str:
    """3.000 → "3", 2.500 → "2.5"."""
    return format(value.normalize(), 'f')


# ── Create ────────────────────────────────────────────────────────────────

class LineInputSerializer(serializers.Serializer):
    item = serializers.PrimaryKeyRelatedField(
        queryset=Item.objects.filter(is_active=True).select_related('pricing_type'))
    service = serializers.PrimaryKeyRelatedField(queryset=Service.objects.filter(is_active=True))
    quantity = serializers.DecimalField(max_digits=8, decimal_places=3, min_value=Decimal('0.001'))
    upcharges = serializers.PrimaryKeyRelatedField(
        queryset=Upcharge.objects.filter(is_active=True).select_related('charge_type'), many=True,
        required=False, default=list)
    notes = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')

    def validate(self, attrs):
        if attrs['item'].pricing_type.code == Item.PricingType.UNIT and attrs['quantity'] != attrs['quantity'].to_integral():
            raise serializers.ValidationError({'quantity': 'Use a whole number of pieces.'})
        if len({u.pk for u in attrs['upcharges']}) != len(attrs['upcharges']):
            raise serializers.ValidationError({'upcharges': 'Each upcharge may be added once.'})
        return attrs


class OrderCreateSerializer(serializers.Serializer):
    """
    POST /api/orders/ — the counter's new order. Prices come from the default price
    list (never from the request); the branch is the active branch, the staff
    member the logged-in user.
    """

    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all())
    is_express = serializers.BooleanField(default=False)
    ready_by = serializers.DateTimeField(required=False, allow_null=True, default=None)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    bag_drop_pieces = serializers.IntegerField(min_value=0, max_value=10000, default=0)
    lines = LineInputSerializer(many=True, required=False, default=list)
    discount_type = serializers.ChoiceField(choices=Order.DiscountType.choices, required=False, allow_blank=True,
                                            default='')
    discount_value = serializers.DecimalField(**MONEY, default=Decimal('0'))
    discount_reason = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    payment_method = serializers.ChoiceField(choices=Order.PaymentMethod.choices,
                                             default=Order.PaymentMethod.ON_COLLECTION)
    paid_amount = serializers.DecimalField(**MONEY, default=Decimal('0'))

    def validate(self, attrs):
        conf = order_settings()
        errors = {}

        price_list = default_price_list()
        if price_list is None:
            raise serializers.ValidationError(
                {'detail': 'There is no default price list. Set one up under Catalogue → Price Lists.'})
        attrs['price_list'] = price_list

        if not attrs['lines'] and not attrs['bag_drop_pieces']:
            errors['lines'] = 'Add at least one item, or use bag drop with a piece count.'

        # price every line from the price list
        prices = {
            (p.item_id, p.service_id): p
            for p in Price.objects.filter(price_list=price_list, item__in=[l['item'] for l in attrs['lines']])
        }
        priced, extra_days = [], 0
        for index, line in enumerate(attrs['lines']):
            item, service = line['item'], line['service']
            price = prices.get((item.pk, service.pk))
            if price is None:
                errors[f'lines[{index}].item'] = f'{item.name} has no {service.name} price in {price_list.name}.'
                continue
            unit_price = price.express_price if attrs['is_express'] else price.price
            if unit_price is None:
                errors[f'lines[{index}].item'] = f'{item.name} has no express {service.name} price.'
                continue
            result = price_line(LineInput(
                unit_price=unit_price, quantity=line['quantity'], min_price=price.min_price,
                upcharges=[UpchargeRate(u.name, u.charge_type.code, u.amount) for u in line['upcharges']],
            ))
            priced.append((line, unit_price, price.min_price, result))
            extra_days = max(extra_days, price.extra_days)

        # payment method and discount type: active values of their common master lists
        if attrs['payment_method'] not in active_codes(PAYMENT_METHOD):
            errors['payment_method'] = 'This payment method is not available.'
        if attrs['discount_type'] and attrs['discount_type'] not in active_codes(DISCOUNT_TYPE):
            errors['discount_type'] = 'This discount type is not available.'

        # discount
        value = attrs['discount_value']
        if value > 0:
            if not attrs['discount_type']:
                errors['discount_type'] = 'Choose an amount or a percent.'
            elif attrs['discount_type'] == Order.DiscountType.PERCENT and value > 100:
                errors['discount_value'] = 'A percent discount can be at most 100.'
            if not attrs['discount_reason'].strip():
                errors['discount_reason'] = 'Give a reason for the discount.'
        else:
            attrs['discount_type'] = ''

        if errors:
            raise serializers.ValidationError(errors)

        totals = order_totals([r.total for *_, r in priced], attrs['discount_type'], value, conf['vat_rate'])

        # payment
        paid, method = attrs['paid_amount'], attrs['payment_method']
        if paid > totals.total:
            errors['paid_amount'] = f'The order total is {totals.total}; the customer can pay at most that.'
        elif paid > 0 and method not in PAID_NOW:
            errors['payment_method'] = 'Choose cash, card or bank transfer for money paid now.'
        elif paid == 0 and method in PAID_NOW and totals.total > 0:
            errors['paid_amount'] = 'Enter the amount paid, or choose pay on collection.'

        # ready-by: the suggestion unless staff picked a time
        now = timezone.localtime()
        if attrs['ready_by'] is None:
            attrs['ready_by'] = suggested_ready_by(
                now, express=attrs['is_express'], extra_days=extra_days, ready_days=conf['ready_days'],
                express_ready_days=conf['express_ready_days'], ready_time=conf['ready_time'])
        elif attrs['ready_by'] <= now:
            errors['ready_by'] = 'Choose a time in the future.'

        if errors:
            raise serializers.ValidationError(errors)

        attrs['priced'] = priced
        attrs['totals'] = totals
        return attrs

    @transaction.atomic
    def save(self, *, branch, user):
        data = self.validated_data
        totals = data['totals']

        # number: lock the branch's counter so two counters never get the same number
        counter, _ = BranchOrderCounter.objects.select_for_update().get_or_create(branch=branch)
        counter.last_number += 1
        counter.save(update_fields=['last_number'])

        order = Order.objects.create(
            number=f'{branch.code}-{counter.last_number:05d}',
            branch=branch, customer=data['customer'], price_list=data['price_list'],
            is_express=data['is_express'], ready_by=data['ready_by'], notes=data['notes'].strip(),
            bag_drop_pieces=data['bag_drop_pieces'],
            subtotal=totals.subtotal, discount_type=data['discount_type'], discount_value=data['discount_value'],
            discount_amount=totals.discount_amount, discount_reason=data['discount_reason'].strip(),
            total=totals.total, vat_amount=totals.vat_amount,
            paid_amount=data['paid_amount'], payment_method=data['payment_method'],
            created_by=user,
        )
        for position, (line, unit_price, min_price, result) in enumerate(data['priced']):
            order_line = OrderLine.objects.create(
                order=order, item=line['item'], service=line['service'], item_name=line['item'].name,
                service_name=line['service'].name, pricing_type=line['item'].pricing_type.code,
                quantity=line['quantity'], unit_price=unit_price, min_price=min_price,
                upcharge_total=result.upcharge_total, line_total=result.total, notes=line['notes'].strip(),
                position=position,
            )
            OrderLineUpcharge.objects.bulk_create(
                OrderLineUpcharge(line=order_line, upcharge=u, name=u.name, charge_type=u.charge_type.code,
                                  rate=u.amount, amount=amount)
                for u, amount in zip(line['upcharges'], result.upcharge_amounts)
            )
        if data['paid_amount'] > 0:
            order.paid_amount = 0  # record_payment adds it (and links the cashier's shift)
            record_payment(order, data['paid_amount'], data['payment_method'], user)
        OrderStatusHistory.objects.create(order=order, status=Order.Status.RECEIVED, changed_by=user)
        return order


# ── Read ──────────────────────────────────────────────────────────────────

class OrderLineSerializer(serializers.ModelSerializer):
    quantity = serializers.SerializerMethodField()
    upcharges = serializers.SerializerMethodField()

    class Meta:
        model = OrderLine
        fields = ['id', 'item', 'service', 'item_name', 'service_name', 'pricing_type', 'quantity', 'unit_price',
                  'min_price', 'upcharges', 'upcharge_total', 'line_total', 'notes']

    def get_quantity(self, line):
        return quantity_text(line.quantity)

    def get_upcharges(self, line):
        return [{'name': u.name, 'amount': str(u.amount)} for u in line.upcharges.all()]


class OrderListSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    stage = serializers.SlugRelatedField(slug_field='code', read_only=True)
    stage_name = serializers.CharField(source='stage.name', read_only=True, default='')
    customer_phone = serializers.CharField(source='customer.phone', read_only=True)
    balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    pieces = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ['id', 'number', 'customer', 'customer_name', 'customer_phone', 'status', 'stage', 'stage_name',
                  'rack', 'is_express', 'ready_by', 'pieces', 'total', 'paid_amount', 'balance', 'collected_at',
                  'created_at']

    def get_pieces(self, order):
        """Pieces handed in: unit items counted, kg/m² lines count as one bag; bag drop adds its count."""
        lines = order.lines.all()
        counted = sum(int(l.quantity) if l.pricing_type == 'unit' else 1 for l in lines)
        return counted + order.bag_drop_pieces


class OrderSerializer(OrderListSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    branch_code = serializers.CharField(source='branch.code', read_only=True)
    price_list_name = serializers.CharField(source='price_list.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)
    lines = OrderLineSerializer(many=True, read_only=True)
    payment_method_name = serializers.SerializerMethodField()
    history = serializers.SerializerMethodField()
    payments = serializers.SerializerMethodField()

    def get_payments(self, order):
        names = master_names(PAYMENT_METHOD)
        return [
            {'id': str(p.id), 'kind': p.kind, 'amount': str(p.amount), 'method': p.method,
             'method_name': names.get(p.method, p.method), 'reason': p.reason,
             'received_by_name': p.received_by.full_name, 'created_at': p.created_at}
            for p in order.payments.all()
        ]

    def get_history(self, order):
        """The timeline: every status / stage change, who and when."""
        return [
            {'status': h.status, 'stage_name': h.stage_name, 'note': h.note,
             'changed_by_name': h.changed_by.full_name, 'changed_at': h.changed_at}
            for h in order.history.all()
        ]

    def get_payment_method_name(self, order):
        return master_names(PAYMENT_METHOD).get(order.payment_method, order.payment_method)

    class Meta(OrderListSerializer.Meta):
        fields = OrderListSerializer.Meta.fields + [
            'branch_name', 'branch_code', 'price_list_name', 'notes', 'bag_drop_pieces', 'lines',
            'subtotal', 'discount_type', 'discount_value', 'discount_amount', 'discount_reason', 'vat_amount',
            'payment_method', 'payment_method_name', 'created_by_name', 'history', 'payments',
        ]
