"""
New common master lists (masters/registry.py):

- ITEM_COLOUR, ITEM_DAMAGE, ITEM_STAIN: the tags the counter puts on each piece
  (colours from the build pack's reference list).
- PREF_*: customer preferences (shirt, trouser, starch, detergent, scent, softener).

Data is frozen here on purpose: migrations must not import app code that changes.
"""
from django.db import migrations

TYPES = [('ITEM_COLOUR', 'Item colour', 'Colours the counter tags a piece with.',
  [('beige', 'Beige'), ('black', 'Black'), ('brown', 'Brown'), ('blue', 'Blue'), ('blue_light', 'Blue (Light)'),
   ('blue_royal', 'Blue (Royal)'), ('burgundy', 'Burgundy'), ('check', 'Check'), ('cream', 'Cream'), ('dark', 'Dark'),
   ('dot', 'Dot'), ('floral', 'Floral'), ('gold', 'Gold'), ('gray', 'Gray'), ('gray_light', 'Gray (Light)'),
   ('green', 'Green'), ('green_light', 'Green (Light)'), ('hawaiian', 'Hawaiian'), ('ivory', 'Ivory'),
   ('khaki', 'Khaki'), ('lemon', 'Lemon'), ('light', 'Light'), ('mixed', 'Mixed'), ('multi', 'Multi'),
   ('navy', 'Navy'), ('off_white', 'Off White'), ('orange', 'Orange'), ('peach', 'Peach'), ('plaid', 'Plaid'),
   ('plain', 'Plain'), ('plum', 'Plum'), ('pink', 'Pink'), ('print', 'Print'), ('purple', 'Purple'), ('red', 'Red'),
   ('silver', 'Silver'), ('striped', 'Striped'), ('tan', 'Tan'), ('teal', 'Teal'), ('white', 'White'),
   ('yellow', 'Yellow')]),
 ('ITEM_DAMAGE', 'Item damage', 'Damage noted on a piece when it is handed in.',
  [('bubble', 'Bubble'), ('button_broken', 'Button broken'), ('button_missing', 'Button missing'),
   ('collar_torn', 'Collar torn'), ('colour_loss', 'Colour loss'), ('cuff_torn', 'Cuff torn'), ('hole', 'Hole'),
   ('torn', 'Torn'), ('zip_broken', 'Zip broken'), ('faded', 'Faded'), ('shrunk', 'Shrunk'),
   ('burn_mark', 'Burn mark')]),
 ('ITEM_STAIN', 'Item stain', 'Stains noted on a piece.',
  [('oil', 'Oil'), ('ink', 'Ink'), ('food', 'Food'), ('tea_coffee', 'Tea / coffee'), ('blood', 'Blood'),
   ('sweat', 'Sweat'), ('make_up', 'Make-up'), ('mud', 'Mud'), ('rust', 'Rust'), ('unknown', 'Unknown')]),
 ('PREF_SHIRT', 'Shirt', 'Customer preference: how shirts come back.',
  [('hanger', 'Hanger'), ('boxed', 'Boxed'), ('folded', 'Folded')]),
 ('PREF_TROUSER', 'Trouser', 'Customer preference: how trousers come back.',
  [('hanger', 'Hanger'), ('boxed', 'Boxed'), ('folded', 'Folded')]),
 ('PREF_STARCH', 'Starch', 'Customer preference: starch (nesha).',
  [('none', 'No starch'), ('light', 'Light'), ('normal', 'Normal'), ('heavy', 'Heavy')]),
 ('PREF_DETERGENT', 'Detergent', 'Customer preference: detergent type.',
  [('standard', 'Standard'), ('premium', 'Premium')]),
 ('PREF_SCENT', 'Scent', 'Customer preference: detergent scent.',
  [('none', 'No scent'), ('light', 'Light'), ('medium', 'Medium'), ('heavy', 'Heavy'),
   ('sensitive', 'Sensitive skin')]),
 ('PREF_SOFTENER', 'Softener', 'Customer preference: fabric softener.',
  [('none', 'No softener'), ('standard', 'Standard'), ('premium', 'Premium')])]


def add_lists(apps, schema_editor):
    CommonMasterType = apps.get_model('masters', 'CommonMasterType')
    CommonMaster = apps.get_model('masters', 'CommonMaster')
    for code, name, description, values in TYPES:
        master_type, _ = CommonMasterType.objects.get_or_create(
            code=code, defaults={'name': name, 'description': description})
        for order, (value_code, value_name) in enumerate(values, start=1):
            CommonMaster.objects.get_or_create(type=master_type, code=value_code,
                                               defaults={'name': value_name, 'sort_order': order})


def remove_lists(apps, schema_editor):
    codes = [code for code, *_ in TYPES]
    apps.get_model('masters', 'CommonMaster').objects.filter(type__code__in=codes).delete()
    apps.get_model('masters', 'CommonMasterType').objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('masters', '0002_master_lists_and_menu'),
    ]

    operations = [
        migrations.RunPython(add_lists, remove_lists),
    ]
