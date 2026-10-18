"""
Structured Output Schemas for AI Tools

Pydantic models that define:
1. Tool argument validation (input to tools)
2. Tool result structures (output from tools)

Benefits:
- Guaranteed valid JSON parsing (no more json.loads failures)
- Type validation before tool execution
- Consistent result format for frontend display
- Better error messages when validation fails
"""

import logging
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from core.errors import log_safe_exception, public_error_for_code

logger = logging.getLogger(__name__)

SUPPORTED_UI_ACTIONS = {
    "open_sql_editor",
    "open_database_modal",
    "open_settings_modal",
    "navigate_new_chat",
}

SUPPORTED_DB_TYPES = {"mysql", "postgresql", "sqlserver", "oracle"}
SUPPORTED_SETTINGS_SECTIONS = {"appearance", "ai", "database", "context"}
# TOOL ARGUMENT SCHEMAS (Input validation)


class BaseToolArgs(BaseModel):
    """Base class for all tool arguments."""

    model_config = ConfigDict(extra="forbid")


class ReadSkillArgs(BaseToolArgs):
    """Arguments for loading one registered skill."""

    skill_name: str = Field(..., min_length=1)

    @field_validator("skill_name")
    @classmethod
    def normalize_skill_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("skill_name must not be empty")
        return normalized


