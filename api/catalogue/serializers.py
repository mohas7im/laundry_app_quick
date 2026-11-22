from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from masters.models import CommonMaster
from masters.registry import ITEM_CATEGORY, PRICING_TYPE, UPCHARGE_TYPE
from masters.serializers import master_field
from .models import Item, Price, PriceList, Service, Upcharge


class UniqueNameMixin:
    """Trimmed, required name that no other row of the model uses (any letter case)."""

    name_taken_message = 'This name is already used.'

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Enter a name.', code='blank')
        model = self.Meta.model
        if model.objects.filter(name__iexact=value).exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise serializers.ValidationError(self.name_taken_message, code='unique')
        return value


class ServiceSerializer(UniqueNameMixin, serializers.ModelSerializer):
    name_taken_message = 'A service with this name already exists.'

    class Meta:
        model = Service
        fields = ['id', 'name', 'sort_order', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']
        extra_kwargs = {'name': {'validators': []}}


class ItemSerializer(UniqueNameMixin, serializers.ModelSerializer):
    """category and pricing_type are common master codes ("men", "per_kg"); *_name are their labels."""

    name_taken_message = 'An item with this name already exists.'
    category = master_field(ITEM_CATEGORY, required=False)
    category_name = serializers.CharField(source='category.name', read_only=True)
    pricing_type = master_field(PRICING_TYPE, required=False)
    pricing_type_name = serializers.CharField(source='pricing_type.name', read_only=True)

    class Meta:
        model = Item
        fields = ['id', 'name', 'category', 'category_name', 'pricing_type', 'pricing_type_name', 'sort_order',
                  'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']
        extra_kwargs = {'name': {'validators': []}}

    def validate(self, attrs):
        if self.instance is None:  # defaults for a new item
            attrs.setdefault('category', CommonMaster.get(ITEM_CATEGORY, 'other'))
            attrs.setdefault('pricing_type', CommonMaster.get(PRICING_TYPE, Item.PricingType.UNIT))
        return attrs


class PriceListSerializer(UniqueNameMixin, serializers.ModelSerializer):
    """
    Exactly one price list is the default: the first one created is, making another
    one the default moves it there, and the default can't be switched off, made
    inactive or deleted (make another list the default first).
    """

    name_taken_message = 'A price list with this name already exists.'
    price_count = serializers.IntegerField(source='prices.count', read_only=True)

    class Meta:
        model = PriceList
        fields = ['id', 'name', 'is_default', 'is_active', 'price_count', 'created_at']
        read_only_fields = ['id', 'price_count', 'created_at']
        # DRF would turn the "one default" DB constraint into a check that rejects
        # switching the default; save() moves it instead, in one transaction.
        extra_kwargs = {'name': {'validators': []}, 'is_default': {'validators': []}}
        validators = []

    def validate(self, attrs):
        current = self.instance
        if current and current.is_default:
            if attrs.get('is_default') is False:
                raise serializers.ValidationError(
                    {'is_default': 'Make another price list the default instead.'}, code='not_allowed')
            if attrs.get('is_active') is False:
                raise serializers.ValidationError(
                    {'is_active': "The default price list can't be inactive."}, code='not_allowed')
        if attrs.get('is_default') and attrs.get('is_active') is False:
            raise serializers.ValidationError({'is_active': "The default price list can't be inactive."})
        return attrs

    @transaction.atomic
    def save(self, **kwargs):
        first = not PriceList.objects.exists()
        if first or self.validated_data.get('is_default'):
            PriceList.objects.filter(is_default=True).exclude(pk=getattr(self.instance, 'pk', None)) \
                .update(is_default=False)
            kwargs['is_default'] = True
        return super().save(**kwargs)


class UpchargeSerializer(UniqueNameMixin, serializers.ModelSerializer):
    """charge_type is an UPCHARGE_TYPE master code ("fixed" / "percent")."""

    name_taken_message = 'An upcharge with this name already exists.'
    charge_type = master_field(UPCHARGE_TYPE, required=False)
    charge_type_name = serializers.CharField(source='charge_type.name', read_only=True)

    class Meta:
        model = Upcharge
        fields = ['id', 'name', 'charge_type', 'charge_type_name', 'amount', 'sort_order', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']
        extra_kwargs = {'name': {'validators': []}}

    def validate(self, attrs):
        if self.instance is None:
            attrs.setdefault('charge_type', CommonMaster.get(UPCHARGE_TYPE, Upcharge.ChargeType.FIXED))
        charge_type = attrs.get('charge_type') or self.instance.charge_type
        amount = attrs.get('amount', getattr(self.instance, 'amount', None))
        if charge_type.code == Upcharge.ChargeType.PERCENT and amount is not None and amount > 100:
            raise serializers.ValidationError({'amount': 'A percentage can be at most 100.'})
        return attrs


# ── Price grid ────────────────────────────────────────────────────────────

MONEY = {'max_digits': 10, 'decimal_places': 2, 'min_value': Decimal('0')}


class PriceCellSerializer(serializers.Serializer):
    """
    One cell of the grid. `price: null` clears the cell (the item isn't offered
    for that service in this price list).
    """

    item = serializers.PrimaryKeyRelatedField(queryset=Item.objects.all())
    service = serializers.PrimaryKeyRelatedField(queryset=Service.objects.all())
    price = serializers.DecimalField(**MONEY, allow_null=True)
    express_price = serializers.DecimalField(**MONEY, allow_null=True, required=False, default=None)
    min_price = serializers.DecimalField(**MONEY, allow_null=True, required=False, default=None)
    extra_days = serializers.IntegerField(min_value=0, max_value=60, required=False, default=0)

    def validate(self, attrs):
        if attrs['price'] is None and (attrs['express_price'] is not None or attrs['min_price'] is not None):
            raise serializers.ValidationError({'price': 'Enter the normal price first.'})
        return attrs


class PriceGridSaveSerializer(serializers.Serializer):
    """PUT /api/prices/<price_list_id>/ — the cells that changed."""

    prices = PriceCellSerializer(many=True)

    def validate_prices(self, cells):
        seen = set()
        for cell in cells:
            key = (cell['item'].pk, cell['service'].pk)
            if key in seen:
                raise serializers.ValidationError('Each item and service may appear once.')
            seen.add(key)
        return cells

    @transaction.atomic
    def save(self, price_list):
        for cell in self.validated_data['prices']:
            where = {'price_list': price_list, 'item': cell['item'], 'service': cell['service']}
            if cell['price'] is None:
                Price.objects.filter(**where).delete()
            else:
                Price.objects.update_or_create(**where, defaults={
                    'price': cell['price'], 'express_price': cell['express_price'],
                    'min_price': cell['min_price'], 'extra_days': cell['extra_days'],
                })
