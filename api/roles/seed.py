"""Write roles/registry.py into the database. Safe to run any number of times."""
from .registry import SYSTEM_MENUS, permission_description

OWNER_ROLE = 'Owner'
OWNER_DESCRIPTION = 'Business owner. Full access to every branch and setting.'


def sync_menu_permissions(Permission, menu, actions):
    """Make `menu`'s permissions exactly `actions` (removed actions are deleted, with their role grants)."""
    Permission.objects.filter(menu=menu).exclude(action__in=actions).delete()
    for action in actions:
        Permission.objects.update_or_create(
            menu=menu, action=action,
            defaults={'code': f'{menu.code}.{action}', 'description': permission_description(action, menu.name)},
        )


def sync_system_menus(Menu, Permission):
    """
    Create missing system menus and make sure each has its actions.
    Names, icons and order the owner changed are kept.
    Model classes are passed in so migrations can use historical models.
    """
    by_code = {}
    for code, name, path, icon, parent_code, order, actions in SYSTEM_MENUS:
        menu, created = Menu.objects.get_or_create(
            code=code,
            defaults={'name': name, 'path': path, 'icon': icon, 'sort_order': order,
                      'parent': by_code.get(parent_code), 'is_system': True},
        )
        if not created and (menu.path != path or not menu.is_system):
            menu.path, menu.is_system = path, True  # the page's URL is fixed in code
            menu.save(update_fields=['path', 'is_system'])
        by_code[code] = menu
        # system actions are added if missing; never removed here
        existing = set(Permission.objects.filter(menu=menu).values_list('action', flat=True))
        sync_menu_permissions(Permission, menu, sorted(existing | set(actions)) if existing else actions)


def ensure_owner_role(Role, RolePermission, Permission):
    """The built-in Owner role, holding every permission. Returns it."""
    role, _ = Role.objects.get_or_create(
        name=OWNER_ROLE, defaults={'description': OWNER_DESCRIPTION, 'is_system_role': True},
    )
    have = set(RolePermission.objects.filter(role=role).values_list('permission_id', flat=True))
    RolePermission.objects.bulk_create(
        [RolePermission(role=role, permission=p) for p in Permission.objects.exclude(id__in=have)]
    )
    return role
