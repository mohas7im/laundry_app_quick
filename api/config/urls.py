from django.urls import include, path

from accounts.urls import auth_urlpatterns

urlpatterns = [
    path('api/auth/', include(auth_urlpatterns)),
    path('api/', include('accounts.urls')),    # /api/users/
    path('api/', include('branches.urls')),    # /api/branches/
    path('api/', include('roles.urls')),       # /api/roles/, /api/permissions/
    path('api/', include('customers.urls')),   # /api/customers/
    path('api/', include('masters.urls')),     # /api/common-masters/, /api/common-master-types/
    path('api/', include('orders.urls')),      # /api/orders/, /api/pos/catalogue/
    path('api/', include('catalogue.urls')),   # /api/services/, items/, price-lists/, prices/, upcharges/
]
