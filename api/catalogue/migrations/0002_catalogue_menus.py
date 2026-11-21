"""
The Catalogue header and its pages (Services, Items, Price Lists, Prices, Upcharges),
each with one permission per action. The Owner role gets them.

Data is frozen here on purpose: migrations must not import app code that changes.
"""
from django.db import migrations

HEADER = {'code': 'catalogue', 'name': 'Catalogue', 'icon': 'tags', 'sort_order': 20, 'is_header': True}
PAGES = [
    # code, name, icon, sort order, router name, link
    ('services', 'Services', 'washing-machine', 1, 'services', '/services'),
    ('items', 'Items', 'shirt', 2, 'items', '/items'),
    ('price_lists', 'Price Lists', 'clipboard-list', 3, 'price-lists', '/price-lists'),
    ('prices', 'Prices', 'circle-dollar-sign', 4, 'prices', '/prices'),
    ('upcharges', 'Upcharges', 'badge-percent', 5, 'upcharges', '/upcharges'),
]


def add_catalogue_menus(apps, schema_editor):
    Menu = apps.get_model('roles', 'Menu')
    Action = apps.get_model('roles', 'Action')
    Permission = apps.get_model('roles', 'Permission')
    Role = apps.get_model('roles', 'Role')
    RolePermission = apps.get_model('roles', 'RolePermission')

    header, _ = Menu.objects.get_or_create(code=HEADER['code'], defaults={
        'name': HEADER['name'], 'icon': HEADER['icon'], 'sort_order': HEADER['sort_order'], 'is_header': True,
    })
    menus = [header]
    for code, name, icon, order, router_name, link in PAGES:
        menu, _ = Menu.objects.get_or_create(code=code, defaults={
            'name': name, 'icon': icon, 'sort_order': order, 'parent': header,
            'router_name': router_name, 'router_link': link,
        })
        menus.append(menu)

    actions = list(Action.objects.all())
    for menu in menus:
        for action in actions:
            Permission.objects.get_or_create(menu=menu, action=action, defaults={
                'code': f'{menu.code}.{action.code}', 'description': f'{action.name} {menu.name}',
            })

    owner = Role.objects.filter(name='Owner').first()
    if owner is not None:
        have = set(RolePermission.objects.filter(role=owner).values_list('permission_id', flat=True))
        RolePermission.objects.bulk_create(
            [RolePermission(role=owner, permission=p)
             for p in Permission.objects.filter(menu__in=menus).exclude(id__in=have)]
        )


def remove_catalogue_menus(apps, schema_editor):
    Menu = apps.get_model('roles', 'Menu')
    Menu.objects.filter(code__in=[p[0] for p in PAGES]).delete()  # cascades to their permissions
    Menu.objects.filter(code=HEADER['code']).delete()


class Migration(migrations.Migration):
    atomic = False  # see roles 0004: PostgreSQL pending-trigger events

    dependencies = [
        ('catalogue', '0001_initial'),
        ('customers', '0002_customers_menu'),
    ]

    operations = [
        migrations.RunPython(add_catalogue_menus, remove_catalogue_menus),
    ]
