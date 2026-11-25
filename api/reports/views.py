import csv
from datetime import date, timedelta

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import serializers
from rest_framework.views import APIView

from accounts.access import branch_permission, get_active_branch
from common.results import BaseResult
from . import queries as q


def _day(request, name='date', default=None):
    raw = request.query_params.get(name)
    if not raw:
        return default or timezone.localdate()
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise serializers.ValidationError({name: 'Use a date like 2026-11-22.'})


SERIES_RANGES = {'7d', '30d', 'month'}


class DashboardView(APIView):
    """
    GET /api/dashboard/?range=7d|30d|month — the active branch today: sales and money vs
    yesterday, the workshop by stage, on-time %, money owed, orders that need attention,
    sales per day over the range (default 7 days) and the top items of the last 30 days
    (dashboard.view).
    """

    permission_classes = [branch_permission('dashboard.view')]

    def get(self, request):
        branch = get_active_branch(request)
        now, today = timezone.now(), timezone.localdate()
        today_start, today_end = q.day_bounds(today)
        yesterday_start, yesterday_end = q.day_bounds(today - timedelta(days=1))
        month_start = today_start - timedelta(days=29)

        series_range = request.query_params.get('range') or '7d'
        if series_range not in SERIES_RANGES:
            raise serializers.ValidationError({'range': 'Use 7d, 30d or month.'})
        first_day = (today.replace(day=1) if series_range == 'month'
                     else today - timedelta(days=29 if series_range == '30d' else 6))

        data = {
            'branch_name': branch.name,
            'date': today.isoformat(),
            'today': {'sales': q.sales(branch.id, today_start, today_end),
                      'collected': q.collected(branch.id, today_start, today_end)},
            'yesterday': {'sales': q.sales(branch.id, yesterday_start, yesterday_end),
                          'collected': q.collected(branch.id, yesterday_start, yesterday_end)},
            'operations': q.operations(branch.id, now),
            'on_time_30_days': q.on_time(branch.id, month_start, today_end),
            'receivables': q.receivables(branch.id, now),
            'attention': q.attention(branch.id, now),
            'series_range': series_range,
            'series': q.daily_series(branch.id, first_day, today),
            'top_items_30_days': q.top_items(branch.id, month_start, today_end),
        }
        return BaseResult.ok(data, 'Dashboard retrieved successfully.').to_response()


class DailySummaryView(APIView):
    """GET /api/reports/daily/?date=YYYY-MM-DD — the end-of-day report of the active branch (reports.view)."""

    permission_classes = [branch_permission('reports.view')]

    def get(self, request):
        branch = get_active_branch(request)
        day = _day(request)
        start, end = q.day_bounds(day)
        data = {
            'branch_name': branch.name,
            'branch_code': branch.code,
            'date': day.isoformat(),
            'sales': q.sales(branch.id, start, end),
            'collected': q.collected(branch.id, start, end),
            'on_time': q.on_time(branch.id, start, end),
            'cash_ups': q.shifts_closed(branch.id, start, end),
            'top_items': q.top_items(branch.id, start, end, limit=10),
        }
        return BaseResult.ok(data, 'Daily summary retrieved successfully.').to_response()


class OrdersExportView(APIView):
    """
    GET /api/reports/orders.csv?from=YYYY-MM-DD&to=YYYY-MM-DD — every order of the active
    branch taken in those days, as a CSV that opens in Excel (reports.print).
    """

    permission_classes = [branch_permission('reports.print')]

    def get(self, request):
        branch = get_active_branch(request)
        today = timezone.localdate()
        first, last = _day(request, 'from', today), _day(request, 'to', today)
        if last < first:
            raise serializers.ValidationError({'to': 'The end date is before the start date.'})
        if (last - first).days > 366:
            raise serializers.ValidationError({'to': 'Export at most one year at a time.'})
        start, end = q.day_bounds(first)[0], q.day_bounds(last)[1]

        response = HttpResponse(content_type='text/csv; charset=utf-8')
        name = f'orders-{branch.code}-{first.isoformat()}-to-{last.isoformat()}.csv'
        response['Content-Disposition'] = f'attachment; filename="{name}"'
        response.write('﻿')  # BOM: Excel reads the file as UTF-8 (names in Arabic stay readable)
        writer = None
        for row in q.order_rows(branch.id, start, end):
            if writer is None:
                writer = csv.DictWriter(response, fieldnames=list(row))
                writer.writeheader()
            writer.writerow(row)
        if writer is None:
            response.write('No orders in these days\r\n')
        return response
