from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import MenuViewSet, MyMenuView, PermissionMatrixView, RolePermissionsView, RoleViewSet

router = DefaultRouter(trailing_slash=True)
router.register('roles', RoleViewSet, basename='role')
router.register('menus', MenuViewSet, basename='menu')

urlpatterns = [
    # Permissions menu
    path('permissions/', PermissionMatrixView.as_view(), name='permission-matrix'),
    path('permissions/roles/<uuid:role_id>/', RolePermissionsView.as_view(), name='role-permissions'),
    path('menus/my/', MyMenuView.as_view(), name='menu-my'),  # before the router's menus/<pk>/
    *router.urls,
]
