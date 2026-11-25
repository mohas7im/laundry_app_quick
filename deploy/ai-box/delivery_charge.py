# Comfort go-live, 24 Nov 2026: catalogue changes for the Delivery / Pickup switch on New Order.
# Run with: manage.py shell -c "exec(open('delivery_charge.py').read())"
from catalogue.models import Item

# The switch adds this item; it is a fee, not a garment: no tag, not in Total Pieces.
fee = Item.objects.get(name="Delivery charge")
fee.pieces = 0
fee.save(update_fields=["pieces"])

# A duplicate from CleanCloud nobody uses: hidden (not deleted), turn is_active back on to restore.
Item.objects.filter(name="Delivery charge 20").update(is_active=False)
print("done")
