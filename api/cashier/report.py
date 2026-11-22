"""
The cash-up numbers of a shift: money by method, and the cash that should be in the drawer.

    expected cash = float + cash taken − cash given back
"""
from decimal import Decimal

from django.db.models import Count, Sum

ZERO = Decimal('0.00')


def shift_report(shift):
    from orders.models import Payment  # orders imports cashier; avoid a cycle at load time

    rows = (Payment.objects.filter(shift=shift).values('method', 'kind')
            .annotate(total=Sum('amount'), count=Count('id')))
    methods = {}
    for row in rows:
        m = methods.setdefault(row['method'], {'method': row['method'], 'taken': ZERO, 'refunded': ZERO, 'count': 0})
        m['taken' if row['kind'] == 'payment' else 'refunded'] += row['total']
        m['count'] += row['count']
    for m in methods.values():
        m['net'] = m['taken'] - m['refunded']

    cash = methods.get('cash', {'taken': ZERO, 'refunded': ZERO})
    expected = shift.opening_float + cash['taken'] - cash['refunded']
    expected = shift.expected_cash if shift.expected_cash is not None else expected

    def money(value):  # like every other amount in the API: "115.00"
        return None if value is None else str(Decimal(value).quantize(Decimal('0.01')))

    return {
        'id': str(shift.id),
        'branch': str(shift.branch_id),
        'branch_name': shift.branch.name,
        'opened_by_name': shift.opened_by.full_name,
        'opened_at': shift.opened_at,
        'closed_at': shift.closed_at,
        'is_open': shift.is_open,
        'opening_float': money(shift.opening_float),
        'cash_taken': money(cash['taken']),
        'cash_refunded': money(cash['refunded']),
        # while open: worked out now; once closed: the figure saved at closing
        'expected_cash': money(expected),
        'counted_cash': money(shift.counted_cash),
        'difference': money(shift.difference),
        'notes': shift.notes,
        'methods': [{**m, 'taken': money(m['taken']), 'refunded': money(m['refunded']), 'net': money(m['net'])}
                    for m in sorted(methods.values(), key=lambda m: m['method'])],
        'total_taken': money(sum((m['taken'] for m in methods.values()), ZERO)),
        'total_refunded': money(sum((m['refunded'] for m in methods.values()), ZERO)),
    }
