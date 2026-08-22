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

from pydantic import BaseModel, ConfigDict, Field, field_validator

from core.errors import log_safe_exception, public_error_for_code, public_tool_error

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

    pass


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

        analysis = DatabaseSecurity.analyze_sql_query(v)
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

        analysis = DatabaseSecurity.analyze_sql_query(v)
        if not analysis["is_safe"]:
            reason = "; ".join(analysis["warnings"]) or "query is not read-only"
            raise ValueError(reason)
        return v


class GetTableDetailsArgs(BaseToolArgs):
    """Arguments for the get_table_details tool."""

    table_name: str = Field(..., description="Name of the table to fetch detailed column metadata for.")


class GetTableRowCountArgs(BaseToolArgs):
    """Arguments for the get_table_row_count tool."""

    table_name: str = Field(..., description="Name of the table to count rows in.")


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
    "get_connection_status": GetConnectionStatusArgs,
    "get_database_list": GetDatabaseListArgs,
    "execute_query": ExecuteQueryArgs,
    "get_table_indexes": GetTableIndexesArgs,
    "analyze_query_result": AnalyzeQueryResultArgs,
    "get_schema_overview": GetSchemaOverviewArgs,
    # New high-value DB tools.
    "explain_query": ExplainQueryArgs,
    "get_table_details": GetTableDetailsArgs,
    "get_table_row_count": GetTableRowCountArgs,
    "get_foreign_keys": GetForeignKeysArgs,
    "list_views": ListViewsArgs,
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


class GetTableRowCountResult(ToolResultBase):
    """Structured result for the get_table_row_count tool."""

    table: Optional[str] = None
    row_count: int = 0
    is_estimate: bool = False


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


class UiActionResult(ToolResultBase):
    """Structured result for UI action tools."""

    action: str
    requiresConfirmation: bool = False


# CENH [4]: Result schema for the `retrieve_memory` tool. The full memory
# string is included for both UI and LLM context (it is already token-budget
# bounded by the VAMP retrieval pipeline, so no separate preview is needed).
class RetrieveMemoryResult(ToolResultBase):
    """Structured result for the retrieve_memory tool."""

    memories: str = ""
    found: bool = False


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
    if "error" in raw_result:
        public = public_error_for_code(raw_result.get("error_code"))
        return {
            "success": False,
            "error_code": public.code,
            "error": public.message,
        }

    try:
        if tool_name == "get_connection_status":
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

        elif tool_name == "get_table_row_count":
            return GetTableRowCountResult(
                table=raw_result.get("table"),
                row_count=int(raw_result.get("row_count", 0) or 0),
                is_estimate=bool(raw_result.get("is_estimate", False)),
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
            ).model_dump()
            # Preserve the compact legacy shape unless confirmation metadata matters.
            if not structured["requiresConfirmation"]:
                structured.pop("requiresConfirmation", None)
            structured.pop("error", None)
            return structured

        elif tool_name == "retrieve_memory":
            # CENH [4]: Structure the retrieve_memory result. The full
            # memory string is already token-budgeted by the VAMP pipeline
            # so we pass it through verbatim (no preview truncation).
            memories = str(raw_result.get("memories", "") or "")
            return RetrieveMemoryResult(
                memories=memories,
                found=bool(raw_result.get("found", bool(memories))),
                success=bool(raw_result.get("success", True)),
                error=raw_result.get("error"),
            ).model_dump()

        else:
            # Unknown tool - return as-is with success flag
            return {"success": True, "data": raw_result}

    except Exception as e:
        public = public_tool_error(
            "TOOL_RESULT_INVALID",
            "Tool result could not be structured.",
        )
        log_safe_exception(logger, "structure_tool_result", e, public)
        return {
            "success": False,
            "error_code": public.code,
            "error": public.message,
        }
