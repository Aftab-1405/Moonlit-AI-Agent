"""Database security utilities — read-only query validation and identifier rules.

This module provides:

1. **Identifier validation** for table / database / column names that flow
   into dynamic SQL. The previous regex (``[A-Za-z0-9_.\\-]{1,128}``) was
   too permissive: it accepted hyphens, leading digits, and all-numeric
   names — all of which require DBMS-specific quoting and are a known
   SQL-injection vector when interpolated. The new rule
   (``[A-Za-z_][A-Za-z0-9_]*(\\.[A-Za-z_][A-Za-z0-9_]*)?``) matches only
   safe SQL identifiers and an optional single ``schema.table`` qualifier.
2. **Read-only query analysis** via ``sqlglot``: parses the SQL, rejects
   multi-statement input, allows only ``SELECT`` / ``WITH`` roots, and
   blocks any DDL/DML node anywhere in the parse tree.
3. **Safe query templates** for the few places the codebase still builds
   SQL from validated identifiers.

All public methods are static and cached where the input space is small.
"""

import logging
import re
from functools import lru_cache
from types import MappingProxyType
from typing import Mapping

from core.errors import log_safe_exception, public_tool_error
from core.security import is_valid_identifier

logger = logging.getLogger(__name__)

_SQLGLOT_DIALECTS: Mapping[str, str] = MappingProxyType(
    {
        "mysql": "mysql",
        "postgresql": "postgres",
        "sqlserver": "tsql",
        "oracle": "oracle",
    }
)

_PROHIBITED_FUNCTION_REASONS: Mapping[str, str] = MappingProxyType(
    {
        "pg_read_file": "file access",
        "pg_read_binary_file": "file access",
        "pg_ls_dir": "file access",
        "load_file": "file access",
        "pg_sleep": "resource delay",
        "sleep": "resource delay",
        "benchmark": "resource exhaustion",
        "dblink_exec": "external database access",
        "openrowset": "external database access",
        "opendatasource": "external database access",
        "openquery": "external database access",
        "sys_exec": "external code execution",
        "sys_eval": "external code execution",
        "xp_cmdshell": "external code execution",
        "sp_execute_external_script": "external code execution",
        "runjava": "external code execution",
        "request": "network access",
        "get_lock": "database locking",
        "pg_terminate_backend": "administrative control",
        "create_job": "administrative control",
    }
)

_SAFE_ANONYMOUS_FUNCTIONS: Mapping[str, frozenset[str]] = MappingProxyType(
    {
        "mysql": frozenset({"now"}),
        "postgresql": frozenset({"age"}),
        "sqlserver": frozenset({"isdate"}),
        "oracle": frozenset({"numtodsinterval"}),
    }
)

_GENERIC_SAFE_ANONYMOUS_FUNCTIONS = frozenset().union(
    *_SAFE_ANONYMOUS_FUNCTIONS.values()
)

_SQLSERVER_STATE_CHANGING_LOCK_HINTS = frozenset(
    {
        "holdlock",
        "paglock",
        "readcommittedlock",
        "rowlock",
        "serializable",
        "tablock",
        "tablockx",
        "updlock",
        "xlock",
    }
)
_SEQUENCE_ADVANCEMENT_WARNING = (
    "Sequence advancement is prohibited by read-only policy"
)
_SESSION_ASSIGNMENT_WARNING = "Session assignment is prohibited by read-only policy"
_STATE_CHANGING_LOCK_WARNING = (
    "State-changing table lock hint is prohibited by read-only policy"
)


