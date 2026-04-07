"""
PostgreSQL Database Adapter

Implements database operations for PostgreSQL using psycopg2.
"""

import logging
from typing import Any, Dict, Optional
from contextlib import contextmanager
from .base_adapter import BaseDatabaseAdapter

logger = logging.getLogger(__name__)

try:
    import psycopg2
    from psycopg2 import pool, extras

    POSTGRESQL_AVAILABLE = True
    _ = psycopg2  # Mark as used for import check pattern
except ImportError:
    POSTGRESQL_AVAILABLE = False
    logger.warning("psycopg2 not installed. PostgreSQL support disabled.")


class PostgreSQLAdapter(BaseDatabaseAdapter):
    """PostgreSQL database adapter."""

    def __init__(self):
        if not POSTGRESQL_AVAILABLE:
            raise ImportError(
                "psycopg2 is required for PostgreSQL support. "
                "Install it with: pip install psycopg2-binary"
            )

    @property
    def db_type(self) -> str:
        return "postgresql"

    @property
    def default_port(self) -> Optional[int]:
        return 5432

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
            # Check if connection string is provided
            connection_string = config.get("connection_string")

            if connection_string:
                # Use connection string directly - supports SSL, remote DBs
                # Parse to get database name for logging
                import re

                db_match = re.search(r"/([^/?]+)(\?|$)", connection_string)
                db_name = db_match.group(1) if db_match else "unknown"

                connection_pool = pool.ThreadedConnectionPool(
                    minconn=1, maxconn=20, dsn=connection_string
                )
                logger.info(
                    f"Created PostgreSQL connection pool using connection string for database: {db_name}"
                )
                return connection_pool
            else:
                # Use individual parameters for local connections
                pool_config = {
                    "host": config["host"],
                    "port": config.get("port", 5432),
                    "user": config["user"],
                    "password": config["password"],
                    "minconn": 1,
                    "maxconn": 20,
                }

                # Add SSL mode if specified (for remote DBs)
                if config.get("sslmode"):
                    pool_config["sslmode"] = config["sslmode"]

                # Add database if specified
                if config.get("database"):
                    pool_config["database"] = config["database"]
                else:
                    # Connect to default 'postgres' database if none specified
                    pool_config["database"] = "postgres"

                connection_pool = pool.ThreadedConnectionPool(**pool_config)
                logger.info(
                    f"Created PostgreSQL connection pool for {config['user']}@{config['host']}"
                )
                return connection_pool

        except Exception as err:
            logger.error(f"Failed to create PostgreSQL pool: {err}")
            raise

    def get_connection_from_pool(self, pool: Any) -> Any:
        """Get PostgreSQL connection from pool."""
        try:
            return pool.getconn()
        except Exception as err:
            logger.error(f"Failed to get PostgreSQL connection from pool: {err}")
            raise

    def close_pool(self, pool: Any) -> bool:
        """Close PostgreSQL connection pool."""
        try:
            pool.closeall()
            logger.info("Closed PostgreSQL connection pool")
            return True
        except Exception as err:
            logger.error(f"Failed to close PostgreSQL pool: {err}")
            return False

    def return_connection_to_pool(self, pool: Any, connection: Any) -> None:
        """Return PostgreSQL connection back to pool."""
        try:
            pool.putconn(connection)
        except Exception as err:
            logger.warning(f"Failed to return PostgreSQL connection to pool: {err}")
            # Try to close the connection if we can't return it
            try:
                connection.close()
            except Exception:
                pass

    @contextmanager
    def get_cursor(
        self, connection: Any, dictionary: bool = False, buffered: bool = True
    ):
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
        """SQL query to list PostgreSQL tables in a specific schema."""
        # Use format to inject schema name safely (schema names are identifiers)
        return f"""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = '{schema}'
            AND table_type = 'BASE TABLE'
        """

    def get_table_schema_query(self, schema: str = "public") -> str:
        """SQL query to get PostgreSQL table schema in a specific schema."""
        return f"""
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
                            AND tc.table_schema = '{schema}'
                    ) THEN 'PRI'
                    ELSE ''
                END as column_key,
                character_maximum_length,
                numeric_precision,
                numeric_scale
            FROM information_schema.columns
            WHERE table_name = %s
            AND table_schema = '{schema}'
            ORDER BY ordinal_position
        """

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

    def get_schema_info_for_ai(self, schema: str = "public") -> dict:
        """
        Return queries to get full schema info for AI context.

        Returns:
            dict with 'tables' and 'columns' SQL queries
        """
        return {
            "tables": f"""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = '{schema}' 
                AND table_type = 'BASE TABLE'
                ORDER BY table_name
            """,
            "columns": f"""
                SELECT table_name, column_name, data_type 
                FROM information_schema.columns 
                WHERE table_schema = '{schema}'
                ORDER BY table_name, ordinal_position
            """,
        }

    def validate_connection(self, connection: Any) -> bool:
        """Validate PostgreSQL connection is alive."""
        try:
            if connection and not connection.closed:
                cursor = connection.cursor()
                cursor.execute("SELECT 1")
                cursor.fetchone()
                cursor.close()
                return True
        except Exception as e:
            logger.debug(f"PostgreSQL connection validation failed: {e}")
        return False

    def format_column_info(self, raw_column: Any) -> Dict:
        """Format PostgreSQL column information."""
        if isinstance(raw_column, dict):
            # Build type string with precision/scale if applicable
            type_str = raw_column.get("data_type", "")
            if raw_column.get("character_maximum_length"):
                type_str += f"({raw_column['character_maximum_length']})"
            elif raw_column.get("numeric_precision"):
                if raw_column.get("numeric_scale"):
                    type_str += f"({raw_column['numeric_precision']},{raw_column['numeric_scale']})"
                else:
                    type_str += f"({raw_column['numeric_precision']})"

            return {
                "name": raw_column.get("column_name", ""),
                "type": type_str,
                "nullable": raw_column.get("is_nullable", "NO") == "YES",
                "key": raw_column.get("column_key", ""),
                "default": raw_column.get("column_default"),
                "extra": "",  # PostgreSQL doesn't have EXTRA like MySQL
            }
        else:
            # Tuple format: (name, type, nullable, default, key, max_length, precision, scale)
            type_str = raw_column[1]
            if raw_column[5]:  # character_maximum_length
                type_str += f"({raw_column[5]})"
            elif raw_column[6]:  # numeric_precision
                if raw_column[7]:  # numeric_scale
                    type_str += f"({raw_column[6]},{raw_column[7]})"
                else:
                    type_str += f"({raw_column[6]})"

            return {
                "name": raw_column[0],
                "type": type_str,
                "nullable": raw_column[2] == "YES",
                "key": raw_column[4],
                "default": raw_column[3],
                "extra": "",
            }

    # =========================================================================
    # Schema Caching Methods (for AI context)
    # =========================================================================

    def get_all_tables_for_cache(self, db_name: str, schema: str = "public") -> tuple:
        """Return SQL query and params to get all tables for schema caching."""
        query = f"""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = '{schema}' AND table_type = 'BASE TABLE'
            ORDER BY table_name
        """
        return query, ()  # No params needed, schema is embedded

    def get_columns_for_table_cache(
        self, db_name: str, table_name: str, schema: str = "public"
    ) -> tuple:
        """Return SQL query and params to get column names for a table."""
        query = f"""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = '{schema}' AND table_name = %s
            ORDER BY ordinal_position
        """
        return query, (table_name,)

    def get_column_details_for_table(
        self, db_name: str, table_name: str, schema: str = "public"
    ) -> tuple:
        """Return SQL query and params to get full column details for a table."""
        query = f"""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = '{schema}' AND table_name = %s
            ORDER BY ordinal_position
        """
        return query, (table_name,)

    def get_set_timeout_sql(self, timeout_seconds: int) -> str:
        """Return PostgreSQL query timeout SQL."""
        return f"SET statement_timeout = '{timeout_seconds * 1000}ms'"

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

    def get_batch_columns_for_tables(
        self, db_name: str, tables: list, schema: str = "public"
    ) -> tuple:
        """Return SQL query and params to batch fetch columns for multiple tables.

        Returns (table_name, column_name, column_key) where column_key is 'PRI' for primary keys.
        """
        if not tables:
            return None, []

        query = f"""
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
                AND tc.table_schema = '{schema}'
            ) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
            WHERE c.table_schema = '{schema}'
            AND c.table_name = ANY(%s)
            ORDER BY c.table_name, c.ordinal_position
        """
        return query, (tables,)

    # =========================================================================
    # Schema Metadata Methods (for AI tools)
    # =========================================================================

    def get_indexes_query(
        self, table_name: str, db_name: str = None, schema: str = "public"
    ) -> tuple:
        """Return SQL query and params to get indexes for a PostgreSQL table."""
        query = f"""
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
            AND n.nspname = '{schema}'
            ORDER BY i.relname, a.attnum
        """
        return query, (table_name,)

    def get_constraints_query(
        self, table_name: str, db_name: str = None, schema: str = "public"
    ) -> tuple:
        """Return SQL query and params to get constraints for a PostgreSQL table."""
        query = f"""
            SELECT 
                tc.constraint_name,
                tc.constraint_type,
                kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            WHERE tc.table_name = %s
            AND tc.table_schema = '{schema}'
            ORDER BY tc.constraint_type, tc.constraint_name, kcu.ordinal_position
        """
        return query, (table_name,)

    def get_foreign_keys_query(
        self, table_name: str = None, db_name: str = None, schema: str = "public"
    ) -> tuple:
        """Return SQL query and params to get foreign key relationships in PostgreSQL."""
        if table_name:
            query = f"""
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
                AND tc.table_schema = '{schema}'
                ORDER BY tc.table_name, kcu.column_name
            """
            return query, (table_name,)
        else:
            query = f"""
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
                AND tc.table_schema = '{schema}'
                ORDER BY tc.table_name, kcu.column_name
            """
            return query, ()
