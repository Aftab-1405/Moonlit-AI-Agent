"""
SQL Server Database Adapter

Implements database operations for SQL Server using pymssql.
Supports local SQL Server instances and cloud providers (Azure SQL, AWS RDS, Google Cloud SQL, Somee.com).

Pooling note (FIX [L9])
-----------------------
pymssql has no first-class pool object, so this adapter's "pool" is the
config dict itself: each ``get_connection_from_pool`` call opens a fresh
TCP connection. ``return_connection_to_pool`` closes the connection.
Previously ``close_pool`` was a no-op, so a disconnect left every
in-flight connection open until GC. We now track open connections in a
set on the pool dict and ``close_pool`` closes them all before returning.

Query timeout (FIX [EC3])
-------------------------
SQL Server does not have a single ``SET QUERY_TIMEOUT`` statement. We
enforce a server-side lock-wait timeout via ``SET LOCK_TIMEOUT <ms>``
(see ``get_set_timeout_sql``), executed before each user query. The
asyncio ``wait_for`` cancel in the caller is the second line of defense
for CPU-bound queries that pass the lock-wait phase. Without the
``SET LOCK_TIMEOUT`` call, cancelling the Python coroutine left the
underlying DB thread alive and held the pool connection until SQL Server
itself finished — see ``operations.execute_sql_query`` and
``ai_tool_executor._execute_query_with_db_config`` for the call sites.
"""

import logging
import threading
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

from config import get_config
from core.errors import log_safe_exception, public_database_error

from .base_adapter import BaseDatabaseAdapter

logger = logging.getLogger(__name__)
Config = get_config()


