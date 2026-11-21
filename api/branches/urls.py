from rest_framework.routers import DefaultRouter

from .views import BranchViewSet

router = DefaultRouter(trailing_slash=True)
router.register('branches', BranchViewSet, basename='branch')

urlpatterns = router.urls
