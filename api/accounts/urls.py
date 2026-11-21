from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

auth_urlpatterns = [
    path('csrf/', views.CsrfView.as_view(), name='auth-csrf'),
    path('login/', views.LoginView.as_view(), name='auth-login'),
    path('refresh/', views.RefreshView.as_view(), name='auth-refresh'),
    path('logout/', views.LogoutView.as_view(), name='auth-logout'),
    path('me/', views.MeView.as_view(), name='auth-me'),
    path('change-password/', views.ChangePasswordView.as_view(), name='auth-change-password'),
]

router = DefaultRouter(trailing_slash=True)
router.register('users', views.StaffUserViewSet, basename='user')

urlpatterns = router.urls