class SQLServerAdapter(BaseDatabaseAdapter):
    """SQL Server database adapter using pymssql.

    Uses square-bracket (``[name]``) quoting for identifiers per the
    T-SQL dialect.
    """

    # FIX [AUDIT-2-B]: SQL Server uses square brackets for identifier quoting.
    IDENTIFIER_QUOTE_OPEN = "["
    IDENTIFIER_QUOTE_CLOSE = "]"

    @property
    def db_type(self) -> str:
        return "sqlserver"

    @property
    def default_port(self) -> Optional[int]:
        return Config.DEFAULT_SQLSERVER_PORT

    @property
    def requires_server(self) -> bool:
        return True

    def create_connection_pool(self, config: Dict) -> Any:
        """
        Create SQL Server connection pool.

        Supports:
        1. Connection string (for Azure SQL, AWS RDS, etc.)
        2. Individual parameters (host, port, user, password, database)

        Note: pymssql doesn't have built-in pooling, so we create a connection factory.

        FIX [L9]: the returned "pool" is the config dict augmented with an
        ``_open_connections`` set (protected by ``_lock``) so that
        ``close_pool`` can actually close in-flight connections rather than
        being a no-op.
        """

        try:
            import re

            connection_string = config.get("connection_string")

            if connection_string:
                logger.info("Parsing SQL Server connection string for pymssql")

                db_match = re.search(
                    r"(?:Database|Initial Catalog)=([^;]+)",
                    connection_string,
                    re.IGNORECASE,
                )
                server_match = re.search(r"(?:Server|Data Source)=([^;,]+)", connection_string, re.IGNORECASE)
                user_match = re.search(r"(?:UID|User ID)=([^;]+)", connection_string, re.IGNORECASE)
                pwd_match = re.search(r"(?:PWD|Password)=([^;]+)", connection_string, re.IGNORECASE)

                config["host"] = server_match.group(1).strip() if server_match else Config.DEFAULT_SQLSERVER_HOST
                config["database"] = db_match.group(1).strip() if db_match else Config.DEFAULT_SQLSERVER_DATABASE
                config["user"] = user_match.group(1).strip() if user_match else ""
                config["password"] = pwd_match.group(1).strip() if pwd_match else ""

            else:
                logger.info("Creating SQL Server connection config")

            # FIX [L9]: track open connections so close_pool can close them.
            config["_open_connections"] = set()
            config["_lock"] = threading.Lock()
            return config

        except Exception as err:
            log_safe_exception(logger, "create_sqlserver_config", err, public_database_error(err))
            raise

    def get_connection_from_pool(self, pool: Any) -> Any:
        """Get SQL Server connection from pool (creates new connection).

        FIX [L9]: register the new connection in the pool's
        ``_open_connections`` set so ``close_pool`` can close it.
        """
        import pymssql

        try:
            host = pool.get("host", Config.DEFAULT_SQLSERVER_HOST)
            port = pool.get("port", Config.DEFAULT_SQLSERVER_PORT)
            user = pool.get("user", "")
            password = pool.get("password", "")
            database = pool.get("database", Config.DEFAULT_SQLSERVER_DATABASE)

            connection = pymssql.connect(
                server=host,
                port=str(port) if port else str(Config.DEFAULT_SQLSERVER_PORT),
                user=user,
                password=password,
                database=database,
                timeout=Config.DB_CONNECT_TIMEOUT_SECONDS,
                login_timeout=Config.DB_LOGIN_TIMEOUT_SECONDS,
            )
            # FIX [L9]: track this connection so close_pool can close it.
            with pool["_lock"]:
                pool["_open_connections"].add(connection)
            return connection
        except Exception as err:
            log_safe_exception(logger, "acquire_sqlserver_connection", err, public_database_error(err))
            raise

    def close_pool(self, pool: Any) -> bool:
        """
        Close SQL Server connection pool.

        FIX [L9]: previously a no-op (``return True``), which leaked every
        in-flight connection on disconnect. We now iterate the tracked
        ``_open_connections`` set and close each one best-effort before
        returning.
        """
        closed_count = 0
        # FIX [L9]: snapshot under the lock, close outside the lock to
        # avoid holding it during a possibly-slow network close.
        with pool.get("_lock", threading.Lock()):
            open_conns = list(pool.get("_open_connections", set()))
            pool["_open_connections"].clear()
        for conn in open_conns:
            try:
                conn.close()
                closed_count += 1
            except Exception as close_err:
                log_safe_exception(
                    logger,
                    "close_sqlserver_connection",
                    close_err,
                    public_database_error(close_err),
                    level=logging.DEBUG,
                )
        logger.info(f"SQL Server pool closed ({closed_count} connection(s) shut down)")
        return True

    def return_connection_to_pool(self, pool: Any, connection: Any) -> None:
        """Return SQL Server connection back to pool (closes connection).

        FIX [L9]: also discard the connection from the ``_open_connections``
        tracker so close_pool does not try to close an already-closed
        connection.
        """
        try:
            if connection:
                connection.close()
        except Exception as err:
            log_safe_exception(
                logger,
                "return_sqlserver_connection",
                err,
                public_database_error(err),
                level=logging.WARNING,
            )
        finally:
            # FIX [L9]: remove from the in-flight tracker regardless of
            # whether close() succeeded, so the set does not grow unbounded.
            try:
                with pool.get("_lock", threading.Lock()):
                    pool.get("_open_connections", set()).discard(connection)
            except Exception:
                pass

    @contextmanager
    def get_cursor(self, connection: Any, dictionary: bool = False, buffered: bool = True):
        """Get SQL Server cursor from connection."""
        cursor = None
        try:
            cursor = connection.cursor()
            yield cursor
            connection.commit()
        except Exception as e:
            if connection:
                connection.rollback()
            raise e
        finally:
            if cursor:
                cursor.close()

    def get_databases_query(self) -> str:
        """SQL query to list SQL Server databases."""
        return """
            SELECT name
            FROM sys.databases
            WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')
              AND HAS_DBACCESS(name) = 1
            ORDER BY name
        """

    def get_tables_query(self) -> str:
        """SQL query to list SQL Server tables."""
        return """
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_CATALOG = %s
            ORDER BY TABLE_NAME
        """

    def get_table_schema_query(self) -> str:
        """SQL query to get SQL Server table schema."""
        return """
            SELECT
                COLUMN_NAME,
                DATA_TYPE,
                IS_NULLABLE,
                COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_CATALOG = %s AND TABLE_NAME = %s
            ORDER BY ORDINAL_POSITION
        """

    def get_system_databases(self) -> set:
        """SQL Server system databases to filter out."""
        return {"master", "tempdb", "model", "msdb"}

    def validate_connection(self, connection: Any) -> bool:
        """
        Validate that the SQL Server connection is alive by issuing ``SELECT 1``.

        Resource handling (FIX [M11]): the cursor is created inside a
        ``try/finally`` so it is always closed even if ``execute`` or
        ``fetchone`` raises. Previously the cursor was only closed on the
        success path, which leaked it on every validation failure.
        """
        cursor = None
        try:
            if connection:
                cursor = connection.cursor()
                cursor.execute("SELECT 1")
                cursor.fetchone()
                return True
        except Exception as err:
            log_safe_exception(
                logger,
                "validate_sqlserver_connection",
                err,
                public_database_error(err),
                level=logging.DEBUG,
            )
        finally:
            # FIX [M11]: always close the cursor, even on the error path.
            if cursor is not None:
                try:
                    cursor.close()
                except Exception:
                    pass
        return False

    # Schema Caching Methods (for AI context)

    def get_all_tables_for_cache(self, db_name: str, schema: str = "dbo") -> tuple:
        """Return SQL query and params to get all tables for schema caching."""
        query = """
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_CATALOG = %s
            ORDER BY TABLE_NAME
        """
        return query, (db_name,)

    def get_set_timeout_sql(self, timeout_seconds: int) -> Optional[str]:
        """
        Return SQL Server statement-timeout SQL.

        FIX [EC3]: previously this returned ``None`` (the comment claimed
        "SQL Server handles timeout at connection level, not per query"),
        which meant the only timeout enforcement was
        ``asyncio.wait_for(timeout=30)`` in the calling layer. That
        cancels the Python coroutine but does NOT kill the running DB
        thread — the orphaned thread keeps the pool connection until
        SQL Server itself finishes the query (potentially minutes for a
        cross-join DoS), exhausting the pool for every other user.

        SQL Server has two relevant knobs:

        * ``SET LOCK_TIMEOUT <ms>`` — the milliseconds a statement will
          wait for a lock before raising error 1222. This is the most
          reliable server-side timeout and is what we set here.

        * ``SET QUERY_GOVERNOR_COST_LIMIT <units>`` — aborts a query
          whose estimated cost exceeds the limit (units are roughly
          10/s). It is *estimated* (not measured), so an under-estimate
          lets a slow query through. We deliberately do NOT use it here
          to avoid double-tuning; the lock timeout + the asyncio cancel
          wall is enough for the realistic DoS scenarios.

        Note: ``SET LOCK_TIMEOUT`` only covers lock-wait time, not
        execution time once the locks are acquired. A genuinely long
        CPU-bound query will still run to completion at the server. The
        ``asyncio.wait_for`` cancel in the caller is the second line of
        defense — together they cover both the lock-wait and the
        "Python gave up" cases. The caller executes the returned string
        verbatim with ``cursor.execute`` before issuing the user query.
        """
        return f"SET LOCK_TIMEOUT {timeout_seconds * 1000}"

    def get_health_check_sql(self) -> str:
        """
        Return SQL Server's no-op health-check SQL.

        FIX [EC6]: issued before each user query to fail-fast on stale
        pooled connections. SQL Server accepts the standard ``SELECT 1``.
        """
        return "SELECT 1"

    def get_column_names_from_cursor(self, cursor: Any) -> List[str]:
        """Extract column names from SQL Server cursor."""
        if hasattr(cursor, "description") and cursor.description:
            return [desc[0] for desc in cursor.description]
        return []

    def get_databases_for_cache(self) -> tuple:
        """Return SQL query and params to get all databases for caching."""
        return self.get_databases_query(), ()

    def get_batch_columns_for_tables(self, db_name: str, tables: List[str], schema: str = "dbo") -> tuple:
        """Return SQL query and params to batch fetch columns for multiple tables.

        Returns (TABLE_NAME, COLUMN_NAME, column_key) where column_key is 'PRI' for primary keys.
        """
        if not tables:
            return None, []

        placeholders = ",".join(["%s"] * len(tables))
        query = f"""
            SELECT
                c.TABLE_NAME,
                c.COLUMN_NAME,
                CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 'PRI' ELSE '' END AS column_key
            FROM INFORMATION_SCHEMA.COLUMNS c
            LEFT JOIN (
                SELECT ccu.TABLE_NAME, ccu.COLUMN_NAME
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu
                    ON tc.CONSTRAINT_NAME = ccu.CONSTRAINT_NAME
                    AND tc.TABLE_CATALOG = ccu.TABLE_CATALOG
                WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                AND tc.TABLE_CATALOG = %s
            ) pk ON c.TABLE_NAME = pk.TABLE_NAME AND c.COLUMN_NAME = pk.COLUMN_NAME
            WHERE c.TABLE_CATALOG = %s
            AND c.TABLE_NAME IN ({placeholders})
            ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
        """
        params = [db_name, db_name] + list(tables)
        return query, params

    # Schema Metadata Methods (for AI tools)

    def get_indexes_query(self, table_name: str, db_name: str = None, schema: str = "dbo") -> tuple:
        """Return SQL query and params to get indexes for a SQL Server table."""
        query = """
            SELECT
                i.name AS index_name,
                c.name AS column_name,
                i.is_unique,
                i.is_primary_key AS is_primary
            FROM sys.indexes i
            JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
            JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
            JOIN sys.tables t ON i.object_id = t.object_id
            WHERE t.name = %s
            ORDER BY i.name, ic.key_ordinal
        """
        return query, (table_name,)

    def get_foreign_keys_query(self, table_name: str = None, db_name: str = None, schema: str = "dbo") -> tuple:
        """Return SQL query and params to get foreign key relationships in SQL Server."""
        if table_name:
            query = """
                SELECT
                    OBJECT_NAME(fk.parent_object_id) AS table_name,
                    COL_NAME(fc.parent_object_id, fc.parent_column_id) AS column_name,
                    OBJECT_NAME(fk.referenced_object_id) AS referenced_table,
                    COL_NAME(fc.referenced_object_id, fc.referenced_column_id) AS referenced_column
                FROM sys.foreign_keys fk
                JOIN sys.foreign_key_columns fc ON fk.object_id = fc.constraint_object_id
                WHERE OBJECT_NAME(fk.parent_object_id) = %s
                ORDER BY fk.name
            """
            return query, (table_name,)
        else:
            query = """
                SELECT
                    OBJECT_NAME(fk.parent_object_id) AS table_name,
                    COL_NAME(fc.parent_object_id, fc.parent_column_id) AS column_name,
                    OBJECT_NAME(fk.referenced_object_id) AS referenced_table,
                    COL_NAME(fc.referenced_object_id, fc.referenced_column_id) AS referenced_column
                FROM sys.foreign_keys fk
                JOIN sys.foreign_key_columns fc ON fk.object_id = fc.constraint_object_id
                ORDER BY OBJECT_NAME(fk.parent_object_id), fk.name
            """
            return query, ()

    # EXPLAIN / Query-plan Methods (added for the explain_query AI tool)
    #
    # SQL Server has no ``EXPLAIN`` statement. The correct mechanism is
    # ``SET SHOWPLAN_TEXT ON`` (or ``SET SHOWPLAN_XML ON`` for structured
    # output): once enabled, the server returns the estimated plan rows for
    # every subsequent statement INSTEAD of executing it. ``SET SHOWPLAN_TEXT
    # OFF`` restores normal execution. We MUST always toggle OFF even on
    # error, otherwise the pooled connection would be returned with plan
    # mode still on and every subsequent query on that connection would
    # return plan rows instead of data — silent corruption for every other
    # user sharing the pool. ``run_explain`` therefore wraps the user query
    # in try/finally.
    #
    # We use ``SHOWPLAN_TEXT`` (not XML) because the text form is what
    # ``DBMS_XPLAN.DISPLAY``-style tooling produces and is what the AI sees
    # most often in DBA-style documentation. ``explain_format = "text"``.

    @property
    def explain_format(self) -> str:
        """SQL Server EXPLAIN output format tag (text)."""
        return "text"

    def get_explain_sql(self, query: str) -> str:
        """Return the user query verbatim — SQL Server EXPLAIN is multi-statement.

        SQL Server has no single ``EXPLAIN`` SQL; the executor must toggle
        ``SET SHOWPLAN_TEXT ON`` before running the query and ``OFF`` after
        (see ``run_explain``). We return the query itself so the base
        ``run_explain`` would still produce *some* output if a caller
        forgets to override, but the SQL Server adapter always overrides
        ``run_explain`` to handle the SET ON/OFF lifecycle correctly.
        """
        return query

    def run_explain(self, cursor: Any, query: str) -> list:
        """Execute a SQL Server EXPLAIN via ``SET SHOWPLAN_TEXT ON/OFF``.

        Workflow:
          1. ``SET SHOWPLAN_TEXT ON`` — server enters plan-only mode.
          2. ``cursor.execute(query)`` — returns plan rows, never runs the
             actual SELECT. ``fetchall()`` returns the formatted plan text.
          3. ``SET SHOWPLAN_TEXT OFF`` (in finally) — restore normal
             execution so the pooled connection is safe to return.

        The plan rows are tuples of one column (the formatted plan text);
        each row is one line of the plan output.
        """
        try:
            cursor.execute("SET SHOWPLAN_TEXT ON")
            cursor.execute(query)
            rows = cursor.fetchall()
            return rows
        finally:
            # Always restore normal execution mode, even on error, so the
            # pooled connection is not returned with plan-only mode still
            # active (which would silently corrupt every subsequent query
            # on this connection).
            try:
                cursor.execute("SET SHOWPLAN_TEXT OFF")
            except Exception as teardown_err:
                log_safe_exception(
                    logger,
                    "reset_sqlserver_showplan",
                    teardown_err,
                    public_database_error(teardown_err),
                    level=logging.DEBUG,
                )

    # Table-details Method (added for the get_table_details AI tool)

    def get_table_details_query(self, table_name: str, db_name: str = None, schema: str = "dbo") -> tuple:
        """Return SQL query and params for a rich per-column SQL Server schema dump.

        Returns one row per column with positional columns:
            name, data_type, is_nullable, default_value,
            is_primary_key (0/1), is_unique (0/1), max_length
        """
        query = """
            SELECT
                c.COLUMN_NAME AS name,
                c.DATA_TYPE AS data_type,
                c.IS_NULLABLE AS is_nullable,
                c.COLUMN_DEFAULT AS default_value,
                CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key,
                CASE WHEN uq.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS is_unique,
                c.CHARACTER_MAXIMUM_LENGTH AS max_length
            FROM INFORMATION_SCHEMA.COLUMNS c
            LEFT JOIN (
                SELECT ccu.TABLE_NAME, ccu.COLUMN_NAME
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu
                    ON tc.CONSTRAINT_NAME = ccu.CONSTRAINT_NAME
                    AND tc.TABLE_CATALOG = ccu.TABLE_CATALOG
                WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                AND tc.TABLE_CATALOG = %s
                AND ccu.TABLE_NAME = %s
            ) pk ON c.TABLE_NAME = pk.TABLE_NAME AND c.COLUMN_NAME = pk.COLUMN_NAME
            LEFT JOIN (
                SELECT ccu.TABLE_NAME, ccu.COLUMN_NAME
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu
                    ON tc.CONSTRAINT_NAME = ccu.CONSTRAINT_NAME
                    AND tc.TABLE_CATALOG = ccu.TABLE_CATALOG
                WHERE tc.CONSTRAINT_TYPE = 'UNIQUE'
                AND tc.TABLE_CATALOG = %s
                AND ccu.TABLE_NAME = %s
            ) uq ON c.TABLE_NAME = uq.TABLE_NAME AND c.COLUMN_NAME = uq.COLUMN_NAME
            WHERE c.TABLE_CATALOG = %s
            AND c.TABLE_NAME = %s
            ORDER BY c.ORDINAL_POSITION
        """
        # Two %s for catalog+table in each subquery, plus the main WHERE.
        # Order: (catalog_pk, table_pk, catalog_uq, table_uq, catalog, table).
        return query, (db_name, table_name, db_name, table_name, db_name, table_name)

    # Views Introspection Methods (added for the list_views AI tool)

    def get_views(self, schema: str = None, db_name: str = None) -> tuple:
        """Return SQL query and params to list SQL Server views.

        ``schema`` is the table_schema (typically ``dbo``); ``db_name`` is
        unused because INFORMATION_SCHEMA is per-database and the cursor is
        already bound to the connected catalog.
        """
        if schema:
            query = """
                SELECT TABLE_NAME
                FROM INFORMATION_SCHEMA.VIEWS
                WHERE TABLE_SCHEMA = %s
                ORDER BY TABLE_NAME
            """
            return query, (schema,)
        query = """
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.VIEWS
            ORDER BY TABLE_NAME
        """
        return query, ()
