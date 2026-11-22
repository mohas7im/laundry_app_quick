from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    CollectionCollectView,
    CollectionListView,
    OrderViewSet,
    PosCatalogueView,
    ProductionBoardView,
    ProductionMoveView,
)

router = DefaultRouter(trailing_slash=True)
router.register('orders', OrderViewSet, basename='order')

urlpatterns = router.urls + [
    path('pos/catalogue/', PosCatalogueView.as_view(), name='pos-catalogue'),
    path('production/', ProductionBoardView.as_view(), name='production-board'),
    path('production/move/', ProductionMoveView.as_view(), name='production-move'),
    path('collection/', CollectionListView.as_view(), name='collection-list'),
    path('collection/collect/', CollectionCollectView.as_view(), name='collection-collect'),
]
