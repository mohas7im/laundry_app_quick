import re

from django.db import transaction
from rest_framework import serializers

from .models import Action, Menu, Permission, Role, RolePermission
from .registry import SYSTEM_MENU_CODES
from .seed import OWNER_ROLE, ensure_owner_role, sync_menu_permissions

# "/orders", "/orders/settings"
LINK_RE = re.compile(r'^/([A-Za-z0-9_-]+|:[a-z_]+)?(/([A-Za-z0-9_-]+|:[a-z_]+))*$')


def _give_owner_everything():
    if Role.objects.filter(name=OWNER_ROLE).exists():
        ensure_owner_role(Role, RolePermission, Permission)


# ── Roles ──────────────────────────────────────────────────────────────────

class RoleSerializer(serializers.ModelSerializer):
    """Name and description. Permissions are set on the role's Permissions page."""

    permission_count = serializers.SerializerMethodField()
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = ['id', 'name', 'description', 'max_discount_percent', 'permission_count', 'user_count',
                  'created_at']
        read_only_fields = ['id', 'permission_count', 'user_count', 'created_at']

    def get_permission_count(self, obj):
        return obj.permissions.count()

    def get_user_count(self, obj):
        return obj.user_roles.values('user').distinct().count()

    def validate_max_discount_percent(self, value):
        if value is not None and not (0 <= value <= 100):
            raise serializers.ValidationError('Use a percent from 0 to 100, or leave it empty for no limit.')
        return value

    def validate_name(self, value):
        value = value.strip()
        if self.instance and self.instance.is_owner_role:
            if value != self.instance.name:
                raise serializers.ValidationError("The Owner role can't be renamed.")
        elif value.lower() == OWNER_ROLE.lower():
            raise serializers.ValidationError(f'"{OWNER_ROLE}" is reserved for the owner role.')
        if Role.objects.filter(name__iexact=value).exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise serializers.ValidationError('A role with this name already exists.')
        return value


class RolePermissionsSerializer(serializers.Serializer):
    """PUT /api/roles/{id}/permissions/ — the full list of permission codes the role should have."""

    permissions = serializers.ListField(child=serializers.CharField(max_length=100), allow_empty=True)

    def validate_permissions(self, value):
        codes = set(value)
        found = {p.code: p for p in Permission.objects.filter(code__in=codes)}
        unknown = sorted(codes - found.keys())
        if unknown:
            raise serializers.ValidationError(f'Unknown permissions: {", ".join(unknown)}')
        return list(found.values())

    def validate(self, attrs):
        if self.context['role'].is_owner_role:
            raise serializers.ValidationError({'permissions': 'The Owner role always has every permission.'})
        return attrs

    @transaction.atomic
    def save(self):
        role = self.context['role']
        RolePermission.objects.filter(role=role).delete()
        RolePermission.objects.bulk_create(
            RolePermission(role=role, permission=p) for p in self.validated_data['permissions']
        )
        return role


# ── Menus ──────────────────────────────────────────────────────────────────

class MenuSerializer(serializers.ModelSerializer):
    """
    A menu in the tree. Normal menus are pages (router name + link required);
    headers and sub-headers group other menus and may leave the link empty.
    Every menu gets one permission per action. The code is made from the name on
    create ("Customer Orders" -> customer_orders) and never changes.
    """

    parent = serializers.PrimaryKeyRelatedField(queryset=Menu.objects.all(), allow_null=True, required=False)

    class Meta:
        model = Menu
        fields = ['id', 'name', 'code', 'router_name', 'router_description', 'router_link', 'icon', 'parent',
                  'is_header', 'is_sub_header', 'sort_order', 'created_at']
        read_only_fields = ['id', 'code', 'created_at']

    # ── field checks ────────────────────────────────────────────────────
    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Enter a name.')
        return value

    def validate_router_link(self, value):
        value = value.strip()
        if value and not LINK_RE.match(value):
            raise serializers.ValidationError('Use a path like /orders.')
        return value

    def validate_parent(self, parent):
        node = parent
        while node is not None:  # no loops: a menu can't sit under itself or its own children
            if self.instance and node.pk == self.instance.pk:
                raise serializers.ValidationError("A menu can't be placed under itself.")
            node = node.parent
        return parent

    # ── whole-object checks ─────────────────────────────────────────────
    def validate(self, attrs):
        current = self.instance

        def get(field, default=None):
            """New value if sent, else the saved one."""
            return attrs.get(field, getattr(current, field) if current else default)

        errors = {}
        if current and current.code in SYSTEM_MENU_CODES:
            for field in ('router_link', 'is_header', 'is_sub_header'):
                if field in attrs and attrs[field] != getattr(current, field):
                    errors[field] = "This menu is used by the app and keeps its structure; you can change the name, icon, parent and order."

        is_header, is_sub_header = get('is_header', False), get('is_sub_header', False)
        if is_header and is_sub_header:
            errors['is_sub_header'] = 'Choose header or sub-header, not both.'
        if not (is_header or is_sub_header):  # a page
            if not get('router_name', ''):
                errors['router_name'] = 'Enter a router name, or make this a header or sub-header.'
            if not get('router_link', ''):
                errors['router_link'] = 'Enter a router link, e.g. /orders, or make this a header or sub-header.'

        link = attrs.get('router_link')
        if link and Menu.objects.filter(router_link=link).exclude(pk=getattr(current, 'pk', None)).exists():
            errors['router_link'] = 'Another menu already uses this link.'

        if current is None:
            code = self._code_from(attrs.get('name', ''))
            if not code:
                errors['name'] = 'Use at least one letter in the name.'
            elif len(code) > 50:
                errors['name'] = 'Use a shorter name.'
            elif Menu.objects.filter(code=code).exists():
                errors['name'] = 'A menu with this name already exists.'
            attrs['code'] = code

        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    @staticmethod
    def _code_from(name):
        return re.sub(r'_+', '_', re.sub(r'[^a-z]+', '_', name.lower())).strip('_')

    # ── save ────────────────────────────────────────────────────────────
    @transaction.atomic
    def create(self, validated_data):
        menu = Menu.objects.create(**validated_data)
        sync_menu_permissions(Permission, Action, menu)
        _give_owner_everything()
        return menu

    @transaction.atomic
    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        sync_menu_permissions(Permission, Action, instance)  # descriptions follow the name
        return instance
