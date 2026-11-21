import uuid

import django.db.models.deletion
from django.db import migrations, models


def clear_old_permissions(apps, schema_editor):
    # Old fixed permission list (module-based). Replaced by menu-based permissions below.
    apps.get_model('roles', 'Permission').objects.all().delete()


# Frozen copy of the system menus as they were at this migration (0004 reshapes them).
# Migrations must not import app code that keeps changing.
_MENUS_0003 = [
    ('dashboard', 'Dashboard', '/', 'layout-dashboard', None, 0, ['view']),
    ('administration', 'Administration', '', 'settings', None, 90, []),
    ('branches', 'Branches', '/branches', 'building-2', 'administration', 1, ['view', 'create', 'edit', 'delete']),
    ('roles', 'Roles & Permissions', '/roles', 'shield-check', 'administration', 2, ['view', 'create', 'edit', 'delete']),
    ('users', 'Users', '/users', 'users', 'administration', 3, ['view', 'create', 'edit', 'delete']),
    ('menus', 'Menus', '/menus', 'list-tree', 'administration', 4, ['view', 'create', 'edit', 'delete']),
]


def load_system_menus(apps, schema_editor):
    Menu = apps.get_model('roles', 'Menu')
    Permission = apps.get_model('roles', 'Permission')
    by_code = {}
    for code, name, path, icon, parent, order, actions in _MENUS_0003:
        menu, _ = Menu.objects.get_or_create(
            code=code,
            defaults={'name': name, 'path': path, 'icon': icon, 'sort_order': order,
                      'parent': by_code.get(parent), 'is_system': True},
        )
        by_code[code] = menu
        for action in actions:
            Permission.objects.get_or_create(
                menu=menu, action=action,
                defaults={'code': f'{code}.{action}', 'description': f'{action.capitalize()} {name}'},
            )


class Migration(migrations.Migration):
    # Each step commits on its own: PostgreSQL can't ALTER `permissions` in the same
    # transaction that deleted rows from it (pending FK trigger events).
    atomic = False

    dependencies = [
        ('roles', '0002_branch_role_fk_and_permissions'),
    ]

    operations = [
        migrations.RunPython(clear_old_permissions, migrations.RunPython.noop),
        migrations.CreateModel(
            name='Menu',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('code', models.CharField(max_length=50, unique=True)),
                ('name', models.CharField(max_length=80)),
                ('path', models.CharField(blank=True, max_length=200)),
                ('icon', models.CharField(blank=True, max_length=50)),
                ('sort_order', models.PositiveIntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
                ('is_system', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('parent', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                                             related_name='children', to='roles.menu')),
            ],
            options={
                'db_table': 'menus',
                'ordering': ['sort_order', 'name'],
                'constraints': [
                    models.CheckConstraint(condition=models.Q(code__regex='^[a-z][a-z_]*$'), name='menus_code_format_ck'),
                ],
            },
        ),
        migrations.AlterModelOptions(name='permission', options={'ordering': ['menu__sort_order', 'code']}),
        migrations.RemoveField(model_name='permission', name='module'),
        migrations.AddField(
            model_name='permission',
            name='menu',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='permissions', to='roles.menu'),
        ),
        migrations.AddField(
            model_name='permission',
            name='action',
            field=models.CharField(default='', max_length=50),
            preserve_default=False,
        ),
        migrations.AlterField(  # table is empty here, so NOT NULL is safe
            model_name='permission',
            name='menu',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                    related_name='permissions', to='roles.menu'),
        ),
        migrations.AddConstraint(
            model_name='permission',
            constraint=models.UniqueConstraint(fields=('menu', 'action'), name='permissions_menu_action_uq'),
        ),
        migrations.RunPython(load_system_menus, migrations.RunPython.noop),
    ]
