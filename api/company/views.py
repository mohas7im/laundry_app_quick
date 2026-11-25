import base64
import binascii
import re

from django.db import transaction
from rest_framework import permissions, serializers
from rest_framework.views import APIView

from accounts.access import menu_permission
from common.results import BaseResult
from .models import CompanySettings

LOGO_MAX_BYTES = 300 * 1024
LOGO_RE = re.compile(r'^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$')


class CompanySettingsSerializer(serializers.ModelSerializer):
    # one-sequence numbering: the number the next order gets (the counter stores the last one used)
    next_invoice_number = serializers.IntegerField(min_value=1, max_value=999_999_999, required=False)

    class Meta:
        model = CompanySettings
        fields = ['name', 'logo', 'address', 'phone', 'email', 'receipt_footer',
                  'invoice_numbering', 'next_invoice_number', 'updated_at']
        read_only_fields = ['updated_at']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['next_invoice_number'] = instance.last_invoice_number + 1
        return data

    def update(self, instance, validated_data):
        # sent only when the admin changes it, so saving the other settings never moves the counter
        # back over orders taken meanwhile (a number already used is skipped anyway)
        next_number = validated_data.pop('next_invoice_number', None)
        if next_number is not None:
            instance.last_invoice_number = next_number - 1
        return super().update(instance, validated_data)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Enter the company name.', code='blank')
        return value

    def validate_logo(self, value):
        if not value:
            return ''
        match = LOGO_RE.match(value)
        if not match:
            raise serializers.ValidationError('Use a PNG, JPG or WebP image.')
        try:
            size = len(base64.b64decode(match.group(2), validate=False))
        except (binascii.Error, ValueError):
            raise serializers.ValidationError('This image file is damaged.')
        if size > LOGO_MAX_BYTES:
            raise serializers.ValidationError(f'The logo is {size // 1024} KB; use one of at most 300 KB.')
        return value

    def validate_email(self, value):
        return value.strip().lower()


class CompanySettingsView(APIView):
    """
    GET  /api/company/ — everyone logged in (receipts print the name, logo and terms).
    PUT  /api/company/ — the Company Settings menu (company.edit).
    """

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.IsAuthenticated()]
        return [menu_permission('company')()]  # PUT → company.edit

    def get(self, request):
        return BaseResult.ok(CompanySettingsSerializer(CompanySettings.current()).data,
                             'Company settings retrieved successfully.').to_response()

    @transaction.atomic
    def put(self, request):
        # locked like the invoice counter, so an order taken meanwhile is not undone by this save
        settings = CompanySettings.objects.select_for_update().get(pk=CompanySettings.current().pk)
        serializer = CompanySettingsSerializer(settings, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return BaseResult.ok(serializer.data, 'Company settings saved.').to_response()
