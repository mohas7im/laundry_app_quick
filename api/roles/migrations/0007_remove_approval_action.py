"""
Remove the "approval" action: not used by this business. Deleting the action
deletes its permissions (permissions.action ON DELETE CASCADE) and every role
grant of them (role_permissions ON DELETE CASCADE).
"""
from django.db import migrations

APPROVAL = ('approval', 'Approval', 6)


def remove_approval(apps, schema_editor):
    apps.get_model('roles', 'Action').objects.filter(code=APPROVAL[0]).delete()


def restore_approval(apps, schema_editor):
    Action = apps.get_model('roles', 'Action')
    Menu = apps.get_model('roles', 'Menu')
    Permission = apps.get_model('roles', 'Permission')
    code, name, order = APPROVAL
    action, _ = Action.objects.get_or_create(code=code, defaults={'name': name, 'sort_order': order})
    for menu in Menu.objects.all():
        Permission.objects.get_or_create(
            menu=menu, action=action,
            defaults={'code': f'{menu.code}.{code}', 'description': f'{name} {menu.name}'},
        )


class Migration(migrations.Migration):
    dependencies = [
        ('roles', '0006_menu_tree_without_groups'),
    ]

    operations = [
        migrations.RunPython(remove_approval, restore_approval),
    ]
