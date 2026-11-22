from django.urls import path

from .views import DailySummaryView, DashboardView, OrdersExportView

urlpatterns = [
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    path('reports/daily/', DailySummaryView.as_view(), name='report-daily'),
    path('reports/orders.csv', OrdersExportView.as_view(), name='report-orders-csv'),
]
