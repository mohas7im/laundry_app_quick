from django.db.models import Prefetch
from rest_framework import mixins, status, viewsets
from rest_framework.views import APIView

from accounts.access import branch_menu_permission, branch_permission, get_active_branch, get_active_branch_id
from catalogue.models import Item, Price, Service, Upcharge
from common.drf import ResultViewSetMixin
from common.results import BaseResult, ErrorCode
from .models import Order, OrderLine
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
        return (Order.objects.filter(branch_id=get_active_branch_id(self.request))
                .select_related('customer', 'branch', 'price_list', 'created_by').prefetch_related(lines))

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

        conf = order_settings()
        data = {
            'price_list': {'id': str(price_list.id), 'name': price_list.name},
            'services': [{'id': str(s.id), 'name': s.name} for s in Service.objects.filter(is_active=True)],
            'items': [
                {'id': str(i.id), 'name': i.name, 'category': i.category, 'pricing_type': i.pricing_type}
                for i in Item.objects.filter(is_active=True)
            ],
            'prices': [
                {'item': str(p.item_id), 'service': str(p.service_id), 'price': money(p.price),
                 'express_price': money(p.express_price), 'min_price': money(p.min_price),
                 'extra_days': p.extra_days}
                for p in Price.objects.filter(price_list=price_list, item__is_active=True, service__is_active=True)
            ],
            'upcharges': [
                {'id': str(u.id), 'name': u.name, 'charge_type': u.charge_type, 'amount': str(u.amount)}
                for u in Upcharge.objects.filter(is_active=True)
            ],
            'settings': {
                'vat_rate': str(conf['vat_rate']),
                'ready_days': conf['ready_days'],
                'express_ready_days': conf['express_ready_days'],
                'ready_time': conf['ready_time'].strftime('%H:%M'),
            },
        }
        return BaseResult.ok(data, 'Catalogue retrieved successfully.').to_response()
