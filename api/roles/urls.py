from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import MenuViewSet, MyMenuView, PermissionListView, RoleViewSet

router = DefaultRouter(trailing_slash=True)
router.register('roles', RoleViewSet, basename='role')
router.register('menus', MenuViewSet, basename='menu')

urlpatterns = [
    path('permissions/', PermissionListView.as_view(), name='permission-list'),
    path('menus/my/', MyMenuView.as_view(), name='menu-my'),  # before the router's menus/<pk>/
    *router.urls,
]
