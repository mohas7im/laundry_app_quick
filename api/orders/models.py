"""
Orders (build pack M4):

    order ─┬─ order_line ── order_line_upcharge
           ├─ payment              (deposit or full payment at the counter; M6 adds more)
           └─ order_status_history (who and when, for every status change)

Lines keep a copy of the item/service names and prices at the time of the order,
so later catalogue changes never change an old order.

Life of an order (M5):

    received ── stage: washing → ironing → packing … (PRODUCTION_STAGE common master)
        │
      ready  (rack) ── collected (balance paid, or on account)
"""
import uuid

from django.conf import settings
from django.db import models

MONEY = {'max_digits': 10, 'decimal_places': 2}


class Order(models.Model):
    class Status(models.TextChoices):
        RECEIVED = 'received', 'Received'
        READY = 'ready', 'Ready'
        COLLECTED = 'collected', 'Collected'
        CANCELLED = 'cancelled', 'Cancelled'

    class PaymentMethod(models.TextChoices):
        ON_COLLECTION = 'on_collection', 'Pay on collection'
        CASH = 'cash', 'Cash'
        CARD = 'card', 'Card'
        BANK = 'bank', 'Bank transfer'
        ON_ACCOUNT = 'on_account', 'On account'

    class DiscountType(models.TextChoices):
        AMOUNT = 'amount', 'Amount'
        PERCENT = 'percent', 'Percent'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=30, unique=True, help_text='Branch code + sequence, e.g. DXB1-00001.')
    branch = models.ForeignKey('branches.Branch', on_delete=models.PROTECT, related_name='orders')
    customer = models.ForeignKey('customers.Customer', on_delete=models.PROTECT, related_name='orders')
    price_list = models.ForeignKey('catalogue.PriceList', on_delete=models.PROTECT, related_name='orders')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RECEIVED)
    stage = models.ForeignKey('masters.CommonMaster', on_delete=models.PROTECT, null=True, blank=True,
                              related_name='+', limit_choices_to={'type__code': 'PRODUCTION_STAGE'},
                              help_text='Where a received order is in the workshop; empty = not started.')
    rack = models.CharField(max_length=30, blank=True, help_text='Where a ready order is kept, e.g. B-12.')
    ready_at = models.DateTimeField(null=True, blank=True,
                                    help_text='When it was cleaned (moved to Ready); deadstock counts from here.')
    collected_at = models.DateTimeField(null=True, blank=True)
    is_express = models.BooleanField(default=False)
    ready_by = models.DateTimeField()
    notes = models.TextField(blank=True)
    preferences = models.CharField(max_length=300, blank=True,
                                   help_text="The customer's preferences when the order was taken, "
                                             'e.g. "Shirt: Boxed / Starch: No starch".')
    bag_drop_pieces = models.PositiveIntegerField(
        default=0, help_text='Bag drop: pieces counted at the counter, items detailed later.')

    subtotal = models.DecimalField(**MONEY)
    discount_type = models.CharField(max_length=10, choices=DiscountType.choices, blank=True)
    discount_value = models.DecimalField(**MONEY, default=0, help_text='The amount or percent entered.')
    discount_amount = models.DecimalField(**MONEY, default=0)
    discount_reason = models.CharField(max_length=200, blank=True)
    discount_approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True,
                                             blank=True, related_name='+',
                                             help_text="The manager whose PIN allowed a discount over the limit.")
    total = models.DecimalField(**MONEY)
    vat_amount = models.DecimalField(**MONEY, help_text='VAT included in the total.')
    paid_amount = models.DecimalField(**MONEY, default=0)
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices,
                                      default=PaymentMethod.ON_COLLECTION)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='orders_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'orders'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['branch', '-created_at']), models.Index(fields=['branch', 'status'])]

    def __str__(self):
        return self.number

    @property
    def balance(self):
        return self.total - self.paid_amount


class OrderLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='lines')
    item = models.ForeignKey('catalogue.Item', on_delete=models.PROTECT, related_name='order_lines')
    service = models.ForeignKey('catalogue.Service', on_delete=models.PROTECT, related_name='order_lines')
    # copies at order time
    item_name = models.CharField(max_length=80)
    service_name = models.CharField(max_length=80)
    pricing_type = models.CharField(max_length=10)
    quantity = models.DecimalField(max_digits=8, decimal_places=3, help_text='Pieces, kg or m².')
    pieces_per_item = models.PositiveSmallIntegerField(default=1, help_text="A copy of the item's pieces (tags).")
    unit_price = models.DecimalField(**MONEY)
    min_price = models.DecimalField(**MONEY, null=True, blank=True)
    upcharge_total = models.DecimalField(**MONEY, default=0)
    line_total = models.DecimalField(**MONEY)
    # Comfort: staff changed the price at the counter -> the price list's price then, and why (null = not changed)
    list_price = models.DecimalField(**MONEY, null=True, blank=True)
    price_reason = models.CharField(max_length=200, blank=True, default='')
    notes = models.CharField(max_length=200, blank=True)
    # per-piece tags: [{"colours": ["Navy"], "damage": ["Button missing"], "stains": [], "note": ""}, …]
    # (names copied from the ITEM_COLOUR / ITEM_DAMAGE / ITEM_STAIN lists; piece 1 first)
    pieces = models.JSONField(default=list, blank=True)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'order_lines'
        ordering = ['position']

    def __str__(self):
        return f'{self.quantity} × {self.item_name} ({self.service_name})'


class OrderLineUpcharge(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    line = models.ForeignKey(OrderLine, on_delete=models.CASCADE, related_name='upcharges')
    upcharge = models.ForeignKey('catalogue.Upcharge', on_delete=models.PROTECT, related_name='order_lines')
    name = models.CharField(max_length=80)
    charge_type = models.CharField(max_length=10)
    rate = models.DecimalField(**MONEY, help_text='The fixed amount or percent at order time.')
    amount = models.DecimalField(**MONEY)

    class Meta:
        db_table = 'order_line_upcharges'


class Payment(models.Model):
    """
    Money taken for an order, or given back (a refund: kind "refund", amount positive).
    Points at the cashier's open shift, so the cash-up counts it (orders/payments.py).
    """

    class Kind(models.TextChoices):
        PAYMENT = 'payment', 'Payment'
        REFUND = 'refund', 'Refund'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name='payments')
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.PAYMENT)
    amount = models.DecimalField(**MONEY)
    method = models.CharField(max_length=20, choices=Order.PaymentMethod.choices)
    reason = models.CharField(max_length=200, blank=True, help_text='Why a refund was given.')
    shift = models.ForeignKey('cashier.Shift', on_delete=models.PROTECT, null=True, blank=True,
                              related_name='payments')
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='payments')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'payments'
        ordering = ['created_at']


class OrderStatusHistory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='history')
    status = models.CharField(max_length=20, choices=Order.Status.choices)
    stage_name = models.CharField(max_length=80, blank=True, help_text='The production stage, if any (a copy).')
    note = models.CharField(max_length=200, blank=True)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+')
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'order_status_history'
        ordering = ['changed_at']


class BranchOrderCounter(models.Model):
    """The last order number used per branch (locked while numbering a new order)."""

    branch = models.OneToOneField('branches.Branch', on_delete=models.CASCADE, primary_key=True,
                                  related_name='order_counter')
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'branch_order_counters'
