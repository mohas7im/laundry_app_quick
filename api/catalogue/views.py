from django.shortcuts import get_object_or_404
from rest_framework import serializers, viewsets
from rest_framework.views import APIView

from accounts.access import menu_permission, org_permission
from common.drf import ResultViewSetMixin
from common.results import BaseResult, ErrorCode
from .importer import ImportError_, preview_or_import
from .models import Item, Price, PriceChange, PriceList, Service, Upcharge
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
        serializer.save(price_list, user=request.user)
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
                 'pricing_type': i.pricing_type.code, 'pricing_type_name': i.pricing_type.name, 'pieces': i.pieces}
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


class PriceHistoryView(APIView):
    """
    GET /api/prices/<price_list_id>/history/?item=&service= (prices.view) — the latest
    200 price changes of a price list, newest first; item / service narrow it to one cell.
    """

    permission_classes = [menu_permission('prices')]

    def get(self, request, price_list_id):
        price_list = get_object_or_404(PriceList, pk=price_list_id)
        changes = price_list.changes.select_related('item', 'service', 'changed_by')
        for key in ('item', 'service'):
            value = request.query_params.get(key)
            if value:
                changes = changes.filter(**{f'{key}_id': value})

        def money(value):
            return None if value is None else str(value)

        data = [
            {'id': str(c.id), 'item': str(c.item_id), 'item_name': c.item.name, 'service': str(c.service_id),
             'service_name': c.service.name, 'old_price': money(c.old_price), 'new_price': money(c.new_price),
             'old_express_price': money(c.old_express_price), 'new_express_price': money(c.new_express_price),
             'source': c.source, 'source_name': c.get_source_display(),
             'changed_by_name': c.changed_by.full_name if c.changed_by else '', 'changed_at': c.changed_at}
            for c in changes[:200]
        ]
        return BaseResult.ok(data, 'Price history retrieved successfully.').to_response()


class SectionChoiceSerializer(serializers.Serializer):
    section = serializers.CharField(max_length=120)
    service = serializers.CharField(max_length=80, allow_blank=True)
    price_list = serializers.ChoiceField(choices=['main', 'online'])


class CatalogueImportSerializer(serializers.Serializer):
    csv = serializers.CharField(max_length=2_000_000, trim_whitespace=False)
    sections = SectionChoiceSerializer(many=True, required=False, default=list)
    main_price_list = serializers.PrimaryKeyRelatedField(queryset=PriceList.objects.all(), required=False,
                                                         allow_null=True, default=None)
    online_price_list = serializers.CharField(max_length=80, required=False, default='Online')
    commit = serializers.BooleanField(default=False)


class CatalogueImportView(APIView):
    """
    POST /api/catalogue/import/ (prices.edit) — the price list from a CSV file.
    commit=false: a preview (sections with their suggested service and price list, what
    would be created and changed, errors, warnings). commit=true: the import, with the
    sections as confirmed; nothing is written while there are errors.
    """

    permission_classes = [org_permission('prices.edit')]

    def post(self, request):
        serializer = CatalogueImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            result = preview_or_import(data['csv'], sections=data['sections'], main_list=data['main_price_list'],
                                       online_list_name=data['online_price_list'], user=request.user,
                                       commit=data['commit'])
        except ImportError_ as e:
            raise serializers.ValidationError({'csv': str(e)})
        if result['imported']:
            message = 'Price list imported.'
        elif data['commit']:
            message = 'Nothing was imported: fix the errors in the file first.'
        else:
            message = 'Preview ready.'
        return BaseResult.ok(result, message).to_response()
