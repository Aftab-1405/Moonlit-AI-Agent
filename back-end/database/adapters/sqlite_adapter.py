"""
SQLite Database Adapter

Implements database operations for SQLite using sqlite3 (built-in).
"""

import sqlite3
import logging
from typing import Any, Dict, Optional
from contextlib import contextmanager
from .base_adapter import BaseDatabaseAdapter
import threading

logger = logging.getLogger(__name__)


class SQLiteConnectionPool:
    """
    Simple connection pool for SQLite.

    SQLite doesn't have a native connection pool, so we create a simple one.
    Note: SQLite has limitations with concurrent writes.
    """

    def __init__(self, database: str, max_connections: int = 10):
        self.database = database
        self.max_connections = max_connections
        self._connections = []
        self._lock = threading.Lock()

    def get_connection(self):
        """Get a connection from the pool or create a new one."""
        with self._lock:
            if self._connections:
                return self._connections.pop()
            else:
                conn = sqlite3.connect(self.database, check_same_thread=False)
                conn.row_factory = sqlite3.Row  # Enable column access by name
                return conn

    def return_connection(self, connection):
        """Return a connection to the pool."""
        with self._lock:
            if len(self._connections) < self.max_connections:
                self._connections.append(connection)
            else:
                connection.close()

    def closeall(self):
        """Close all connections in the pool."""
        with self._lock:
            for conn in self._connections:
                conn.close()
            self._connections.clear()


