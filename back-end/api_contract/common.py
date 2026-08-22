"""Shared API contract models."""

import re
from typing import Any, Generic, Literal, TypeVar

from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

DataT = TypeVar("DataT")

_SAFE_VALIDATION_LOCATION_ROOTS = frozenset(
    {"body", "cookie", "header", "path", "query"}
)
_SAFE_VALIDATION_TYPE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


class ExternalRequestModel(BaseModel):
    """Base for untrusted public request bodies."""

    model_config = ConfigDict(extra="forbid")


class ApiError(BaseModel):
    """Standard JSON error envelope."""

    status: Literal["error"] = "error"
    error: str = Field(..., description="Stable machine-readable error code.")
    message: str = Field(..., description="Human-readable error message.")
    details: dict[str, Any] = Field(default_factory=dict)


class ApiSuccess(BaseModel, Generic[DataT]):
    """Standard JSON success envelope."""

    status: Literal["success"] = "success"
    data: DataT
    message: str | None = None


def api_error_response(
    *,
    status_code: int,
    error: str,
    message: str,
    details: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    """Build the single JSON envelope used for public HTTP errors."""
    return JSONResponse(
        status_code=status_code,
        content=ApiError(
            error=error,
            message=message,
            details=details or {},
        ).model_dump(),
        headers=headers,
    )


def serialize_validation_errors(
    errors: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Project Pydantic validation details into a caller-data-free shape."""
    serialized: list[dict[str, Any]] = []
    for error in errors:
        raw_location = error.get("loc")
        location: list[str] = []
        if isinstance(raw_location, (list, tuple)):
            for index, segment in enumerate(raw_location):
                if (
                    index == 0
                    and isinstance(segment, str)
                    and segment in _SAFE_VALIDATION_LOCATION_ROOTS
                ):
                    location.append(segment)
                elif isinstance(segment, int):
                    location.append("item")
                else:
                    location.append("field")
        if not location:
            location.append("request")

        raw_type = error.get("type")
        error_type = (
            raw_type
            if isinstance(raw_type, str) and _SAFE_VALIDATION_TYPE.fullmatch(raw_type)
            else "validation_error"
        )
        serialized.append({"loc": location, "type": error_type})
    return serialized


COMMON_ERROR_RESPONSES = {
    400: {"model": ApiError, "description": "Bad request."},
    401: {"model": ApiError, "description": "Authentication required."},
    403: {"model": ApiError, "description": "Forbidden."},
    422: {"model": ApiError, "description": "Request validation failed."},
    500: {"model": ApiError, "description": "Internal server error."},
}
