"""
Item category, item pricing type ("Charged") and upcharge type move from text columns
with values written in the code to foreign keys to common masters (masters app).

Existing rows keep their value: each old code ("men", "per_kg", "fixed") is linked to
the master row with that code. Data is frozen here on purpose.
"""
import django.db.models.deletion
from django.db import migrations, models

FALLBACK = {'ITEM_CATEGORY': 'other', 'PRICING_TYPE': 'unit', 'UPCHARGE_TYPE': 'fixed'}


def link_to_masters(apps, schema_editor):
    CommonMaster = apps.get_model('masters', 'CommonMaster')
    Item = apps.get_model('catalogue', 'Item')
    Upcharge = apps.get_model('catalogue', 'Upcharge')

    def lookup(type_code):
        by_code = {m.code: m for m in CommonMaster.objects.filter(type__code=type_code)}
        return lambda code: by_code.get(code) or by_code[FALLBACK[type_code]]

    category, pricing = lookup('ITEM_CATEGORY'), lookup('PRICING_TYPE')
    for item in Item.objects.all():
        item.category_ref = category(item.category)
        item.pricing_type_ref = pricing(item.pricing_type)
        item.save(update_fields=['category_ref', 'pricing_type_ref'])

    charge = lookup('UPCHARGE_TYPE')
    for upcharge in Upcharge.objects.all():
        upcharge.charge_type_ref = charge(upcharge.charge_type)
        upcharge.save(update_fields=['charge_type_ref'])


def master_fk(type_code, null, help_text=''):
    return models.ForeignKey(
        null=null, on_delete=django.db.models.deletion.PROTECT, related_name='+', to='masters.commonmaster',
        limit_choices_to={'type__code': type_code}, **({'help_text': help_text} if help_text else {}),
    )


class Migration(migrations.Migration):
    atomic = False  # see roles 0004: PostgreSQL pending-trigger events

    dependencies = [
        ('catalogue', '0002_catalogue_menus'),
        ('masters', '0002_master_lists_and_menu'),
    ]

    operations = [
        migrations.AddField('item', 'category_ref', master_fk('ITEM_CATEGORY', null=True)),
        migrations.AddField('item', 'pricing_type_ref', master_fk('PRICING_TYPE', null=True)),
        migrations.AddField('upcharge', 'charge_type_ref', master_fk('UPCHARGE_TYPE', null=True)),
        migrations.RunPython(link_to_masters, migrations.RunPython.noop),
        migrations.RemoveField('item', 'category'),
        migrations.RemoveField('item', 'pricing_type'),
        migrations.RemoveField('upcharge', 'charge_type'),
        migrations.RenameField('item', 'category_ref', 'category'),
        migrations.RenameField('item', 'pricing_type_ref', 'pricing_type'),
        migrations.RenameField('upcharge', 'charge_type_ref', 'charge_type'),
        migrations.AlterField('item', 'category', master_fk('ITEM_CATEGORY', null=False)),
        migrations.AlterField('item', 'pricing_type', master_fk(
            'PRICING_TYPE', null=False, help_text='How it is charged: per item, per kg or per m².')),
        migrations.AlterField('upcharge', 'charge_type', master_fk('UPCHARGE_TYPE', null=False)),
    ]
