"""
M6: the Payments (/payments) and Cash-up (/shifts) menus with one permission per action.
payments.view: the payments list and customer balances; payments.create: take a payment
or settle a balance; payments.edit: refunds. shifts.view: see shifts; shifts.create:
open and close your own shift. The Owner gets them.

Data is frozen here on purpose: migrations must not import app code that changes.
"""
from django.db import migrations

MENUS = [
    # code, name, icon, sort order, router name, link
    ('payments', 'Payments', 'wallet', 8, 'payments', '/payments'),
    ('shifts', 'Cash-up', 'credit-card', 9, 'shifts', '/shifts'),
]


def add_menus(apps, schema_editor):
    Menu = apps.get_model('roles', 'Menu')
    Action = apps.get_model('roles', 'Action')
    Permission = apps.get_model('roles', 'Permission')
    Role = apps.get_model('roles', 'Role')
    RolePermission = apps.get_model('roles', 'RolePermission')
    menus = []
    for code, name, icon, order, router_name, link in MENUS:
        menu, _ = Menu.objects.get_or_create(code=code, defaults={
            'name': name, 'icon': icon, 'sort_order': order, 'router_name': router_name, 'router_link': link,
        })
        menus.append(menu)
        for action in Action.objects.all():
            Permission.objects.get_or_create(menu=menu, action=action, defaults={
                'code': f'{code}.{action.code}', 'description': f'{action.name} {name}',
            })
    owner = Role.objects.filter(name='Owner').first()
    if owner is not None:
        have = set(RolePermission.objects.filter(role=owner).values_list('permission_id', flat=True))
        RolePermission.objects.bulk_create(
            [RolePermission(role=owner, permission=p)
             for p in Permission.objects.filter(menu__in=menus).exclude(id__in=have)]
        )


def remove_menus(apps, schema_editor):
    apps.get_model('roles', 'Menu').objects.filter(code__in=[m[0] for m in MENUS]).delete()


class Migration(migrations.Migration):
    atomic = False  # see roles 0004: PostgreSQL pending-trigger events

    dependencies = [
        ('cashier', '0001_initial'),
        ('roles', '0009_remove_menu_is_active'),
    ]

    operations = [
        migrations.RunPython(add_menus, remove_menus),
    ]
