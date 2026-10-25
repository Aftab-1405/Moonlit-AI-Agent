"""SQL query API contract models."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class QueryColumnMetadata(BaseModel):
    """Ordered source-column identity and declared analysis behavior."""

    key: str
    label: str
    sql_type: str
    precision: int | None = None
    scale: int | None = None
    timezone: str | None = None
    encoding: str
    perspective_type: Literal["string", "integer", "float", "boolean", "date", "datetime"]
    analysis_semantics: str


class QueryResultMetadata(BaseModel):
    """Identity and scope of this query output (not underlying table coverage)."""

    version: Literal[1] = 1
    execution_id: str
    executed_at: str
    source_id: str
    query_id: str
    execution_time_ms: float = Field(default=0, ge=0)
    requested_timeout_seconds: int | None = None
    effective_timeout_seconds: int | None = None
    timeout_scope: Literal["statement", "driver-round-trip", "driver-configured"] | None = None
    effective_limit: int = Field(ge=0)
    returned_rows: int = Field(ge=0)
    completeness: Literal["complete", "truncated", "unknown"]


class QueryResultData(BaseModel):
    """Tabular query result."""

    columns: list[str] = Field(default_factory=list)
    column_types: dict[str, str] = Field(default_factory=dict)
    rows: list[list[Any]] = Field(default_factory=list)
    column_metadata: list[QueryColumnMetadata] = Field(default_factory=list)
    result_metadata: QueryResultMetadata | None = None


class RunSqlQueryData(BaseModel):
    """Data returned after successful SQL execution."""

    result: QueryResultData
    row_count: int = Field(..., ge=0)
    total_rows: int | None = Field(default=None, ge=0)
    truncated: bool = False
    execution_time_ms: float = Field(..., ge=0)
    query_type: Literal["SELECT", "WITH", "OTHER"] = "SELECT"
