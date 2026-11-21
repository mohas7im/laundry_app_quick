"""
How BaseResult plugs into Django REST Framework:

- exception_handler: DRF's EXCEPTION_HANDLER hook (settings.REST_FRAMEWORK). Errors DRF
  raises — serializer validation, 401/403/404, throttling — come back as a BaseResult.
- ResultViewSetMixin: ModelViewSet actions (list/retrieve/create/update/destroy) return a
  BaseResult; a delete blocked by PROTECT foreign keys returns BaseResult.referenced().
"""
from django.db.models import ProtectedError
from rest_framework import exceptions, status
from rest_framework.views import exception_handler as drf_exception_handler

from .results import BaseResult, Error, ErrorCode

# DRF ErrorDetail.code → our error code (validation errors)
_FIELD_CODES = {
    'required': ErrorCode.REQUIRED,
    'blank': ErrorCode.REQUIRED,
    'null': ErrorCode.REQUIRED,
    'unique': ErrorCode.DUPLICATE,
    'not_allowed': ErrorCode.OPERATION_NOT_ALLOWED,
}

# DRF exception → our error code (everything else)
_EXCEPTION_CODES = [
    (exceptions.NotAuthenticated, ErrorCode.NOT_AUTHENTICATED),
    (exceptions.AuthenticationFailed, ErrorCode.NOT_AUTHENTICATED),
    (exceptions.PermissionDenied, ErrorCode.PERMISSION_DENIED),
    (exceptions.NotFound, ErrorCode.NOT_FOUND),
    (exceptions.MethodNotAllowed, ErrorCode.METHOD_NOT_ALLOWED),
    (exceptions.Throttled, ErrorCode.TOO_MANY_REQUESTS),
    (exceptions.ParseError, ErrorCode.INVALID_REQUEST),
]

GENERAL_KEYS = ('detail', 'non_field_errors')  # errors about the whole request, not one field


def _field_errors(detail, path=''):
    """Flatten DRF's nested validation detail into Error objects (field paths like roles[1].role)."""
    if isinstance(detail, dict):
        for key, value in detail.items():
            if key in GENERAL_KEYS:
                sub = path
            elif isinstance(key, int):  # DRF keys list-item errors by index
                sub = f'{path}[{key}]'
            else:
                sub = f'{path}.{key}' if path else key
            yield from _field_errors(value, sub)
    elif isinstance(detail, list):
        for index, item in enumerate(detail):
            if isinstance(item, (dict, list)):
                yield from _field_errors(item, f'{path}[{index}]')
            else:
                yield from _field_errors(item, path)
    else:
        code = _FIELD_CODES.get(getattr(detail, 'code', None), ErrorCode.VALIDATION_ERROR)
        yield Error(code, str(detail), path or None)


def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return None  # not a DRF error: let Django report it (500)

    if isinstance(exc, exceptions.ValidationError):
        errors = list(_field_errors(exc.detail))
        general = next((e.description for e in errors if e.field_name is None), None)
        result = BaseResult.failure(errors, message=general or 'Some fields are invalid. Check them and try again.')
    else:
        code = next((c for cls, c in _EXCEPTION_CODES if isinstance(exc, cls)), ErrorCode.INVALID_REQUEST)
        detail = exc.detail if isinstance(exc, exceptions.APIException) else str(exc)
        result = BaseResult.failure(code, message=str(detail))

    # keep DRF's status and headers (e.g. WWW-Authenticate on 401, Retry-After on 429)
    return result.to_response(status=response.status_code, headers=dict(response.headers))


class ResultViewSetMixin:
    """
    Put first in a ModelViewSet's bases. Messages use the model's verbose names,
    e.g. "Branches retrieved successfully.", "Branch created successfully.".
    Set `referenced_message` for the "still in use" delete error.
    """

    referenced_message = 'This record is still used by other records, so it can\'t be deleted.'

    def _name(self, plural=False):
        meta = self.get_queryset().model._meta
        return str(meta.verbose_name_plural if plural else meta.verbose_name).capitalize()

    def list(self, request, *args, **kwargs):
        data = super().list(request, *args, **kwargs).data
        return BaseResult.ok(data, f'{self._name(plural=True)} retrieved successfully.').to_response()

    def retrieve(self, request, *args, **kwargs):
        data = super().retrieve(request, *args, **kwargs).data
        return BaseResult.ok(data, f'{self._name()} retrieved successfully.').to_response()

    def create(self, request, *args, **kwargs):
        data = super().create(request, *args, **kwargs).data
        return BaseResult.ok(data, f'{self._name()} created successfully.').to_response(status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        data = super().update(request, *args, **kwargs).data
        return BaseResult.ok(data, f'{self._name()} updated successfully.').to_response()

    def destroy(self, request, *args, **kwargs):
        try:
            super().destroy(request, *args, **kwargs)
        except ProtectedError as exc:
            tables = [obj._meta.db_table for obj in exc.protected_objects]
            return BaseResult.referenced(tables, self.referenced_message).to_response()
        return BaseResult.ok(message=f'{self._name()} deleted successfully.').to_response()
