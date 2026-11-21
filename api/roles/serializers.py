from django.db import transaction
from rest_framework import serializers

from .models import Permission, Role, RolePermission


class RoleSerializer(serializers.ModelSerializer):
    """`permissions` is a list of permission codes, stored in role_permissions."""

    # Input: list of codes. Output is built in to_representation from role_permissions.
    permissions = serializers.ListField(child=serializers.CharField(), allow_empty=True, write_only=True)
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = ['id', 'name', 'description', 'is_system_role', 'permissions', 'user_count', 'created_at']
        read_only_fields = ['id', 'is_system_role', 'user_count', 'created_at']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['permissions'] = sorted(p.code for p in instance.permissions.all())
        return data

    def get_user_count(self, obj):
        return obj.user_roles.values('user').distinct().count()

    def validate_name(self, value):
        value = value.strip()
        if self.instance and self.instance.is_system_role and value != self.instance.name:
            raise serializers.ValidationError("Built-in roles can't be renamed.")
        qs = Role.objects.filter(name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A role with this name already exists.')
        return value

    def validate_permissions(self, value):
        codes = set(value)
        found = {p.code: p for p in Permission.objects.filter(code__in=codes)}
        unknown = sorted(codes - found.keys())
        if unknown:
            raise serializers.ValidationError(f'Unknown permissions: {", ".join(unknown)}')
        if self.instance and self.instance.is_owner_role:
            raise serializers.ValidationError('The Owner role always has every permission.')
        return list(found.values())

    @transaction.atomic
    def create(self, validated_data):
        permissions = validated_data.pop('permissions')
        role = Role.objects.create(**validated_data)
        RolePermission.objects.bulk_create(RolePermission(role=role, permission=p) for p in permissions)
        return role

    @transaction.atomic
    def update(self, instance, validated_data):
        permissions = validated_data.pop('permissions', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if permissions is not None:
            RolePermission.objects.filter(role=instance).delete()
            RolePermission.objects.bulk_create(RolePermission(role=instance, permission=p) for p in permissions)
        return instance
