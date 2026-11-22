import re

from rest_framework import serializers

from .models import Customer


def normalize_phone(value):
    """"+971 50-123 4567" → "+971501234567". Keeps a leading +, drops spaces, dashes, dots and brackets."""
    value = value.strip()
    plus = value.startswith('+')
    digits = re.sub(r'[\s\-().]', '', value.lstrip('+'))
    return ('+' if plus else '') + digits


class CustomerSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True, default=0)

    class Meta:
        model = Customer
        fields = ['id', 'name', 'phone', 'email', 'address', 'notes', 'branch', 'branch_name', 'balance',
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
