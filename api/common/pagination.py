"""
Paging and searching for every list API, set once in settings.REST_FRAMEWORK:

    GET /api/customers/?page_number=2&page_size=20&search_term=fatima

- Pagination: applies when the request sends page_number or page_size. Without
  them the list comes back whole, as before (dropdowns need every branch/role).
  The page goes in the BaseResult's `data`:

      {"items": [...], "page_number": 2, "page_size": 20, "total_count": 57, "total_pages": 3}

  A page past the end returns no items (with the totals), not an error.
- SearchTermFilter: `search_term` matches any of the view's `search_fields`
  (case-insensitive, every word must match). Views without search_fields ignore it.
"""
import math

from rest_framework import exceptions
from rest_framework.filters import SearchFilter
from rest_framework.pagination import BasePagination
from rest_framework.response import Response


class Pagination(BasePagination):
    page_number_param = 'page_number'
    page_size_param = 'page_size'
    default_page_size = 10
    max_page_size = 100

    def paginate_queryset(self, queryset, request, view=None):
        params = request.query_params
        if self.page_number_param not in params and self.page_size_param not in params:
            return None  # not asked for: return the whole list

        self.page_number = self._positive_int(params, self.page_number_param, 1)
        self.page_size = min(self._positive_int(params, self.page_size_param, self.default_page_size),
                             self.max_page_size)
        self.total_count = queryset.count()
        start = (self.page_number - 1) * self.page_size
        return list(queryset[start:start + self.page_size])

    def get_paginated_response(self, data):
        return Response({
            'items': data,
            'page_number': self.page_number,
            'page_size': self.page_size,
            'total_count': self.total_count,
            'total_pages': max(1, math.ceil(self.total_count / self.page_size)),
        })

    @staticmethod
    def _positive_int(params, name, default):
        raw = params.get(name, default)
        try:
            value = int(raw)
        except (TypeError, ValueError):
            value = 0
        if value < 1:
            raise exceptions.ValidationError({name: 'Enter a whole number of 1 or more.'})
        return value


class SearchTermFilter(SearchFilter):
    """DRF's search, read from `search_term` instead of `search`."""

    search_param = 'search_term'
