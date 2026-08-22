"""Shared API contract models."""

from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field

DataT = TypeVar("DataT")


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


COMMON_ERROR_RESPONSES = {
    400: {"model": ApiError, "description": "Bad request."},
    401: {"model": ApiError, "description": "Authentication required."},
    403: {"model": ApiError, "description": "Forbidden."},
    422: {"model": ApiError, "description": "Request validation failed."},
    500: {"model": ApiError, "description": "Internal server error."},
}
