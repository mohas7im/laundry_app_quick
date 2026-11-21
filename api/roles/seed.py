"""
Write roles/registry.py into the database, and keep permissions in step with
menus and actions. Safe to run any number of times.

Model classes are passed in so migrations can use their historical models.
"""
from .registry import SYSTEM_ACTIONS, SYSTEM_MENUS, permission_description

OWNER_ROLE = 'Owner'
OWNER_DESCRIPTION = 'Business owner. Full access to every branch and setting.'


def sync_actions(Action):
    for code, name, order in SYSTEM_ACTIONS:
        Action.objects.update_or_create(code=code, defaults={'name': name, 'sort_order': order})


def sync_menu_permissions(Permission, Action, menu):
    """Every menu has exactly one permission per action."""
    for action in Action.objects.all():
        Permission.objects.update_or_create(
            menu=menu, action=action,
            defaults={'code': f'{menu.code}.{action.code}',
                      'description': permission_description(action.name, menu.name)},
        )


def sync_system_menus(Menu, Permission, Action):
    """
    Create missing system menus. Names, icons and order the owner changed are kept;
    the structure the code relies on (header flags, links) is enforced.
    """
    by_code = {}
    for spec in SYSTEM_MENUS:
        structure = {
            'is_header': spec.get('is_header', False),
            'is_sub_header': spec.get('is_sub_header', False),
            'router_name': spec.get('router_name', ''),
            'router_link': spec.get('router_link', ''),
        }
        menu, created = Menu.objects.get_or_create(
            code=spec['code'],
            defaults={**structure, 'name': spec['name'], 'icon': spec.get('icon', ''),
                      'sort_order': spec.get('sort_order', 0), 'parent': by_code.get(spec.get('parent'))},
        )
        if not created:
            for field, value in structure.items():
                setattr(menu, field, value)
            menu.save(update_fields=list(structure))
        by_code[spec['code']] = menu
        sync_menu_permissions(Permission, Action, menu)


def sync_all(Menu, Permission, Action, Role=None, RolePermission=None):
    """Actions, system menus, and a permission per action for every menu."""
    sync_actions(Action)
    sync_system_menus(Menu, Permission, Action)
    for menu in Menu.objects.all():
        sync_menu_permissions(Permission, Action, menu)
    if Role is not None and Role.objects.filter(name=OWNER_ROLE).exists():
        ensure_owner_role(Role, RolePermission, Permission)


def ensure_owner_role(Role, RolePermission, Permission):
    """The Owner role (found by name), holding every permission. Returns it."""
    role, _ = Role.objects.get_or_create(
        name=OWNER_ROLE, defaults={'description': OWNER_DESCRIPTION},
    )
    have = set(RolePermission.objects.filter(role=role).values_list('permission_id', flat=True))
    RolePermission.objects.bulk_create(
        [RolePermission(role=role, permission=p) for p in Permission.objects.exclude(id__in=have)]
    )
    return role
