from datetime import time, timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from catalogue.models import Item, Price, PriceList, Service, Upcharge
from customers.models import Customer
from customers.preferences import preferences_text
from masters.models import CommonMaster
from masters.registry import DISCOUNT_TYPE, ITEM_COLOUR, ITEM_DAMAGE, ITEM_STAIN, PAYMENT_METHOD
from .approval import approve, discount_need, paid_order_need
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


def branch_calendar(branch_id):
    """The branch's ready-by rules: cut-off, closing time, closed weekdays, holidays from today."""
    from branches.models import Branch, BranchHoliday

    branch = Branch.objects.filter(pk=branch_id).first()
    if branch is None:
        return {}
    return {
        'cutoff': branch.cutoff_time,
        'closes_at': branch.closes_at,
        'closed_weekdays': [d for d in branch.closed_weekdays if isinstance(d, int) and 0 <= d <= 6],
        'holidays': list(BranchHoliday.objects.filter(branch=branch, date__gte=timezone.localdate())
                         .values_list('date', flat=True)[:400]),
    }


def ready_days_for(services, default_days):
    """The slowest service of the order sets its days (a service without its own uses the default)."""
    return max((default_days if s.ready_days is None else s.ready_days for s in services), default=default_days)


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


# ── Create and edit ───────────────────────────────────────────────────────

PIECE_TAGS = {'colours': ITEM_COLOUR, 'damage': ITEM_DAMAGE, 'stains': ITEM_STAIN}


class PieceSerializer(serializers.Serializer):
    """The tags of one piece: names from the ITEM_COLOUR / ITEM_DAMAGE / ITEM_STAIN lists, and a note."""

    colours = serializers.ListField(child=serializers.CharField(max_length=80), required=False, default=list)
    damage = serializers.ListField(child=serializers.CharField(max_length=80), required=False, default=list)
    stains = serializers.ListField(child=serializers.CharField(max_length=80), required=False, default=list)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')


# Comfort: one-off items use the catalogue item named "Custom item" (it has no prices, so it is never a tile)
CUSTOM_ITEM = 'custom item'


def is_custom_item(item) -> bool:
    return item.name.strip().lower() == CUSTOM_ITEM


def price_changes(priced) -> str:
    """For the timeline: custom items and changed prices of an order."""
    parts = []
    for line, unit_price, _min, _result, list_price in priced:
        if is_custom_item(line['item']):
            parts.append(f"custom {line['custom_name'].strip()} {unit_price}")
        elif list_price is not None:
            parts.append(f"{line['item'].name} {list_price} -> {unit_price} ({line['price_reason'].strip()})")
    return ('Prices: ' + '; '.join(parts)) if parts else ''


