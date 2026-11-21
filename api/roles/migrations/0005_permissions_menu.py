"""
Roles and Permissions become separate menus:
- "Roles & Permissions" → "Roles" (only if the owner hasn't renamed it); its
  /roles/:id/permissions child link moves to the new Permissions menu.
- New system menu "Permissions" (/permissions, child /permissions/:roleId) with
  one permission per action.
- Roles that could view/edit roles keep managing permissions: roles.view →
  permissions.view, roles.edit → permissions.edit. The Owner gets everything.

Data is frozen here on purpose: migrations must not import app code that changes.
"""
from django.db import migrations


def split_permissions_menu(apps, schema_editor):
    Menu = apps.get_model('roles', 'Menu')
    MenuRoute = apps.get_model('roles', 'MenuRoute')
    Action = apps.get_model('roles', 'Action')
    Permission = apps.get_model('roles', 'Permission')
    RolePermission = apps.get_model('roles', 'RolePermission')
    Role = apps.get_model('roles', 'Role')

    roles_menu = Menu.objects.filter(code='roles').first()
    admin = Menu.objects.filter(code='administration').first()
    if roles_menu is None or admin is None:
        return  # built-in menus missing (deleted by hand): nothing to split

    if roles_menu.name == 'Roles & Permissions':
        roles_menu.name = 'Roles'
        roles_menu.save(update_fields=['name'])
    MenuRoute.objects.filter(link='/roles/:id/permissions').delete()

    # keep the built-in order unless the owner changed it
    for code, old, new in (('users', 3, 4), ('menus', 4, 5)):
        Menu.objects.filter(code=code, sort_order=old).update(sort_order=new)

    menu, _ = Menu.objects.get_or_create(
        code='permissions',
        defaults={'name': 'Permissions', 'icon': 'key-round', 'sort_order': 3, 'parent': admin,
                  'router_name': 'permissions', 'router_link': '/permissions', 'is_system': True},
    )
    MenuRoute.objects.update_or_create(link='/permissions/:roleId', defaults={'menu': menu})
    for action in Action.objects.all():
        Permission.objects.get_or_create(
            menu=menu, action=action,
            defaults={'code': f'permissions.{action.code}', 'description': f'{action.name} Permissions'},
        )

    by_code = {p.code: p for p in Permission.objects.filter(menu=menu)}
    for source, target in (('roles.view', 'permissions.view'), ('roles.edit', 'permissions.edit')):
        role_ids = RolePermission.objects.filter(permission__code=source).values_list('role_id', flat=True)
        have = set(RolePermission.objects.filter(permission=by_code[target]).values_list('role_id', flat=True))
        RolePermission.objects.bulk_create(
            [RolePermission(role_id=r, permission=by_code[target]) for r in set(role_ids) - have]
        )

    owner = Role.objects.filter(name='Owner', is_system_role=True).first()
    if owner is not None:
        have = set(RolePermission.objects.filter(role=owner).values_list('permission_id', flat=True))
        RolePermission.objects.bulk_create(
            [RolePermission(role=owner, permission=p) for p in Permission.objects.exclude(id__in=have)]
        )


class Migration(migrations.Migration):
    atomic = False  # see 0004: PostgreSQL pending-trigger events

    dependencies = [
        ('roles', '0004_actions_and_menu_fields'),
    ]

    operations = [
        migrations.RunPython(split_permissions_menu, migrations.RunPython.noop),
    ]
