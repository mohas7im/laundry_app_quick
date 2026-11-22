"""
M5: the PRODUCTION_STAGE common master list (Washing → Ironing → Packing; admins can
rename, reorder, add and hide stages) and the Production (/production) and Collection
(/collection) menus with one permission per action. The Owner gets them.

Data is frozen here on purpose: migrations must not import app code that changes.
"""
from django.db import migrations

STAGES = [('washing', 'Washing'), ('ironing', 'Ironing'), ('packing', 'Packing')]
MENUS = [
    # code, name, icon, sort order, router name, link
    ('production', 'Production', 'washing-machine', 6, 'production', '/production'),
    ('collection', 'Collection', 'package-check', 7, 'collection', '/collection'),
]


def add_stages_and_menus(apps, schema_editor):
    CommonMasterType = apps.get_model('masters', 'CommonMasterType')
    CommonMaster = apps.get_model('masters', 'CommonMaster')
    stage_type, _ = CommonMasterType.objects.get_or_create(code='PRODUCTION_STAGE', defaults={
        'name': 'Production stage', 'description': 'The workshop steps between Received and Ready, in order.',
    })
    for order, (code, name) in enumerate(STAGES, start=1):
        CommonMaster.objects.get_or_create(type=stage_type, code=code, defaults={'name': name, 'sort_order': order})

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


def remove_stages_and_menus(apps, schema_editor):
    apps.get_model('roles', 'Menu').objects.filter(code__in=[m[0] for m in MENUS]).delete()


class Migration(migrations.Migration):
    atomic = False  # see roles 0004: PostgreSQL pending-trigger events

    dependencies = [
        ('orders', '0003_production_and_collection'),
        ('masters', '0002_master_lists_and_menu'),
        ('roles', '0009_remove_menu_is_active'),
    ]

    operations = [
        migrations.RunPython(add_stages_and_menus, remove_stages_and_menus),
    ]