class WebSearchArgs(BaseToolArgs):
    """Arguments for a bounded web search."""

    query: str = Field(..., min_length=1)

    @field_validator("query")
    @classmethod
    def normalize_query(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("query must not be empty")
        return normalized


class GetQueryHistoryArgs(BaseToolArgs):
    """Arguments for retrieving recent query history."""


class GetConnectionStatusArgs(BaseToolArgs):
    """Arguments for get_connection_status tool."""

    pass  # Only requires rationale


class GetDatabaseListArgs(BaseToolArgs):
    """Arguments for get_database_list tool."""

    pass  # Only requires rationale


class ExecuteQueryArgs(BaseToolArgs):
    """Arguments for execute_query tool."""

    query: str = Field(..., description="SQL SELECT query to execute.")
    max_rows: Optional[int] = Field(
        100,
        description="Maximum number of rows to return (capped at 1000).",
        ge=1,
        le=1000,
    )

    @field_validator("max_rows", mode="before")
    @classmethod
    def cap_max_rows(cls, v: Any) -> Any:
        if isinstance(v, int):
            return max(1, min(v, 1000))
        return v

    @field_validator("query")
    @classmethod
    def validate_query_is_read_only(cls, v: str) -> str:
        from service.database.security import DatabaseSecurity

        analysis = DatabaseSecurity.analyze_sql_query(v, dialect=None)
        if not analysis["is_safe"]:
            reason = "; ".join(analysis["warnings"]) or "query is not read-only"
            raise ValueError(reason)

        return v


class GetTableIndexesArgs(BaseToolArgs):
    """Arguments for get_table_indexes tool."""

    table_name: str = Field(..., description="Name of the table to get indexes for.")


class AnalyzeQueryResultArgs(BaseToolArgs):
    """Arguments for deterministic analysis of a persisted query result."""

    execution_id: str = Field(..., min_length=1)
    operation: Literal["profile", "data_quality", "correlation"]
    columns: Optional[List[str]] = Field(default=None, max_length=50)


class GetSchemaOverviewArgs(BaseToolArgs):
    """Arguments for get_schema_overview tool."""

    target_tables: Optional[List[str]] = Field(
        None,
        description="Optional list of table names to fetch the overview for. If not provided, fetches all tables.",
    )


# New tool arg schemas (added for the high-value DB tools expansion)
# Each new tool follows the same pattern as the existing tools above: a
# Pydantic ``BaseToolArgs`` subclass with explicit ``Field`` metadata and,
# where applicable, a ``field_validator`` for read-only enforcement. The
# schemas are registered in ``TOOL_ARG_SCHEMAS`` below so
# ``ToolExecutor.validate_and_parse_args`` can find them.


class ExplainQueryArgs(BaseToolArgs):
    """Arguments for the explain_query tool.

    Validates that ``query`` is a read-only SELECT/WITH statement before the
    tool is dispatched — same gate as ``ExecuteQueryArgs``. EXPLAIN must not
    be allowed on DML/DDL because some DBMSes (e.g. MySQL EXPLAIN ANALYZE,
    PostgreSQL EXPLAIN ANALYZE) actually execute the statement, and even on
    DBMSes where EXPLAIN is plan-only, exposing the plan for an UPDATE could
    leak which rows would be touched.
    """

    query: str = Field(..., description="Read-only SELECT/WITH SQL to EXPLAIN.")

    @field_validator("query")
    @classmethod
    def validate_query_is_read_only(cls, v: str) -> str:
        from service.database.security import DatabaseSecurity

        analysis = DatabaseSecurity.analyze_sql_query(v, dialect=None)
        if not analysis["is_safe"]:
            reason = "; ".join(analysis["warnings"]) or "query is not read-only"
            raise ValueError(reason)
        return v


class GetTableDetailsArgs(BaseToolArgs):
    """Arguments for the get_table_details tool."""

    table_name: str = Field(..., description="Name of the table to fetch detailed column metadata for.")


class GetTableRowCountsArgs(BaseToolArgs):
    """Arguments for counting several tables in one database roundtrip."""

    model_config = ConfigDict(extra="forbid")

    table_names: List[str] = Field(
        ...,
        min_length=1,
        max_length=10,
        description="One to ten unique table names to count in a single call.",
    )

    @field_validator("table_names")
    @classmethod
    def validate_unique_table_names(cls, value: List[str]) -> List[str]:
        normalized = [name.strip() for name in value]
        if any(not name for name in normalized):
            raise ValueError("table_names must not contain empty names")
        if len({name.casefold() for name in normalized}) != len(normalized):
            raise ValueError("table_names must contain unique names")
        return normalized


class GetForeignKeysArgs(BaseToolArgs):
    """Arguments for the get_foreign_keys tool.

    ``table_name`` is optional — when omitted, the tool returns all foreign
    keys in the connected database/schema (mirroring the behavior of the
    existing ``_get_foreign_keys`` executor method).
    """

    table_name: Optional[str] = Field(
        None,
        description="Optional table name to filter foreign keys for. If omitted, all FKs are returned.",
    )


class ListViewsArgs(BaseToolArgs):
    """Arguments for the list_views tool.

    No parameters — the tool inspects the currently connected database and
    schema (from the per-stream ``db_config``).
    """

    pass


class OpenSqlEditorArgs(BaseToolArgs):
    """Arguments for open_sql_editor tool."""

    query: Optional[str] = Field(None, description="SQL query to pre-populate in the editor.")

    @field_validator("query")
    @classmethod
    def normalize_optional_query(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        query = v.strip()
        return query or None


class OpenDatabaseModalArgs(BaseToolArgs):
    """Arguments for open_database_modal tool."""

    db_type: Optional[str] = Field(None, description="Database type to pre-select (e.g. 'postgresql').")

    @field_validator("db_type")
    @classmethod
    def validate_db_type(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        db_type = v.strip().lower()
        if not db_type:
            return None
        if db_type not in SUPPORTED_DB_TYPES:
            raise ValueError(f"db_type must be one of: {', '.join(sorted(SUPPORTED_DB_TYPES))}")
        return db_type


class OpenSettingsModalArgs(BaseToolArgs):
    """Arguments for open_settings_modal tool."""

    section: Optional[str] = Field(None, description="Settings section to navigate to on open.")

    @field_validator("section")
    @classmethod
    def validate_section(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        section = v.strip().lower()
        if not section:
            return None
        if section not in SUPPORTED_SETTINGS_SECTIONS:
            raise ValueError(f"section must be one of: {', '.join(sorted(SUPPORTED_SETTINGS_SECTIONS))}")
        return section


class NavigateNewChatArgs(BaseToolArgs):
    """Arguments for navigate_new_chat tool."""

    pass  # Only requires rationale


# CENH [4]: Argument schema for the `retrieve_memory` tool. The LLM passes a
# natural-language query; the tool returns formatted VAMP memory bullets.
class RetrieveMemoryArgs(BaseToolArgs):
    """Arguments for the retrieve_memory tool.

    A natural-language query describing what past facts the agent needs.
    The query is embedded via the same Bedrock Titan pipeline used for the
    per-turn VAMP retrieval, so rephrasing or specializing the original
    user prompt is the right pattern (e.g. "What did the user say about
    their revenue KPIs?").
    """

    query: str = Field(
        ...,
        description=(
            "A natural-language query describing what past facts you need. "
            'Example: "What did the user say about their revenue KPIs?"'
        ),
    )

    @field_validator("query")
    @classmethod
    def normalize_query(cls, v: str) -> str:
        query = (v or "").strip()
        if not query:
            raise ValueError("query must not be empty")
        return query


TOOL_ARG_SCHEMAS = {
    "read_skill": ReadSkillArgs,
    "get_connection_status": GetConnectionStatusArgs,
    "get_database_list": GetDatabaseListArgs,
    "execute_query": ExecuteQueryArgs,
    "get_table_indexes": GetTableIndexesArgs,
    "analyze_query_result": AnalyzeQueryResultArgs,
    "get_schema_overview": GetSchemaOverviewArgs,
    # New high-value DB tools.
    "explain_query": ExplainQueryArgs,
    "get_table_details": GetTableDetailsArgs,
    "get_table_row_counts": GetTableRowCountsArgs,
    "get_foreign_keys": GetForeignKeysArgs,
    "list_views": ListViewsArgs,
    "web_search": WebSearchArgs,
    "get_query_history": GetQueryHistoryArgs,
    "open_sql_editor": OpenSqlEditorArgs,
    "open_database_modal": OpenDatabaseModalArgs,
    "open_settings_modal": OpenSettingsModalArgs,
    "navigate_new_chat": NavigateNewChatArgs,
    # CENH [4]: Memory tool — no skill required, not cacheable.
    "retrieve_memory": RetrieveMemoryArgs,
}


# TOOL RESULT SCHEMAS (Output structure for frontend)


class ToolResultBase(BaseModel):
    """Base class for all tool results."""

    success: bool = True
    error: Optional[str] = None


class ReadSkillResult(ToolResultBase):
    """Safe UI metadata for a loaded skill."""

    skill_name: str
    description: Optional[str] = None
    already_loaded: bool = False


class ConnectionStatusResult(ToolResultBase):
    """Structured result for connection status."""

    model_config = ConfigDict(populate_by_name=True)

    connected: bool = False
    db_type: Optional[str] = None
    database: Optional[str] = None
    host: Optional[str] = None
    is_remote: Optional[bool] = None
    schema_name: Optional[str] = Field(default=None, validation_alias="schema", serialization_alias="schema")


class DatabaseListResult(ToolResultBase):
    """Structured result for database list."""

    databases: List[str] = Field(default_factory=list)
    current_database: Optional[str] = None
    count: int = 0


class QueryResult(ToolResultBase):
    """Structured result for query execution.

    Full data is included for the inline chat result table.
    LLM context should consume preview-only summaries to control token usage.
    """

    data: List[Dict[str, Any]] = Field(default_factory=list)
    row_count: int = 0  # Actual rows returned (after truncation)
    total_rows: Optional[int] = None  # Exact total only when known
    column_count: int = 0
    columns: List[str] = Field(default_factory=list)
    truncated: bool = False
    preview: List[Dict[str, Any]] = Field(default_factory=list)
    preview_row_count: int = 0
    preview_is_partial: bool = False
    full_result_location: str = "inline interactive chat table"
    preview_note: Optional[str] = None
    execution_id: Optional[str] = None
    conversation_id: Optional[str] = None


class TableIndexesResult(ToolResultBase):
    """Structured result for table indexes."""

    table: Optional[str] = None
    count: int = 0
    indexes: List[Dict[str, Any]] = Field(default_factory=list)


class SchemaOverviewResult(ToolResultBase):
    """Structured result for schema overview."""

    database: Optional[str] = None
    table_count: int = 0
    foreign_key_count: int = 0
    tables: List[str] = Field(default_factory=list)
    columns: Dict[str, List[Any]] = Field(default_factory=dict)
    foreign_keys: List[Dict[str, Any]] = Field(default_factory=list)


class NumericStatistics(BaseModel):
    """Numeric metrics for one profiled column."""

    min: float
    max: float
    mean: float
    median: float
    sample_stddev: Optional[float] = None


class ColumnProfileResult(BaseModel):
    """Validated profile metrics for one query-result column."""

    count: int = Field(strict=True, ge=0)
    non_null_count: int = Field(strict=True, ge=0)
    null_count: int = Field(strict=True, ge=0)
    distinct_count: int = Field(strict=True, ge=0)
    numeric_count: int = Field(strict=True, ge=0)
    numeric: Optional[NumericStatistics] = None

    @model_validator(mode="after")
    def validate_counts(self) -> "ColumnProfileResult":
        if self.non_null_count + self.null_count != self.count:
            raise ValueError("null and non-null counts must equal count")
        if self.distinct_count > self.non_null_count or self.numeric_count > self.non_null_count:
            raise ValueError("derived counts cannot exceed non-null count")
        return self


class ColumnQualityResult(BaseModel):
    """Validated data-quality metrics for one query-result column."""

    count: int = Field(strict=True, ge=0)
    non_null_count: int = Field(strict=True, ge=0)
    null_count: int = Field(strict=True, ge=0)
    distinct_count: int = Field(strict=True, ge=0)

    @model_validator(mode="after")
    def validate_counts(self) -> "ColumnQualityResult":
        if self.non_null_count + self.null_count != self.count:
            raise ValueError("null and non-null counts must equal count")
        if self.distinct_count > self.non_null_count:
            raise ValueError("distinct count cannot exceed non-null count")
        return self


class AnalyzeQueryResult(ToolResultBase):
    """Structured deterministic analysis over a prior query result."""

    operation: Literal["profile", "data_quality", "correlation"]
    analyzed_rows: int = Field(ge=0)
    source_truncated: bool
    scope_note: str
    columns: Any
    duplicate_row_count: Optional[int] = Field(default=None, ge=0)
    paired_numeric_rows: Optional[int] = Field(default=None, ge=0)
    pearson_correlation: Optional[float] = Field(default=None, ge=-1, le=1)

    @model_validator(mode="after")
    def validate_operation_fields(self) -> "AnalyzeQueryResult":
        if self.operation == "correlation":
            if not isinstance(self.columns, list) or len(self.columns) != 2:
                raise ValueError("correlation requires exactly two columns")
            if self.paired_numeric_rows is None or self.pearson_correlation is None:
                raise ValueError("correlation metrics are required")
        elif not isinstance(self.columns, dict):
            raise ValueError(f"{self.operation} columns must be a mapping")
        if self.operation == "data_quality" and self.duplicate_row_count is None:
            raise ValueError("duplicate_row_count is required for data_quality")
        return self


# New tool result schemas (added for the high-value DB tools expansion)
# Each result schema mirrors the dict shape returned by the matching
# ``AIToolExecutor._<tool>`` method so ``structure_tool_result`` can coerce
# the raw dict into a frontend-friendly payload. These schemas are also
# documentation: they pin down the contract the AI sees in
# ``ToolMessage.content``.


class ExplainQueryResult(ToolResultBase):
    """Structured result for the explain_query tool."""

    query: Optional[str] = None
    plan_format: Optional[str] = None  # "json" | "text" | "tabular"
    plan: List[Any] = Field(default_factory=list)
    row_count: int = 0
    truncated: bool = False


class GetTableDetailsResult(ToolResultBase):
    """Structured result for the get_table_details tool."""

    table: Optional[str] = None
    columns: List[Dict[str, Any]] = Field(default_factory=list)
    constraints: List[Dict[str, Any]] = Field(default_factory=list)
    column_count: int = 0


class TableRowCountResult(BaseModel):
    """Exact row count for one table in a batch result."""

    table: str
    row_count: int = Field(ge=0)
    is_estimate: bool = False


class GetTableRowCountsResult(ToolResultBase):
    """Structured result for the get_table_row_counts tool."""

    table_count: int = Field(default=0, ge=0)
    row_counts: List[TableRowCountResult] = Field(default_factory=list)


class GetForeignKeysResult(ToolResultBase):
    """Structured result for the get_foreign_keys tool."""

    table: Optional[str] = None  # only set when table_name arg was provided
    foreign_keys: List[Dict[str, Any]] = Field(default_factory=list)
    count: int = 0


class ListViewsResult(ToolResultBase):
    """Structured result for the list_views tool."""

    views: List[str] = Field(default_factory=list)
    materialized_views: List[str] = Field(default_factory=list)
    count: int = 0


class WebSearchItem(BaseModel):
    """One safe web-search citation card."""

    title: str
    url: str
    content: str

    @field_validator("url")
    @classmethod
    def validate_http_url(cls, value: str) -> str:
        from urllib.parse import urlsplit

        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("url must use http or https")
        return value


class WebSearchResult(ToolResultBase):
    """Structured bounded web-search result."""

    query: str
    count: int = Field(ge=0, le=5)
    results: List[WebSearchItem] = Field(max_length=5)


class QueryHistoryItem(BaseModel):
    """One bounded, user-scoped SQL history entry."""

    query: str = Field(max_length=500)
    database: str
    row_count: int = Field(ge=0)
    status: str
    executed_at: str


class QueryHistoryResult(ToolResultBase):
    """Structured recent query history for the UI."""

    count: int = Field(ge=0, le=10)
    queries: List[QueryHistoryItem] = Field(max_length=10)


class UiActionResult(ToolResultBase):
    """Structured result for UI action tools."""

    action: str
    requiresConfirmation: bool = False
    approved: Optional[bool] = None


class RetrieveMemoryResult(ToolResultBase):
    """Safe UI metadata for the retrieve_memory tool."""

    query: str
    found: bool


class RetrieveMemoryModelResult(RetrieveMemoryResult):
    """Validated memory evidence that is available only to the model."""

    memories: str


TOOL_RESULT_SCHEMAS = {
    "read_skill": ReadSkillResult,
    "get_connection_status": ConnectionStatusResult,
    "get_database_list": DatabaseListResult,
    "execute_query": QueryResult,
    "analyze_query_result": AnalyzeQueryResult,
    "get_table_indexes": TableIndexesResult,
    "get_schema_overview": SchemaOverviewResult,
    "explain_query": ExplainQueryResult,
    "get_table_details": GetTableDetailsResult,
    "get_table_row_counts": GetTableRowCountsResult,
    "get_foreign_keys": GetForeignKeysResult,
    "list_views": ListViewsResult,
    "web_search": WebSearchResult,
    "get_query_history": QueryHistoryResult,
    "open_sql_editor": UiActionResult,
    "open_database_modal": UiActionResult,
    "open_settings_modal": UiActionResult,
    "navigate_new_chat": UiActionResult,
    "retrieve_memory": RetrieveMemoryResult,
}

REQUIRED_RAW_RESULT_FIELDS = {
    "get_connection_status": {"connected"},
    "get_database_list": {"databases"},
    "execute_query": {"data", "columns", "row_count", "truncated"},
    "get_table_indexes": {"table", "indexes"},
    "get_schema_overview": {"tables", "columns", "foreign_keys"},
    "explain_query": {"query", "plan_format", "plan", "row_count"},
    "get_table_details": {"table", "columns", "constraints"},
    "get_table_row_counts": {"row_counts"},
    "get_foreign_keys": {"foreign_keys"},
    "list_views": {"views", "materialized_views"},
}


# HELPER FUNCTIONS


def validate_tool_args(tool_name: str, args: Dict[str, Any]) -> BaseToolArgs:
    """
    Validate tool arguments using Pydantic schema.

    Args:
        tool_name: Name of the tool
        args: Raw arguments dict from AI

    Returns:
        Validated Pydantic model

    Raises:
        ValueError: If validation fails with descriptive message
    """
    schema_class = TOOL_ARG_SCHEMAS.get(tool_name)

    if not schema_class:
        raise ValueError(f"Unknown tool: {tool_name}")

    try:
        return schema_class(**args)
    except Exception as e:
        raise ValueError(f"Invalid arguments for {tool_name}: {str(e)}")


def structure_tool_result(tool_name: str, raw_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert raw tool result to structured format for frontend.

    Args:
        tool_name: Name of the tool
        raw_result: Raw result dict from tool execution

    Returns:
        Structured result dict with consistent format
    """
    # Handle errors uniformly
    if "error" in raw_result or "error_code" in raw_result or raw_result.get("success") is False:
        public = public_error_for_code(raw_result.get("error_code"))
        return {
            "success": False,
            "error_code": public.code,
            "error": public.message,
        }

    required_fields = REQUIRED_RAW_RESULT_FIELDS.get(tool_name, set())
    if not required_fields.issubset(raw_result):
        public = public_error_for_code("TOOL_RESULT_INVALID")
        return {
            "success": False,
            "error_code": public.code,
            "error": public.message,
        }

    try:
        if tool_name == "read_skill":
            return ReadSkillResult.model_validate(raw_result).model_dump()

        elif tool_name == "analyze_query_result":
            operation = raw_result.get("operation")
            columns = raw_result.get("columns")
            if operation == "profile" and isinstance(columns, dict):
                columns = {
                    name: ColumnProfileResult.model_validate(metrics).model_dump() for name, metrics in columns.items()
                }
            elif operation == "data_quality" and isinstance(columns, dict):
                columns = {
                    name: ColumnQualityResult.model_validate(metrics).model_dump() for name, metrics in columns.items()
                }
            normalized = {**raw_result, "columns": columns}
            return AnalyzeQueryResult.model_validate(normalized).model_dump()

        elif tool_name == "web_search":
            results = raw_result.get("results", [])
            normalized = {**raw_result, "count": len(results) if isinstance(results, list) else 0}
            return WebSearchResult.model_validate(normalized).model_dump()

        elif tool_name == "get_query_history":
            queries = raw_result.get("queries", [])
            normalized = {**raw_result, "count": len(queries) if isinstance(queries, list) else 0}
            return QueryHistoryResult.model_validate(normalized).model_dump()

        elif tool_name == "get_connection_status":
            return ConnectionStatusResult(
                connected=raw_result.get("connected", False),
                db_type=raw_result.get("db_type"),
                database=raw_result.get("database"),
                host=raw_result.get("host"),
                is_remote=raw_result.get("is_remote"),
                schema_name=raw_result.get("schema"),
            ).model_dump(by_alias=True)

        elif tool_name == "get_database_list":
            dbs = raw_result.get("databases", [])
            return DatabaseListResult(
                databases=dbs,
                current_database=raw_result.get("current_database"),
                count=len(dbs),
            ).model_dump()

        elif tool_name == "execute_query":
            # Include full data for UI panels, plus preview for token-efficient context.
            data = raw_result.get("data", [])
            columns = raw_result.get("columns", [])
            row_count = raw_result.get("row_count", len(data))
            total_rows = raw_result.get("total_rows", row_count)
            preview_rows = data[:20]
            preview_row_count = len(preview_rows)
            preview_is_partial = (
                bool(raw_result.get("truncated"))
                or (row_count > preview_row_count)
                or (total_rows is not None and total_rows > preview_row_count)
            )
            preview_note = (
                "Preview only. The full available query result is visible in the inline interactive chat table."
                if preview_is_partial
                else None
            )

            return QueryResult(
                data=data,
                row_count=row_count,
                total_rows=total_rows,
                column_count=len(columns),
                columns=columns,
                truncated=raw_result.get("truncated", False),
                preview=preview_rows,
                preview_row_count=preview_row_count,
                preview_is_partial=preview_is_partial,
                full_result_location="inline interactive chat table",
                preview_note=preview_note,
                execution_id=raw_result.get("execution_id"),
                conversation_id=raw_result.get("conversation_id"),
            ).model_dump()

        elif tool_name == "get_table_indexes":
            indexes = raw_result.get("indexes", [])
            return TableIndexesResult(table=raw_result.get("table"), count=len(indexes), indexes=indexes).model_dump()

        elif tool_name == "get_schema_overview":
            tables = raw_result.get("tables", [])
            fks = raw_result.get("foreign_keys", [])
            return SchemaOverviewResult(
                database=raw_result.get("database"),
                table_count=len(tables),
                foreign_key_count=len(fks),
                tables=tables,
                columns=raw_result.get("columns", {}),
                foreign_keys=fks,
            ).model_dump()

        elif tool_name == "explain_query":
            plan = raw_result.get("plan", [])
            return ExplainQueryResult(
                query=raw_result.get("query"),
                plan_format=raw_result.get("plan_format"),
                plan=plan,
                row_count=raw_result.get("row_count", len(plan)),
                truncated=bool(raw_result.get("truncated", False)),
            ).model_dump()

        elif tool_name == "get_table_details":
            cols = raw_result.get("columns", [])
            return GetTableDetailsResult(
                table=raw_result.get("table"),
                columns=cols,
                constraints=raw_result.get("constraints", []),
                column_count=len(cols),
            ).model_dump()

        elif tool_name == "get_table_row_counts":
            row_counts = raw_result.get("row_counts", [])
            return GetTableRowCountsResult(
                table_count=len(row_counts),
                row_counts=row_counts,
            ).model_dump()

        elif tool_name == "get_foreign_keys":
            fks = raw_result.get("foreign_keys", [])
            return GetForeignKeysResult(
                table=raw_result.get("table"),
                foreign_keys=fks,
                count=len(fks),
            ).model_dump()

        elif tool_name == "list_views":
            views = raw_result.get("views", [])
            matviews = raw_result.get("materialized_views", [])
            return ListViewsResult(
                views=views,
                materialized_views=matviews,
                count=len(views) + len(matviews),
            ).model_dump()

        elif tool_name in SUPPORTED_UI_ACTIONS:
            structured = UiActionResult(
                action=tool_name,
                requiresConfirmation=bool(raw_result.get("requiresConfirmation", False)),
                approved=raw_result.get("approved"),
            ).model_dump()
            # Preserve the compact legacy shape unless confirmation metadata matters.
            if not structured["requiresConfirmation"]:
                structured.pop("requiresConfirmation", None)
            if structured["approved"] is None:
                structured.pop("approved", None)
            structured.pop("error", None)
            return structured

        elif tool_name == "retrieve_memory":
            model_result = RetrieveMemoryModelResult.model_validate(raw_result)
            return RetrieveMemoryResult(
                query=model_result.query,
                found=model_result.found,
                success=model_result.success,
                error=model_result.error,
            ).model_dump()

        else:
            public = public_error_for_code("TOOL_RESULT_INVALID")
            return {
                "success": False,
                "error_code": public.code,
                "error": public.message,
            }

    except Exception as e:
        public = public_error_for_code("TOOL_RESULT_INVALID")
        log_safe_exception(logger, "structure_tool_result", e, public)
        return {
            "success": False,
            "error_code": public.code,
            "error": public.message,
        }


def structure_retrieve_memory_model_result(raw_result: Dict[str, Any]) -> Dict[str, Any]:
    """Validate model-only memory evidence without exposing it to UI structuring."""
    if "error" in raw_result or "error_code" in raw_result or raw_result.get("success") is False:
        public = public_error_for_code(raw_result.get("error_code"))
        return {"success": False, "error_code": public.code, "error": public.message}
    try:
        return RetrieveMemoryModelResult.model_validate(raw_result).model_dump()
    except Exception as exc:
        public = public_error_for_code("TOOL_RESULT_INVALID")
        log_safe_exception(logger, "structure_retrieve_memory_model_result", exc, public)
        return {"success": False, "error_code": public.code, "error": public.message}
