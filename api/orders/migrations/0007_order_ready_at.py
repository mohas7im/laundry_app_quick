"""
orders.ready_at: when an order was cleaned (moved to Ready). Deadstock counts from it,
and the order search filters on it. Existing ready / collected orders get the time of
their last move to Ready from the timeline.
"""
from django.db import migrations, models


def fill_ready_at(apps, schema_editor):
    Order = apps.get_model('orders', 'Order')
    History = apps.get_model('orders', 'OrderStatusHistory')
    for order in Order.objects.filter(status__in=['ready', 'collected']):
        last = (History.objects.filter(order=order, status='ready').order_by('-changed_at')
                .values_list('changed_at', flat=True).first())
        order.ready_at = last or order.collected_at or order.updated_at
        order.save(update_fields=['ready_at'])


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0006_pieces_preferences_discount_approval'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='ready_at',
            field=models.DateTimeField(blank=True, null=True,
                                       help_text='When it was cleaned (moved to Ready); deadstock counts from here.'),
        ),
        migrations.RunPython(fill_ready_at, migrations.RunPython.noop),
    ]
