"""
PostgreSQL Database Adapter

Implements database operations for PostgreSQL using psycopg2.
"""

import logging
from contextlib import contextmanager
from typing import Any, Dict, Optional

from config import get_config
from core.errors import log_safe_exception, public_database_error

Config = get_config()
from .base_adapter import BaseDatabaseAdapter

logger = logging.getLogger(__name__)

try:
    import psycopg2
    from psycopg2 import extras, pool
    from psycopg2 import sql as _pg_sql

    POSTGRESQL_AVAILABLE = True
    _ = psycopg2  # Mark as used for import check pattern
except ImportError:
    POSTGRESQL_AVAILABLE = False
    logger.warning("psycopg2 not installed. PostgreSQL support disabled.")


class PostgreSQLAdapter(BaseDatabaseAdapter):
    """PostgreSQL database adapter (psycopg2-based)."""

    def _sanitize_schema(self, schema: str) -> str:
        if not schema:
            return "public"
        import re

        if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", schema):
            raise ValueError(f"Invalid schema name: {schema}")
        return schema

    def __init__(self):
        if not POSTGRESQL_AVAILABLE:
            raise ImportError(
                "psycopg2 is required for PostgreSQL support. Install it with: pip install psycopg2-binary"
            )

    @property
    def db_type(self) -> str:
        return "postgresql"

    @property
    def default_port(self) -> Optional[int]:
        return Config.DEFAULT_POSTGRESQL_PORT

    @property
    def requires_server(self) -> bool:
        return True

    def create_connection_pool(self, config: Dict) -> Any:
        """Create PostgreSQL connection pool.

        Supports either:
        1. Connection string (DSN) via 'connection_string' key
        2. Individual parameters (host, port, user, password, database)

        Connection strings support remote databases with SSL (Neon, Supabase, etc.)
        """
        try:
            connection_string = config.get("connection_string")

            if connection_string:
                # Use connection string directly - supports SSL, remote DBs
                connection_pool = pool.ThreadedConnectionPool(
                    minconn=Config.DEFAULT_DB_POOL_MIN_CONNECTIONS,
                    maxconn=min(
                        Config.DB_POOL_WORKER_BASIS * 2,
                        Config.DEFAULT_DB_POOL_MAX_CONNECTIONS,
                    ),
                    dsn=connection_string,
                    connect_timeout=Config.DB_CONNECT_TIMEOUT_SECONDS,
                )
                logger.info("Created remote PostgreSQL connection pool")
                return connection_pool
            else:
                pool_config = {
                    "host": config["host"],
                    "port": config.get("port", Config.DEFAULT_POSTGRESQL_PORT),
                    "user": config["user"],
                    "password": config["password"],
                    "minconn": Config.DEFAULT_DB_POOL_MIN_CONNECTIONS,
                    "maxconn": min(
                        Config.DB_POOL_WORKER_BASIS * 2,
                        Config.DEFAULT_DB_POOL_MAX_CONNECTIONS,
                    ),
                    "connect_timeout": Config.DB_CONNECT_TIMEOUT_SECONDS,
                }
                if config.get("sslmode"):
                    pool_config["sslmode"] = config["sslmode"]
                if config.get("database"):
                    pool_config["database"] = config["database"]
                else:
                    # Connect to default 'postgres' database if none specified
                    pool_config["database"] = Config.DEFAULT_POSTGRESQL_DATABASE

                connection_pool = pool.ThreadedConnectionPool(**pool_config)
                logger.info("Created PostgreSQL connection pool")
                return connection_pool

        except Exception as err:
            log_safe_exception(logger, "create_postgresql_pool", err, public_database_error(err))
            raise

    def get_connection_from_pool(self, pool: Any) -> Any:
        """Get PostgreSQL connection from pool."""
        try:
            return pool.getconn()
        except Exception as err:
            log_safe_exception(logger, "acquire_postgresql_connection", err, public_database_error(err))
            raise

    def close_pool(self, pool: Any) -> bool:
        """Close PostgreSQL connection pool."""
        try:
            pool.closeall()
            logger.info("Closed PostgreSQL connection pool")
            return True
        except Exception as err:
            log_safe_exception(logger, "close_postgresql_pool", err, public_database_error(err))
            return False

    def return_connection_to_pool(self, pool: Any, connection: Any) -> None:
        """Return PostgreSQL connection back to pool."""
        try:
            pool.putconn(connection)
        except Exception as err:
            log_safe_exception(
                logger,
                "return_postgresql_connection",
                err,
                public_database_error(err),
                level=logging.WARNING,
            )
            # Try to close the connection if we can't return it
            try:
                connection.close()
            except Exception:
                pass

    @contextmanager
    def get_cursor(self, connection: Any, dictionary: bool = False, buffered: bool = True):
        """Get PostgreSQL cursor from connection."""
        cursor = None
        try:
            if dictionary:
                cursor = connection.cursor(cursor_factory=extras.RealDictCursor)
            else:
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
        """SQL query to list PostgreSQL databases."""
        return """
            SELECT datname
            FROM pg_database
            WHERE datistemplate = false
        """

    def get_schemas_query(self) -> str:
        """SQL query to list PostgreSQL schemas in current database."""
        return """
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
            ORDER BY schema_name
        """

    def get_tables_query(self, schema: str = "public") -> str:
        """SQL query to list PostgreSQL tables in a specific schema.

        FIX [M15]: the schema name is interpolated using
        ``psycopg2.sql.Literal`` instead of an f-string, so even if the
        ``_sanitize_schema`` regex is ever relaxed we cannot end up with
        SQL injection through the schema value. Returns a Composed object
        which ``cursor.execute`` accepts in place of a plain string.
        """
        schema = self._sanitize_schema(schema)
        return _pg_sql.SQL("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = {}
            AND table_type = 'BASE TABLE'
        """).format(_pg_sql.Literal(schema))

    def get_table_schema_query(self, schema: str = "public") -> str:
        """SQL query to get PostgreSQL table schema in a specific schema.

        FIX [M15]: the schema name is interpolated using
        ``psycopg2.sql.Literal`` (defense-in-depth) rather than an f-string.
        Returns a Composed object; the table-name placeholders (%s) are
        still filled in by the caller via the params tuple.
        """
        schema = self._sanitize_schema(schema)
        return _pg_sql.SQL("""
            SELECT
                column_name,
                data_type,
                is_nullable,
                column_default,
                CASE
                    WHEN column_name IN (
                        SELECT kcu.column_name
                        FROM information_schema.table_constraints tc
                        JOIN information_schema.key_column_usage kcu
                            ON tc.constraint_name = kcu.constraint_name
                            AND tc.table_schema = kcu.table_schema
                        WHERE tc.constraint_type = 'PRIMARY KEY'
                            AND tc.table_name = %s
                            AND tc.table_schema = {}
                    ) THEN 'PRI'
                    ELSE ''
                END as column_key,
                character_maximum_length,
                numeric_precision,
                numeric_scale
            FROM information_schema.columns
            WHERE table_name = %s
            AND table_schema = {}
            ORDER BY ordinal_position
        """).format(_pg_sql.Literal(schema), _pg_sql.Literal(schema))

    def get_system_databases(self) -> set:
        """PostgreSQL system databases to filter out."""
        return {"template0", "template1"}

    def get_databases_for_remote(self) -> str:
        """SQL query for remote PostgreSQL (excludes postgres db for cleaner list)."""
        return """
            SELECT datname FROM pg_database
            WHERE datistemplate = false
            AND datname NOT IN ('postgres')
            ORDER BY datname
        """

    def validate_connection(self, connection: Any) -> bool:
        """
        Validate that the PostgreSQL connection is alive by issuing ``SELECT 1``.

        Resource handling (FIX [M11]): the cursor is created inside a
        ``try/finally`` so it is always closed even if ``execute`` or
        ``fetchone`` raises. Previously the cursor was only closed on the
        success path, which leaked it and could leave the connection in an
        aborted-transaction state.
        """
        cursor = None
        try:
            if connection and not connection.closed:
                cursor = connection.cursor()
                cursor.execute("SELECT 1")
                cursor.fetchone()
                return True
        except Exception as err:
            log_safe_exception(
                logger,
                "validate_postgresql_connection",
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
        """Return SQL query and params to get all tables for schema caching.

        FIX [M15]: the schema name is interpolated using
        ``psycopg2.sql.Literal`` (defense-in-depth) rather than an f-string.
        """
        schema = self._sanitize_schema(schema)
        query = _pg_sql.SQL("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = {} AND table_type = 'BASE TABLE'
            ORDER BY table_name
        """).format(_pg_sql.Literal(schema))
        return query, ()  # No params needed, schema is embedded as a Literal

    def get_set_timeout_sql(self, timeout_seconds: int) -> str:
        """Return PostgreSQL query timeout SQL."""
        return f"SET statement_timeout = '{timeout_seconds * 1000}ms'"

    def get_health_check_sql(self) -> str:
        """
        Return PostgreSQL's no-op health-check SQL.

        FIX [EC6]: issued before each user query to fail-fast on stale
        pooled connections. PostgreSQL accepts the standard ``SELECT 1``.
        """
        return "SELECT 1"

    def get_column_names_from_cursor(self, cursor: Any) -> list:
        """Extract column names from PostgreSQL cursor."""
        if cursor.description:
            return [desc[0] for desc in cursor.description]
        return []

    def get_databases_for_cache(self) -> tuple:
        """Return SQL query and params to get all databases for caching."""
        query = """
            SELECT datname FROM pg_database
            WHERE datistemplate = false
            AND datname NOT IN ('postgres', 'template0', 'template1')
            ORDER BY datname
        """
        return query, ()

    def get_batch_columns_for_tables(self, db_name: str, tables: list, schema: str = "public") -> tuple:
        """Return SQL query and params to batch fetch columns for multiple tables.

        Returns (table_name, column_name, column_key) where column_key is 'PRI' for primary keys.

        FIX [M15]: the schema name is interpolated using
        ``psycopg2.sql.Literal`` (defense-in-depth) rather than an f-string.
        """
        import re

        if schema and not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", schema):
            raise ValueError(f"Invalid schema name: {schema}")

        if not tables:
            return None, []

        query = _pg_sql.SQL("""
            SELECT
                c.table_name,
                c.column_name,
                CASE WHEN pk.column_name IS NOT NULL THEN 'PRI' ELSE '' END AS column_key
            FROM information_schema.columns c
            LEFT JOIN (
                SELECT kcu.table_name, kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                AND tc.table_schema = {}
            ) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
            WHERE c.table_schema = {}
            AND c.table_name = ANY(%s)
            ORDER BY c.table_name, c.ordinal_position
        """).format(_pg_sql.Literal(schema), _pg_sql.Literal(schema))
        return query, (tables,)

    # Schema Metadata Methods (for AI tools)

    def get_indexes_query(self, table_name: str, db_name: str = None, schema: str = "public") -> tuple:
        """Return SQL query and params to get indexes for a PostgreSQL table.

        FIX [M15]: the schema name is interpolated using
        ``psycopg2.sql.Literal`` (defense-in-depth) rather than an f-string.
        """
        schema = self._sanitize_schema(schema)
        query = _pg_sql.SQL("""
            SELECT
                i.relname AS index_name,
                a.attname AS column_name,
                ix.indisunique AS is_unique,
                ix.indisprimary AS is_primary
            FROM pg_class t
            JOIN pg_index ix ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE t.relname = %s
            AND n.nspname = {}
            ORDER BY i.relname, a.attnum
        """).format(_pg_sql.Literal(schema))
        return query, (table_name,)

    def get_foreign_keys_query(self, table_name: str = None, db_name: str = None, schema: str = "public") -> tuple:
        """Return SQL query and params to get foreign key relationships in PostgreSQL.

        FIX [M15]: the schema name is interpolated using
        ``psycopg2.sql.Literal`` (defense-in-depth) rather than an f-string.
        """
        schema = self._sanitize_schema(schema)
        if table_name:
            query = _pg_sql.SQL("""
                SELECT
                    tc.table_name,
                    kcu.column_name,
                    ccu.table_name AS referenced_table,
                    ccu.column_name AS referenced_column
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu
                    ON ccu.constraint_name = tc.constraint_name
                    AND ccu.table_schema = tc.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_name = %s
                AND tc.table_schema = {}
                ORDER BY tc.table_name, kcu.column_name
            """).format(_pg_sql.Literal(schema))
            return query, (table_name,)
        else:
            query = _pg_sql.SQL("""
                SELECT
                    tc.table_name,
                    kcu.column_name,
                    ccu.table_name AS referenced_table,
                    ccu.column_name AS referenced_column
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu
                    ON ccu.constraint_name = tc.constraint_name
                    AND ccu.table_schema = tc.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_schema = {}
                ORDER BY tc.table_name, kcu.column_name
            """).format(_pg_sql.Literal(schema))
            return query, ()

    # EXPLAIN / Query-plan Methods (added for the explain_query AI tool)
    #
    # PostgreSQL's ``EXPLAIN (FORMAT JSON, VERBOSE)`` returns one row whose
    # first column is a JSON array describing the full plan tree with per-node
    # cost / row estimates, filter conditions, and (when VERBOSE) the actual
    # output column lists. We deliberately do NOT use ANALYZE because ANALYZE
    # actually executes the query — for arbitrary LLM-generated SQL on a
    # shared pool, that's an unacceptable side-effect (a SELECT could lock
    # rows, fire triggers via views, or just consume resources). The
    # VERBOSE variant gives the AI enough to identify seq scans, missing
    # indexes, and bad join orderings without the execution risk.

    @property
    def explain_format(self) -> str:
        """PostgreSQL EXPLAIN output format tag (JSON)."""
        return "json"

    def get_explain_sql(self, query: str) -> str:
        """Return PostgreSQL ``EXPLAIN (FORMAT JSON, VERBOSE)`` for a validated query.

        ``query`` must already be validated as read-only (SELECT/WITH) by
        ``DatabaseSecurity.analyze_sql_query``. We deliberately omit ANALYZE
        so the underlying SELECT is never executed — ANALYZE would actually
        run the statement, which is unsafe for arbitrary LLM-generated SQL
        on a shared pool (locks, triggers, resource cost).
        """
        return f"EXPLAIN (FORMAT JSON, VERBOSE) {query}"

    # Table-details Method (added for the get_table_details AI tool)

    def get_table_details_query(self, table_name: str, db_name: str = None, schema: str = "public") -> tuple:
        """Return SQL query and params for a rich per-column PostgreSQL schema dump.

        Returns one row per column with positional columns:
            name, data_type, is_nullable, default_value,
            is_primary_key (bool), is_unique (bool), max_length

        FIX [M15]: the schema name is interpolated using
        ``psycopg2.sql.Literal`` (defense-in-depth) rather than an f-string.
        """
        schema = self._sanitize_schema(schema)
        query = _pg_sql.SQL("""
            SELECT
                c.column_name AS name,
                c.data_type AS data_type,
                c.is_nullable AS is_nullable,
                c.column_default AS default_value,
                (pk.column_name IS NOT NULL) AS is_primary_key,
                (uq.column_name IS NOT NULL) AS is_unique,
                c.character_maximum_length AS max_length
            FROM information_schema.columns c
            LEFT JOIN (
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                AND tc.table_schema = {}
                AND tc.table_name = %s
            ) pk ON c.column_name = pk.column_name
            LEFT JOIN (
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'UNIQUE'
                AND tc.table_schema = {}
                AND tc.table_name = %s
            ) uq ON c.column_name = uq.column_name
            WHERE c.table_schema = {}
            AND c.table_name = %s
            ORDER BY c.ordinal_position
        """).format(
            _pg_sql.Literal(schema),
            _pg_sql.Literal(schema),
            _pg_sql.Literal(schema),
        )
        # Three %s placeholders for table_name (pk subquery, uq subquery,
        # main WHERE) — psycopg2 fills them positionally from the tuple.
        return query, (table_name, table_name, table_name)

    # Views Introspection Methods (added for the list_views AI tool)

    def get_views(self, schema: str = None, db_name: str = None) -> tuple:
        """Return SQL query and params to list PostgreSQL views in ``schema``.

        FIX [M15]: the schema name is interpolated using
        ``psycopg2.sql.Literal`` (defense-in-depth) rather than an f-string.
        """
        schema = self._sanitize_schema(schema)
        query = _pg_sql.SQL("""
            SELECT table_name
            FROM information_schema.views
            WHERE table_schema = {}
            ORDER BY table_name
        """).format(_pg_sql.Literal(schema))
        return query, ()

    def get_materialized_views(self, schema: str = None, db_name: str = None):
        """Return SQL query and params to list PostgreSQL materialized views.

        PostgreSQL is the only supported DBMS that has first-class
        materialized views (``pg_matviews`` is a public view that lists
        them). We use ``pg_class`` instead because ``pg_matviews`` requires
        the user to have been granted explicit select on it; ``pg_class``
        is universally readable and ``relkind = 'm'`` is the canonical
        filter for materialized views.

        FIX [M15]: the schema name is interpolated using
        ``psycopg2.sql.Literal`` (defense-in-depth) rather than an f-string.
        """
        schema = self._sanitize_schema(schema)
        query = _pg_sql.SQL("""
            SELECT c.relname
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind = 'm'
            AND n.nspname = {}
            ORDER BY c.relname
        """).format(_pg_sql.Literal(schema))
        return query, ()
