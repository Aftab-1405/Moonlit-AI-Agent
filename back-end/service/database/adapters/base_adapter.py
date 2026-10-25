"""
Base Database Adapter

Abstract base class defining the interface that all database adapters must implement.

FIX [AUDIT-2-B]: two methods have been promoted from per-adapter
implementations to first-class members of the base class:

- :meth:`quote_identifier` — returns the DBMS-specific quoted form of a
  SQL identifier (e.g. ``"table"`` for PostgreSQL, ``[table]`` for SQL
  Server, ``\\`table\\``` for MySQL, ``"table"`` for Oracle). Callers
  previously hardcoded this branching in Python; centralizing it on the
  adapter removes a class of injection bugs.

- :meth:`parse_connection_string` — returns ``(host, port, database,
  user)`` from a connection string. Six near-duplicate parsers existed
  across the codebase; the base method provides a sensible default
  (urlparse with a regex fallback) that adapters may override for
  dialect-specific syntax (Oracle ``user/pass@host:port/db``).
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from contextlib import contextmanager
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from core.security import validate_identifier

if TYPE_CHECKING:
    from psycopg2.sql import Composable


class BaseDatabaseAdapter(ABC):
    """Abstract base class for database adapters.

    Defines the contract every concrete adapter (MySQL, PostgreSQL, SQL
    Server, Oracle, SQLite) must implement. Adapters are stateless and
    thread-safe; a single instance may be shared across requests.

    The contract is split into four logical groups:

    1. **Identity** — :meth:`db_type`, :meth:`default_port`, :meth:`requires_server`.
    2. **Pool lifecycle** — :meth:`create_connection_pool`,
       :meth:`get_connection_from_pool`, :meth:`return_connection_to_pool`,
       :meth:`close_pool`.
    3. **Cursor lifecycle** — :meth:`get_cursor` (context manager that
       auto-commits on success and rolls back on error).
    4. **Schema introspection** — :meth:`get_databases_query`,
       :meth:`get_tables_query`, :meth:`get_table_schema_query`,
       :meth:`get_system_databases`, plus optional EXPLAIN / index /
       foreign-key / view helpers.
    """

    @property
    @abstractmethod
    def db_type(self) -> str:
        """Return the database type identifier (e.g., 'mysql', 'postgresql', 'sqlite')."""
        pass

    @property
    @abstractmethod
    def default_port(self) -> Optional[int]:
        """Return the default port for this database type (None for SQLite)."""
        pass

    @property
    @abstractmethod
    def requires_server(self) -> bool:
        """Return whether this database requires a server connection (False for SQLite)."""
        pass

    @abstractmethod
    def create_connection_pool(self, config: Dict) -> Any:
        """
        Create a connection pool for this database type.

        Args:
            config: Database configuration dict with keys:
                   - host (optional for SQLite)
                   - port (optional for SQLite)
                   - user (optional for SQLite)
                   - password (optional for SQLite)
                   - database (optional)
                   - Additional db-specific options

        Returns:
            Connection pool object (type varies by database)
        """
        pass

    @abstractmethod
    def get_connection_from_pool(self, pool: Any) -> Any:
        """
        Get a connection from the pool.

        Args:
            pool: Connection pool created by create_connection_pool()

        Returns:
            Database connection object
        """
        pass

    @abstractmethod
    def close_pool(self, pool: Any) -> bool:
        """
        Close a connection pool.

        Args:
            pool: Connection pool to close

        Returns:
            True if successful, False otherwise
        """
        pass

    @abstractmethod
    def return_connection_to_pool(self, pool: Any, connection: Any) -> None:
        """
        Return a connection back to the pool.
        CRITICAL: Must be called after each use to prevent pool exhaustion.

        Args:
            pool: Connection pool the connection belongs to
            connection: Database connection to return
        """
        pass

    @abstractmethod
    @contextmanager
    def get_cursor(self, connection: Any, dictionary: bool = False, buffered: bool = True):
        """
        Context manager to get a cursor from a connection.

        Args:
            connection: Database connection
            dictionary: If True, return rows as dictionaries (if supported)
            buffered: If True, fetch all rows immediately (if supported)

        Yields:
            Database cursor
        """
        pass

    @abstractmethod
    def get_databases_query(self) -> str:
        """
        Return SQL query to list all databases.

        Returns:
            SQL query string
        """
        pass

    @abstractmethod
    def get_tables_query(self) -> str | Composable:
        """
        Return SQL query to list all tables in a database.

        Returns:
            SQL query string with placeholder for database name
        """
        pass

    @abstractmethod
    def get_table_schema_query(self) -> str | Composable:
        """
        Return SQL query to get table schema information.

        Returns:
            SQL query string with placeholders for database and table names
        """
        pass

    @abstractmethod
    def get_system_databases(self) -> set:
        """
        Return set of system databases that should be filtered out.

        Returns:
            Set of system database names
        """
        pass

    @abstractmethod
    def validate_connection(self, connection: Any) -> bool:
        """
        Validate that a connection is alive.

        Args:
            connection: Database connection to validate

        Returns:
            True if connection is alive, False otherwise
        """
        pass

    # Schema Caching Methods (for AI context)

    def get_all_tables_for_cache(
        self, db_name: str, schema: str = "public"
    ) -> tuple[str | Composable, tuple[str, ...]]:
        """
        Return SQL query to get all tables for schema caching.

        Args:
            db_name: Database name (used by MySQL, ignored by PostgreSQL)
            schema: Schema name (used by PostgreSQL, ignored by MySQL)

        Returns:
            Tuple of (query_string, params_tuple)

        Note: Default implementation calls get_tables_query.
              Override for database-specific behavior.
        """
        # Default: return the standard tables query
        return self.get_tables_query(), (db_name,)

    def get_set_timeout_sql(self, timeout_seconds: int) -> Optional[str]:
        """
        Return SQL statement to set query timeout, or None if not supported.

        Args:
            timeout_seconds: Timeout in seconds

        Returns:
            SQL statement string or None
        """
        return None  # Default: no timeout support

    def get_health_check_sql(self) -> str:
        """
        Return a no-op SQL statement used to verify the connection is alive.

        FIX [EC6]: a lightweight ``SELECT 1`` (or DB-equivalent) is
        issued before every user query to fail-fast on stale pooled
        connections. Without this, a connection that the DB server
        dropped (idle-timeout, server restart, network blip) is only
        discovered when the user's actual query fails — and the broken
        connection is then *returned to the pool* and handed to the
        next query, producing cascading failures across every user
        sharing the pool.

        The default returns a MySQL/PostgreSQL/SQL Server-compatible
        ``SELECT 1``. Adapters whose dialect requires a different
        no-op (e.g. Oracle needs ``SELECT 1 FROM DUAL``) override this.

        Returns:
            A SQL string that returns exactly one row and never has
            side effects.
        """
        return "SELECT 1"

    def get_column_names_from_cursor(self, cursor: Any) -> List[str]:
        """
        Extract column names from a cursor after query execution.

        Args:
            cursor: Database cursor after executing a query

        Returns:
            List of column names
        """
        # Default implementation - subclasses should override
        if hasattr(cursor, "description") and cursor.description:
            return [desc[0] for desc in cursor.description]
        return []

    def extract_database_names(self, rows: list) -> list:
        """
        Extract database names from the result of get_databases_query.

        Args:
            rows: Raw rows from cursor.fetchall()

        Returns:
            List of database names
        """
        # Default: first column contains the database name
        return [row[0] for row in rows]

    def get_databases_for_cache(self) -> tuple:
        """
        Return SQL query and params to get all databases for caching.
        Filters out system databases.

        Returns:
            Tuple of (query_string, params_tuple)
        """
        return self.get_databases_query(), ()

    def get_batch_columns_for_tables(self, db_name: str, tables: List[str], schema: str = "public") -> tuple:
        """
        Return SQL query and params to batch fetch columns for multiple tables.

        Args:
            db_name: Database name
            tables: List of table names
            schema: Schema name (PostgreSQL)

        Returns:
            Tuple of (query_string, params_list)

        Note: Override in subclasses for database-specific syntax.
        """
        # Default: not supported, return empty
        return None, []

    # Schema Metadata Methods (for AI tools)

    def get_indexes_query(self, table_name: str, db_name: str | None = None, schema: str = "public") -> tuple:
        """
        Return SQL query and params to get indexes for a table.

        Query should return: index_name, column_name, is_unique, is_primary

        Args:
            table_name: Table name
            db_name: Database name (MySQL)
            schema: Schema name (PostgreSQL)

        Returns:
            Tuple of (query_string, params_tuple)
        """
        return None, ()  # Default: not supported

    def get_foreign_keys_query(
        self, table_name: str | None = None, db_name: str | None = None, schema: str = "public"
    ) -> tuple:
        """
        Return SQL query and params to get foreign key relationships.

        Query should return: table_name, column_name, referenced_table, referenced_column

        Args:
            table_name: Optional table name (None = all tables)
            db_name: Database name (MySQL)
            schema: Schema name (PostgreSQL)

        Returns:
            Tuple of (query_string, params_tuple)
        """
        return None, ()  # Default: not supported

    # EXPLAIN / Query-plan Methods (added for the explain_query AI tool)
    #
    # The explain_query tool exposes the DBMS query optimizer's plan for a
    # read-only SELECT/WITH statement so the AI can diagnose slow queries.
    # Two entry points are provided:
    #
    #   * ``get_explain_sql(query)`` — returns the single SQL string the
    #     executor should run. Used by MySQL and PostgreSQL where EXPLAIN is
    #     a self-contained statement that returns plan rows directly.
    #
    #   * ``run_explain(cursor, query)`` — override on adapters whose dialect
    #     needs multi-statement orchestration (SQL Server SET SHOWPLAN_TEXT
    #     ON/OFF, Oracle EXPLAIN PLAN + DBMS_XPLAN.DISPLAY). The default
    #     implementation runs ``get_explain_sql(query)`` and returns
    #     ``cursor.fetchall()``.
    #
    # ``explain_format`` is a short string tag the executor returns to the
    # AI so it knows how to interpret the plan rows ("json", "text", or
    # "tabular"). The default is "tabular" (plain EXPLAIN with one row per
    # plan node).

    @property
    def explain_format(self) -> str:
        """Return the format tag for this adapter's EXPLAIN output.

        Default is ``"tabular"`` (one row per plan node). Override in
        subclasses whose EXPLAIN returns JSON or formatted text.
        """
        return "tabular"

    def get_explain_sql(self, query: str) -> str:
        """Return the SQL statement that produces an EXPLAIN plan for ``query``.

        The default wraps ``query`` in a plain ``EXPLAIN``. Subclasses
        override to use DBMS-specific richer formats (e.g. JSON, ANALYZE,
        SHOWPLAN_TEXT). The caller is responsible for validating that
        ``query`` is a read-only SELECT/WITH before invoking this method.

        Args:
            query: A validated read-only SQL SELECT/WITH statement.

        Returns:
            A SQL string that, when executed, returns the plan rows.
        """
        return f"EXPLAIN {query}"

    def run_explain(self, cursor: Any, query: str) -> list:
        """Execute the EXPLAIN plan for ``query`` and return the raw rows.

        Default implementation runs ``get_explain_sql(query)`` and returns
        ``cursor.fetchall()``. Override in subclasses whose dialect requires
        multi-statement orchestration (SQL Server SET SHOWPLAN_TEXT ON/OFF,
        Oracle EXPLAIN PLAN + DBMS_XPLAN.DISPLAY).

        Args:
            cursor: An open DB-API cursor.
            query: A validated read-only SQL SELECT/WITH statement.

        Returns:
            List of raw plan rows (cursor.fetchall() output).
        """
        cursor.execute(self.get_explain_sql(query))
        return cursor.fetchall()

    # Table-details Methods (added for the get_table_details AI tool)
    #
    # ``get_table_details_query`` returns a richer schema query than the
    # existing ``get_table_schema_query``: in addition to column name /
    # type / nullable / default, it includes is_primary_key, is_unique, and
    # character_maximum_length. The result powers the get_table_details AI
    # tool, which the agent uses to write type-correct SQL without having
    # to infer column constraints from naming conventions.

    def get_table_details_query(self, table_name: str, db_name: str | None = None, schema: str = "public") -> tuple:
        """Return SQL query and params for a rich per-column schema dump.

        Query should return one row per column with these positional
        columns (in order):
            name, data_type, is_nullable, default_value,
            is_primary_key, is_unique, max_length

        Args:
            table_name: Table to inspect.
            db_name: Database name (MySQL / SQL Server).
            schema: Schema name (PostgreSQL / SQL Server).

        Returns:
            Tuple of (query_string, params_tuple_or_list). Default
            implementation returns ``(None, ())`` meaning "not supported";
            the executor surfaces a clear error to the AI in that case.
        """
        return None, ()  # Default: not supported

    # Views Introspection Methods (added for the list_views AI tool)
    #
    # ``get_views`` returns the (sql, params) to list regular views in the
    # connected schema/database. ``get_materialized_views`` returns the
    # equivalent for materialized views, or ``None`` when the DBMS does not
    # support them. The executor merges both into a single list_views tool
    # response so the AI can discover view definitions alongside base tables
    # (the existing get_schema_overview / get_tables_query filters by
    # ``table_type = 'BASE TABLE'`` only, leaving views invisible).

    def get_views(self, schema: str | None = None, db_name: str | None = None) -> tuple:
        """Return SQL query and params to list regular views.

        Args:
            schema: Schema name (PostgreSQL / SQL Server) or owner (Oracle).
            db_name: Database name (MySQL).

        Returns:
            Tuple of (query_string, params_tuple). Default returns
            ``(None, ())`` meaning "not supported".
        """
        return None, ()  # Default: not supported

    def get_materialized_views(self, schema: str | None = None, db_name: str | None = None):
        """Return SQL query and params to list materialized views, or None.

        Args:
            schema: Schema name (PostgreSQL).
            db_name: Database name (unused on most adapters).

        Returns:
            Tuple of (query_string, params_tuple) or ``None`` when the
            DBMS does not support materialized views. Default returns
            ``None``.
        """
        return None  # Default: materialized views not supported

    # Identifier quoting & connection-string parsing
    # (FIX [AUDIT-2-B]: promoted from per-adapter code to the base class)
    #
    # ``quote_identifier`` returns the DBMS-specific quoted form of a SQL
    # identifier. Centralizing this on the adapter removes a class of
    # injection bugs (callers previously hardcoded the quoting character
    # in Python and could forget to validate the identifier first).
    #
    # ``parse_connection_string`` returns ``(host, port, database, user)``
    # from a connection string. Six near-duplicate parsers existed across
    # the codebase; the base method provides a sensible default
    # (urlparse with a regex fallback) that adapters may override for
    # dialect-specific syntax.

    #: The character(s) used to quote identifiers in this DBMS. Subclasses
    #: override this constant (e.g. ``"``, ``[``, ``\\````). The default
    #: is the ANSI SQL double-quote.
    IDENTIFIER_QUOTE_OPEN: str = '"'
    IDENTIFIER_QUOTE_CLOSE: str = '"'

    def quote_identifier(self, name: str) -> str:
        """Return the DBMS-specific quoted form of a SQL identifier.

        Validates the identifier against the strict pattern
        ``[A-Za-z_][A-Za-z0-9_]*(\\.[A-Za-z_][A-Za-z0-9_]*)?`` before
        quoting, so this method can never produce an injection vector
        even when called with user-controlled input.

        Args:
            name: Identifier to quote (may include a single
                ``schema.table`` qualifier).

        Returns:
            The quoted identifier, with each component wrapped in the
            DBMS-specific quote characters. For a ``schema.table``
            qualifier, each component is quoted independently.

        Raises:
            ValueError: If ``name`` fails identifier validation.
        """
        validate_identifier(name, kind="identifier")
        # Split on the first dot so ``schema.table`` is quoted as
        # ``"schema"."table"`` rather than ``"schema.table"`` (the latter
        # would create a single identifier with a literal dot, which is
        # legal but not what callers intend).
        parts = name.split(".", maxsplit=1)
        quoted = ".".join(f"{self.IDENTIFIER_QUOTE_OPEN}{p}{self.IDENTIFIER_QUOTE_CLOSE}" for p in parts)
        return quoted

    def parse_connection_string(
        self, conn_str: str
    ) -> Tuple[Optional[str], Optional[int], Optional[str], Optional[str]]:
        """Parse a connection string into ``(host, port, database, user)``.

        Default implementation uses :func:`urllib.parse.urlparse` with a
        regex fallback for dialect-specific syntax (Oracle
        ``user/pass@host:port/db``). Subclasses may override for
        dialect-specific parsing.

        Args:
            conn_str: Connection string (e.g.
                ``mysql://user:pass@host:3306/db``).

        Returns:
            Tuple of ``(host, port, database, user)``. Any component
            that cannot be parsed is ``None``.
        """
        if not conn_str:
            return None, None, None, None
        # urlparse succeeds (does not raise) even on non-URL input like
        # ``user/pass@host:1521/orcl`` — it treats the whole string as
        # the path. Only use the urlparse result when a scheme is
        # present (``scheme://...``); otherwise fall through to the
        # regex fallback.
        try:
            parsed = urlparse(conn_str)
            if parsed.scheme:
                host = parsed.hostname
                port = parsed.port
                database = (parsed.path or "/").lstrip("/") or None
                user = parsed.username
                return host, port, database, user
        except Exception:
            pass
        # Regex fallback for non-URL syntax (e.g. Oracle EZ-connect
        # ``user/pass@host:port/db``). The credentials group allows
        # ``/`` so ``user/pass`` is captured as a single user field.
        match = re.match(
            r"^(?:([^@]+)@)?([^:/]+)(?::(\d+))?(?:/(.+))?$",
            conn_str,
        )
        if not match:
            return None, None, None, None
        user, host, port_str, database = match.groups()
        port = int(port_str) if port_str else None
        return host, port, database, user
