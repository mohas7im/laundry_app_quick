"""
The Orders menu (/orders; the New Order screen is /orders/new) with one permission
per action (orders.view, .create, .edit, .delete, .print). The Owner role gets them.

Data is frozen here on purpose: migrations must not import app code that changes.
"""
from django.db import migrations


def add_orders_menu(apps, schema_editor):
    Menu = apps.get_model('roles', 'Menu')
    Action = apps.get_model('roles', 'Action')
    Permission = apps.get_model('roles', 'Permission')
    Role = apps.get_model('roles', 'Role')
    RolePermission = apps.get_model('roles', 'RolePermission')

    menu, _ = Menu.objects.get_or_create(code='orders', defaults={
        'name': 'Orders', 'icon': 'receipt', 'sort_order': 5, 'router_name': 'orders', 'router_link': '/orders',
    })
    for action in Action.objects.all():
        Permission.objects.get_or_create(menu=menu, action=action, defaults={
            'code': f'orders.{action.code}', 'description': f'{action.name} {menu.name}',
        })

    owner = Role.objects.filter(name='Owner').first()
    if owner is not None:
        have = set(RolePermission.objects.filter(role=owner).values_list('permission_id', flat=True))
        RolePermission.objects.bulk_create(
            [RolePermission(role=owner, permission=p)
             for p in Permission.objects.filter(menu=menu).exclude(id__in=have)]
        )


def remove_orders_menu(apps, schema_editor):
    apps.get_model('roles', 'Menu').objects.filter(code='orders').delete()


class Migration(migrations.Migration):
    atomic = False  # see roles 0004: PostgreSQL pending-trigger events

    dependencies = [
        ('orders', '0001_initial'),
        ('catalogue', '0002_catalogue_menus'),
    ]

    operations = [
        migrations.RunPython(add_orders_menu, remove_orders_menu),
    ]
