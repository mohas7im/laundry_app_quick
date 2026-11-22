"""
The common master lists the app uses (masters/registry.py), and the Common Masters menu
(/common-masters, under Administration) with one permission per action. The Owner gets them.

The values below replace lists that used to be written in the code (item categories,
pricing types, upcharge/discount types, payment methods, order note chips).

Data is frozen here on purpose: migrations must not import app code that changes.
"""
from django.db import migrations

TYPES = [
    # code, name, description, values [(code, name)]
    ('ITEM_CATEGORY', 'Item category', 'Groups items, e.g. Men, Women, Household.',
     [('men', 'Men'), ('women', 'Women'), ('kids', 'Kids'), ('household', 'Household'), ('other', 'Other')]),
    ('PRICING_TYPE', 'Charged', 'How an item is priced: per piece, by weight or by area.',
     [('unit', 'Per item'), ('per_kg', 'Per kg'), ('per_m2', 'Per m²')]),
    ('UPCHARGE_TYPE', 'Upcharge type', 'A fixed amount, or a percent of the order line.',
     [('fixed', 'Fixed amount (AED)'), ('percent', 'Percent of the line (%)')]),
    ('DISCOUNT_TYPE', 'Discount type', 'An amount off, or a percent of the subtotal.',
     [('amount', 'Amount (AED)'), ('percent', 'Percent (%)')]),
    ('PAYMENT_METHOD', 'Payment method', 'How a customer pays. Cash, card and bank mean the money was taken.',
     [('on_collection', 'Pay on collection'), ('cash', 'Cash'), ('card', 'Card'), ('bank', 'Bank transfer'),
      ('on_account', 'On account')]),
    ('ORDER_NOTE', 'Order note', 'Quick notes the counter adds to an order with one tap.',
     [('no_starch', 'No starch'), ('light_starch', 'Light starch'), ('heavy_starch', 'Heavy starch'),
      ('on_hanger', 'On hanger'), ('folded', 'Folded')]),
]


def add_lists_and_menu(apps, schema_editor):
    CommonMasterType = apps.get_model('masters', 'CommonMasterType')
    CommonMaster = apps.get_model('masters', 'CommonMaster')
    for code, name, description, values in TYPES:
        master_type, _ = CommonMasterType.objects.get_or_create(
            code=code, defaults={'name': name, 'description': description})
        for order, (value_code, value_name) in enumerate(values, start=1):
            CommonMaster.objects.get_or_create(type=master_type, code=value_code,
                                               defaults={'name': value_name, 'sort_order': order})

    Menu = apps.get_model('roles', 'Menu')
    Action = apps.get_model('roles', 'Action')
    Permission = apps.get_model('roles', 'Permission')
    Role = apps.get_model('roles', 'Role')
    RolePermission = apps.get_model('roles', 'RolePermission')
    admin = Menu.objects.filter(code='administration').first()
    menu, _ = Menu.objects.get_or_create(code='common_masters', defaults={
        'name': 'Common Masters', 'icon': 'folder', 'sort_order': 6, 'parent': admin,
        'router_name': 'common-masters', 'router_link': '/common-masters',
    })
    for action in Action.objects.all():
        Permission.objects.get_or_create(menu=menu, action=action, defaults={
            'code': f'common_masters.{action.code}', 'description': f'{action.name} {menu.name}',
        })
    owner = Role.objects.filter(name='Owner').first()
    if owner is not None:
        have = set(RolePermission.objects.filter(role=owner).values_list('permission_id', flat=True))
        RolePermission.objects.bulk_create(
            [RolePermission(role=owner, permission=p)
             for p in Permission.objects.filter(menu=menu).exclude(id__in=have)]
        )


def remove_lists_and_menu(apps, schema_editor):
    apps.get_model('roles', 'Menu').objects.filter(code='common_masters').delete()
    apps.get_model('masters', 'CommonMaster').objects.all().delete()
    apps.get_model('masters', 'CommonMasterType').objects.all().delete()


class Migration(migrations.Migration):
    atomic = False  # see roles 0004: PostgreSQL pending-trigger events

    dependencies = [
        ('masters', '0001_initial'),
        ('roles', '0009_remove_menu_is_active'),
    ]

    operations = [
        migrations.RunPython(add_lists_and_menu, remove_lists_and_menu),
    ]
