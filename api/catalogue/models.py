"""
Catalogue & pricing (build pack M2):

    service ─┐
             ├─ price (one per price list × item × service)
    item ────┘          └─ price_list (Walk-in, Online, Corporate X; one is the default)
    upcharge (stain removal, starch, urgent …)

Money: exact decimals with 2 places, VAT-inclusive (AED).
Item category, how an item is charged and the upcharge type are common masters
(masters app); the API reads and writes their codes.
"""
import uuid

from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

MONEY = {'max_digits': 10, 'decimal_places': 2, 'validators': [MinValueValidator(0)]}


class Service(models.Model):
    """What the shop does to an item: Dry Clean, Wash & Iron, Pressed, Repairs (table `services`)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=80)
    ready_days = models.PositiveSmallIntegerField(
        null=True, blank=True, help_text="Days to get it ready (normal orders); empty = the shop's default.")
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'services'
        ordering = ['sort_order', 'name']
        constraints = [models.UniqueConstraint(Lower('name'), name='services_name_lower_uq')]

    def __str__(self):
        return self.name


class Item(models.Model):
    """What customers bring: Kandura, Shirt, Blanket … One list shared by every service (table `items`)."""

    class PricingType:
        """Codes of the PRICING_TYPE master the pricing rules depend on."""
        UNIT = 'unit'
        PER_KG = 'per_kg'
        PER_M2 = 'per_m2'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=80)
    category = models.ForeignKey('masters.CommonMaster', on_delete=models.PROTECT, related_name='+',
                                 limit_choices_to={'type__code': 'ITEM_CATEGORY'})
    pricing_type = models.ForeignKey('masters.CommonMaster', on_delete=models.PROTECT, related_name='+',
                                     limit_choices_to={'type__code': 'PRICING_TYPE'},
                                     help_text='How it is charged: per item, per kg or per m².')
    pieces = models.PositiveSmallIntegerField(default=1, help_text='Pieces (tags) per item, e.g. a 2-piece suit = 2.')
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'items'
        ordering = ['sort_order', 'name']
        constraints = [models.UniqueConstraint(Lower('name'), name='items_name_lower_uq')]

    def __str__(self):
        return self.name


class PriceList(models.Model):
    """A set of prices: Walk-in (default), Online, a corporate contract … (table `price_lists`)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=80)
    is_default = models.BooleanField(default=False, help_text='Used when a customer has no price list of their own.')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'price_lists'
        ordering = ['-is_default', 'name']
        constraints = [
            models.UniqueConstraint(Lower('name'), name='price_lists_name_lower_uq'),
            # at most one default (the API keeps exactly one once a list exists)
            models.UniqueConstraint(fields=['is_default'], condition=Q(is_default=True),
                                    name='price_lists_one_default_uq'),
        ]

    def __str__(self):
        return self.name


class Price(models.Model):
    """The price of one item for one service in one price list (table `prices`)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    price_list = models.ForeignKey(PriceList, on_delete=models.CASCADE, related_name='prices')
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='prices')
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name='prices')
    price = models.DecimalField(**MONEY, help_text='Per item, per kg or per m², as the item is charged.')
    express_price = models.DecimalField(**MONEY, null=True, blank=True)
    min_price = models.DecimalField(**MONEY, null=True, blank=True, help_text='The least this line can cost.')
    extra_days = models.PositiveSmallIntegerField(default=0, help_text='Added to the ready-by date.')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'prices'
        constraints = [
            models.UniqueConstraint(fields=['price_list', 'item', 'service'], name='prices_list_item_service_uq'),
        ]

    def __str__(self):
        return f'{self.item} / {self.service} @ {self.price_list}: {self.price}'


class PriceChange(models.Model):
    """
    Price history (table `price_history`): every change to a price, from the grid or an
    import. A new price has no old values; a removed one has no new values.
    """

    class Source(models.TextChoices):
        GRID = 'grid', 'Prices page'
        IMPORT = 'import', 'CSV import'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    price_list = models.ForeignKey(PriceList, on_delete=models.CASCADE, related_name='changes')
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='price_changes')
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name='price_changes')
    old_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    new_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    old_express_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    new_express_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    source = models.CharField(max_length=10, choices=Source.choices)
    changed_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='+')
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'price_history'
        ordering = ['-changed_at']
        indexes = [models.Index(fields=['price_list', '-changed_at'])]


class Upcharge(models.Model):
    """An extra charge on an order line: stain removal, starch, urgent, hanger (table `upcharges`)."""

    class ChargeType:
        """Codes of the UPCHARGE_TYPE master the pricing rules depend on."""
        FIXED = 'fixed'
        PERCENT = 'percent'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=80)
    charge_type = models.ForeignKey('masters.CommonMaster', on_delete=models.PROTECT, related_name='+',
                                    limit_choices_to={'type__code': 'UPCHARGE_TYPE'})
    amount = models.DecimalField(**MONEY)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'upcharges'
        ordering = ['sort_order', 'name']
        constraints = [models.UniqueConstraint(Lower('name'), name='upcharges_name_lower_uq')]

    def __str__(self):
        return self.name
