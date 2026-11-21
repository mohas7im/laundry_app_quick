import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

OWNER_ROLE = 'Owner'


class Menu(models.Model):
    """
    A sidebar menu item (table `menus`). Each menu has actions (view, create, edit,
    delete, …); every action is one row in `permissions` (code = "<menu code>.<action>").
    A menu without a path is a group heading for its children.
    System menus belong to pages built into the app: they can be renamed/reordered,
    not deleted.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=80)
    path = models.CharField(max_length=200, blank=True)
    icon = models.CharField(max_length=50, blank=True)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.PROTECT, related_name='children')
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    is_system = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'menus'
        ordering = ['sort_order', 'name']
        constraints = [
            models.CheckConstraint(condition=Q(code__regex=r'^[a-z][a-z_]*$'), name='menus_code_format_ck'),
        ]

    def __str__(self):
        return self.name


class Permission(models.Model):
    """One action on one menu, e.g. `branches.create` (table `permissions`)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=100, unique=True)
    menu = models.ForeignKey(Menu, on_delete=models.CASCADE, related_name='permissions')
    action = models.CharField(max_length=50)
    description = models.TextField(blank=True)

    class Meta:
        db_table = 'permissions'
        ordering = ['menu__sort_order', 'code']
        constraints = [
            models.CheckConstraint(condition=Q(code__regex=r'^[a-z_]+\.[a-z_]+$'), name='permissions_code_format_ck'),
            models.UniqueConstraint(fields=['menu', 'action'], name='permissions_menu_action_uq'),
        ]

    def __str__(self):
        return self.code


class Role(models.Model):
    """A named set of permissions, shared by all branches (table `roles`)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=80)
    description = models.TextField(blank=True)
    is_system_role = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    permissions = models.ManyToManyField(Permission, through='RolePermission', related_name='roles')

    class Meta:
        db_table = 'roles'
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(Lower('name'), name='roles_name_lower_uq'),
        ]

    def __str__(self):
        return self.name

    @property
    def is_owner_role(self):
        return self.is_system_role and self.name == OWNER_ROLE


class RolePermission(models.Model):
    """M:N roles <-> permissions (table `role_permissions`, composite primary key)."""

    pk = models.CompositePrimaryKey('role_id', 'permission_id')
    role = models.ForeignKey(Role, on_delete=models.CASCADE)
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE)

    class Meta:
        db_table = 'role_permissions'


class UserRole(models.Model):
    """
    A role held by a user (table `user_roles`).
    branch = NULL → organization-wide (applies in every branch); otherwise only in that branch.
    A branch role requires a matching user_branch_assignments row (composite FK, migration 0002).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='user_roles')
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name='user_roles')
    branch = models.ForeignKey('branches.Branch', null=True, blank=True, on_delete=models.PROTECT,
                               related_name='user_roles')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'user_roles'
        constraints = [
            models.UniqueConstraint(fields=['user', 'role', 'branch'], nulls_distinct=False, name='user_roles_uq'),
        ]

    def __str__(self):
        where = self.branch.name if self.branch_id else 'all branches'
        return f'{self.user} — {self.role} ({where})'
