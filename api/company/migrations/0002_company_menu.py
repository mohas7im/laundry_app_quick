"""
The Company Settings menu (/company, under Administration) with one permission per action
(company.view: see the settings page; company.edit: change them). The Owner gets them.
Everyone logged in can read the settings (receipts print them).

Data is frozen here on purpose: migrations must not import app code that changes.
"""
from django.db import migrations


def add_company_menu(apps, schema_editor):
    Menu = apps.get_model('roles', 'Menu')
    Action = apps.get_model('roles', 'Action')
    Permission = apps.get_model('roles', 'Permission')
    Role = apps.get_model('roles', 'Role')
    RolePermission = apps.get_model('roles', 'RolePermission')

    admin = Menu.objects.filter(code='administration').first()
    menu, _ = Menu.objects.get_or_create(code='company', defaults={
        'name': 'Company Settings', 'icon': 'cog', 'sort_order': 0, 'parent': admin,
        'router_name': 'company', 'router_link': '/company',
    })
    for action in Action.objects.all():
        Permission.objects.get_or_create(menu=menu, action=action, defaults={
            'code': f'company.{action.code}', 'description': f'{action.name} Company Settings',
        })
    owner = Role.objects.filter(name='Owner').first()
    if owner is not None:
        have = set(RolePermission.objects.filter(role=owner).values_list('permission_id', flat=True))
        RolePermission.objects.bulk_create(
            [RolePermission(role=owner, permission=p)
             for p in Permission.objects.filter(menu=menu).exclude(id__in=have)]
        )


def remove_company_menu(apps, schema_editor):
    apps.get_model('roles', 'Menu').objects.filter(code='company').delete()


class Migration(migrations.Migration):
    atomic = False  # see roles 0004: PostgreSQL pending-trigger events

    dependencies = [
        ('company', '0001_initial'),
        ('roles', '0009_remove_menu_is_active'),
    ]

    operations = [
        migrations.RunPython(add_company_menu, remove_company_menu),
    ]
