from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.views import APIView

from accounts.access import menu_permission
from common.drf import ResultViewSetMixin
from common.results import BaseResult, ErrorCode
from .models import Item, Price, PriceList, Service, Upcharge
from .serializers import (
    ItemSerializer,
    PriceGridSaveSerializer,
    PriceListSerializer,
    ServiceSerializer,
    UpchargeSerializer,
)

# The Prices page lists services, items and price lists to build its grid.
GRID_READERS = ['prices.view']


class ServiceViewSet(ResultViewSetMixin, viewsets.ModelViewSet):
    queryset = Service.objects.all()
    serializer_class = ServiceSerializer
    permission_classes = [menu_permission('services', view_also=GRID_READERS)]
    search_fields = ['name']


class ItemViewSet(ResultViewSetMixin, viewsets.ModelViewSet):
    queryset = Item.objects.select_related('category', 'pricing_type')
    serializer_class = ItemSerializer
    permission_classes = [menu_permission('items', view_also=GRID_READERS)]
    search_fields = ['name', 'category__name']


class PriceListViewSet(ResultViewSetMixin, viewsets.ModelViewSet):
    queryset = PriceList.objects.all()
    serializer_class = PriceListSerializer
    permission_classes = [menu_permission('price_lists', view_also=GRID_READERS)]
    search_fields = ['name']

    def destroy(self, request, *args, **kwargs):
        if self.get_object().is_default:
            return BaseResult.failure(
                ErrorCode.OPERATION_NOT_ALLOWED,
                "The default price list can't be deleted. Make another list the default first.",
            ).to_response()
        return super().destroy(request, *args, **kwargs)


class UpchargeViewSet(ResultViewSetMixin, viewsets.ModelViewSet):
    queryset = Upcharge.objects.select_related('charge_type')
    serializer_class = UpchargeSerializer
    permission_classes = [menu_permission('upcharges')]
    search_fields = ['name']


class PriceGridView(APIView):
    """
    Prices menu: one price list as an items × services grid.
    GET (prices.view): the active services and items, and the prices set.
    PUT (prices.edit): {"prices": [{item, service, price, express_price, min_price, extra_days}]}
        for the cells that changed; price null clears a cell.
    """

    permission_classes = [menu_permission('prices')]

    def get(self, request, price_list_id):
        price_list = get_object_or_404(PriceList, pk=price_list_id)
        return BaseResult.ok(self._grid(price_list), 'Prices retrieved successfully.').to_response()

    def put(self, request, price_list_id):
        price_list = get_object_or_404(PriceList, pk=price_list_id)
        serializer = PriceGridSaveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(price_list)
        return BaseResult.ok(self._grid(price_list), 'Prices saved successfully.').to_response()

    @staticmethod
    def _grid(price_list):
        def money(value):
            return None if value is None else str(value)

        return {
            'price_list': {'id': str(price_list.id), 'name': price_list.name, 'is_default': price_list.is_default},
            'services': [{'id': str(s.id), 'name': s.name} for s in Service.objects.filter(is_active=True)],
            'items': [
                {'id': str(i.id), 'name': i.name, 'category': i.category.code, 'category_name': i.category.name,
                 'pricing_type': i.pricing_type.code, 'pricing_type_name': i.pricing_type.name}
                for i in Item.objects.filter(is_active=True).select_related('category', 'pricing_type')
            ],
            'prices': [
                {
                    'item': str(p.item_id), 'service': str(p.service_id), 'price': money(p.price),
                    'express_price': money(p.express_price), 'min_price': money(p.min_price),
                    'extra_days': p.extra_days,
                }
                for p in Price.objects.filter(price_list=price_list)
            ],
        }
