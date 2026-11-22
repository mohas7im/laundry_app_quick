from decimal import Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.views import APIView

from accounts.access import branch_permission, get_active_branch, get_active_branch_id
from common.results import BaseResult
from .models import Shift
from .report import shift_report

MONEY = {'max_digits': 10, 'decimal_places': 2, 'min_value': Decimal('0')}


def _my_open_shift(request):
    return (Shift.objects.filter(opened_by=request.user, branch_id=get_active_branch_id(request), closed_at__isnull=True)
            .select_related('branch', 'opened_by').first())


class OpenShiftSerializer(serializers.Serializer):
    opening_float = serializers.DecimalField(**MONEY)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class CloseShiftSerializer(serializers.Serializer):
    counted_cash = serializers.DecimalField(**MONEY)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class CurrentShiftView(APIView):
    """GET /api/shifts/current/ — my open shift at the active branch with its live numbers (data null if none)."""

    permission_classes = [branch_permission('shifts.view')]

    def get(self, request):
        shift = _my_open_shift(request)
        message = 'Your shift is open.' if shift else 'You have no open shift.'
        return BaseResult.ok(shift_report(shift) if shift else None, message).to_response()


class OpenShiftView(APIView):
    """POST /api/shifts/open/ {opening_float, notes?} — start my shift at the active branch."""

    permission_classes = [branch_permission('shifts.create')]

    def post(self, request):
        serializer = OpenShiftSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if _my_open_shift(request):
            raise serializers.ValidationError({'detail': 'Your shift is already open. Close it before opening another.'})
        shift = Shift.objects.create(branch=get_active_branch(request), opened_by=request.user,
                                     opening_float=serializer.validated_data['opening_float'],
                                     notes=serializer.validated_data['notes'].strip())
        return BaseResult.ok(shift_report(shift), 'Shift opened.').to_response(status.HTTP_201_CREATED)


class CloseShiftView(APIView):
    """POST /api/shifts/close/ {counted_cash, notes?} — count the drawer and close my shift."""

    permission_classes = [branch_permission('shifts.create')]

    @transaction.atomic
    def post(self, request):
        serializer = CloseShiftSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        shift = _my_open_shift(request)
        if shift is None:
            raise serializers.ValidationError({'detail': 'You have no open shift to close.'})
        shift = Shift.objects.select_for_update().select_related('branch', 'opened_by').get(pk=shift.pk)
        shift.expected_cash = Decimal(shift_report(shift)['expected_cash'])  # fixed at closing
        shift.counted_cash = serializer.validated_data['counted_cash']
        notes = serializer.validated_data['notes'].strip()
        shift.notes = f'{shift.notes}\n{notes}'.strip() if notes else shift.notes
        shift.closed_at = timezone.now()
        shift.save()
        report = shift_report(shift)
        diff = shift.difference
        message = ('Shift closed. The cash matches.' if diff == 0
                   else f'Shift closed. The drawer is {"short" if diff < 0 else "over"} by AED {abs(diff)}.')
        return BaseResult.ok(report, message).to_response()


class ShiftListView(APIView):
    """GET /api/shifts/ — the active branch's shifts, newest first (last 100)."""

    permission_classes = [branch_permission('shifts.view')]

    def get(self, request):
        shifts = (Shift.objects.filter(branch_id=get_active_branch_id(request))
                  .select_related('branch', 'opened_by')[:100])
        return BaseResult.ok([shift_report(s) for s in shifts], 'Shifts retrieved successfully.').to_response()


class ShiftDetailView(APIView):
    """GET /api/shifts/<id>/ — one shift's cash-up report."""

    permission_classes = [branch_permission('shifts.view')]

    def get(self, request, shift_id):
        shift = get_object_or_404(Shift.objects.select_related('branch', 'opened_by'), pk=shift_id,
                                  branch_id=get_active_branch_id(request))
        return BaseResult.ok(shift_report(shift), 'Shift retrieved successfully.').to_response()
