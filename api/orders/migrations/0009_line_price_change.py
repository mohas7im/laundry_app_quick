from django.db import migrations, models


class Migration(migrations.Migration):
    """Comfort: a price changed at the counter keeps the list price and the reason."""

    dependencies = [('orders', '0008_line_pieces_per_item')]

    operations = [
        migrations.AddField('orderline', 'list_price',
                            models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
        migrations.AddField('orderline', 'price_reason', models.CharField(blank=True, default='', max_length=200)),
    ]
