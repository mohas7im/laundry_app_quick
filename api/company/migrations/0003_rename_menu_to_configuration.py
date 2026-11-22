"""
The Company Settings menu becomes "Configuration" at /configuration (unless the owner
renamed it). Its permission codes stay company.view / company.edit, so roles keep them;
only their descriptions change.

Data is frozen here on purpose: migrations must not import app code that changes.
"""
from django.db import migrations


def rename(apps, schema_editor):
    Menu = apps.get_model('roles', 'Menu')
    Permission = apps.get_model('roles', 'Permission')
    menu = Menu.objects.filter(code='company').first()
    if menu is None:
        return
    if menu.name == 'Company Settings':
        menu.name = 'Configuration'
    menu.router_name, menu.router_link = 'configuration', '/configuration'
    menu.save(update_fields=['name', 'router_name', 'router_link'])
    for p in Permission.objects.filter(menu=menu).select_related('action'):
        p.description = f'{p.action.name} {menu.name}'
        p.save(update_fields=['description'])


def rename_back(apps, schema_editor):
    Menu = apps.get_model('roles', 'Menu')
    Menu.objects.filter(code='company', name='Configuration').update(
        name='Company Settings', router_name='company', router_link='/company')


class Migration(migrations.Migration):
    atomic = False  # see roles 0004: PostgreSQL pending-trigger events

    dependencies = [
        ('company', '0002_company_menu'),
    ]

    operations = [
        migrations.RunPython(rename, rename_back),
    ]
