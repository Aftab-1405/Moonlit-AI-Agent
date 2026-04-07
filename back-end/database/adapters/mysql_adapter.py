"""
MySQL Database Adapter

Implements database operations for MySQL using mysql-connector-python.
"""

import mysql.connector
from mysql.connector import pooling
from typing import Any, Dict, Optional
from contextlib import contextmanager
import logging
from .base_adapter import BaseDatabaseAdapter
from config import Config

logger = logging.getLogger(__name__)


class MySQLAdapter(BaseDatabaseAdapter):
    """MySQL database adapter."""

    @property
    def db_type(self) -> str:
        return "mysql"

    @property
    def default_port(self) -> Optional[int]:
        return 3306

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
        from database.mysql_utils import get_mysql_connect_kwargs

        try:
            # Get connection kwargs from shared utility
            pool_config = get_mysql_connect_kwargs(config, for_pool=True)

            # Add pool-specific settings
            connection_string = config.get("connection_string")
            if connection_string:
                pool_config["pool_name"] = f"mysql_remote_pool_{id(config)}"
            else:
                pool_config["pool_name"] = f"mysql_pool_{id(config)}"
                pool_config["pool_size"] = min(Config.MAX_WORKERS * 2, 32)

            pool = pooling.MySQLConnectionPool(**pool_config)

            host = pool_config.get("host", "unknown")
            db = pool_config.get("database", "N/A")
            user = pool_config.get("user", "unknown")

            if connection_string:
                logger.info(
                    f"Created MySQL connection pool using connection string for database: {db} at {host}"
                )
            else:
                logger.info(f"Created MySQL connection pool for {user}@{host}")

            return pool

        except mysql.connector.Error as err:
            logger.error(f"Failed to create MySQL pool: {err}")
            raise

    def get_connection_from_pool(self, pool: Any) -> Any:
        """Get MySQL connection from pool."""
        try:
            return pool.get_connection()
        except mysql.connector.Error as err:
            logger.error(f"Failed to get MySQL connection from pool: {err}")
            raise

    def close_pool(self, pool: Any) -> bool:
        """Close MySQL connection pool."""
        try:
            # MySQL connector pools don't have a direct close method
            # Connections are closed when pool is garbage collected
            # We can force close all connections in the pool
            if hasattr(pool, "_cnx_queue"):
                while not pool._cnx_queue.empty():
                    try:
                        conn = pool._cnx_queue.get(block=False)
                        if conn:
                            conn.close()
                    except Exception:
                        pass
            logger.info("Closed MySQL connection pool")
            return True
        except Exception as err:
            logger.error(f"Failed to close MySQL pool: {err}")
            return False

    def return_connection_to_pool(self, pool: Any, connection: Any) -> None:
        """Return MySQL connection back to pool.

        For MySQL connector, pooled connections are returned automatically
        when close() is called on a pooled connection.
        """
        try:
            if connection and connection.is_connected():
                connection.close()  # Returns to pool for pooled connections
        except Exception as err:
            logger.warning(f"Failed to return MySQL connection to pool: {err}")

    @contextmanager
    def get_cursor(
        self, connection: Any, dictionary: bool = False, buffered: bool = True
    ):
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
        """Validate MySQL connection is alive."""
        try:
            if connection and connection.is_connected():
                cursor = connection.cursor()
                cursor.execute("SELECT 1")
                cursor.fetchone()
                cursor.close()
                return True
        except Exception as e:
            logger.debug(f"MySQL connection validation failed: {e}")
        return False

    def format_column_info(self, raw_column: Any) -> Dict:
        """Format MySQL column information."""
        if isinstance(raw_column, dict):
            return {
                "name": raw_column.get("COLUMN_NAME", ""),
                "type": raw_column.get("COLUMN_TYPE", ""),
                "nullable": raw_column.get("IS_NULLABLE", "NO") == "YES",
                "key": raw_column.get("COLUMN_KEY", ""),
                "default": raw_column.get("COLUMN_DEFAULT"),
                "extra": raw_column.get("EXTRA", ""),
            }
        else:
            # Tuple format: (name, type, nullable, key, default, extra)
            return {
                "name": raw_column[0],
                "type": raw_column[1],
                "nullable": raw_column[2] == "YES",
                "key": raw_column[3],
                "default": raw_column[4],
                "extra": raw_column[5],
            }

    # =========================================================================
    # Schema Caching Methods (for AI context)
    # =========================================================================

    def get_all_tables_for_cache(self, db_name: str, schema: str = "public") -> tuple:
        """Return SQL query and params to get all tables for schema caching."""
        query = """
            SELECT TABLE_NAME 
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = %s AND TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
        """
        return query, (db_name,)

    def get_columns_for_table_cache(
        self, db_name: str, table_name: str, schema: str = "public"
    ) -> tuple:
        """Return SQL query and params to get column names for a table."""
        query = """
            SELECT COLUMN_NAME
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
            ORDER BY ORDINAL_POSITION
        """
        return query, (db_name, table_name)

    def get_column_details_for_table(
        self, db_name: str, table_name: str, schema: str = "public"
    ) -> tuple:
        """Return SQL query and params to get full column details for a table."""
        query = """
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
            ORDER BY ORDINAL_POSITION
        """
        return query, (db_name, table_name)

    def get_set_timeout_sql(self, timeout_seconds: int) -> str:
        """Return MySQL query timeout SQL."""
        return f"SET SESSION MAX_EXECUTION_TIME={timeout_seconds * 1000}"

    def get_column_names_from_cursor(self, cursor: Any) -> list:
        """Extract column names from MySQL cursor."""
        if hasattr(cursor, "column_names"):
            return list(cursor.column_names)
        return []

    def get_databases_for_cache(self) -> tuple:
        """Return SQL query and params to get all databases for caching."""
        # MySQL: SHOW DATABASES, then filter system DBs in code
        return "SHOW DATABASES", ()

    def get_batch_columns_for_tables(
        self, db_name: str, tables: list, schema: str = "public"
    ) -> tuple:
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

    # =========================================================================
    # Schema Metadata Methods (for AI tools)
    # =========================================================================

    def get_indexes_query(
        self, table_name: str, db_name: str = None, schema: str = "public"
    ) -> tuple:
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

    def get_constraints_query(
        self, table_name: str, db_name: str = None, schema: str = "public"
    ) -> tuple:
        """Return SQL query and params to get constraints for a MySQL table."""
        query = """
            SELECT 
                tc.CONSTRAINT_NAME AS constraint_name,
                tc.CONSTRAINT_TYPE AS constraint_type,
                kcu.COLUMN_NAME AS column_name
            FROM information_schema.TABLE_CONSTRAINTS tc
            JOIN information_schema.KEY_COLUMN_USAGE kcu
                ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
                AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
                AND tc.TABLE_NAME = kcu.TABLE_NAME
            WHERE tc.TABLE_SCHEMA = %s AND tc.TABLE_NAME = %s
            ORDER BY tc.CONSTRAINT_TYPE, tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
        """
        return query, (db_name, table_name)

    def get_foreign_keys_query(
        self, table_name: str = None, db_name: str = None, schema: str = "public"
    ) -> tuple:
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
