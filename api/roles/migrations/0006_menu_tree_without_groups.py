"""
Menus are a plain self-referencing tree:
- `is_group` removed: a menu with children is a parent; how it shows in the
  sidebar is is_header / is_sub_header.
- `menu_routes` removed: sub-pages (e.g. /menus/new, /permissions/<id>) belong to
  the menu whose link is their path prefix.
- Every menu now has one permission per action (former groups get theirs here).

Data is frozen here on purpose: migrations must not import app code that changes.
"""
from django.db import migrations, models
from django.db.models import Q


def permissions_for_every_menu(apps, schema_editor):
    Menu = apps.get_model('roles', 'Menu')
    Action = apps.get_model('roles', 'Action')
    Permission = apps.get_model('roles', 'Permission')
    Role = apps.get_model('roles', 'Role')
    RolePermission = apps.get_model('roles', 'RolePermission')

    for menu in Menu.objects.all():
        for action in Action.objects.all():
            Permission.objects.get_or_create(
                menu=menu, action=action,
                defaults={'code': f'{menu.code}.{action.code}', 'description': f'{action.name} {menu.name}'},
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
        ('roles', '0005_permissions_menu'),
    ]

    operations = [
        migrations.RunPython(permissions_for_every_menu, migrations.RunPython.noop),
        migrations.RemoveConstraint(model_name='menu', name='menus_header_only_for_groups_ck'),
        migrations.RemoveConstraint(model_name='menu', name='menus_link_only_for_pages_ck'),
        migrations.RemoveField(model_name='menu', name='is_group'),
        migrations.DeleteModel(name='MenuRoute'),
        migrations.AddConstraint(
            model_name='menu',
            constraint=models.CheckConstraint(
                condition=Q(is_header=True) | Q(is_sub_header=True) | ~Q(router_link=''),
                name='menus_page_needs_link_ck'),
        ),
    ]
