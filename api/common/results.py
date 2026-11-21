"""
Common response wrapper. Every API response has the same shape:

    {
        "success": true,
        "message": "Permissions retrieved successfully.",
        "data": {...},                      # null when there is nothing to return
        "errors": [                         # empty on success
            {"error_code": "REQUIRED", "description": "This field is required.", "field_name": "name"}
        ],
        "referenced_tables": []             # tables that block a delete (see BaseResult.referenced)
    }

    BaseResult            → a result without data (e.g. "Branch deleted successfully.")
    BaseResult[TData]     → the same result carrying data, e.g. BaseResult[list[dict]]

Python has no implicit conversions, so the equivalents are explicit and short:
    BaseResult.ok(data)        instead of  `return data;`          (C# implicit T → BaseResult<T>)
    BaseResult.failure(error)  instead of  `return new Error(...)` (C# implicit Error → BaseResult)
    result.to_response()       turns a result into a DRF Response with the right HTTP status
    bool(result)               is result.success, so `if result:` reads naturally
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Generic, TypeVar

from rest_framework import status as http
from rest_framework.response import Response

TData = TypeVar('TData')


class ErrorCode(StrEnum):
    """All error codes the API returns, in one place."""

    VALIDATION_ERROR = 'VALIDATION_ERROR'          # a field value is not acceptable
    REQUIRED = 'REQUIRED'                          # a required field is missing or blank
    DUPLICATE = 'DUPLICATE'                        # the value is already used
    INVALID_REQUEST = 'INVALID_REQUEST'            # malformed request body
    NOT_AUTHENTICATED = 'NOT_AUTHENTICATED'        # not logged in, or the session expired
    PERMISSION_DENIED = 'PERMISSION_DENIED'        # logged in, but not allowed
    NOT_FOUND = 'NOT_FOUND'
    METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED'
    OPERATION_NOT_ALLOWED = 'OPERATION_NOT_ALLOWED'  # a business rule forbids it (e.g. delete the Owner role)
    REFERENCED = 'REFERENCED'                      # can't delete: other records still use it
    TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS'

    @property
    def http_status(self) -> int:
        return _HTTP_STATUS.get(self, http.HTTP_400_BAD_REQUEST)


_HTTP_STATUS = {
    ErrorCode.NOT_AUTHENTICATED: http.HTTP_401_UNAUTHORIZED,
    ErrorCode.PERMISSION_DENIED: http.HTTP_403_FORBIDDEN,
    ErrorCode.NOT_FOUND: http.HTTP_404_NOT_FOUND,
    ErrorCode.METHOD_NOT_ALLOWED: http.HTTP_405_METHOD_NOT_ALLOWED,
    ErrorCode.REFERENCED: http.HTTP_409_CONFLICT,
    ErrorCode.TOO_MANY_REQUESTS: http.HTTP_429_TOO_MANY_REQUESTS,
}


@dataclass(frozen=True)
class Error:
    error_code: ErrorCode
    description: str
    field_name: str | None = None  # None = about the request as a whole

    def to_dict(self) -> dict:
        return {'error_code': str(self.error_code), 'description': self.description, 'field_name': self.field_name}


@dataclass
class BaseResult(Generic[TData]):
    success: bool = True
    message: str = ''
    data: TData | None = None
    errors: list[Error] = field(default_factory=list)
    referenced_tables: list[str] = field(default_factory=list)

    # ── constructors ────────────────────────────────────────────────────
    @classmethod
    def ok(cls, data: TData | None = None, message: str = '') -> BaseResult[TData]:
        return cls(success=True, message=message, data=data)

    @classmethod
    def failure(cls, error: Error | ErrorCode | list[Error], message: str = '',
                description: str = '') -> BaseResult[TData]:
        """
        failure(Error(...)), failure([Error, ...]), or failure(ErrorCode.X, "message").
        With just a code, the message doubles as the error description.
        """
        if isinstance(error, ErrorCode):
            errors = [Error(error, description or message)]
        elif isinstance(error, Error):
            errors = [error]
        else:
            errors = list(error)
        return cls(success=False, message=message or (errors[0].description if errors else ''), errors=errors)

    @classmethod
    def referenced(cls, tables: list[str], message: str) -> BaseResult[TData]:
        """A delete refused because other tables still reference the record."""
        return cls(
            success=False, message=message, referenced_tables=sorted(set(tables)),
            errors=[Error(ErrorCode.REFERENCED, message)],
        )

    # ── building ────────────────────────────────────────────────────────
    def add_error(self, error_code: ErrorCode, description: str, field_name: str | None = None) -> BaseResult[TData]:
        """Add an error (marks the result failed). Returns self so calls can be chained."""
        self.errors.append(Error(error_code, description, field_name))
        self.success = False
        if not self.message:
            self.message = description
        return self

    def __bool__(self) -> bool:
        return self.success

    # ── output ──────────────────────────────────────────────────────────
    def to_dict(self) -> dict:
        return {
            'success': self.success,
            'message': self.message,
            'data': self.data,
            'errors': [e.to_dict() for e in self.errors],
            'referenced_tables': self.referenced_tables,
        }

    def to_response(self, status: int | None = None, headers: dict | None = None) -> Response:
        """
        DRF Response. Status: given, else 200 for success, else the first error's
        status (400 for validation, 401, 403, 404, 409 for referenced, ...).
        """
        if status is None:
            status = http.HTTP_200_OK if self.success else (
                self.errors[0].error_code.http_status if self.errors else http.HTTP_400_BAD_REQUEST
            )
        return Response(self.to_dict(), status=status, headers=headers)
