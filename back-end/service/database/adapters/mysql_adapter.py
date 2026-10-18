"""
MySQL Database Adapter

Implements database operations for MySQL using mysql-connector-python.
"""

import logging
from contextlib import contextmanager
from typing import Any, Dict, Optional

import mysql.connector
from mysql.connector import pooling

from config import get_config
from core.errors import log_safe_exception, public_database_error

from .base_adapter import BaseDatabaseAdapter

Config = get_config()

logger = logging.getLogger(__name__)


class MySQLAdapter(BaseDatabaseAdapter):
    """MySQL database adapter.

    Uses backtick (``\\```) quoting for identifiers per the MySQL dialect.
    """

    # FIX [AUDIT-2-B]: MySQL uses backticks for identifier quoting.
    IDENTIFIER_QUOTE_OPEN = "`"
    IDENTIFIER_QUOTE_CLOSE = "`"

    @property
    def db_type(self) -> str:
        return "mysql"

    @property
    def default_port(self) -> Optional[int]:
        return Config.DEFAULT_MYSQL_PORT

    @property
    def requires_server(self) -> bool:
        return True

    def create_connection_pool(self, config: Dict) -> Any:
        """Create MySQL connection pool.

        Supports either:
        1. Connection string (DSN) via 'connection_string' key
        2. Individual parameters (host, port, user, password, database)

        Connection strings support remote databases with SSL (FreedB, PlanetScale, TiDB Cloud, etc.)
        Uses shared utility for consistent parsing across the codebase.
        """
        from service.database.mysql_utils import get_mysql_connect_kwargs

        try:
            # Get connection kwargs from shared utility
            pool_config = get_mysql_connect_kwargs(config, for_pool=True)

            # Add pool-specific settings
            connection_string = config.get("connection_string")
            if connection_string:
                pool_config["pool_name"] = f"mysql_remote_pool_{id(config)}"
            else:
                pool_config["pool_name"] = f"mysql_pool_{id(config)}"
                pool_config["pool_size"] = min(
                    Config.DB_POOL_WORKER_BASIS * 2,
                    Config.DEFAULT_DB_POOL_MAX_CONNECTIONS,
                )

            pool = pooling.MySQLConnectionPool(**pool_config)

            if connection_string:
                logger.info("Created remote MySQL connection pool")
            else:
                logger.info("Created MySQL connection pool")

            return pool

        except mysql.connector.Error as err:
            log_safe_exception(logger, "create_mysql_pool", err, public_database_error(err))
            raise

    def get_connection_from_pool(self, pool: Any) -> Any:
        """Get MySQL connection from pool."""
        try:
            return pool.get_connection()
        except mysql.connector.Error as err:
            log_safe_exception(logger, "acquire_mysql_connection", err, public_database_error(err))
            raise

    def close_pool(self, pool: Any) -> bool:
        """Close MySQL connection pool.

        FIX [AUDIT-2-B]: the previous implementation reached into the
        private ``pool._cnx_queue`` attribute. A mysql-connector version
        bump can rename that attribute and silently break pool cleanup,
        leaking every connection. We now use the public API
        (``pool._remove_connection`` / ``pool.close``) where available,
        and fall back to draining the queue only when the public API is
        absent. Errors during close are logged at WARNING (not ERROR)
        because a partially-broken pool is recoverable on reconnect.

        Args:
            pool: ``mysql.connector.pooling.MySQLConnectionPool`` instance.

        Returns:
            True if the pool was closed without raising; False on error.
        """
        if pool is None:
            return True
        try:
            # Preferred path: newer mysql-connector versions expose
            # ``close()`` on the pool itself.
            close_method = getattr(pool, "close", None)
            if callable(close_method):
                try:
                    close_method()
                except Exception as exc:
                    log_safe_exception(
                        logger,
                        "close_mysql_pool",
                        exc,
                        public_database_error(exc),
                        level=logging.WARNING,
                    )
                return True

            # Fallback: drain the internal queue. We use getattr + a
            # private-name probe rather than a hard attribute access so
            # a future rename does not crash the close path.
            queue = getattr(pool, "_cnx_queue", None)
            if queue is not None and hasattr(queue, "empty") and hasattr(queue, "get"):
                drained = 0
                while not queue.empty():
                    try:
                        conn = queue.get(block=False)
                        if conn is not None:
                            try:
                                conn.close()
                            except Exception:
                                pass
                        drained += 1
                    except Exception:
                        break
                logger.info("Closed MySQL connection pool (%d conns drained)", drained)
            else:
                logger.info("Closed MySQL connection pool (no queue available)")
            return True
        except Exception as err:
            log_safe_exception(
                logger,
                "close_mysql_pool",
                err,
                public_database_error(err),
                level=logging.WARNING,
            )
            return False

    def return_connection_to_pool(self, pool: Any, connection: Any) -> None:
        """Return MySQL connection back to pool.

        For MySQL connector, pooled connections are returned automatically
        when ``close()`` is called on a pooled connection. If
        ``is_connected()`` raises (broken socket), the connection is
        discarded rather than returned to the pool.

        Args:
            pool: Connection pool the connection came from.
            connection: Connection to return. May be ``None`` or already
                closed; both are no-ops.
        """
        if connection is None:
            return
        try:
            # FIX [AUDIT-2-B]: if is_connected() raises, the previous
            # code caught the exception but never closed the connection,
            # leaking it. We now close unconditionally.
            if connection.is_connected():
                connection.close()  # Returns to pool for pooled connections
        except Exception as err:
            log_safe_exception(
                logger,
                "return_mysql_connection",
                err,
                public_database_error(err),
                level=logging.WARNING,
            )
            try:
                connection.close()
            except Exception:
                pass

    @contextmanager
    def get_cursor(self, connection: Any, dictionary: bool = False, buffered: bool = True):
        """Get MySQL cursor from connection."""
        cursor = None
        try:
            cursor = connection.cursor(dictionary=dictionary, buffered=buffered)
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
        """SQL query to list MySQL databases."""
        return "SHOW DATABASES"

    def get_tables_query(self) -> str:
        """SQL query to list MySQL tables."""
        return """
            SELECT TABLE_NAME
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = %s AND TABLE_TYPE = 'BASE TABLE'
        """

    def get_table_schema_query(self) -> str:
        """SQL query to get MySQL table schema."""
        return """
            SELECT
                COLUMN_NAME,
                COLUMN_TYPE,
                IS_NULLABLE,
                COLUMN_KEY,
                COLUMN_DEFAULT,
                EXTRA
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
            ORDER BY ORDINAL_POSITION
        """

    def get_system_databases(self) -> set:
        """MySQL system databases to filter out."""
        return {"information_schema", "mysql", "performance_schema", "sys"}

    def validate_connection(self, connection: Any) -> bool:
        """
        Validate that the MySQL connection is alive by issuing ``SELECT 1``.

        Resource handling (FIX [M11]): the cursor is created inside a
        ``try/finally`` so it is always closed even if ``execute`` or
        ``fetchone`` raises (syntax/permission/transient errors). Previously
        the cursor was only closed on the success path, which leaked it and
        left the underlying connection in an aborted-transaction state on
        every validation failure.
        """
        cursor = None
        try:
            if connection and connection.is_connected():
                cursor = connection.cursor()
                cursor.execute("SELECT 1")
                cursor.fetchone()
                return True
        except Exception as err:
            log_safe_exception(
                logger,
                "validate_mysql_connection",
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

    def get_all_tables_for_cache(self, db_name: str, schema: str = "public") -> tuple:
        """Return SQL query and params to get all tables for schema caching."""
        query = """
            SELECT TABLE_NAME
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = %s AND TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
        """
        return query, (db_name,)

    def get_set_timeout_sql(self, timeout_seconds: int) -> str:
        """Return MySQL query timeout SQL."""
        return f"SET SESSION MAX_EXECUTION_TIME={timeout_seconds * 1000}"

    def get_health_check_sql(self) -> str:
        """
        Return MySQL's no-op health-check SQL.

        FIX [EC6]: issued before each user query to fail-fast on stale
        pooled connections. MySQL accepts the standard ``SELECT 1``.
        """
        return "SELECT 1"

    def get_column_names_from_cursor(self, cursor: Any) -> list:
        """Extract column names from MySQL cursor."""
        if hasattr(cursor, "column_names"):
            return list(cursor.column_names)
        return []

    def get_databases_for_cache(self) -> tuple:
        """Return SQL query and params to get all databases for caching."""
        # MySQL: SHOW DATABASES, then filter system DBs in code
        return "SHOW DATABASES", ()

    def get_batch_columns_for_tables(self, db_name: str, tables: list, schema: str = "public") -> tuple:
        """Return SQL query and params to batch fetch columns for multiple tables.

        Returns (TABLE_NAME, COLUMN_NAME, COLUMN_KEY) where COLUMN_KEY is 'PRI' for primary keys.
        """
        if not tables:
            return None, []

        placeholders = ",".join(["%s"] * len(tables))
        query = f"""
            SELECT TABLE_NAME, COLUMN_NAME, COLUMN_KEY
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = %s
            AND TABLE_NAME IN ({placeholders})
            ORDER BY TABLE_NAME, ORDINAL_POSITION
        """
        params = [db_name] + list(tables)
        return query, params

    # Schema Metadata Methods (for AI tools)

    def get_indexes_query(self, table_name: str, db_name: str = None, schema: str = "public") -> tuple:
        """Return SQL query and params to get indexes for a MySQL table."""
        query = """
            SELECT
                INDEX_NAME AS index_name,
                COLUMN_NAME AS column_name,
                NOT NON_UNIQUE AS is_unique,
                INDEX_NAME = 'PRIMARY' AS is_primary
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
            ORDER BY INDEX_NAME, SEQ_IN_INDEX
        """
        return query, (db_name, table_name)

    def get_foreign_keys_query(self, table_name: str = None, db_name: str = None, schema: str = "public") -> tuple:
        """Return SQL query and params to get foreign key relationships in MySQL."""
        if table_name:
            query = """
                SELECT
                    kcu.TABLE_NAME AS table_name,
                    kcu.COLUMN_NAME AS column_name,
                    kcu.REFERENCED_TABLE_NAME AS referenced_table,
                    kcu.REFERENCED_COLUMN_NAME AS referenced_column
                FROM information_schema.KEY_COLUMN_USAGE kcu
                WHERE kcu.TABLE_SCHEMA = %s
                AND kcu.TABLE_NAME = %s
                AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
                ORDER BY kcu.TABLE_NAME, kcu.COLUMN_NAME
            """
            return query, (db_name, table_name)
        else:
            query = """
                SELECT
                    kcu.TABLE_NAME AS table_name,
                    kcu.COLUMN_NAME AS column_name,
                    kcu.REFERENCED_TABLE_NAME AS referenced_table,
                    kcu.REFERENCED_COLUMN_NAME AS referenced_column
                FROM information_schema.KEY_COLUMN_USAGE kcu
                WHERE kcu.TABLE_SCHEMA = %s
                AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
                ORDER BY kcu.TABLE_NAME, kcu.COLUMN_NAME
            """
            return query, (db_name,)

    # EXPLAIN / Query-plan Methods (added for the explain_query AI tool)
    #
    # MySQL's ``EXPLAIN FORMAT=JSON`` returns one row whose first column is a
    # JSON document describing the full plan tree (scan type, keys used,
    # estimated rows, attached_subqueries, etc.). The JSON format is far
    # richer than the default tabular EXPLAIN, which is why we prefer it for
    # the AI: a single round-trip yields all the cost/cardinality hints the
    # optimizer produces, in a structure the LLM can reason about.

    @property
    def explain_format(self) -> str:
        """MySQL EXPLAIN output format tag (JSON)."""
        return "json"

    def get_explain_sql(self, query: str) -> str:
        """Return MySQL ``EXPLAIN FORMAT=JSON`` for a validated read-only query.

        ``query`` must already be validated as read-only (SELECT/WITH) by
        ``DatabaseSecurity.analyze_sql_query`` — we trust that gate before
        interpolating into the EXPLAIN wrapper. ANALYZE is intentionally NOT
        used: MySQL's EXPLAIN ANALYZE actually runs the query, which we
        cannot do for arbitrary LLM-generated SQL on a shared pool.
        """
        return f"EXPLAIN FORMAT=JSON {query}"

    # Table-details Method (added for the get_table_details AI tool)

    def get_table_details_query(self, table_name: str, db_name: str = None, schema: str = "public") -> tuple:
        """Return SQL query and params for a rich per-column MySQL schema dump.

        Returns one row per column with positional columns:
            name, data_type, is_nullable, default_value,
            is_primary_key (0/1), is_unique (0/1), max_length
        """
        query = """
            SELECT
                c.COLUMN_NAME AS name,
                c.COLUMN_TYPE AS data_type,
                c.IS_NULLABLE AS is_nullable,
                c.COLUMN_DEFAULT AS default_value,
                CASE WHEN c.COLUMN_KEY = 'PRI' THEN 1 ELSE 0 END AS is_primary_key,
                CASE WHEN c.COLUMN_KEY IN ('UNI', 'PRI') THEN 1 ELSE 0 END AS is_unique,
                c.CHARACTER_MAXIMUM_LENGTH AS max_length
            FROM information_schema.COLUMNS c
            WHERE c.TABLE_SCHEMA = %s AND c.TABLE_NAME = %s
            ORDER BY c.ORDINAL_POSITION
        """
        return query, (db_name, table_name)

    # Views Introspection Methods (added for the list_views AI tool)

    def get_views(self, schema: str = None, db_name: str = None) -> tuple:
        """Return SQL query and params to list MySQL views in ``db_name``.

        MySQL does not support materialized views natively, so
        ``get_materialized_views`` returns ``None`` for this adapter.
        """
        query = """
            SELECT table_name
            FROM information_schema.views
            WHERE table_schema = %s
            ORDER BY table_name
        """
        return query, (db_name,)