class DatabaseSecurity:
    """Database security utilities — read-only query validation and identifier rules."""

    # FIX [AUDIT-2-B]: the previous patterns allowed hyphens, leading
    # digits, and pure-numeric names — all of which are SQL-injection
    # vectors when interpolated into dynamic SQL. The new patterns match
    # only safe SQL identifiers and an optional single ``schema.table``
    # qualifier. ``core.security.is_valid_identifier`` is the single
    # source of truth so the rule is consistent across the codebase.
    _TABLE_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$")
    _DATABASE_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$")
    _COLUMN_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$")

    @staticmethod
    @lru_cache(maxsize=256)
    def validate_table_name(table_name: str) -> str:
        """Validate a SQL table name.

        Args:
            table_name: Table name to validate. May include a single
                ``schema.table`` qualifier.

        Returns:
            The validated table name (unchanged).

        Raises:
            ValueError: If the name is empty, longer than 128 characters,
                or contains characters outside the safe set.
        """
        if not table_name:
            raise ValueError("Table name cannot be empty")
        if not is_valid_identifier(table_name, max_length=128):
            raise ValueError(f"Invalid table name: {table_name}")
        return table_name

    @staticmethod
    @lru_cache(maxsize=128)
    def validate_database_name(db_name: str) -> str:
        """Validate a SQL database name.

        Args:
            db_name: Database name to validate.

        Returns:
            The validated database name (unchanged).

        Raises:
            ValueError: If the name is empty, longer than 128 characters,
                or contains characters outside the safe set.
        """
        if not db_name:
            raise ValueError("Database name cannot be empty")
        if not is_valid_identifier(db_name, max_length=128):
            raise ValueError(f"Invalid database name: {db_name}")
        return db_name

    @staticmethod
    @lru_cache(maxsize=512)
    def validate_column_name(column_name: str) -> str:
        """Validate a SQL column name.

        Args:
            column_name: Column name to validate. May include a single
                ``table.column`` qualifier.

        Returns:
            The validated column name (unchanged).

        Raises:
            ValueError: If the name is empty, longer than 128 characters,
                or contains characters outside the safe set.
        """
        if not column_name:
            raise ValueError("Column name cannot be empty")
        if not is_valid_identifier(column_name, max_length=128):
            raise ValueError(f"Invalid column name: {column_name}")
        return column_name

    @staticmethod
    def analyze_sql_query(query: str, dialect: str | None = None) -> dict:
        """Parse and validate exactly one read-only SQL statement.

        Args:
            query: SQL string to analyze.
            dialect: Application database type. ``None`` is reserved for the
                early tool-schema gate and uses the union of supported safe
                anonymous functions.

        Returns:
            Dict with keys ``is_safe`` (bool), ``warnings`` (list[str]),
            ``query_type`` (``"SELECT"`` / ``"WITH"`` / ``None``), and
            ``tables_accessed`` (list[str]).
        """
        if not query:
            raise ValueError("Query cannot be empty")

        analysis = {
            "is_safe": False,
            "warnings": [],
            "query_type": None,
            "tables_accessed": [],
        }
        if dialect is None:
            parser_dialect = None
            safe_anonymous_functions = _GENERIC_SAFE_ANONYMOUS_FUNCTIONS
        else:
            parser_dialect = _SQLGLOT_DIALECTS.get(dialect)
            if parser_dialect is None:
                analysis["warnings"].append(
                    "Database dialect is not supported by SQL security policy"
                )
                return analysis
            safe_anonymous_functions = _SAFE_ANONYMOUS_FUNCTIONS[dialect]

        try:
            import sqlglot
            from sqlglot import expressions as exp

            statements = [
                item
                for item in sqlglot.parse(query, read=parser_dialect)
                if item is not None
            ]
            if len(statements) != 1:
                analysis["warnings"].append("Exactly one SQL statement is required")
                return analysis

            statement = statements[0]
            allowed_roots = (exp.Select, exp.Union, exp.Intersect, exp.Except)
            if not isinstance(statement, allowed_roots):
                analysis["warnings"].append(
                    f"Only read-only SELECT/WITH queries are allowed, not {type(statement).__name__}"
                )
                return analysis

            blocked_types = tuple(
                node_type
                for node_type in (
                    getattr(exp, name, None)
                    for name in (
                        "Insert",
                        "Update",
                        "Delete",
                        "Drop",
                        "Alter",
                        "Create",
                        "TruncateTable",
                        "Command",
                        "Copy",
                        "Into",
                        "Lock",
                        "Merge",
                        "Grant",
                        "Revoke",
                    )
                )
                if node_type is not None
            )
            blocked_nodes = [type(node).__name__ for node in statement.walk() if isinstance(node, blocked_types)]
            if blocked_nodes:
                analysis["warnings"].append("Blocked operation detected: " + ", ".join(sorted(set(blocked_nodes))))
                return analysis

            if dialect == "sqlserver" and any(
                statement.find_all(exp.NextValueFor)
            ):
                analysis["warnings"].append(_SEQUENCE_ADVANCEMENT_WARNING)
                return analysis

            if dialect == "oracle":
                for column in statement.find_all(exp.Column):
                    identifier = column.this
                    if (
                        column.table
                        and isinstance(identifier, exp.Identifier)
                        and not identifier.args.get("quoted", False)
                        and column.name.casefold() == "nextval"
                    ):
                        analysis["warnings"].append(_SEQUENCE_ADVANCEMENT_WARNING)
                        return analysis

            if dialect == "mysql":
                for assignment in statement.find_all(exp.PropertyEQ):
                    if isinstance(assignment.this, exp.Parameter):
                        analysis["warnings"].append(_SESSION_ASSIGNMENT_WARNING)
                        return analysis

            if dialect == "sqlserver":
                for hint in statement.find_all(exp.WithTableHint):
                    hint_names = {
                        str(node.this).strip().casefold()
                        for node in hint.find_all(exp.Var)
                    }
                    if hint_names & _SQLSERVER_STATE_CHANGING_LOCK_HINTS:
                        analysis["warnings"].append(_STATE_CHANGING_LOCK_WARNING)
                        return analysis

            for node in statement.find_all(exp.Func):
                function_name = (
                    node.name if isinstance(node, exp.Anonymous) else node.sql_name()
                )
                normalized_name = str(function_name).strip().casefold()
                prohibited_reason = _PROHIBITED_FUNCTION_REASONS.get(normalized_name)
                if prohibited_reason is not None:
                    analysis["warnings"].append(
                        f"Function {normalized_name} is prohibited: {prohibited_reason}"
                    )
                    return analysis
                if (
                    isinstance(node, exp.Anonymous)
                    and normalized_name not in safe_anonymous_functions
                ):
                    analysis["warnings"].append(
                        f"Function {normalized_name} is not allowed: "
                        "unapproved anonymous function"
                    )
                    return analysis

            analysis["query_type"] = "WITH" if statement.args.get("with_") else "SELECT"
            analysis["tables_accessed"] = [table.name for table in statement.find_all(exp.Table) if table.name]
            analysis["is_safe"] = True
        except Exception as exc:
            public = public_tool_error(
                "SQL_PARSE_FAILED",
                "SQL could not be safely parsed",
            )
            log_safe_exception(logger, "analyze_sql_query", exc, public)
            analysis["warnings"].append(public.message)

        return analysis

    @staticmethod
    @lru_cache(maxsize=64)
    def get_safe_query_template(query_type: str, table_name: str) -> str:
        """Generate a cached safe query template.

        Args:
            query_type: ``"SELECT"`` or ``"COUNT"``.
            table_name: Validated table name.

        Returns:
            SQL template string with ``{columns}`` / ``{conditions}``
            placeholders. Empty string for unknown query types.
        """
        validated_table = DatabaseSecurity.validate_table_name(table_name)

        # Only SELECT templates are provided
        templates = {
            "SELECT": f"SELECT {{columns}} FROM `{validated_table}` {{conditions}}",
            "COUNT": f"SELECT COUNT(*) FROM `{validated_table}` {{conditions}}",
        }

        return templates.get(query_type, "")

    @staticmethod
    def clear_cache():
        """Clear all validation caches.

        Call this when the underlying DB schema changes and previously
        rejected identifiers may now be valid (or vice versa).
        """
        DatabaseSecurity.validate_table_name.cache_clear()
        DatabaseSecurity.validate_database_name.cache_clear()
        DatabaseSecurity.validate_column_name.cache_clear()
        DatabaseSecurity.get_safe_query_template.cache_clear()
