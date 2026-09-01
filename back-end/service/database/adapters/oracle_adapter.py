"""
Oracle Database Adapter

Implements database operations for Oracle using oracledb (python-oracledb).
Supports local Oracle instances and cloud providers (AWS RDS Oracle).

Features:
- TRUE connection pooling using oracledb.create_pool()
- Pool of 2-10 connections maintained for efficient reuse
- Connection acquisition is fast (no connect overhead per query)

Note: Oracle Cloud Autonomous DB requires wallet-based authentication which
is not supported in this simple connection string approach.

Query timeout (FIX [EC3])
-------------------------
Oracle has no ``SET QUERY_TIMEOUT``-style SQL statement that the caller
can ``execute`` before each query. The correct mechanism is the
``oracledb`` driver's per-connection ``call_timeout`` attribute: when
set to a non-zero number of milliseconds, every round-trip (RPC/execute
/fetch) on that connection is aborted by the driver if it exceeds the
limit, raising ``DPI-1067`` (or ``cx_Oracle.DatabaseError`` on older
drivers). See ``set_session_timeout`` below.

``get_set_timeout_sql`` therefore still returns ``None``; the callers
(``operations.execute_sql_query`` and
``ai_tool_executor._execute_query_with_db_config``) detect the presence
of ``set_session_timeout`` via ``getattr(adapter, 'set_session_timeout',
None)`` and call it directly on the connection object before executing
the user query. The asyncio ``wait_for`` cancel in the caller remains
the second line of defense.
"""

import logging
import re
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

from config import get_config
from core.errors import log_safe_exception, public_database_error

Config = get_config()
from .base_adapter import BaseDatabaseAdapter

logger = logging.getLogger(__name__)
try:
    import oracledb

    ORACLE_AVAILABLE = True
except ImportError:
    ORACLE_AVAILABLE = False
    logger.warning("oracledb not installed. Oracle support disabled.")


