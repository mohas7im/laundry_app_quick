from django.urls import path

from .views import CloseShiftView, CurrentShiftView, OpenShiftView, ShiftDetailView, ShiftListView

urlpatterns = [
    path('shifts/', ShiftListView.as_view(), name='shift-list'),
    path('shifts/current/', CurrentShiftView.as_view(), name='shift-current'),
    path('shifts/open/', OpenShiftView.as_view(), name='shift-open'),
    path('shifts/close/', CloseShiftView.as_view(), name='shift-close'),
    path('shifts/<uuid:shift_id>/', ShiftDetailView.as_view(), name='shift-detail'),
]
