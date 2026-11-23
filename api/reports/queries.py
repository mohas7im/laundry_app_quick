"""
The numbers behind the dashboard, the daily summary and the exports (M7). One place,
so every screen agrees. Everything is for one branch; days are shop days (Asia/Dubai).

    sales      = orders taken in the period (not cancelled): their totals, VAT included
    collected  = payments − refunds received in the period (any method)
    pieces     = items per piece counted, a kg/m² line counts as one bag, plus bag-drop pieces
"""
from collections import defaultdict
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db.models import Count, F, Max, Min, Q, Sum
from django.utils import timezone

from cashier.models import Shift
from cashier.report import shift_report
from masters.models import CommonMaster
from masters.registry import PAYMENT_METHOD, PRODUCTION_STAGE
from orders.models import Order, OrderLine, OrderStatusHistory, Payment

ZERO = Decimal('0.00')


def money(value):
    return str((value or ZERO).quantize(Decimal('0.01')))


def day_bounds(day):
    """A shop day as [start, end) aware datetimes."""
    tz = timezone.get_current_timezone()
    start = datetime.combine(day, time.min, tzinfo=tz)
    return start, start + timedelta(days=1)


def _orders(branch_id, start, end):
    return Order.objects.filter(branch_id=branch_id, created_at__gte=start, created_at__lt=end) \
        .exclude(status=Order.Status.CANCELLED)


def pieces_of(orders):
    lines = OrderLine.objects.filter(order__in=orders)
    unit = lines.filter(pricing_type='unit').aggregate(n=Sum(F('quantity') * F('pieces_per_item')))['n'] or 0
    weighed = lines.exclude(pricing_type='unit').count()
    bags = orders.aggregate(n=Sum('bag_drop_pieces'))['n'] or 0
    return int(unit) + weighed + bags


def sales(branch_id, start, end):
    orders = _orders(branch_id, start, end)
    agg = orders.aggregate(count=Count('id'), total=Sum('total'), vat=Sum('vat_amount'),
                           discount=Sum('discount_amount'), subtotal=Sum('subtotal'),
                           express=Count('id', filter=Q(is_express=True)))
    total, vat = agg['total'] or ZERO, agg['vat'] or ZERO
    return {
        'orders': agg['count'],
        'express_orders': agg['express'],
        'pieces': pieces_of(orders),
        'subtotal': money(agg['subtotal']),
        'discounts': money(agg['discount']),
        'sales': money(total),                 # VAT included
        'vat': money(vat),
        'sales_excl_vat': money(total - vat),
        'average_order': money(total / agg['count'] if agg['count'] else ZERO),
    }


def collected(branch_id, start, end):
    """Payments and refunds received in the period, per method."""
    names = dict(CommonMaster.of(PAYMENT_METHOD).values_list('code', 'name'))
    rows = (Payment.objects.filter(order__branch_id=branch_id, created_at__gte=start, created_at__lt=end)
            .values('method', 'kind').annotate(total=Sum('amount'), count=Count('id')))
    methods = {}
    for row in rows:
        m = methods.setdefault(row['method'], {'method': row['method'], 'method_name': names.get(row['method'], row['method']),
                                               'taken': ZERO, 'refunded': ZERO, 'count': 0})
        m['taken' if row['kind'] == Payment.Kind.PAYMENT else 'refunded'] += row['total']
        m['count'] += row['count']
    taken = sum((m['taken'] for m in methods.values()), ZERO)
    refunded = sum((m['refunded'] for m in methods.values()), ZERO)
    return {
        'taken': money(taken),
        'refunded': money(refunded),
        'net': money(taken - refunded),
        'methods': [{**m, 'taken': money(m['taken']), 'refunded': money(m['refunded']),
                     'net': money(m['taken'] - m['refunded'])}
                    for m in sorted(methods.values(), key=lambda m: m['method'])],
    }


def operations(branch_id, now):
    """The workshop right now: work by stage, overdue, ready to collect and how long it has waited."""
    open_orders = Order.objects.filter(branch_id=branch_id, status__in=[Order.Status.RECEIVED, Order.Status.READY])
    stages = list(CommonMaster.of(PRODUCTION_STAGE).filter(is_active=True))
    received = open_orders.filter(status=Order.Status.RECEIVED)
    by_stage = dict(received.values_list('stage__code').annotate(n=Count('id')))
    wip = [{'code': 'received', 'name': 'Received', 'orders': by_stage.get(None, 0)}]
    wip += [{'code': s.code, 'name': s.name, 'orders': by_stage.get(s.code, 0)} for s in stages]
    ready = open_orders.filter(status=Order.Status.READY)  # orders.ready_at: when it became ready
    wip.append({'code': 'ready', 'name': 'Ready', 'orders': ready.count()})

    overdue = received.filter(ready_by__lt=now)
    oldest = overdue.order_by('ready_by').values('number', 'ready_by').first()

    aging = {'0-2': 0, '3-7': 0, '8-14': 0, '15-45': 0, '45+': 0}  # days waiting since ready
    for ready_at in ready.values_list('ready_at', flat=True):
        days = (now - ready_at).days if ready_at else 0
        bucket = '0-2' if days <= 2 else '3-7' if days <= 7 else '8-14' if days <= 14 else '15-45' if days <= 45 else '45+'
        aging[bucket] += 1

    return {
        'wip': wip,
        'overdue': overdue.count(),
        'overdue_express': overdue.filter(is_express=True).count(),
        'oldest_overdue': oldest,
        'ready_to_collect': wip[-1]['orders'],
        'uncollected_aging': [{'days': k, 'orders': v} for k, v in aging.items()],
    }


