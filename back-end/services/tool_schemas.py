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

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator


# =============================================================================
# TOOL ARGUMENT SCHEMAS (Input validation)
# =============================================================================


class BaseToolArgs(BaseModel):
    """Base class for all tool arguments."""

    rationale: str = Field(
        ..., description="A natural, friendly sentence explaining what the AI is doing"
    )


class GetConnectionStatusArgs(BaseToolArgs):
    """Arguments for get_connection_status tool."""

    pass  # Only requires rationale


class GetDatabaseListArgs(BaseToolArgs):
    """Arguments for get_database_list tool."""

    pass  # Only requires rationale


class GetDatabaseSchemaArgs(BaseToolArgs):
    """Arguments for get_database_schema tool."""

    database: Optional[str] = Field(
        None, description="Database name. If not provided, uses current database."
    )


class GetTableColumnsArgs(BaseToolArgs):
    """Arguments for get_table_columns tool."""

    table_name: str = Field(..., description="Name of the table to get columns for.")


class ExecuteQueryArgs(BaseToolArgs):
    """Arguments for execute_query tool."""

    query: str = Field(..., description="SQL SELECT query to execute.")
    max_rows: Optional[int] = Field(
        100, description="Maximum number of rows to return.", ge=1, le=1000
    )

    @field_validator("query")
    @classmethod
    def validate_query_is_read_only(cls, v: str) -> str:
        """
        Ensure query is read-only by blocking mutation keywords.

        This is database-agnostic - works with PostgreSQL, MySQL, SQL Server, Oracle, SQLite.
        Instead of whitelisting SELECT/WITH, we blacklist dangerous operations.
        """
        normalized = v.strip().upper()

        # Remove string literals to avoid false positives (e.g., "INSERT" as data)
        # Simple approach: replace quoted strings with empty
        import re

        cleaned = re.sub(r"'[^']*'", "", normalized)  # Remove single-quoted strings
        cleaned = re.sub(r'"[^"]*"', "", cleaned)  # Remove double-quoted strings

        # Dangerous keywords that indicate write operations
        DANGEROUS_KEYWORDS = {
            "INSERT",
            "UPDATE",
            "DELETE",
            "DROP",
            "CREATE",
            "ALTER",
            "TRUNCATE",
            "GRANT",
            "REVOKE",
            "EXEC",
            "EXECUTE",
        }

        # Check for dangerous keywords as whole words
        words = set(re.findall(r"\b[A-Z_]+\b", cleaned))
        dangerous_found = words & DANGEROUS_KEYWORDS

        if dangerous_found:
            raise ValueError(
                f"Query contains blocked keywords: {', '.join(dangerous_found)}. "
                "Only read-only queries are allowed."
            )

        return v


class GetTableIndexesArgs(BaseToolArgs):
    """Arguments for get_table_indexes tool."""

    table_name: str = Field(..., description="Name of the table to get indexes for.")


class GetForeignKeysArgs(BaseToolArgs):
    """Arguments for get_foreign_keys tool."""

    table_name: Optional[str] = Field(
        None,
        description="Optional table name. If not provided, returns all FK relationships.",
    )


# Mapping of tool names to their argument schemas
TOOL_ARG_SCHEMAS = {
    "get_connection_status": GetConnectionStatusArgs,
    "get_database_list": GetDatabaseListArgs,
    "get_database_schema": GetDatabaseSchemaArgs,
    "get_table_columns": GetTableColumnsArgs,
    "execute_query": ExecuteQueryArgs,
    "get_table_indexes": GetTableIndexesArgs,
    "get_foreign_keys": GetForeignKeysArgs,
}


# =============================================================================
# TOOL RESULT SCHEMAS (Output structure for frontend)
# =============================================================================


class ToolResultBase(BaseModel):
    """Base class for all tool results."""

    success: bool = True
    error: Optional[str] = None


class ConnectionStatusResult(ToolResultBase):
    """Structured result for connection status."""

    connected: bool = False
    db_type: Optional[str] = None
    database: Optional[str] = None
    host: Optional[str] = None
    is_remote: Optional[bool] = None
    schema: Optional[str] = None


class DatabaseListResult(ToolResultBase):
    """Structured result for database list."""

    databases: List[str] = []
    current_database: Optional[str] = None
    count: int = 0


