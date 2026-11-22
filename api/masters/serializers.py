import re

from rest_framework import serializers

from .models import CommonMaster, CommonMasterType
from .registry import FIXED_TYPES, PRODUCTION_STAGE, RESERVED_STAGE_CODES


class CommonMasterTypeSerializer(serializers.ModelSerializer):
    value_count = serializers.IntegerField(source='values.count', read_only=True)
    is_fixed = serializers.SerializerMethodField()

    class Meta:
        model = CommonMasterType
        fields = ['id', 'code', 'name', 'description', 'is_fixed', 'value_count']

    def get_is_fixed(self, obj):
        """Fixed types: the code decides on each value, so values can't be added or deleted."""
        return obj.code in FIXED_TYPES


def code_from(name):
    """"Kids Wear" → "kids_wear"."""
    return re.sub(r'_+', '_', re.sub(r'[^a-z0-9]+', '_', name.lower())).strip('_')


class CommonMasterSerializer(serializers.ModelSerializer):
    """
    A value of a type. The type and code are set on create and never change (the code
    is what other tables and the app use). Fixed types take no new values.
    """

    type = serializers.SlugRelatedField(slug_field='code', queryset=CommonMasterType.objects.all())
    type_name = serializers.CharField(source='type.name', read_only=True)
    code = serializers.CharField(max_length=50, required=False, allow_blank=True)

    class Meta:
        model = CommonMaster
        fields = ['id', 'type', 'type_name', 'code', 'name', 'sort_order', 'is_active', 'created_at']
        read_only_fields = ['id', 'type_name', 'created_at']
        validators = []  # uniqueness is checked in validate() with clear messages

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Enter a name.', code='blank')
        return value

    def validate(self, attrs):
        current = self.instance
        master_type = current.type if current else attrs['type']

        # the name first: it's what the user typed
        name = attrs.get('name')
        if name and CommonMaster.objects.filter(type=master_type, name__iexact=name) \
                .exclude(pk=getattr(current, 'pk', None)).exists():
            raise serializers.ValidationError({'name': f'{master_type.name} already has "{name}".'}, code='unique')

        if current:
            attrs.pop('type', None)
            if attrs.get('code') not in (None, '', current.code):
                raise serializers.ValidationError(
                    {'code': "The code can't be changed: other records and the app use it."}, code='not_allowed')
            attrs.pop('code', None)
        else:
            if master_type.code in FIXED_TYPES:
                raise serializers.ValidationError(
                    {'type': f'{master_type.name} values are used by the app: rename or hide them, '
                             "but they can't be added."}, code='not_allowed')
            code = code_from(attrs.get('code') or attrs.get('name', ''))
            if not code:
                raise serializers.ValidationError({'name': 'Use at least one letter or number in the name.'})
            if master_type.code == PRODUCTION_STAGE and code in RESERVED_STAGE_CODES:
                raise serializers.ValidationError(
                    {'name': f'"{attrs["name"]}" is already a column of the production board.'})
            if CommonMaster.objects.filter(type=master_type, code=code).exists():
                raise serializers.ValidationError({'code': f'"{code}" is already used in {master_type.name}.'},
                                                  code='unique')
            attrs['code'] = code
        return attrs


def master_field(type_code, **kwargs):
    """
    A serializer field for a foreign key to a common master, read and written as its code:
    category = master_field('ITEM_CATEGORY') → "men".
    """
    return serializers.SlugRelatedField(slug_field='code', queryset=CommonMaster.of(type_code), **kwargs)
