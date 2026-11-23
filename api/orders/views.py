from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, F, Prefetch, Q
from django.conf import settings
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.views import APIView

from accounts.access import branch_menu_permission, branch_permission, get_active_branch, get_active_branch_id
from catalogue.models import Item, Price, PriceList, Service, Upcharge
from common.drf import ResultViewSetMixin
from common.results import BaseResult, ErrorCode
from masters.models import CommonMaster
from customers.preferences import preference_lists
from masters.registry import DISCOUNT_TYPE, ITEM_COLOUR, ITEM_DAMAGE, ITEM_STAIN, ORDER_NOTE, PAYMENT_METHOD
from .approval import discount_limit
from .models import Order, OrderLine, OrderStatusHistory, Payment
from .payments import PaySerializer, RefundSerializer, SettleSerializer, outstanding_orders
from .workflow import OPEN, CollectSerializer, MoveSerializer, active_stages
from .serializers import (
    OrderCancelSerializer,
    OrderCreateSerializer,
    OrderSearchSerializer,
    branch_calendar,
    deadstock_cutoff,
    OrderUpdateSerializer,
    OrderListSerializer,
    OrderSerializer,
    default_price_list,
    order_settings,
)


class OrderViewSet(ResultViewSetMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                   mixins.CreateModelMixin, viewsets.GenericViewSet):
    """
    /api/orders/ — orders of the ACTIVE branch (counter work, permissions from the access token):
    GET orders.view, POST orders.create, PUT (edit, with a reason) orders.edit.
    Cancelling: POST /api/orders/<id>/cancel/ (orders.delete).
    """

    permission_classes = [branch_menu_permission('orders')]
    search_fields = ['number', 'customer__name', 'customer__phone']

    def get_queryset(self):
        lines = Prefetch('lines', queryset=OrderLine.objects.prefetch_related('upcharges'))
        history = Prefetch('history', queryset=OrderStatusHistory.objects.select_related('changed_by'))  # staff
        payments = Prefetch('payments', queryset=Payment.objects.select_related('received_by'))
        qs = (Order.objects.filter(branch_id=get_active_branch_id(self.request))
              .select_related('customer', 'branch', 'price_list', 'created_by', 'stage', 'discount_approved_by')
              .prefetch_related(lines, history, payments))
        if getattr(self, 'action', None) == 'list':  # also built by hand for one order (_order_detail)
            qs = search_orders(qs, self.request.query_params)
        return qs

    def get_serializer_class(self):
        return OrderSearchSerializer if self.action == 'list' else OrderSerializer

    def create(self, request, *args, **kwargs):
        serializer = OrderCreateSerializer(data=request.data, context=self._input_context())
        serializer.is_valid(raise_exception=True)
        order = serializer.save(branch=get_active_branch(request), user=request.user)
        order = self.get_queryset().get(pk=order.pk)
        return BaseResult.ok(OrderSerializer(order).data, f'Order {order.number} created.') \
            .to_response(status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        order = self.get_object()
        serializer = OrderUpdateSerializer(data=request.data, context={**self._input_context(), 'order': order})
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        order = self.get_queryset().get(pk=order.pk)
        return BaseResult.ok(OrderSerializer(order).data, f'Order {order.number} updated.').to_response()

    def _input_context(self):
        return {'user': self.request.user, 'branch_id': get_active_branch_id(self.request)}


def _date(params, name):
    from datetime import date

    raw = params.get(name, '').strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise serializers.ValidationError({name: 'Use a date like 2026-11-22.'})


def search_orders(qs, params):
    """
    The order search (GET /api/orders/?…). Dates are shop days, from/to included:
      status=ready,collected   express=true|false   payment=paid|unpaid   deadstock=true
      placed_from / placed_to (taken)   ready_from / ready_to (cleaned)
      collected_from / collected_to     paid_from / paid_to (a payment on those days)
      payment_method=cash (paid with it, or set to it, e.g. on_account)
    """
    status_filter = params.get('status')  # ?status=ready or ?status=received,ready
    if status_filter:
        qs = qs.filter(status__in=status_filter.split(','))
    express = params.get('express')
    if express in ('true', 'false'):
        qs = qs.filter(is_express=express == 'true')
    payment = params.get('payment')
    if payment == 'paid':
        qs = qs.filter(paid_amount__gte=F('total'))
    elif payment == 'unpaid':
        qs = qs.filter(paid_amount__lt=F('total'))
    if params.get('deadstock') == 'true':
        qs = qs.filter(status=Order.Status.READY, ready_at__lte=deadstock_cutoff())
    for field, name in (('created_at', 'placed'), ('ready_at', 'ready'), ('collected_at', 'collected')):
        start, end = _date(params, f'{name}_from'), _date(params, f'{name}_to')
        if start:
            qs = qs.filter(**{f'{field}__date__gte': start})
        if end:
            qs = qs.filter(**{f'{field}__date__lte': end})
    paid_from, paid_to = _date(params, 'paid_from'), _date(params, 'paid_to')
    if paid_from or paid_to:
        payments = Payment.objects.filter(kind=Payment.Kind.PAYMENT)
        if paid_from:
            payments = payments.filter(created_at__date__gte=paid_from)
        if paid_to:
            payments = payments.filter(created_at__date__lte=paid_to)
        qs = qs.filter(pk__in=payments.values('order_id'))
    method = params.get('payment_method', '').strip()
    if method:
        paid_with = Payment.objects.filter(kind=Payment.Kind.PAYMENT, method=method).values('order_id')
        qs = qs.filter(Q(pk__in=paid_with) | Q(payment_method=method))
    return qs


class PosCatalogueView(APIView):
    """
    GET /api/pos/catalogue/ — what the New Order screen needs, for staff who can take
    orders (orders.create in the active branch), without catalogue admin permissions:
    active services and items, the default price list's prices, upcharges and the
    ready-by / VAT settings.
    """

    permission_classes = [branch_permission('orders.create')]

    def get(self, request):
        price_list = default_price_list()
        if price_list is None:
            return BaseResult.failure(
                ErrorCode.OPERATION_NOT_ALLOWED,
                'There is no default price list. Set one up under Catalogue → Price Lists.',
            ).to_response()

        def money(value):
            return None if value is None else str(value)

        def masters(type_code):
            return [{'code': m.code, 'name': m.name} for m in CommonMaster.of(type_code).filter(is_active=True)]

        conf = order_settings()
        branch_id = get_active_branch_id(request)
        # most used first: lines per item and service at this branch over the last 90 days
        since = timezone.now() - timedelta(days=90)
        usage = (OrderLine.objects.filter(order__branch_id=branch_id, order__created_at__gte=since)
                 .exclude(order__status=Order.Status.CANCELLED)
                 .values('item', 'service').annotate(count=Count('id')))
        limit = discount_limit(request.user, branch_id)
        calendar = branch_calendar(branch_id)
        data = {
            'price_list': {'id': str(price_list.id), 'name': price_list.name},
            'price_lists': [{'id': str(p.id), 'name': p.name} for p in PriceList.objects.filter(is_active=True)],
            'services': [{'id': str(s.id), 'name': s.name, 'ready_days': s.ready_days}
                         for s in Service.objects.filter(is_active=True)],
            'items': [
                {'id': str(i.id), 'name': i.name, 'category': i.category.code, 'category_name': i.category.name,
                 'pricing_type': i.pricing_type.code, 'pricing_type_name': i.pricing_type.name, 'pieces': i.pieces}
                for i in Item.objects.filter(is_active=True).select_related('category', 'pricing_type')
            ],
            # every active price list: a customer with their own list uses it, the default for the rest
            'prices': [
                {'price_list': str(p.price_list_id), 'item': str(p.item_id), 'service': str(p.service_id),
                 'price': money(p.price), 'express_price': money(p.express_price), 'min_price': money(p.min_price),
                 'extra_days': p.extra_days}
                for p in Price.objects.filter(price_list__is_active=True, item__is_active=True,
                                              service__is_active=True)
            ],
            'usage': [{'item': str(u['item']), 'service': str(u['service']), 'count': u['count']} for u in usage],
            'upcharges': [
                {'id': str(u.id), 'name': u.name, 'charge_type': u.charge_type.code, 'amount': str(u.amount)}
                for u in Upcharge.objects.filter(is_active=True).select_related('charge_type')
            ],
            # lists from common masters (active values, in order)
            'payment_methods': masters(PAYMENT_METHOD),
            'discount_types': masters(DISCOUNT_TYPE),
            'order_notes': masters(ORDER_NOTE),
            'piece_tags': {'colours': masters(ITEM_COLOUR), 'damage': masters(ITEM_DAMAGE),
                           'stains': masters(ITEM_STAIN)},
            'preferences': preference_lists(),
            # the biggest discount this user may give without a manager (null = no limit)
            'discount_limit': None if limit is None else str(limit),
            'settings': {
                'vat_rate': str(conf['vat_rate']),
                'ready_days': conf['ready_days'],
                'express_ready_days': conf['express_ready_days'],
                'ready_time': conf['ready_time'].strftime('%H:%M'),
                # the branch's calendar for the ready-by suggestion (same rules as the server)
                'cutoff_time': calendar['cutoff'].strftime('%H:%M') if calendar.get('cutoff') else None,
                'closes_at': calendar['closes_at'].strftime('%H:%M') if calendar.get('closes_at') else None,
                'closed_weekdays': calendar.get('closed_weekdays', []),
                'holidays': [d.isoformat() for d in calendar.get('holidays', [])],
            },
        }
        return BaseResult.ok(data, 'Catalogue retrieved successfully.').to_response()


# ── M5: production board and collection ───────────────────────────────────

def _open_orders(request, *statuses):
    lines = Prefetch('lines', queryset=OrderLine.objects.only(
        'id', 'order_id', 'quantity', 'pieces_per_item', 'pricing_type', 'item_name', 'service_id', 'service_name',
        'position'))
    return (Order.objects.filter(branch_id=get_active_branch_id(request), status__in=statuses)
            .select_related('customer', 'stage', 'created_by').prefetch_related(lines))


class ProductionBoardView(APIView):
    """
    GET /api/production/ — the board of the active branch: the stage columns (active
    PRODUCTION_STAGE values in order) and every open order (received or ready),
    late ones first.
    """

    permission_classes = [branch_permission('production.view')]

    def get(self, request):
        orders = _open_orders(request, *OPEN).order_by('ready_by')
        data = {
            'stages': [{'code': s.code, 'name': s.name} for s in active_stages()],
            # the board's Section filter
            'services': [{'id': str(s.id), 'name': s.name} for s in Service.objects.filter(is_active=True)],
            'deadstock_days': settings.ORDERS['DEADSTOCK_DAYS'],
            'orders': OrderListSerializer(orders, many=True).data,
        }
        return BaseResult.ok(data, 'Production board retrieved successfully.').to_response()


class ProductionMoveView(APIView):
    """POST /api/production/move/ {orders: [ids], to: "received" | <stage> | "ready" | "next", rack?}"""

    permission_classes = [branch_permission('production.edit')]

    def post(self, request):
        serializer = MoveSerializer(data=request.data, context={'branch_id': get_active_branch_id(request)})
        serializer.is_valid(raise_exception=True)
        moved = serializer.save(request.user)
        word = 'order' if len(moved) == 1 else 'orders'
        return BaseResult.ok(OrderListSerializer(moved, many=True).data, f'{len(moved)} {word} moved.').to_response()


class CollectionListView(APIView):
    """GET /api/collection/?search_term= — ready orders of the active branch (order no., name or phone)."""

    permission_classes = [branch_permission('collection.view')]

    def get(self, request):
        orders = _open_orders(request, Order.Status.READY).order_by('customer__name', 'ready_by')
        term = request.query_params.get('search_term', '').strip()
        if term:
            orders = orders.filter(Q(number__icontains=term) | Q(customer__name__icontains=term)
                                   | Q(customer__phone__icontains=term))
        return BaseResult.ok(OrderListSerializer(orders[:200], many=True).data,
                             'Ready orders retrieved successfully.').to_response()


class CollectionCollectView(APIView):
    """POST /api/collection/collect/ {orders: [ids], payment_method, amount}"""

    permission_classes = [branch_permission('collection.create')]

    def post(self, request):
        serializer = CollectSerializer(data=request.data, context={'branch_id': get_active_branch_id(request)})
        serializer.is_valid(raise_exception=True)
        collected = serializer.save(request.user)
        numbers = ', '.join(o.number for o in collected)
        return BaseResult.ok(OrderListSerializer(collected, many=True).data, f'Collected {numbers}.').to_response()


# ── M6: payments, refunds, customer balances ──────────────────────────────

def _branch_order(request, order_id):
    return get_object_or_404(Order, pk=order_id, branch_id=get_active_branch_id(request))


def _order_detail(request, order_id):
    view = OrderViewSet(request=request, format_kwarg=None)
    return OrderSerializer(view.get_queryset().get(pk=order_id)).data


class OrderCancelView(APIView):
    """POST /api/orders/<id>/cancel/ {reason} — cancel an order that hasn't been collected (orders.delete)."""

    permission_classes = [branch_permission('orders.delete')]

    def post(self, request, order_id):
        order = _branch_order(request, order_id)
        serializer = OrderCancelSerializer(data=request.data, context={'order': order})
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return BaseResult.ok(_order_detail(request, order.pk), f'Order {order.number} cancelled.').to_response()


class OrderPayView(APIView):
    """POST /api/orders/<id>/pay/ {amount, payment_method} — take money for an order (payments.create)."""

    permission_classes = [branch_permission('payments.create')]

    def post(self, request, order_id):
        order = _branch_order(request, order_id)
        serializer = PaySerializer(data=request.data, context={'order': order})
        serializer.is_valid(raise_exception=True)
        payment = serializer.save(request.user)
        return BaseResult.ok(_order_detail(request, order.pk),
                             f'AED {payment.amount} received for {order.number}.').to_response()


class OrderRefundView(APIView):
    """POST /api/orders/<id>/refund/ {amount, payment_method, reason} — give money back (payments.edit)."""

    permission_classes = [branch_permission('payments.edit')]

    def post(self, request, order_id):
        order = _branch_order(request, order_id)
        serializer = RefundSerializer(data=request.data, context={'order': order})
        serializer.is_valid(raise_exception=True)
        payment = serializer.save(request.user)
        return BaseResult.ok(_order_detail(request, order.pk),
                             f'AED {payment.amount} refunded on {order.number}.').to_response()


class PaymentListView(APIView):
    """
    GET /api/payments/?date=YYYY-MM-DD — payments and refunds at the active branch on one
    day (shop time; default today), with totals per method (payments.view).
    """

    permission_classes = [branch_permission('payments.view')]

    def get(self, request):
        from datetime import date as date_type

        from django.utils import timezone

        raw = request.query_params.get('date')
        try:
            day = date_type.fromisoformat(raw) if raw else timezone.localdate()
        except ValueError:
            raise serializers.ValidationError({'date': 'Use a date like 2026-11-22.'})
        payments = (Payment.objects.filter(order__branch_id=get_active_branch_id(request), created_at__date=day)
                    .select_related('order__customer', 'received_by').order_by('-created_at'))
        names = dict(CommonMaster.of(PAYMENT_METHOD).values_list('code', 'name'))
        rows, totals = [], {}
        for p in payments:
            rows.append({
                'id': str(p.id), 'kind': p.kind, 'amount': str(p.amount), 'method': p.method,
                'method_name': names.get(p.method, p.method), 'reason': p.reason,
                'order': str(p.order_id), 'order_number': p.order.number, 'customer_name': p.order.customer.name,
                'received_by_name': p.received_by.full_name, 'created_at': p.created_at,
            })
            t = totals.setdefault(p.method, {'method': p.method, 'method_name': names.get(p.method, p.method),
                                             'taken': Decimal('0'), 'refunded': Decimal('0')})
            t['taken' if p.kind == Payment.Kind.PAYMENT else 'refunded'] += p.amount
        for t in totals.values():
            t['net'] = t['taken'] - t['refunded']
            for key in ('taken', 'refunded', 'net'):
                t[key] = str(t[key])
        data = {'date': day.isoformat(), 'payments': rows, 'totals': sorted(totals.values(), key=lambda t: t['method'])}
        return BaseResult.ok(data, 'Payments retrieved successfully.').to_response()


class CustomerBalanceView(APIView):
    """
    GET  /api/customers/<id>/balance/ — what the customer owes: unpaid orders, oldest first (payments.view).
    POST /api/customers/<id>/settle/  {amount, payment_method} — pay them off, oldest first (payments.create).
    """

    def get_permissions(self):
        code = 'payments.create' if self.request.method == 'POST' else 'payments.view'
        return [branch_permission(code)()]

    def _customer(self, customer_id):
        from customers.models import Customer
        return get_object_or_404(Customer, pk=customer_id)

    def get(self, request, customer_id):
        customer = self._customer(customer_id)
        orders = outstanding_orders(customer).select_related('customer', 'stage', 'branch', 'created_by')
        due = sum((o.balance for o in orders), Decimal('0'))
        data = {'customer': str(customer.id), 'customer_name': customer.name, 'balance': str(due),
                'orders': [{**OrderListSerializer(o).data, 'branch_code': o.branch.code} for o in orders]}
        return BaseResult.ok(data, 'Balance retrieved successfully.').to_response()

    def post(self, request, customer_id):
        customer = self._customer(customer_id)
        serializer = SettleSerializer(data=request.data, context={'customer': customer})
        serializer.is_valid(raise_exception=True)
        payments = serializer.save(request.user)
        numbers = ', '.join(p.order.number for p in payments)
        return BaseResult.ok({'paid_orders': [str(p.order_id) for p in payments]},
                             f'AED {serializer.validated_data["amount"]} received ({numbers}).').to_response()
