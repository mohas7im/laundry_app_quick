import re

from django.db import transaction
from rest_framework import serializers

from .models import Menu, Permission, Role, RolePermission
from .seed import OWNER_ROLE, ensure_owner_role, sync_menu_permissions

CODE_RE = re.compile(r'^[a-z][a-z_]*$')


class MenuSerializer(serializers.ModelSerializer):
    """
    A menu and its actions. Each action becomes the permission "<code>.<action>".
    Removing an action deletes that permission (and takes it away from every role).
    """

    # Input: list of action names. Output is built in to_representation from permissions.
    actions = serializers.ListField(child=serializers.CharField(max_length=50), allow_empty=True, write_only=True)
    parent = serializers.PrimaryKeyRelatedField(queryset=Menu.objects.all(), allow_null=True, required=False)

    class Meta:
        model = Menu
        fields = ['id', 'code', 'name', 'path', 'icon', 'parent', 'sort_order', 'is_active', 'is_system',
                  'actions', 'created_at']
        read_only_fields = ['id', 'is_system', 'created_at']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        order = {'view': 0, 'create': 1, 'edit': 2, 'delete': 3}
        data['actions'] = sorted((p.action for p in instance.permissions.all()), key=lambda a: (order.get(a, 9), a))
        return data

    def validate_code(self, value):
        value = value.strip().lower()
        if self.instance and value != self.instance.code:
            raise serializers.ValidationError("The code can't be changed: permission codes are built from it.")
        if not CODE_RE.match(value):
            raise serializers.ValidationError('Use lowercase letters and underscores, e.g. "orders".')
        if Menu.objects.filter(code=value).exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise serializers.ValidationError('A menu with this code already exists.')
        return value

    def validate_path(self, value):
        value = value.strip()
        if value and not value.startswith('/'):
            raise serializers.ValidationError('Start the path with "/", e.g. /orders. Leave it empty for a group heading.')
        if self.instance and self.instance.is_system and value != self.instance.path:
            raise serializers.ValidationError("A built-in menu's path can't be changed.")
        return value

    def validate_actions(self, value):
        actions = sorted({a.strip().lower() for a in value if a.strip()})
        bad = [a for a in actions if not CODE_RE.match(a)]
        if bad:
            raise serializers.ValidationError(f'Use lowercase letters and underscores: {", ".join(bad)}')
        if self.instance and self.instance.is_system:
            removed = set(self.instance.permissions.values_list('action', flat=True)) - set(actions)
            if removed:
                raise serializers.ValidationError(f"Built-in actions can't be removed: {', '.join(sorted(removed))}")
        return actions

    def validate_parent(self, parent):
        node = parent
        while node is not None:  # no loops: a menu can't sit under itself or its own children
            if self.instance and node.pk == self.instance.pk:
                raise serializers.ValidationError("A menu can't be placed under itself.")
            node = node.parent
        return parent

    def validate(self, attrs):
        if self.instance is None and 'code' not in attrs:
            raise serializers.ValidationError({'code': 'This field is required.'})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        actions = validated_data.pop('actions')
        menu = Menu.objects.create(**validated_data)
        self._sync(menu, actions)
        return menu

    @transaction.atomic
    def update(self, instance, validated_data):
        actions = validated_data.pop('actions', None)
        validated_data.pop('code', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        current = list(instance.permissions.values_list('action', flat=True))
        self._sync(instance, current if actions is None else actions)
        return instance

    @staticmethod
    def _sync(menu, actions):
        sync_menu_permissions(Permission, menu, actions)
        # The Owner role always has every permission, including new ones.
        if Role.objects.filter(name=OWNER_ROLE, is_system_role=True).exists():
            ensure_owner_role(Role, RolePermission, Permission)


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