class LineInputSerializer(serializers.Serializer):
    item = serializers.PrimaryKeyRelatedField(
        queryset=Item.objects.filter(is_active=True).select_related('pricing_type'))
    service = serializers.PrimaryKeyRelatedField(queryset=Service.objects.filter(is_active=True))
    quantity = serializers.DecimalField(max_digits=8, decimal_places=3, min_value=Decimal('0.001'))
    upcharges = serializers.PrimaryKeyRelatedField(
        queryset=Upcharge.objects.filter(is_active=True).select_related('charge_type'), many=True,
        required=False, default=list)
    notes = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    pieces = PieceSerializer(many=True, required=False, default=list)
    # Comfort: a price changed at the counter (with a reason), and custom items (name, price, pieces)
    unit_price = serializers.DecimalField(**MONEY, required=False, allow_null=True,
                                          default=None)
    price_reason = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    custom_name = serializers.CharField(max_length=80, required=False, allow_blank=True, default='')
    custom_pieces = serializers.IntegerField(min_value=1, max_value=50, required=False, default=1)

    def validate(self, attrs):
        custom = is_custom_item(attrs['item'])
        if custom and not attrs['custom_name'].strip():
            raise serializers.ValidationError({'custom_name': 'Write the name of the custom item.'})
        if custom and attrs['unit_price'] is None:
            raise serializers.ValidationError({'unit_price': 'Enter the price of the custom item.'})
        if not custom and attrs['unit_price'] is not None and not attrs['price_reason'].strip():
            raise serializers.ValidationError({'price_reason': 'Say why the price is changed.'})
        is_unit = attrs['item'].pricing_type.code == Item.PricingType.UNIT
        if is_unit and attrs['quantity'] != attrs['quantity'].to_integral():
            raise serializers.ValidationError({'quantity': 'Use a whole number of pieces.'})
        if len({u.pk for u in attrs['upcharges']}) != len(attrs['upcharges']):
            raise serializers.ValidationError({'upcharges': 'Each upcharge may be added once.'})
        # one entry per piece (a weighed line is one bag); drop repeats and empty trailing pieces
        pieces = [
            {**{tag: list(dict.fromkeys(n.strip() for n in p[tag] if n.strip())) for tag in PIECE_TAGS},
             'note': p['note'].strip()}
            for p in attrs['pieces']
        ]
        while pieces and not any(pieces[-1].values()):
            pieces.pop()
        per_item = attrs['custom_pieces'] if custom else attrs['item'].pieces
        if len(pieces) > (int(attrs['quantity']) * per_item if is_unit else 1):
            raise serializers.ValidationError({'pieces': 'There are more piece notes than pieces.'})
        attrs['pieces'] = pieces
        return attrs


def price_table(price_list, default, items):
    """{(item id, service id): Price} from the customer's price list, and the default list for the rest."""
    lists = [default] if price_list == default else [default, price_list]  # the later list wins
    table = {}
    for current in lists:
        for p in Price.objects.filter(price_list=current, item__in=items):
            table[(p.item_id, p.service_id)] = p
    return table


