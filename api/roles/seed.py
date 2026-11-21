"""Write roles/registry.py into the database. Safe to run any number of times."""
from .registry import PERMISSION_GROUPS

OWNER_DESCRIPTION = 'Business owner. Full access to every branch and setting.'


def sync_permissions(Permission):
    """Create/update every permission in the registry. Model passed in so migrations can use it."""
    for module, perms in PERMISSION_GROUPS:
        for code, description in perms:
            Permission.objects.update_or_create(code=code, defaults={'module': module, 'description': description})


def ensure_owner_role(Role, RolePermission, Permission):
    """The built-in Owner role, holding every permission. Returns it."""
    from .models import OWNER_ROLE

    role, _ = Role.objects.get_or_create(
        name=OWNER_ROLE, defaults={'description': OWNER_DESCRIPTION, 'is_system_role': True},
    )
    have = set(RolePermission.objects.filter(role=role).values_list('permission_id', flat=True))
    RolePermission.objects.bulk_create(
        [RolePermission(role=role, permission=p) for p in Permission.objects.exclude(id__in=have)]
    )
    return role
