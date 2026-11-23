import re
from decimal import Decimal

from rest_framework import serializers

from catalogue.models import PriceList
from masters.models import CommonMaster
from masters.registry import PREFERENCE_TYPES
from .models import Customer
from .preferences import preferences_text


def normalize_phone(value):
    """"+971 50-123 4567" → "+971501234567". Keeps a leading +, drops spaces, dashes, dots and brackets."""
    value = value.strip()
    plus = value.startswith('+')
    digits = re.sub(r'[\s\-().]', '', value.lstrip('+'))
    return ('+' if plus else '') + digits


class CustomerSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True, default=0)
    preferences = serializers.DictField(child=serializers.CharField(allow_blank=True), required=False)
    preferences_text = serializers.SerializerMethodField()
    price_list = serializers.PrimaryKeyRelatedField(queryset=PriceList.objects.filter(is_active=True),
                                                    allow_null=True, required=False)
    price_list_name = serializers.CharField(source='price_list.name', read_only=True, default='')
    discount_percent = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal('0'),
                                                max_value=Decimal('100'), required=False)

    class Meta:
        model = Customer
        fields = ['id', 'name', 'phone', 'email', 'address', 'notes', 'preferences', 'preferences_text',
                  'price_list', 'price_list_name', 'discount_percent', 'branch', 'branch_name', 'balance',
                  'created_at', 'updated_at']
        # branch: set from the active branch on create, never changed
        read_only_fields = ['id', 'branch', 'branch_name', 'balance', 'created_at', 'updated_at']
        # the model's unique check would run on the raw input; validate_phone checks the normalised number
        extra_kwargs = {
            'name': {'error_messages': {'blank': "Enter the customer's name.", 'required': "Enter the customer's name."}},
            'phone': {
                'validators': [],
                'error_messages': {'blank': 'Enter a phone number.', 'required': 'Enter a phone number.'},
            },
        }

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter the customer's name.", code='blank')
        return value

    def validate_phone(self, value):
        phone = normalize_phone(value)
        if not re.fullmatch(r'\+?\d{7,15}', phone):
            raise serializers.ValidationError('Enter a phone number with 7 to 15 digits, e.g. +971 50 123 4567.')
        others = Customer.objects.filter(phone=phone).exclude(pk=getattr(self.instance, 'pk', None))
        if others.exists():
            raise serializers.ValidationError('A customer with this phone number already exists.', code='unique')
        return phone

    def validate_email(self, value):
        return value.strip().lower()

    def get_preferences_text(self, customer):
        return preferences_text(customer.preferences)

    def validate_preferences(self, value):
        """{"PREF_SHIRT": "boxed"}; an empty value removes that preference."""
        unknown = sorted(set(value) - set(PREFERENCE_TYPES))
        if unknown:
            raise serializers.ValidationError(f'Unknown preferences: {", ".join(unknown)}.')
        chosen = {k: v for k, v in value.items() if v}
        current = getattr(self.instance, 'preferences', None) or {}
        allowed = set(CommonMaster.objects.filter(type__code__in=list(chosen), is_active=True)
                      .values_list('type__code', 'code'))
        for key, code in chosen.items():
            if (key, code) not in allowed and current.get(key) != code:  # a hidden value stays if unchanged
                raise serializers.ValidationError(f'"{code}" is not an option of {key}.')
        return chosen
