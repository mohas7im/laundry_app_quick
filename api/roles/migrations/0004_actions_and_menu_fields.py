"""
- New `actions` table (the permission grid's columns).
- permissions.action becomes a foreign key to actions (permission ids are kept,
  so existing role grants survive).
- menus: path → router_link; new is_group / is_header / is_sub_header /
  router_name / router_description; new `menu_routes` table for child links.
- Every page menu gets one permission per action (adds print and approval).

Data is frozen here on purpose: migrations must not import app code that changes.
"""
import uuid

import django.db.models.deletion
from django.db import migrations, models
from django.db.models import Q

ACTIONS = [
    ('create', 'Create', 1),
    ('edit', 'Edit', 2),
    ('delete', 'Delete', 3),
    ('view', 'View', 4),
    ('print', 'Print', 5),
    ('approval', 'Approval', 6),
]

SYSTEM_STRUCTURE = {
    # code: (is_group, is_header, router_name, child routes)
    'dashboard': (False, False, 'dashboard', []),
    'administration': (True, True, '', []),
    'branches': (False, False, 'branches', []),
    'roles': (False, False, 'roles', ['/roles/:id/permissions']),
    'users': (False, False, 'users', []),
    'menus': (False, False, 'menus', ['/menus/new', '/menus/:id/edit']),
}


def create_actions(apps, schema_editor):
    Action = apps.get_model('roles', 'Action')
    for code, name, order in ACTIONS:
        Action.objects.update_or_create(code=code, defaults={'name': name, 'sort_order': order})


def link_permissions_to_actions(apps, schema_editor):
    Action = apps.get_model('roles', 'Action')
    Permission = apps.get_model('roles', 'Permission')
    for p in Permission.objects.all():
        action = Action.objects.filter(code=p.action).first()
        if action is None:  # an extra action someone added to a menu (e.g. "refund")
            last = Action.objects.order_by('-sort_order').first()
            action = Action.objects.create(code=p.action, name=p.action.replace('_', ' ').capitalize(),
                                           sort_order=(last.sort_order + 1) if last else 1)
        p.action_ref = action
        p.save(update_fields=['action_ref'])


def reshape_menus(apps, schema_editor):
    Menu = apps.get_model('roles', 'Menu')
    MenuRoute = apps.get_model('roles', 'MenuRoute')
    Permission = apps.get_model('roles', 'Permission')
    Action = apps.get_model('roles', 'Action')
    RolePermission = apps.get_model('roles', 'RolePermission')
    Role = apps.get_model('roles', 'Role')

    for menu in Menu.objects.all():
        if menu.code in SYSTEM_STRUCTURE:
            is_group, is_header, router_name, children = SYSTEM_STRUCTURE[menu.code]
        else:  # menus created in the app: no link = group heading
            is_group, is_header, router_name, children = (not menu.router_link, not menu.router_link,
                                                          '' if not menu.router_link else menu.code, [])
        menu.is_group, menu.is_header, menu.router_name = is_group, is_header, router_name
        if is_group:
            menu.router_link = ''
        menu.save(update_fields=['is_group', 'is_header', 'router_name', 'router_link'])
        for link in children:
            MenuRoute.objects.update_or_create(link=link, defaults={'menu': menu})

        if is_group:
            Permission.objects.filter(menu=menu).delete()
            continue
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
    # Each step commits on its own: PostgreSQL can't ALTER a table in the same
    # transaction that changed its rows (pending FK trigger events).
    atomic = False

    dependencies = [
        ('roles', '0003_menus'),
    ]

    operations = [
        # ── actions ─────────────────────────────────────────────────────────
        migrations.CreateModel(
            name='Action',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('code', models.CharField(max_length=50, unique=True)),
                ('name', models.CharField(max_length=50)),
                ('sort_order', models.PositiveIntegerField(default=0)),
            ],
            options={
                'db_table': 'actions',
                'ordering': ['sort_order', 'code'],
                'constraints': [
                    models.CheckConstraint(condition=Q(code__regex='^[a-z][a-z_]*$'), name='actions_code_format_ck'),
                ],
            },
        ),
        migrations.RunPython(create_actions, migrations.RunPython.noop),

        # ── permissions.action: text → foreign key ──────────────────────────
        migrations.AddField(
            model_name='permission',
            name='action_ref',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='+', to='roles.action'),
        ),
        migrations.RunPython(link_permissions_to_actions, migrations.RunPython.noop),
        migrations.RemoveConstraint(model_name='permission', name='permissions_menu_action_uq'),
        migrations.RemoveField(model_name='permission', name='action'),
        migrations.RenameField(model_name='permission', old_name='action_ref', new_name='action'),
        migrations.AlterField(
            model_name='permission',
            name='action',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                    related_name='permissions', to='roles.action'),
        ),
        migrations.AddConstraint(
            model_name='permission',
            constraint=models.UniqueConstraint(fields=('menu', 'action'), name='permissions_menu_action_uq'),
        ),
        migrations.AlterModelOptions(
            name='permission', options={'ordering': ['menu__sort_order', 'action__sort_order']},
        ),

        # ── menus: new fields, child links ──────────────────────────────────
        migrations.RenameField(model_name='menu', old_name='path', new_name='router_link'),
        migrations.AddField(model_name='menu', name='is_group', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='menu', name='is_header', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='menu', name='is_sub_header', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='menu', name='router_name', field=models.CharField(blank=True, max_length=80)),
        migrations.AddField(model_name='menu', name='router_description',
                            field=models.CharField(blank=True, max_length=255)),
        migrations.CreateModel(
            name='MenuRoute',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('link', models.CharField(max_length=200, unique=True)),
                ('menu', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                           related_name='child_routes', to='roles.menu')),
            ],
            options={'db_table': 'menu_routes', 'ordering': ['link']},
        ),
        migrations.RunPython(reshape_menus, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name='menu',
            constraint=models.CheckConstraint(
                condition=Q(is_group=True) | Q(is_header=False, is_sub_header=False),
                name='menus_header_only_for_groups_ck'),
        ),
        migrations.AddConstraint(
            model_name='menu',
            constraint=models.CheckConstraint(
                condition=~Q(is_header=True, is_sub_header=True), name='menus_header_xor_sub_header_ck'),
        ),
        migrations.AddConstraint(
            model_name='menu',
            constraint=models.CheckConstraint(
                condition=Q(is_group=True, router_link='') | (Q(is_group=False) & ~Q(router_link='')),
                name='menus_link_only_for_pages_ck'),
        ),
        migrations.AddConstraint(
            model_name='menu',
            constraint=models.UniqueConstraint(fields=('router_link',), condition=~Q(router_link=''),
                                               name='menus_router_link_uq'),
        ),
    ]