class OrderInputSerializer(serializers.Serializer):
    """
    What the counter sends for an order: customer, lines, express, notes, discount.
    Prices always come from the price lists (never from the request): the customer's own
    list, else the default one. Context: user (the staff member), branch_id (active branch).
    """

    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.select_related('price_list'))
    is_express = serializers.BooleanField(default=False)
    ready_by = serializers.DateTimeField(required=False, allow_null=True, default=None)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    save_notes = serializers.BooleanField(default=False, help_text='Keep the notes on the customer for next time.')
    bag_drop_pieces = serializers.IntegerField(min_value=0, max_value=10000, default=0)
    lines = LineInputSerializer(many=True, required=False, default=list)
    discount_type = serializers.ChoiceField(choices=Order.DiscountType.choices, required=False, allow_blank=True,
                                            default='')
    discount_value = serializers.DecimalField(**MONEY, default=Decimal('0'))
    discount_reason = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    approval_pin = serializers.CharField(required=False, allow_blank=True, default='', write_only=True)

    order = None  # the order being edited (OrderUpdateSerializer)

    def approval_needs(self, attrs):
        """What needs a manager here (orders/approval.py)."""
        totals = attrs['totals']
        needs = []
        if totals.discount_amount > 0 and totals.subtotal > 0 and not self._pre_approved_discount(attrs):
            percent = (totals.discount_amount * 100 / totals.subtotal).quantize(Decimal('0.01'))
            needs.append(discount_need(percent, self.context['branch_id']))
        return needs

    def _pre_approved_discount(self, attrs):
        """The customer's own discount, or (when editing) the discount the order already had."""
        customer = attrs['customer']
        if (attrs['discount_type'] == Order.DiscountType.PERCENT
                and 0 < attrs['discount_value'] <= customer.discount_percent):
            return True
        o = self.order
        return bool(o and o.discount_amount > 0 and o.discount_type == attrs['discount_type']
                    and o.discount_value == attrs['discount_value'])

    def validate(self, attrs):
        conf = order_settings()
        errors = {}

        default = default_price_list()
        if default is None:
            raise serializers.ValidationError(
                {'detail': 'There is no default price list. Set one up under Catalogue → Price Lists.'})
        customer = attrs['customer']
        own = customer.price_list if customer.price_list_id and customer.price_list.is_active else None
        attrs['price_list'] = own or default

        if not attrs['lines'] and not attrs['bag_drop_pieces']:
            errors['lines'] = 'Add at least one item, or use bag drop with a piece count.'

        # price every line
        prices = price_table(attrs['price_list'], default, [l['item'] for l in attrs['lines']])
        priced, extra_days = [], 0
        for index, line in enumerate(attrs['lines']):
            item, service = line['item'], line['service']
            rates = [UpchargeRate(u.name, u.charge_type.code, u.amount) for u in line['upcharges']]
            override = line['unit_price']
            if is_custom_item(item):  # Comfort: priced by staff, for this order only
                result = price_line(LineInput(unit_price=override, quantity=line['quantity'], upcharges=rates))
                priced.append((line, override, None, result, None))
                continue
            price = prices.get((item.pk, service.pk))
            list_unit = None if price is None else (price.express_price if attrs['is_express'] else price.price)
            if override is None and price is None:
                errors[f'lines[{index}].item'] = f'{item.name} has no {service.name} price.'
                continue
            if override is None and list_unit is None:
                errors[f'lines[{index}].item'] = f'{item.name} has no express {service.name} price.'
                continue
            # Comfort: a price changed at the counter wins (no minimum); the list price is kept for the record
            changed = override is not None and override != list_unit
            unit_price = override if changed else list_unit
            min_price = None if changed or price is None else price.min_price
            result = price_line(LineInput(unit_price=unit_price, quantity=line['quantity'], min_price=min_price,
                                          upcharges=rates))
            priced.append((line, unit_price, min_price, result, list_unit if changed else None))
            if price is not None:
                extra_days = max(extra_days, price.extra_days)

        # piece tags: names from their lists
        if any(line['pieces'] for line in attrs['lines']):
            names = {}
            for type_code, name in CommonMaster.objects.filter(type__code__in=PIECE_TAGS.values()) \
                    .values_list('type__code', 'name'):
                names.setdefault(type_code, set()).add(name)
            for index, line in enumerate(attrs['lines']):
                for piece in line['pieces']:
                    for tag, type_code in PIECE_TAGS.items():
                        unknown = [n for n in piece[tag] if n not in names.get(type_code, ())]
                        if unknown:
                            errors[f'lines[{index}].pieces'] = f'Unknown {tag}: {", ".join(unknown)}.'

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

        # ready-by: the suggestion unless staff picked a time (when editing, an unchanged time may be past)
        now = timezone.localtime()
        if attrs['ready_by'] is None:
            attrs['ready_by'] = suggested_ready_by(
                now, express=attrs['is_express'], extra_days=extra_days,
                ready_days=ready_days_for([l['service'] for l in attrs['lines']], conf['ready_days']),
                express_ready_days=conf['express_ready_days'], ready_time=conf['ready_time'],
                **branch_calendar(self.context['branch_id']))
        elif attrs['ready_by'] <= now and not (self.order and attrs['ready_by'] == self.order.ready_by):
            errors['ready_by'] = 'Choose a time in the future.'

        if errors:
            raise serializers.ValidationError(errors)

        attrs['priced'] = priced
        attrs['totals'] = order_totals([p[3].total for p in priced], attrs['discount_type'], value,
                                       conf['vat_rate'])
        return attrs

    def check_approval(self, attrs):
        """Called last: the PIN is only asked for an order that is otherwise fine."""
        attrs['approver'] = approve(self.approval_needs(attrs), user=self.context['user'],
                                    pin=attrs['approval_pin'])
        return attrs

    # ── saving ──

    def _fields(self):
        data = self.validated_data
        totals = data['totals']
        fields = dict(
            customer=data['customer'], price_list=data['price_list'], is_express=data['is_express'],
            ready_by=data['ready_by'], notes=data['notes'].strip(), bag_drop_pieces=data['bag_drop_pieces'],
            preferences=preferences_text(data['customer'].preferences)[:300],
            subtotal=totals.subtotal, discount_type=data['discount_type'], discount_value=data['discount_value'],
            discount_amount=totals.discount_amount, discount_reason=data['discount_reason'].strip(),
            total=totals.total, vat_amount=totals.vat_amount,
        )
        if totals.discount_amount == 0:
            fields['discount_approved_by'] = None
        elif data['approver'] is not None:
            fields['discount_approved_by'] = data['approver']
        return fields

    def _save_lines(self, order):
        for position, (line, unit_price, min_price, result, list_price) in enumerate(self.validated_data['priced']):
            custom = is_custom_item(line['item'])
            order_line = OrderLine.objects.create(
                order=order, item=line['item'], service=line['service'],
                item_name=line['custom_name'].strip() if custom else line['item'].name,
                service_name=line['service'].name, pricing_type=line['item'].pricing_type.code,
                quantity=line['quantity'], pieces_per_item=line['custom_pieces'] if custom else line['item'].pieces,
                unit_price=unit_price, min_price=min_price, list_price=list_price,
                price_reason=line['price_reason'].strip() if list_price is not None else '',
                upcharge_total=result.upcharge_total, line_total=result.total, notes=line['notes'].strip(),
                pieces=line['pieces'], position=position,
            )
            OrderLineUpcharge.objects.bulk_create(
                OrderLineUpcharge(line=order_line, upcharge=u, name=u.name, charge_type=u.charge_type.code,
                                  rate=u.amount, amount=amount)
                for u, amount in zip(line['upcharges'], result.upcharge_amounts)
            )

    def _save_customer_notes(self):
        """"Save" on the notes: they become the customer's notes and fill in on their next order."""
        data = self.validated_data
        notes = data['notes'].strip()
        if data['save_notes'] and data['customer'].notes != notes:
            data['customer'].notes = notes
            data['customer'].save(update_fields=['notes', 'updated_at'])