class SQLiteAdapter(BaseDatabaseAdapter):
    """SQLite database adapter."""

    @property
    def db_type(self) -> str:
        return 'sqlite'

    @property
    def default_port(self) -> Optional[int]:
        return None  # SQLite doesn't use ports

    @property
    def requires_server(self) -> bool:
        return False  # SQLite is file-based

    def create_connection_pool(self, config: Dict) -> Any:
        """Create SQLite connection pool."""
        try:
            # For SQLite, prefer 'file_path' (full path) over 'database' (display name)
            database_path = config.get('file_path') or config.get('database') or config.get('path') or ':memory:'

            pool = SQLiteConnectionPool(database_path, max_connections=10)
            logger.info(f"Created SQLite connection pool for {database_path}")
            return pool

        except Exception as err:
            logger.error(f"Failed to create SQLite pool: {err}")
            raise

    def get_connection_from_pool(self, pool: Any) -> Any:
        """Get SQLite connection from pool."""
        try:
            return pool.get_connection()
        except Exception as err:
            logger.error(f"Failed to get SQLite connection from pool: {err}")
            raise

    def close_pool(self, pool: Any) -> bool:
        """Close SQLite connection pool."""
        try:
            pool.closeall()
            logger.info("Closed SQLite connection pool")
            return True
        except Exception as err:
            logger.error(f"Failed to close SQLite pool: {err}")
            return False

    def return_connection_to_pool(self, pool: Any, connection: Any) -> None:
        """Return SQLite connection back to pool."""
        try:
            pool.return_connection(connection)
        except Exception as err:
            logger.warning(f"Failed to return SQLite connection to pool: {err}")
            try:
                connection.close()
            except Exception:
                pass

    @contextmanager
    def get_cursor(self, connection: Any, dictionary: bool = False, buffered: bool = True):
        """Get SQLite cursor from connection."""
        cursor = None
        try:
            if dictionary:
                connection.row_factory = sqlite3.Row
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
        """
        SQLite doesn't have multiple databases per connection.
        Return query to get attached databases.
        """
        return "PRAGMA database_list"
    
    def extract_database_names(self, rows: list) -> list:
        """
        Extract database names from PRAGMA database_list.
        
        PRAGMA database_list returns: (seq, name, file)
        We need column 1 (name) not column 0 (seq).
        """
        return [row[1] for row in rows if row[1]]  # row[1] is the database name

    def get_tables_query(self) -> str:
        """SQL query to list SQLite tables."""
        return """
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
        """
    
    def get_all_tables_for_cache(self, db_name: str = None, schema: str = 'main') -> tuple:
        """
        Return SQL query and params to get all tables for caching.
        SQLite ignores db_name since it's file-based.
        """
        query = """
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        """
        return query, ()
    
    def get_columns_for_table_cache(self, db_name: str, table_name: str, schema: str = 'main') -> tuple:
        """
        Return SQL query and params to get columns for a table.
        SQLite uses PRAGMA table_info which returns (cid, name, type, notnull, dflt_value, pk).
        We wrap in a query to just get column names.
        """
        # PRAGMA returns: cid, name, type, notnull, dflt_value, pk
        # We need to use the PRAGMA directly as it can't be used in subquery
        # The _cache_schema_sqlite method will handle this specially
        return f"PRAGMA table_info('{table_name}')", ()

    def get_table_schema_query(self) -> str:
        """SQL query to get SQLite table schema."""
        # SQLite uses PRAGMA table_info
        return "PRAGMA table_info(%s)"

    def get_system_databases(self) -> set:
        """SQLite doesn't have system databases like MySQL/PostgreSQL."""
        return {'temp'}

    def validate_connection(self, connection: Any) -> bool:
        """Validate SQLite connection is alive."""
        try:
            if connection:
                cursor = connection.cursor()
                cursor.execute("SELECT 1")
                cursor.fetchone()
                cursor.close()
                return True
        except Exception as e:
            logger.debug(f"SQLite connection validation failed: {e}")
        return False

    def format_column_info(self, raw_column: Any) -> Dict:
        """
        Format SQLite column information.

        SQLite PRAGMA table_info returns:
        (cid, name, type, notnull, dflt_value, pk)
        """
        if isinstance(raw_column, dict):
            return {
                'name': raw_column.get('name', ''),
                'type': raw_column.get('type', ''),
                'nullable': not raw_column.get('notnull', 0),
                'key': 'PRI' if raw_column.get('pk', 0) else '',
                'default': raw_column.get('dflt_value'),
                'extra': ''
            }
        else:
            # Tuple format: (cid, name, type, notnull, dflt_value, pk)
            return {
                'name': raw_column[1],
                'type': raw_column[2],
                'nullable': not raw_column[3],
                'key': 'PRI' if raw_column[5] else '',
                'default': raw_column[4],
                'extra': ''
            }
    
    # =========================================================================
    # Schema Metadata Methods (for AI tools)
    # =========================================================================
    
    def get_indexes_query(self, table_name: str, db_name: str = None, schema: str = 'main') -> tuple:
        """Return SQL query and params to get indexes for a SQLite table."""
        # SQLite uses PRAGMA index_list and index_info
        # We use a workaround by querying sqlite_master
        query = """
            SELECT 
                name AS index_name,
                '' AS column_name,
                CASE WHEN sql LIKE '%UNIQUE%' THEN 1 ELSE 0 END AS is_unique,
                0 AS is_primary
            FROM sqlite_master
            WHERE type = 'index' AND tbl_name = ?
            ORDER BY name
        """
        return query, (table_name,)
    
    def get_constraints_query(self, table_name: str, db_name: str = None, schema: str = 'main') -> tuple:
        """Return SQL query and params to get constraints for a SQLite table."""
        # SQLite doesn't have a constraints table - use PRAGMA
        # This is a simplified query, actual constraints need PRAGMA parsing
        query = """
            SELECT 
                'PRIMARY KEY' AS constraint_name,
                'PRIMARY KEY' AS constraint_type,
                name AS column_name
            FROM pragma_table_info(?)
            WHERE pk > 0
        """
        return query, (table_name,)
    
    def get_foreign_keys_query(self, table_name: str = None, db_name: str = None, schema: str = 'main') -> tuple:
        """Return SQL query and params to get foreign key relationships in SQLite."""
        if table_name:
            query = """
                SELECT 
                    ? AS table_name,
                    "from" AS column_name,
                    "table" AS referenced_table,
                    "to" AS referenced_column
                FROM pragma_foreign_key_list(?)
            """
            return query, (table_name, table_name)
        else:
            # SQLite doesn't support getting all FKs at once easily
            # Return empty - the tool will handle per-table queries
            return None, ()

