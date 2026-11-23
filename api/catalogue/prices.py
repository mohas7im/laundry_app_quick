"""
Setting a price, in one place, so every change lands in the price history
(price_history): the Prices page grid and the CSV import both call set_price().
"""
from .models import Price, PriceChange

NEW, CHANGED, SAME, REMOVED = 'new', 'changed', 'same', 'removed'


def set_price(price_list, item, service, *, price, express_price=None, min_price=None, extra_days=0,
              user=None, source=PriceChange.Source.GRID):
    """
    Create, change or (price None) remove one price. A new, removed, or changed price or
    express price is written to the history. Returns NEW, CHANGED, SAME or REMOVED (None
    when there was nothing to remove).
    """
    current = Price.objects.filter(price_list=price_list, item=item, service=service).first()

    def log(old_price, new_price, old_express, new_express):
        PriceChange.objects.create(price_list=price_list, item=item, service=service, old_price=old_price,
                                   new_price=new_price, old_express_price=old_express,
                                   new_express_price=new_express, source=source, changed_by=user)

    if price is None:
        if current is None:
            return None
        log(current.price, None, current.express_price, None)
        current.delete()
        return REMOVED

    if current is None:
        Price.objects.create(price_list=price_list, item=item, service=service, price=price,
                             express_price=express_price, min_price=min_price, extra_days=extra_days)
        log(None, price, None, express_price)
        return NEW

    money_changed = current.price != price or current.express_price != express_price
    other_changed = current.min_price != min_price or current.extra_days != extra_days
    if not (money_changed or other_changed):
        return SAME
    if money_changed:
        log(current.price, price, current.express_price, express_price)
    current.price, current.express_price = price, express_price
    current.min_price, current.extra_days = min_price, extra_days
    current.save()
    return CHANGED