class SchemaResult(ToolResultBase):
    """Structured result for database schema."""

    database: Optional[str] = None
    table_count: int = 0
    tables: List[str] = []


class TableColumnsResult(ToolResultBase):
    """Structured result for table columns."""

    table: Optional[str] = None
    column_count: int = 0
    columns: List[str] = []


class QueryResult(ToolResultBase):
    """Structured result for query execution.

    Full data is included for UI streaming (SQL editor/results panel).
    LLM context should consume preview-only summaries to control token usage.
    """

    data: List[Dict[str, Any]] = []  # Full rows for UI/canvas rendering
    row_count: int = 0  # Actual rows returned (after truncation)
    total_rows: int = 0  # Total rows in DB before truncation
    column_count: int = 0
    columns: List[str] = []
    truncated: bool = False
    preview: List[Dict[str, Any]] = []  # First 5 rows for LLM context (token-efficient)
    preview_row_count: int = 0
    preview_is_partial: bool = False
    full_result_location: str = "SQL editor results pane/canvas"
    preview_note: Optional[str] = None


class TableIndexesResult(ToolResultBase):
    """Structured result for table indexes."""

    table: Optional[str] = None
    count: int = 0
    indexes: List[Dict[str, Any]] = []


class ForeignKeysResult(ToolResultBase):
    """Structured result for foreign key relationships."""

    table: Optional[str] = None
    count: int = 0
    foreign_keys: List[Dict[str, Any]] = []


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


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
        return {"success": False, "error": raw_result["error"]}

    try:
        if tool_name == "get_connection_status":
            return ConnectionStatusResult(
                connected=raw_result.get("connected", False),
                db_type=raw_result.get("db_type"),
                database=raw_result.get("database"),
                host=raw_result.get("host"),
                is_remote=raw_result.get("is_remote"),
                schema=raw_result.get("schema"),
            ).model_dump()

        elif tool_name == "get_database_list":
            dbs = raw_result.get("databases", [])
            return DatabaseListResult(
                databases=dbs,
                current_database=raw_result.get("current_database"),
                count=len(dbs),
            ).model_dump()

        elif tool_name == "get_database_schema":
            tables = raw_result.get("tables", [])
            return SchemaResult(
                database=raw_result.get("database"),
                table_count=len(tables),
                tables=tables[:10] if len(tables) > 10 else tables,  # Limit for display
            ).model_dump()

        elif tool_name == "get_table_columns":
            cols = raw_result.get("columns", [])
            # Handle both list of strings and list of dicts
            if cols and isinstance(cols[0], dict):
                col_names = [c.get("name", str(c)) for c in cols]
            else:
                col_names = cols
            return TableColumnsResult(
                table=raw_result.get("table"),
                column_count=len(col_names),
                columns=col_names,
            ).model_dump()

        elif tool_name == "execute_query":
            # Include full data for UI panels, plus preview for token-efficient context.
            data = raw_result.get("data", [])
            columns = raw_result.get("columns", [])
            row_count = raw_result.get("row_count", len(data))
            total_rows = raw_result.get("total_rows", row_count)
            preview_rows = data[:5]
            preview_row_count = len(preview_rows)
            preview_is_partial = max(row_count, total_rows) > preview_row_count
            preview_note = (
                "Preview only. Complete query results are available in the SQL editor results pane/canvas."
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
                preview=preview_rows,  # 5 rows for LLM context summary
                preview_row_count=preview_row_count,
                preview_is_partial=preview_is_partial,
                full_result_location="SQL editor results pane/canvas",
                preview_note=preview_note,
            ).model_dump()

        elif tool_name == "get_table_indexes":
            indexes = raw_result.get("indexes", [])
            return TableIndexesResult(
                table=raw_result.get("table"), count=len(indexes), indexes=indexes
            ).model_dump()

        elif tool_name == "get_foreign_keys":
            fks = raw_result.get("foreign_keys", [])
            return ForeignKeysResult(
                table=raw_result.get("table"), count=len(fks), foreign_keys=fks
            ).model_dump()

        else:
            # Unknown tool - return as-is with success flag
            return {"success": True, "data": raw_result}

    except Exception as e:
        # If structuring fails, return raw with error note
        return {"success": True, "data": raw_result, "_structuring_error": str(e)}
