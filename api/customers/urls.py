from rest_framework.routers import DefaultRouter

from .views import CustomerViewSet

router = DefaultRouter(trailing_slash=True)
router.register('customers', CustomerViewSet, basename='customer')

urlpatterns = router.urls
