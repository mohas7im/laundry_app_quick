"""
Invoice numbering is chosen on the Configuration page: per branch (KC33-00001, the
original behaviour) or one sequence for all branches (3001, 3002, ...).

A database that already has plain-number orders (the Comfort go-live) keeps plain numbers:
it switches to one sequence, continuing after the highest number used.

Data is frozen here on purpose: migrations must not import app code that changes.
"""
from django.db import migrations, models


def keep_plain_numbers(apps, schema_editor):
    Order = apps.get_model('orders', 'Order')
    CompanySettings = apps.get_model('company', 'CompanySettings')
    BranchOrderCounter = apps.get_model('orders', 'BranchOrderCounter')

    plain = [int(n) for n in Order.objects.filter(number__regex=r'^[0-9]+$').values_list('number', flat=True)]
    if not plain:
        return
    last = max(plain + list(BranchOrderCounter.objects.values_list('last_number', flat=True)))
    settings = CompanySettings.objects.order_by('id').first() or CompanySettings.objects.create()
    settings.invoice_numbering = 'company'
    settings.last_invoice_number = last
    settings.save(update_fields=['invoice_numbering', 'last_invoice_number'])


class Migration(migrations.Migration):

    dependencies = [
        ('company', '0003_rename_menu_to_configuration'),
        ('orders', '0008_line_pieces_per_item'),
    ]

    operations = [
        migrations.AddField(
            model_name='companysettings',
            name='invoice_numbering',
            field=models.CharField(choices=[('branch', 'Per branch (KC33-00001)'),
                                            ('company', 'One sequence for all branches (3001)')],
                                   default='branch', max_length=10),
        ),
        migrations.AddField(
            model_name='companysettings',
            name='last_invoice_number',
            field=models.PositiveIntegerField(
                default=0, help_text='The last company-wide invoice number used (one-sequence numbering).'),
        ),
        migrations.RunPython(keep_plain_numbers, migrations.RunPython.noop),
    ]