class OrderCreateSerializer(OrderInputSerializer):
    """POST /api/orders/ — the counter's new order, with money taken now (or pay on collection)."""

    payment_method = serializers.ChoiceField(choices=Order.PaymentMethod.choices,
                                             default=Order.PaymentMethod.ON_COLLECTION)
    paid_amount = serializers.DecimalField(**MONEY, default=Decimal('0'))

    def validate(self, attrs):
        attrs = super().validate(attrs)
        errors = {}
        total = attrs['totals'].total
        paid, method = attrs['paid_amount'], attrs['payment_method']
        if method not in active_codes(PAYMENT_METHOD):
            errors['payment_method'] = 'This payment method is not available.'
        elif paid > total:
            errors['paid_amount'] = f'The order total is {total}; the customer can pay at most that.'
        elif paid > 0 and method not in PAID_NOW:
            errors['payment_method'] = 'Choose cash, card or bank transfer for money paid now.'
        elif paid == 0 and method in PAID_NOW and total > 0:
            errors['paid_amount'] = 'Enter the amount paid, or choose pay on collection.'
        if errors:
            raise serializers.ValidationError(errors)
        return self.check_approval(attrs)

    @transaction.atomic
    def save(self, *, branch, user):
        data = self.validated_data

        # number: lock the branch's counter so two counters never get the same number
        counter, _ = BranchOrderCounter.objects.select_for_update().get_or_create(branch=branch)
        counter.last_number += 1
        counter.save(update_fields=['last_number'])

        order = Order.objects.create(
            number=str(counter.last_number), branch=branch,  # Comfort: plain invoice numbers (3001, 3002, ...)
            payment_method=data['payment_method'], created_by=user, **self._fields(),
        )
        self._save_lines(order)
        if data['paid_amount'] > 0:
            record_payment(order, data['paid_amount'], data['payment_method'], user)  # adds to paid_amount
        OrderStatusHistory.objects.create(order=order, status=Order.Status.RECEIVED, changed_by=user,
                                          note=price_changes(data['priced'])[:200])
        self._save_customer_notes()
        return order