def on_time(branch_id, start, end):
    """Of the orders that became ready in the period: how many were ready by their ready-by time."""
    became_ready = (OrderStatusHistory.objects.filter(order__branch_id=branch_id, status=Order.Status.READY,
                                                      changed_at__gte=start, changed_at__lt=end)
                    .values('order').annotate(first_ready=Min('changed_at'), ready_by=Max('order__ready_by')))
    total = len(became_ready)
    in_time = sum(1 for row in became_ready if row['first_ready'] <= row['ready_by'])
    return {'ready': total, 'on_time': in_time, 'percent': round(100 * in_time / total) if total else None}


def receivables(branch_id, now):
    """Money still owed on orders (not cancelled), by the order's age."""
    owed = (Order.objects.filter(branch_id=branch_id).exclude(status=Order.Status.CANCELLED)
            .filter(total__gt=F('paid_amount')).values('created_at', 'total', 'paid_amount', 'customer_id'))
    buckets = {'0-30': ZERO, '31-60': ZERO, '61-90': ZERO, '90+': ZERO}
    customers = set()
    for row in owed:
        days = (now - row['created_at']).days
        key = '0-30' if days <= 30 else '31-60' if days <= 60 else '61-90' if days <= 90 else '90+'
        buckets[key] += row['total'] - row['paid_amount']
        customers.add(row['customer_id'])
    return {
        'total': money(sum(buckets.values(), ZERO)),
        'customers': len(customers),
        'aging': [{'days': k, 'amount': money(v)} for k, v in buckets.items()],
    }


def shifts_closed(branch_id, start, end):
    shifts = (Shift.objects.filter(branch_id=branch_id, closed_at__gte=start, closed_at__lt=end)
              .select_related('branch', 'opened_by'))
    return [shift_report(s) for s in shifts]


def daily_series(branch_id, last_day, days=7):
    """Orders, sales and money collected for each of the last `days` shop days."""
    series = []
    for offset in range(days - 1, -1, -1):
        day = last_day - timedelta(days=offset)
        start, end = day_bounds(day)
        orders = _orders(branch_id, start, end).aggregate(n=Count('id'), total=Sum('total'))
        pay = collected(branch_id, start, end)
        series.append({'date': day.isoformat(), 'orders': orders['n'], 'sales': money(orders['total']),
                       'collected': pay['net']})
    return series


def top_items(branch_id, start, end, limit=5):
    rows = (OrderLine.objects.filter(order__branch_id=branch_id, order__created_at__gte=start, order__created_at__lt=end)
            .exclude(order__status=Order.Status.CANCELLED)
            .values('item_name').annotate(quantity=Sum('quantity'), sales=Sum('line_total'))
            .order_by('-sales')[:limit])
    return [{'item_name': r['item_name'], 'quantity': format(r['quantity'].normalize(), 'f'), 'sales': money(r['sales'])}
            for r in rows]


def order_rows(branch_id, start, end):
    """Every order taken in the period, for the CSV export."""
    names = dict(CommonMaster.of(PAYMENT_METHOD).values_list('code', 'name'))
    orders = (Order.objects.filter(branch_id=branch_id, created_at__gte=start, created_at__lt=end)
              .select_related('customer', 'created_by', 'stage').order_by('created_at'))
    pieces = defaultdict(int)
    for order_id, pricing_type, quantity, per_item in OrderLine.objects.filter(order__in=orders) \
            .values_list('order_id', 'pricing_type', 'quantity', 'pieces_per_item'):
        pieces[order_id] += int(quantity) * per_item if pricing_type == 'unit' else 1
    for o in orders:
        yield {
            'Order': o.number,
            'Taken': timezone.localtime(o.created_at).strftime('%Y-%m-%d %H:%M'),
            'Customer': o.customer.name,
            'Phone': o.customer.phone,
            'Status': o.get_status_display(),
            'Express': 'Yes' if o.is_express else 'No',
            'Pieces': pieces[o.id] + o.bag_drop_pieces,
            'Subtotal': money(o.subtotal),
            'Discount': money(o.discount_amount),
            'Total (VAT incl.)': money(o.total),
            'VAT': money(o.vat_amount),
            'Paid': money(o.paid_amount),
            'Balance': money(o.balance),
            'Payment method': names.get(o.payment_method, o.payment_method),
            'Ready by': timezone.localtime(o.ready_by).strftime('%Y-%m-%d %H:%M'),
            'Served by': o.created_by.full_name,
        }
