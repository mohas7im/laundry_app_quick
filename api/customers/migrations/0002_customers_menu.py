"""
The Customers menu (/customers) with one permission per action
(customers.view, .create, .edit, .delete, .print). The Owner role gets them.

Data is frozen here on purpose: migrations must not import app code that changes.
"""
from django.db import migrations


def add_customers_menu(apps, schema_editor):
    Menu = apps.get_model('roles', 'Menu')
    Action = apps.get_model('roles', 'Action')
    Permission = apps.get_model('roles', 'Permission')
    Role = apps.get_model('roles', 'Role')
    RolePermission = apps.get_model('roles', 'RolePermission')

    menu, _ = Menu.objects.get_or_create(
        code='customers',
        defaults={'name': 'Customers', 'icon': 'contact-round', 'sort_order': 10,
                  'router_name': 'customers', 'router_link': '/customers'},
    )
    for action in Action.objects.all():
        Permission.objects.get_or_create(
            menu=menu, action=action,
            defaults={'code': f'customers.{action.code}', 'description': f'{action.name} {menu.name}'},
        )

    owner = Role.objects.filter(name='Owner').first()
    if owner is not None:
        have = set(RolePermission.objects.filter(role=owner).values_list('permission_id', flat=True))
        RolePermission.objects.bulk_create(
            [RolePermission(role=owner, permission=p)
             for p in Permission.objects.filter(menu=menu).exclude(id__in=have)]
        )


def remove_customers_menu(apps, schema_editor):
    apps.get_model('roles', 'Menu').objects.filter(code='customers').delete()  # cascades to its permissions


class Migration(migrations.Migration):
    atomic = False  # see roles 0004: PostgreSQL pending-trigger events

    dependencies = [
        ('customers', '0001_initial'),
        ('roles', '0009_remove_menu_is_active'),
    ]

    operations = [
        migrations.RunPython(add_customers_menu, remove_customers_menu),
    ]