EDITABLE = (Order.Status.RECEIVED, Order.Status.READY)


class OrderUpdateSerializer(OrderInputSerializer):
    """
    PUT /api/orders/<id>/ — change an order that hasn't been collected: lines, notes, express,
    ready-by, discount (re-priced from today's price lists). No money is taken here (Pay and
    Refund do that). The reason goes on the timeline. A paid order needs a manager's approval
    and can't end up below what was paid.
    """

    reason = serializers.CharField(max_length=200, allow_blank=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.order = self.context['order']

    def approval_needs(self, attrs):
        needs = super().approval_needs(attrs)
        if self.order.paid_amount > 0:
            needs.append(paid_order_need(self.context['branch_id']))
        return needs

    def validate(self, attrs):
        if self.order.status not in EDITABLE:
            raise serializers.ValidationError(
                {'detail': f'This order is {self.order.get_status_display().lower()}; it can no longer be changed.'})
        if not attrs.get('reason', '').strip():
            raise serializers.ValidationError({'reason': 'Say why the order is being changed.'})
        attrs = super().validate(attrs)
        paid = self.order.paid_amount
        if attrs['totals'].total < paid:
            raise serializers.ValidationError({'detail': f'The new total ({attrs["totals"].total}) is less than the '
                                                         f'{paid} already paid. Refund the difference first.'})
        return self.check_approval(attrs)

    @transaction.atomic
    def save(self, *, user):
        data = self.validated_data
        order = Order.objects.select_for_update().get(pk=self.order.pk)
        for name, value in self._fields().items():
            setattr(order, name, value)
        order.save()
        order.lines.all().delete()
        self._save_lines(order)
        note = f'Edited: {data["reason"].strip()}'
        if price_changes(data['priced']):
            note += f' · {price_changes(data["priced"])}'
        if data['approver'] is not None:
            note += f' (approved by {data["approver"].full_name})'
        OrderStatusHistory.objects.create(order=order, status=order.status,
                                          stage_name=order.stage.name if order.stage_id else '',
                                          note=note[:200], changed_by=user)
        self._save_customer_notes()
        return order


class OrderCancelSerializer(serializers.Serializer):
    """POST /api/orders/<id>/cancel/ {reason}: an order not yet collected, with nothing paid on it."""

    reason = serializers.CharField(max_length=200, allow_blank=True)

    def validate(self, attrs):
        order = self.context['order']
        if order.status not in EDITABLE:
            raise serializers.ValidationError(
                {'detail': f'This order is {order.get_status_display().lower()}; it can no longer be cancelled.'})
        if order.paid_amount > 0:
            raise serializers.ValidationError(
                {'detail': f'AED {order.paid_amount} has been paid on this order. Refund it first, then cancel.'})
        if not attrs['reason'].strip():
            raise serializers.ValidationError({'reason': 'Say why the order is being cancelled.'})
        return attrs

    @transaction.atomic
    def save(self, *, user):
        order = Order.objects.select_for_update().get(pk=self.context['order'].pk)
        order.status = Order.Status.CANCELLED
        order.stage = None
        order.save(update_fields=['status', 'stage', 'updated_at'])
        OrderStatusHistory.objects.create(order=order, status=order.status,
                                          note=f'Cancelled: {self.validated_data["reason"].strip()}'[:200],
                                          changed_by=user)
        return order


# ── Read ──────────────────────────────────────────────────────────────────

class OrderLineSerializer(serializers.ModelSerializer):
    quantity = serializers.SerializerMethodField()
    upcharges = serializers.SerializerMethodField()

    class Meta:
        model = OrderLine
        fields = ['id', 'item', 'service', 'item_name', 'service_name', 'pricing_type', 'quantity', 'unit_price',
                  'min_price', 'upcharges', 'upcharge_total', 'line_total', 'notes', 'pieces',
                  'list_price', 'price_reason', 'pieces_per_item']

    def get_quantity(self, line):
        return quantity_text(line.quantity)

    def get_upcharges(self, line):
        return [{'upcharge': str(u.upcharge_id), 'name': u.name, 'amount': str(u.amount)}
                for u in line.upcharges.all()]


def deadstock_cutoff():
    """Ready before this time and still not collected: deadstock."""
    return timezone.now() - timedelta(days=settings.ORDERS['DEADSTOCK_DAYS'])


class OrderListSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    stage = serializers.SlugRelatedField(slug_field='code', read_only=True)
    stage_name = serializers.CharField(source='stage.name', read_only=True, default='')
    customer_phone = serializers.CharField(source='customer.phone', read_only=True)
    customer_address = serializers.CharField(source='customer.address', read_only=True)
    balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    pieces = serializers.SerializerMethodField()
    summary = serializers.SerializerMethodField()
    deadstock = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)

    class Meta:
        model = Order
        fields = ['id', 'number', 'customer', 'customer_name', 'customer_phone', 'customer_address', 'status', 'stage', 'stage_name',
                  'rack', 'is_express', 'ready_by', 'pieces', 'summary', 'notes', 'preferences', 'total',
                  'paid_amount', 'balance', 'ready_at', 'deadstock', 'collected_at', 'created_by_name', 'created_at']

    def get_summary(self, order):
        """What is in the order, one entry per line: "Kandura × 2 (Wash & Iron)"."""
        return [{'service': str(l.service_id), 'service_name': l.service_name, 'item_name': l.item_name,
                 'pieces_per_item': l.pieces_per_item,
                 'quantity': quantity_text(l.quantity), 'pricing_type': l.pricing_type}
                for l in order.lines.all()]

    def get_deadstock(self, order):
        if order.status != Order.Status.READY or order.ready_at is None:
            return False
        if 'cutoff' not in self.context:
            self.context['cutoff'] = deadstock_cutoff()
        return order.ready_at <= self.context['cutoff']

    def get_pieces(self, order):
        """Pieces handed in: unit items × their pieces (a 2-piece suit = 2), kg/m² lines count as one bag;
        bag drop adds its count."""
        lines = order.lines.all()
        counted = sum(int(l.quantity) * l.pieces_per_item if l.pricing_type == 'unit' else 1 for l in lines)
        return counted + order.bag_drop_pieces


