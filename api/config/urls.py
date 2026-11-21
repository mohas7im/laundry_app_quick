from django.urls import include, path

from accounts.urls import auth_urlpatterns

urlpatterns = [
    path('api/auth/', include(auth_urlpatterns)),
    path('api/', include('accounts.urls')),    # /api/users/
    path('api/', include('branches.urls')),    # /api/branches/
    path('api/', include('roles.urls')),       # /api/roles/, /api/permissions/
]