class OracleAdapter(BaseDatabaseAdapter):
    """Oracle database adapter using oracledb with TRUE connection pooling."""

    def __init__(self):
        if not ORACLE_AVAILABLE:
            raise ImportError("oracledb is required for Oracle support. Install it with: pip install oracledb")

    @property
    def db_type(self) -> str:
        return "oracle"

    @property
    def default_port(self) -> Optional[int]:
        return Config.DEFAULT_ORACLE_PORT

    @property
    def requires_server(self) -> bool:
        return True

    def _parse_connection_string(self, connection_string: str) -> Dict[str, str]:
        """
        Parse Oracle connection string to extract components.

        Supported formats:
        - user/password@host:port/service_name
        - user/password@//host:port/service_name (Easy Connect Plus)
        - user/password@host/service_name (default port 1521)

        Returns:
            Dict with 'user', 'password', 'dsn' keys
        """
        # Pattern: user/password@[//]host[:port]/service_name
        pattern = r"^([^/]+)/([^@]+)@(.+)$"
        match = re.match(pattern, connection_string)

        if match:
            user = match.group(1)
            password = match.group(2)
            dsn = match.group(3)

            # Remove leading // if present (Easy Connect Plus format)
            if dsn.startswith("//"):
                dsn = dsn[2:]

            return {"user": user, "password": password, "dsn": dsn}
        else:
            raise ValueError("Invalid Oracle connection string format. Expected: user/password@host:port/service_name")

    def create_connection_pool(self, config: Dict) -> Any:
        """
        Create TRUE Oracle connection pool using oracledb.create_pool().

        Pool Configuration:
        - min: 2 connections (always maintained)
        - max: 10 connections (scales up under load)
        - increment: 1 (grows gradually)

        Supports:
        1. Connection string (Easy Connect format for AWS RDS, local)
        2. Individual parameters (host, port, user, password, service_name/sid)

        Note: Oracle Cloud Autonomous DB with wallet is NOT supported.
        """

        try:
            connection_string = config.get("connection_string")

            if connection_string:
                parsed = self._parse_connection_string(connection_string)
                user = parsed["user"]
                password = parsed["password"]
                dsn = parsed["dsn"]

                logger.info("Creating remote Oracle connection pool")
            else:
                host = config.get("host", Config.DEFAULT_ORACLE_HOST)
                port = config.get("port", Config.DEFAULT_ORACLE_PORT)
                user = config.get("user", "")
                password = config.get("password", "")
                service_name = config.get("service_name") or config.get("database", Config.DEFAULT_ORACLE_SERVICE)

                # Easy Connect string format: host:port/service_name
                dsn = f"{host}:{port}/{service_name}"

                logger.info("Creating Oracle connection pool")
            pool = oracledb.create_pool(
                user=user,
                password=password,
                dsn=dsn,
                min=Config.ORACLE_POOL_MIN_CONNECTIONS,
                max=min(
                    Config.DB_POOL_WORKER_BASIS * 2,
                    Config.DEFAULT_DB_POOL_MAX_CONNECTIONS,
                ),
                increment=Config.ORACLE_POOL_INCREMENT,
                timeout=Config.ORACLE_POOL_TIMEOUT_SECONDS,
                getmode=oracledb.POOL_GETMODE_WAIT,  # Wait for connection if pool exhausted
            )

            logger.info(f"Created Oracle connection pool: min={pool.min}, max={pool.max}, opened={pool.opened}")
            return pool

        except Exception as err:
            log_safe_exception(logger, "create_oracle_pool", err, public_database_error(err))
            raise

    def get_connection_from_pool(self, pool: Any) -> Any:
        """
        Get Oracle connection from pool (reuses existing connection).

        This is fast because connections are already established in the pool.
        """
        try:
            # acquire() gets a connection from the pool (fast!)
            # If pool is exhausted, waits up to 'timeout' seconds
            connection = pool.acquire()
            logger.debug(f"Acquired Oracle connection from pool (busy={pool.busy}, opened={pool.opened})")
            return connection
        except Exception as err:
            log_safe_exception(logger, "acquire_oracle_connection", err, public_database_error(err))
            raise

    def close_pool(self, pool: Any) -> bool:
        """Close Oracle connection pool and all connections in it."""
        try:
            if pool:
                pool.close(force=True)
                logger.info("Oracle connection pool closed successfully")
            return True
        except Exception as err:
            log_safe_exception(logger, "close_oracle_pool", err, public_database_error(err))
            return False

    def return_connection_to_pool(self, pool: Any, connection: Any) -> None:
        """
        Return Oracle connection back to pool for reuse.

        Connection is NOT closed - it stays in the pool for next query.
        """
        try:
            if connection and pool:
                # release() returns connection to pool (does NOT close it)
                pool.release(connection)
                logger.debug(f"Released Oracle connection to pool (busy={pool.busy})")
        except Exception as err:
            log_safe_exception(
                logger,
                "return_oracle_connection",
                err,
                public_database_error(err),
                level=logging.WARNING,
            )

    @contextmanager
    def get_cursor(self, connection: Any, dictionary: bool = False, buffered: bool = True):
        """Get Oracle cursor from connection."""
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
        """SQL query to list Oracle databases (actually schemas/users)."""
        # Oracle doesn't have "databases" like MySQL/PostgreSQL
        # We list user schemas instead
        return """
            SELECT username
            FROM all_users
            WHERE username NOT IN ('SYS', 'SYSTEM', 'ORACLE_OCM', 'XDB', 'WMSYS',
                                   'CTXSYS', 'MDSYS', 'OLAPSYS', 'ORDDATA', 'ORDSYS',
                                   'OUTLN', 'DBSNMP', 'APPQOSSYS', 'ANONYMOUS')
            ORDER BY username
        """

    def get_tables_query(self) -> str:
        """SQL query to list Oracle tables."""
        return """
            SELECT table_name
            FROM all_tables
            WHERE owner = :1
            ORDER BY table_name
        """

    def get_table_schema_query(self) -> str:
        """SQL query to get Oracle table schema."""
        return """
            SELECT
                column_name,
                data_type,
                nullable,
                data_default
            FROM all_tab_columns
            WHERE owner = :1 AND table_name = :2
            ORDER BY column_id
        """

    def get_system_databases(self) -> set:
        """Oracle system schemas to filter out."""
        return {
            "sys",
            "system",
            "oracle_ocm",
            "xdb",
            "wmsys",
            "ctxsys",
            "mdsys",
            "olapsys",
            "orddata",
            "ordsys",
            "outln",
            "dbsnmp",
            "appqossys",
            "anonymous",
        }

    def validate_connection(self, connection: Any) -> bool:
        """
        Validate that the Oracle connection is alive by issuing ``SELECT 1 FROM DUAL``.

        Resource handling (FIX [M11]): the cursor is created inside a
        ``try/finally`` so it is always closed even if ``execute`` or
        ``fetchone`` raises. Previously the cursor was only closed on the
        success path, which leaked it on every validation failure.
        """
        cursor = None
        try:
            if connection:
                cursor = connection.cursor()
                cursor.execute("SELECT 1 FROM DUAL")
                cursor.fetchone()
                return True
        except Exception as err:
            log_safe_exception(
                logger,
                "validate_oracle_connection",
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

    def get_all_tables_for_cache(self, db_name: str, schema: str = None) -> tuple:
        """Return SQL query and params to get all tables for schema caching."""
        # In Oracle, db_name is actually the schema/owner
        query = """
            SELECT table_name
            FROM all_tables
            WHERE owner = :1
            ORDER BY table_name
        """
        return query, (db_name.upper(),)

    def get_set_timeout_sql(self, timeout_seconds: int) -> Optional[str]:
        """
        Return Oracle query timeout SQL.

        FIX [EC3]: Oracle has no ``SET QUERY_TIMEOUT``-style SQL
        statement. The correct mechanism is the ``oracledb`` driver's
        per-connection ``call_timeout`` attribute (see
        ``set_session_timeout``). This method therefore still returns
        ``None`` so that the generic SQL-string-based timeout path is
        skipped for Oracle; callers detect ``set_session_timeout`` via
        ``getattr`` and apply it directly to the connection object.
        """
        # Oracle doesn't support query-level timeout in the same way
        return None

    def get_health_check_sql(self) -> str:
        """
        Return Oracle's no-op health-check SQL.

        FIX [EC6]: Oracle requires a ``FROM`` clause on every SELECT,
        so ``SELECT 1`` raises ``ORA-00923: FROM keyword not found``.
        ``DUAL`` is a one-row virtual table provided specifically for
        this purpose. Used by ``operations.execute_sql_query`` and
        ``ai_tool_executor._execute_query_with_db_config`` to verify
        the pooled connection is alive before issuing the user query.
        """
        return "SELECT 1 FROM DUAL"

    def set_session_timeout(self, conn: Any, seconds: int) -> None:
        """
        Apply a per-connection call timeout to an Oracle connection.

        FIX [EC3]: oracledb's ``Connection.call_timeout`` is the
        server-side timeout mechanism for Oracle. When set to a non-zero
        number of milliseconds, every round-trip (execute / fetch / RPC)
        on that connection is aborted by the driver if it exceeds the
        limit, raising ``DPI-1067`` (or ``cx_Oracle.DatabaseError`` on
        older drivers). This is the only reliable way to enforce a
        per-query timeout on Oracle — there is no ``SET QUERY_TIMEOUT``
        SQL statement the caller can execute.

        Called from ``operations.execute_sql_query`` and
        ``ai_tool_executor._execute_query_with_db_config`` via
        ``getattr(adapter, 'set_session_timeout', None)`` before the
        user query is executed. We deliberately accept ``seconds`` here
        (matching the ``get_set_timeout_sql`` interface) and convert to
        ms internally — oracledb uses milliseconds.

        Args:
            conn: oracledb Connection object (acquired from the pool).
            seconds: Timeout in seconds. 0 disables the timeout (no
                upper bound on round-trip time).

        Raises:
            Nothing: a failure to set the timeout is logged at debug
                level and swallowed, mirroring the SQL-string timeout
                path's tolerance in other adapters. The asyncio
                ``wait_for`` cancel in the caller remains the second
                line of defense.
        """
        try:
            # oracledb uses milliseconds for call_timeout.
            conn.call_timeout = int(seconds) * 1000
            logger.debug(
                "Oracle call_timeout set to %dms",
                int(seconds) * 1000,
            )
        except Exception as err:
            log_safe_exception(
                logger,
                "set_oracle_call_timeout",
                err,
                public_database_error(err),
                level=logging.DEBUG,
            )

    def get_column_names_from_cursor(self, cursor: Any) -> List[str]:
        """Extract column names from Oracle cursor."""
        if hasattr(cursor, "description") and cursor.description:
            return [desc[0] for desc in cursor.description]
        return []

    def get_databases_for_cache(self) -> tuple:
        """Return SQL query and params to get all schemas for caching."""
        return self.get_databases_query(), ()

    def get_batch_columns_for_tables(self, db_name: str, tables: List[str], schema: str = None) -> tuple:
        """Return SQL query and params to batch fetch columns for multiple tables.

        Returns (table_name, column_name, column_key) where column_key is 'PRI' for primary keys.
        """
        if not tables:
            return None, []

        # Oracle uses different placeholder syntax (:1, :2, etc.)
        # Building IN clause with positional params
        table_placeholders = ",".join([f":{i + 2}" for i in range(len(tables))])
        query = f"""
            SELECT
                c.table_name,
                c.column_name,
                CASE WHEN pk.column_name IS NOT NULL THEN 'PRI' ELSE '' END AS column_key
            FROM all_tab_columns c
            LEFT JOIN (
                SELECT cc.table_name, cc.column_name
                FROM all_constraints con
                JOIN all_cons_columns cc ON con.constraint_name = cc.constraint_name
                    AND con.owner = cc.owner
                WHERE con.constraint_type = 'P'
                AND con.owner = :1
            ) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
            WHERE c.owner = :1
            AND c.table_name IN ({table_placeholders})
            ORDER BY c.table_name, c.column_id
        """
        params = [db_name.upper()] + [t.upper() for t in tables]
        return query, params

    # Schema Metadata Methods (for AI tools)

    def get_indexes_query(self, table_name: str, db_name: str = None, schema: str = None) -> tuple:
        """Return SQL query and params to get indexes for an Oracle table."""
        query = """
            SELECT
                i.index_name,
                ic.column_name,
                CASE WHEN i.uniqueness = 'UNIQUE' THEN 1 ELSE 0 END AS is_unique,
                0 AS is_primary
            FROM all_indexes i
            JOIN all_ind_columns ic ON i.index_name = ic.index_name AND i.owner = ic.index_owner
            WHERE i.table_name = :1 AND i.owner = :2
            ORDER BY i.index_name, ic.column_position
        """
        owner = db_name.upper() if db_name else schema.upper() if schema else "PUBLIC"
        return query, (table_name.upper(), owner)

    def get_foreign_keys_query(self, table_name: str = None, db_name: str = None, schema: str = None) -> tuple:
        """Return SQL query and params to get foreign key relationships in Oracle."""
        owner = db_name.upper() if db_name else schema.upper() if schema else "PUBLIC"

        if table_name:
            query = """
                SELECT
                    a.table_name,
                    a.column_name,
                    c_pk.table_name AS referenced_table,
                    b.column_name AS referenced_column
                FROM all_cons_columns a
                JOIN all_constraints c ON a.constraint_name = c.constraint_name AND a.owner = c.owner
                JOIN all_constraints c_pk ON c.r_constraint_name = c_pk.constraint_name AND c.r_owner = c_pk.owner
                JOIN all_cons_columns b ON c_pk.constraint_name = b.constraint_name AND c_pk.owner = b.owner
                WHERE c.constraint_type = 'R' AND a.table_name = :1 AND a.owner = :2
                ORDER BY a.table_name, a.column_name
            """
            return query, (table_name.upper(), owner)
        else:
            query = """
                SELECT
                    a.table_name,
                    a.column_name,
                    c_pk.table_name AS referenced_table,
                    b.column_name AS referenced_column
                FROM all_cons_columns a
                JOIN all_constraints c ON a.constraint_name = c.constraint_name AND a.owner = c.owner
                JOIN all_constraints c_pk ON c.r_constraint_name = c_pk.constraint_name AND c.r_owner = c_pk.owner
                JOIN all_cons_columns b ON c_pk.constraint_name = b.constraint_name AND c_pk.owner = b.owner
                WHERE c.constraint_type = 'R' AND a.owner = :1
                ORDER BY a.table_name, a.column_name
            """
            return query, (owner,)

    # EXPLAIN / Query-plan Methods (added for the explain_query AI tool)
    #
    # Oracle's EXPLAIN flow is two-statement:
    #   1. ``EXPLAIN PLAN SET STATEMENT_ID = 'agent' FOR <query>`` writes the
    #      plan into the ``PLAN_TABLE`` (a per-user global table) keyed by
    #      the statement_id. The query is NOT executed — only its plan is
    #      computed and stored.
    #   2. ``SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY(NULL, 'agent', 'ALL'))``
    #      retrieves the formatted plan text (one row per line of output).
    #
    # The shared 'agent' statement_id is reused across calls. A previous
    # plan with the same statement_id is automatically overwritten by the
    # next EXPLAIN PLAN, so we don't strictly need to clean it up — but
    # concurrent calls from the same user on the same pool could collide.
    # The single-threaded nature of the AI tool path (one tool call at a
    # time per stream) makes this safe in practice. ``explain_format =
    # "text"`` because DBMS_XPLAN.DISPLAY returns formatted text rows.

    @property
    def explain_format(self) -> str:
        """Oracle EXPLAIN output format tag (text from DBMS_XPLAN.DISPLAY)."""
        return "text"

    def get_explain_sql(self, query: str) -> str:
        """Return Oracle ``EXPLAIN PLAN`` for a validated read-only query.

        This produces the SETUP statement only; retrieving the formatted
        plan requires a second statement (see ``run_explain``). The
        statement_id ``'agent'`` is reused across calls — Oracle overwrites
        the prior plan for the same statement_id, so no cleanup is needed.
        """
        return f"EXPLAIN PLAN SET STATEMENT_ID = 'agent' FOR {query}"

    def run_explain(self, cursor: Any, query: str) -> list:
        """Execute Oracle EXPLAIN PLAN and return formatted plan rows.

        Workflow:
          1. ``EXPLAIN PLAN SET STATEMENT_ID = 'agent' FOR <query>`` —
             compute the plan and store it in PLAN_TABLE.
          2. ``SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY(NULL, 'agent',
             'ALL'))`` — return the formatted plan text rows.

        The 'ALL' format includes cost, cardinality, bytes, partition
        info, predicate info, and column projections — the richest
        non-executing plan Oracle offers.
        """
        cursor.execute(self.get_explain_sql(query))
        display_query = "SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY(NULL, 'agent', 'ALL'))"
        cursor.execute(display_query)
        return cursor.fetchall()

    # Table-details Method (added for the get_table_details AI tool)

    def get_table_details_query(self, table_name: str, db_name: str = None, schema: str = None) -> tuple:
        """Return SQL query and params for a rich per-column Oracle schema dump.

        Returns one row per column with positional columns:
            name, data_type, is_nullable, default_value,
            is_primary_key (0/1), is_unique (0/1), max_length

        ``db_name`` is interpreted as the owner (Oracle schema). Oracle's
        positional bind syntax (``:1``, ``:2``, ...) is used.
        """
        owner = db_name.upper() if db_name else (schema.upper() if schema else "PUBLIC")
        query = """
            SELECT
                c.column_name AS name,
                c.data_type AS data_type,
                c.nullable AS is_nullable,
                c.data_default AS default_value,
                CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key,
                CASE WHEN uq.column_name IS NOT NULL THEN 1 ELSE 0 END AS is_unique,
                c.data_length AS max_length
            FROM all_tab_columns c
            LEFT JOIN (
                SELECT cc.table_name, cc.column_name
                FROM all_constraints con
                JOIN all_cons_columns cc ON con.constraint_name = cc.constraint_name
                    AND con.owner = cc.owner
                WHERE con.constraint_type = 'P'
                AND con.owner = :1
                AND cc.table_name = :2
            ) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
            LEFT JOIN (
                SELECT cc.table_name, cc.column_name
                FROM all_constraints con
                JOIN all_cons_columns cc ON con.constraint_name = cc.constraint_name
                    AND con.owner = cc.owner
                WHERE con.constraint_type = 'U'
                AND con.owner = :3
                AND cc.table_name = :4
            ) uq ON c.table_name = uq.table_name AND c.column_name = uq.column_name
            WHERE c.owner = :5
            AND c.table_name = :6
            ORDER BY c.column_id
        """
        return query, (
            owner,
            table_name.upper(),
            owner,
            table_name.upper(),
            owner,
            table_name.upper(),
        )

    # Views Introspection Methods (added for the list_views AI tool)

    def get_views(self, schema: str = None, db_name: str = None) -> tuple:
        """Return SQL query and params to list Oracle views owned by ``db_name``.

        ``db_name`` is interpreted as the owner (Oracle schema); ``schema``
        is accepted for API uniformity but ignored — Oracle has no
        sub-schema concept below the user/owner level. Materialized views
        are queried separately via ``get_materialized_views`` (Oracle
        supports them via ``all_mviews``).
        """
        owner = db_name.upper() if db_name else (schema.upper() if schema else "PUBLIC")
        query = """
            SELECT view_name
            FROM all_views
            WHERE owner = :1
            ORDER BY view_name
        """
        return query, (owner,)

    def get_materialized_views(self, schema: str = None, db_name: str = None):
        """Return SQL query and params to list Oracle materialized views.

        Oracle exposes materialized views via ``all_mviews``. The
        ``mview_name`` column is the equivalent of ``view_name`` on
        ``all_views``.
        """
        owner = db_name.upper() if db_name else (schema.upper() if schema else "PUBLIC")
        query = """
            SELECT mview_name
            FROM all_mviews
            WHERE owner = :1
            ORDER BY mview_name
        """
        return query, (owner,)