class OrderSearchSerializer(OrderListSerializer):
    """A row of the order search: who took, cleaned and collected the order, and when."""

    staff = serializers.SerializerMethodField()

    class Meta(OrderListSerializer.Meta):
        fields = OrderListSerializer.Meta.fields + ['staff']

    def get_staff(self, order):
        history = list(order.history.all())  # oldest first
        if not history:
            return []

        def last(status):
            return next((h for h in reversed(history) if h.status == status and not h.note.startswith('Edited:')),
                        None)

        steps = [('Taken', history[0])]
        if order.ready_at:
            steps.append(('Cleaned', last(Order.Status.READY)))
        if order.status in (Order.Status.COLLECTED, Order.Status.CANCELLED):
            steps.append((order.get_status_display(), last(order.status)))
        return [{'step': step, 'name': h.changed_by.full_name, 'at': h.changed_at} for step, h in steps if h]


class OrderSerializer(OrderListSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    branch_code = serializers.CharField(source='branch.code', read_only=True)
    price_list_name = serializers.CharField(source='price_list.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)
    discount_approved_by_name = serializers.CharField(source='discount_approved_by.full_name', read_only=True,
                                                      default='')
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
            'branch_name', 'branch_code', 'price_list', 'price_list_name', 'notes', 'preferences', 'bag_drop_pieces',
            'lines', 'subtotal', 'discount_type', 'discount_value', 'discount_amount', 'discount_reason',
            'discount_approved_by_name', 'vat_amount',
            'payment_method', 'payment_method_name', 'created_by_name', 'history', 'payments',
        ]
