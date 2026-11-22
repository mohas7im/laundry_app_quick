from django.db.models import Prefetch, Q
from rest_framework import mixins, status, viewsets
from rest_framework.views import APIView

from accounts.access import branch_menu_permission, branch_permission, get_active_branch, get_active_branch_id
from catalogue.models import Item, Price, Service, Upcharge
from common.drf import ResultViewSetMixin
from common.results import BaseResult, ErrorCode
from masters.models import CommonMaster
from masters.registry import DISCOUNT_TYPE, ORDER_NOTE, PAYMENT_METHOD
from .models import Order, OrderLine, OrderStatusHistory
from .workflow import OPEN, CollectSerializer, MoveSerializer, active_stages
from .serializers import (
    OrderCreateSerializer,
    OrderListSerializer,
    OrderSerializer,
    default_price_list,
    order_settings,
)


class OrderViewSet(ResultViewSetMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                   mixins.CreateModelMixin, viewsets.GenericViewSet):
    """
    /api/orders/ — orders of the ACTIVE branch (counter work: orders.view / orders.create
    from the access token). Editing and cancelling come with the production module.
    """

    permission_classes = [branch_menu_permission('orders')]
    search_fields = ['number', 'customer__name', 'customer__phone']

    def get_queryset(self):
        lines = Prefetch('lines', queryset=OrderLine.objects.prefetch_related('upcharges'))
        history = Prefetch('history', queryset=OrderStatusHistory.objects.select_related('changed_by'))
        qs = (Order.objects.filter(branch_id=get_active_branch_id(self.request))
              .select_related('customer', 'branch', 'price_list', 'created_by', 'stage')
              .prefetch_related(lines, history))
        status_filter = self.request.query_params.get('status')  # ?status=ready or ?status=received,ready
        if status_filter:
            qs = qs.filter(status__in=status_filter.split(','))
        return qs

    def get_serializer_class(self):
        return OrderListSerializer if self.action == 'list' else OrderSerializer

    def create(self, request, *args, **kwargs):
        serializer = OrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save(branch=get_active_branch(request), user=request.user)
        order = self.get_queryset().get(pk=order.pk)
        return BaseResult.ok(OrderSerializer(order).data, f'Order {order.number} created.') \
            .to_response(status.HTTP_201_CREATED)


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
        data = {
            'price_list': {'id': str(price_list.id), 'name': price_list.name},
            'services': [{'id': str(s.id), 'name': s.name} for s in Service.objects.filter(is_active=True)],
            'items': [
                {'id': str(i.id), 'name': i.name, 'category': i.category.code, 'category_name': i.category.name,
                 'pricing_type': i.pricing_type.code, 'pricing_type_name': i.pricing_type.name}
                for i in Item.objects.filter(is_active=True).select_related('category', 'pricing_type')
            ],
            'prices': [
                {'item': str(p.item_id), 'service': str(p.service_id), 'price': money(p.price),
                 'express_price': money(p.express_price), 'min_price': money(p.min_price),
                 'extra_days': p.extra_days}
                for p in Price.objects.filter(price_list=price_list, item__is_active=True, service__is_active=True)
            ],
            'upcharges': [
                {'id': str(u.id), 'name': u.name, 'charge_type': u.charge_type.code, 'amount': str(u.amount)}
                for u in Upcharge.objects.filter(is_active=True).select_related('charge_type')
            ],
            # lists from common masters (active values, in order)
            'payment_methods': masters(PAYMENT_METHOD),
            'discount_types': masters(DISCOUNT_TYPE),
            'order_notes': masters(ORDER_NOTE),
            'settings': {
                'vat_rate': str(conf['vat_rate']),
                'ready_days': conf['ready_days'],
                'express_ready_days': conf['express_ready_days'],
                'ready_time': conf['ready_time'].strftime('%H:%M'),
            },
        }
        return BaseResult.ok(data, 'Catalogue retrieved successfully.').to_response()


# ── M5: production board and collection ───────────────────────────────────

def _open_orders(request, *statuses):
    lines = Prefetch('lines', queryset=OrderLine.objects.only('id', 'order_id', 'quantity', 'pricing_type'))
    return (Order.objects.filter(branch_id=get_active_branch_id(request), status__in=statuses)
            .select_related('customer', 'stage').prefetch_related(lines))


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
