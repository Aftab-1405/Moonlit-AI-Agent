"""
SQL Server Database Adapter

Implements database operations for SQL Server using pyodbc.
Supports local SQL Server instances and cloud providers (Azure SQL, AWS RDS, Google Cloud SQL).
"""

import logging
from typing import Any, Dict, List, Optional
from contextlib import contextmanager
from .base_adapter import BaseDatabaseAdapter

logger = logging.getLogger(__name__)


class SQLServerAdapter(BaseDatabaseAdapter):
    """SQL Server database adapter using pyodbc."""

    @property
    def db_type(self) -> str:
        return "sqlserver"

    @property
    def default_port(self) -> Optional[int]:
        return 1433

    @property
    def requires_server(self) -> bool:
        return True

    def create_connection_pool(self, config: Dict) -> Any:
        """
        Create SQL Server connection pool.

        Supports:
        1. Connection string (for Azure SQL, AWS RDS, etc.)
        2. Individual parameters (host, port, user, password, database)

        Note: pyodbc doesn't have built-in pooling, so we create a connection factory.
        """

        try:
            connection_string = config.get("connection_string")

            if connection_string:
                # Remote connection via connection string
                # Expected format: Driver={ODBC Driver 17};Server=xxx;Database=xxx;UID=xxx;PWD=xxx
                conn_str = connection_string
                logger.info("Creating SQL Server connection using connection string")
            else:
                # Local connection via individual parameters
                host = config.get("host", "localhost")
                port = config.get("port", 1433)
                user = config.get("user", "")
                password = config.get("password", "")
                database = config.get("database", "master")
                driver = config.get("driver", "ODBC Driver 17 for SQL Server")

                conn_str = (
                    f"Driver={{{driver}}};"
                    f"Server={host},{port};"
                    f"Database={database};"
                    f"UID={user};"
                    f"PWD={password};"
                    f"TrustServerCertificate=yes;"
                )
                logger.info(f"Creating SQL Server connection for {user}@{host}:{port}")

            # Store connection string in config for later use
            config["_connection_string"] = conn_str

            # Return config as "pool" - we'll create connections on demand
            return config

        except Exception as err:
            logger.error(f"Failed to create SQL Server connection config: {err}")
            raise

    def get_connection_from_pool(self, pool: Any) -> Any:
        """Get SQL Server connection from pool (creates new connection)."""
        import pyodbc

        try:
            conn_str = pool.get("_connection_string")
            if not conn_str:
                raise ValueError("No connection string found in pool config")

            connection = pyodbc.connect(conn_str, timeout=30)
            return connection
        except Exception as err:
            logger.error(f"Failed to get SQL Server connection: {err}")
            raise

    def close_pool(self, pool: Any) -> bool:
        """Close SQL Server connection pool (no-op for pyodbc)."""
        logger.info("SQL Server pool closed")
        return True

    def return_connection_to_pool(self, pool: Any, connection: Any) -> None:
        """Return SQL Server connection back to pool (closes connection)."""
        try:
            if connection:
                connection.close()
        except Exception as err:
            logger.warning(f"Failed to close SQL Server connection: {err}")

    @contextmanager
    def get_cursor(
        self, connection: Any, dictionary: bool = False, buffered: bool = True
    ):
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
            ORDER BY name
        """

    def get_tables_query(self) -> str:
        """SQL query to list SQL Server tables."""
        return """
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_CATALOG = ?
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
            WHERE TABLE_CATALOG = ? AND TABLE_NAME = ?
            ORDER BY ORDINAL_POSITION
        """

    def get_system_databases(self) -> set:
        """SQL Server system databases to filter out."""
        return {"master", "tempdb", "model", "msdb"}

    def validate_connection(self, connection: Any) -> bool:
        """Validate SQL Server connection is alive."""
        try:
            if connection:
                cursor = connection.cursor()
                cursor.execute("SELECT 1")
                cursor.fetchone()
                cursor.close()
                return True
        except Exception as e:
            logger.debug(f"SQL Server connection validation failed: {e}")
        return False

    def format_column_info(self, raw_column: Any) -> Dict:
        """Format SQL Server column information."""
        if isinstance(raw_column, dict):
            return {
                "name": raw_column.get("COLUMN_NAME", ""),
                "type": raw_column.get("DATA_TYPE", ""),
                "nullable": raw_column.get("IS_NULLABLE", "NO") == "YES",
                "key": "",
                "default": raw_column.get("COLUMN_DEFAULT"),
                "extra": "",
            }
        else:
            # Tuple format: (name, type, nullable, default)
            return {
                "name": raw_column[0],
                "type": raw_column[1],
                "nullable": raw_column[2] == "YES",
                "key": "",
                "default": raw_column[3] if len(raw_column) > 3 else None,
                "extra": "",
            }

    # =========================================================================
    # Schema Caching Methods (for AI context)
    # =========================================================================

    def get_all_tables_for_cache(self, db_name: str, schema: str = "dbo") -> tuple:
        """Return SQL query and params to get all tables for schema caching."""
        query = """
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_CATALOG = ?
            ORDER BY TABLE_NAME
        """
        return query, (db_name,)

    def get_columns_for_table_cache(
        self, db_name: str, table_name: str, schema: str = "dbo"
    ) -> tuple:
        """Return SQL query and params to get column names for a table."""
        query = """
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_CATALOG = ? AND TABLE_NAME = ?
            ORDER BY ORDINAL_POSITION
        """
        return query, (db_name, table_name)

    def get_column_details_for_table(
        self, db_name: str, table_name: str, schema: str = "dbo"
    ) -> tuple:
        """Return SQL query and params to get full column details for a table."""
        query = """
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_CATALOG = ? AND TABLE_NAME = ?
            ORDER BY ORDINAL_POSITION
        """
        return query, (db_name, table_name)

    def get_set_timeout_sql(self, timeout_seconds: int) -> Optional[str]:
        """Return SQL Server query timeout SQL."""
        # SQL Server handles timeout at connection level, not per query
        return None

    def get_column_names_from_cursor(self, cursor: Any) -> List[str]:
        """Extract column names from SQL Server cursor."""
        if hasattr(cursor, "description") and cursor.description:
            return [desc[0] for desc in cursor.description]
        return []

    def get_databases_for_cache(self) -> tuple:
        """Return SQL query and params to get all databases for caching."""
        return self.get_databases_query(), ()

    def get_batch_columns_for_tables(
        self, db_name: str, tables: List[str], schema: str = "dbo"
    ) -> tuple:
        """Return SQL query and params to batch fetch columns for multiple tables.

        Returns (TABLE_NAME, COLUMN_NAME, column_key) where column_key is 'PRI' for primary keys.
        """
        if not tables:
            return None, []

        placeholders = ",".join(["?"] * len(tables))
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
                AND tc.TABLE_CATALOG = ?
            ) pk ON c.TABLE_NAME = pk.TABLE_NAME AND c.COLUMN_NAME = pk.COLUMN_NAME
            WHERE c.TABLE_CATALOG = ?
            AND c.TABLE_NAME IN ({placeholders})
            ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
        """
        params = [db_name, db_name] + list(tables)
        return query, params

    # =========================================================================
    # Schema Metadata Methods (for AI tools)
    # =========================================================================

    def get_indexes_query(
        self, table_name: str, db_name: str = None, schema: str = "dbo"
    ) -> tuple:
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
            WHERE t.name = ?
            ORDER BY i.name, ic.key_ordinal
        """
        return query, (table_name,)

    def get_constraints_query(
        self, table_name: str, db_name: str = None, schema: str = "dbo"
    ) -> tuple:
        """Return SQL query and params to get constraints for a SQL Server table."""
        query = """
            SELECT 
                tc.CONSTRAINT_NAME AS constraint_name,
                tc.CONSTRAINT_TYPE AS constraint_type,
                ccu.COLUMN_NAME AS column_name
            FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
            JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu
                ON tc.CONSTRAINT_NAME = ccu.CONSTRAINT_NAME
                AND tc.TABLE_CATALOG = ccu.TABLE_CATALOG
            WHERE tc.TABLE_NAME = ?
            ORDER BY tc.CONSTRAINT_TYPE, tc.CONSTRAINT_NAME
        """
        return query, (table_name,)

    def get_foreign_keys_query(
        self, table_name: str = None, db_name: str = None, schema: str = "dbo"
    ) -> tuple:
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
                WHERE OBJECT_NAME(fk.parent_object_id) = ?
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
