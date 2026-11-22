from rest_framework.routers import DefaultRouter

from .views import CommonMasterTypeViewSet, CommonMasterViewSet

router = DefaultRouter(trailing_slash=True)
router.register('common-master-types', CommonMasterTypeViewSet, basename='common-master-type')
router.register('common-masters', CommonMasterViewSet, basename='common-master')

urlpatterns = router.urls
