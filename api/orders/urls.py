from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    CollectionCollectView,
    CollectionListView,
    CustomerBalanceView,
    OrderPayView,
    OrderRefundView,
    PaymentListView,
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
    path('orders/<uuid:order_id>/pay/', OrderPayView.as_view(), name='order-pay'),
    path('orders/<uuid:order_id>/refund/', OrderRefundView.as_view(), name='order-refund'),
    path('payments/', PaymentListView.as_view(), name='payment-list'),
    path('customers/<uuid:customer_id>/balance/', CustomerBalanceView.as_view(), name='customer-balance'),
    path('customers/<uuid:customer_id>/settle/', CustomerBalanceView.as_view(), name='customer-settle'),
]
