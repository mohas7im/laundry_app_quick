from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import PermissionListView, RoleViewSet

router = DefaultRouter(trailing_slash=True)
router.register('roles', RoleViewSet, basename='role')

urlpatterns = [
    path('permissions/', PermissionListView.as_view(), name='permission-list'),
    *router.urls,
]
