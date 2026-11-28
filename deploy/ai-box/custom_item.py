# Comfort, 28 Nov 2026: the catalogue item that "+ Custom item" on New Order uses.
# It has no prices on purpose (so it is never a tile). Do not rename or deactivate it.
# Run with: manage.py shell -c "exec(open('custom_item.py').read())"
from catalogue.models import Item
from masters.models import CommonMaster

ref = Item.objects.filter(is_active=True).exclude(name__iexact='custom item').first()
unit = CommonMaster.of('PRICING_TYPE').get(code='unit')
item, made = Item.objects.get_or_create(
    name='Custom item',
    defaults=dict(category=ref.category, pricing_type=unit, pieces=1, sort_order=9999),
)
print('Custom item', 'created' if made else 'exists')
