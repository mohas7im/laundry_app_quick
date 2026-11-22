from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import OrderViewSet, PosCatalogueView

router = DefaultRouter(trailing_slash=True)
router.register('orders', OrderViewSet, basename='order')

urlpatterns = router.urls + [
    path('pos/catalogue/', PosCatalogueView.as_view(), name='pos-catalogue'),
]
