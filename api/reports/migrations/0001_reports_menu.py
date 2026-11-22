"""
M7: the Reports menu (/reports: daily summary and exports) with one permission per action
(reports.view: the daily summary; reports.print: print and export). The Owner gets them.
The Dashboard menu exists already (dashboard.view shows the business dashboard).

Data is frozen here on purpose: migrations must not import app code that changes.
"""
from django.db import migrations


def add_reports_menu(apps, schema_editor):
    Menu = apps.get_model('roles', 'Menu')
    Action = apps.get_model('roles', 'Action')
    Permission = apps.get_model('roles', 'Permission')
    Role = apps.get_model('roles', 'Role')
    RolePermission = apps.get_model('roles', 'RolePermission')

    menu, _ = Menu.objects.get_or_create(code='reports', defaults={
        'name': 'Reports', 'icon': 'file-text', 'sort_order': 11, 'router_name': 'reports', 'router_link': '/reports',
    })
    for action in Action.objects.all():
        Permission.objects.get_or_create(menu=menu, action=action, defaults={
            'code': f'reports.{action.code}', 'description': f'{action.name} Reports',
        })
    owner = Role.objects.filter(name='Owner').first()
    if owner is not None:
        have = set(RolePermission.objects.filter(role=owner).values_list('permission_id', flat=True))
        RolePermission.objects.bulk_create(
            [RolePermission(role=owner, permission=p)
             for p in Permission.objects.filter(menu=menu).exclude(id__in=have)]
        )


def remove_reports_menu(apps, schema_editor):
    apps.get_model('roles', 'Menu').objects.filter(code='reports').delete()


class Migration(migrations.Migration):
    atomic = False  # see roles 0004: PostgreSQL pending-trigger events

    dependencies = [
        ('roles', '0009_remove_menu_is_active'),
    ]

    operations = [
        migrations.RunPython(add_reports_menu, remove_reports_menu),
    ]
