from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ItemViewSet, PriceGridView, PriceListViewSet, ServiceViewSet, UpchargeViewSet

router = DefaultRouter(trailing_slash=True)
router.register('services', ServiceViewSet, basename='service')
router.register('items', ItemViewSet, basename='item')
router.register('price-lists', PriceListViewSet, basename='price-list')
router.register('upcharges', UpchargeViewSet, basename='upcharge')

urlpatterns = router.urls + [
    path('prices/<uuid:price_list_id>/', PriceGridView.as_view(), name='price-grid'),
]
