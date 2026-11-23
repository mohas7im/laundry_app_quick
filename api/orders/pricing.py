"""
Order pricing and ready-by rules: plain functions, no database, unit-tested.

Prices are VAT-inclusive. For each line:

    unit price  = the price list's express price if the order is express, else its price
    base        = unit price × quantity, but at least the minimum price (if set)
    upcharges   = fixed: the amount once per line;  percent: that % of the base
    line total  = base + upcharges

    subtotal    = sum of line totals
    discount    = an amount, or a percent of the subtotal (never more than the subtotal)
    total       = subtotal − discount
    VAT         = the part of the total that is VAT:  total − total / (1 + rate)
"""
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal('0.01')


def money(value) -> Decimal:
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass
class UpchargeRate:
    name: str
    charge_type: str  # 'fixed' | 'percent'
    rate: Decimal


@dataclass
class LineInput:
    unit_price: Decimal
    quantity: Decimal
    min_price: Decimal | None = None
    upcharges: list[UpchargeRate] = field(default_factory=list)


@dataclass
class LinePrice:
    base: Decimal
    upcharge_amounts: list[Decimal]
    upcharge_total: Decimal
    total: Decimal


def price_line(line: LineInput) -> LinePrice:
    base = money(line.unit_price * line.quantity)
    if line.min_price is not None and base < line.min_price:
        base = money(line.min_price)
    amounts = [
        money(u.rate) if u.charge_type == 'fixed' else money(base * u.rate / 100)
        for u in line.upcharges
    ]
    upcharge_total = money(sum(amounts, Decimal('0')))
    return LinePrice(base=base, upcharge_amounts=amounts, upcharge_total=upcharge_total, total=base + upcharge_total)


@dataclass
class OrderTotals:
    subtotal: Decimal
    discount_amount: Decimal
    total: Decimal
    vat_amount: Decimal


def order_totals(line_totals, discount_type: str = '', discount_value: Decimal = Decimal('0'),
                 vat_rate: Decimal = Decimal('5')) -> OrderTotals:
    subtotal = money(sum(line_totals, Decimal('0')))
    if discount_type == 'percent':
        discount = money(subtotal * discount_value / 100)
    elif discount_type == 'amount':
        discount = money(discount_value)
    else:
        discount = Decimal('0.00')
    discount = min(discount, subtotal)
    total = subtotal - discount
    vat = money(total - total / (1 + vat_rate / 100))
    return OrderTotals(subtotal=subtotal, discount_amount=discount, total=total, vat_amount=vat)


def suggested_ready_by(now: datetime, *, express: bool, extra_days: int, ready_days: int,
                       express_ready_days: int, ready_time: time, cutoff: time | None = None,
                       closes_at: time | None = None, closed_weekdays=(), holidays=()) -> datetime:
    """
    The ready-by date the counter starts with (staff may change it):

    - counting starts today, or tomorrow when the order comes in after the branch's cut-off;
    - + the days (express, or the slowest service of the order) + the largest extra days of its items;
    - at the ready time, but never after the branch closes;
    - if that is already past (express late in the day), the next day;
    - never on a closed weekday (0 = Monday) or a holiday: the next open day instead.
    """
    start = now.date()
    if cutoff is not None and now.time() >= cutoff:
        start += timedelta(days=1)
    days = (express_ready_days if express else ready_days) + extra_days
    at = min(ready_time, closes_at) if closes_at else ready_time
    ready = datetime.combine(start + timedelta(days=days), at, tzinfo=now.tzinfo)
    if ready <= now:
        ready += timedelta(days=1)
    closed, off = set(closed_weekdays), set(holidays)
    for _ in range(60):  # a shop is never closed for two months in a row
        if ready.weekday() not in closed and ready.date() not in off:
            break
        ready += timedelta(days=1)
    return ready
