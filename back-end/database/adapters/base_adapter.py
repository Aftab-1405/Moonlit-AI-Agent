"""
Base Database Adapter

Abstract base class defining the interface that all database adapters must implement.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from contextlib import contextmanager


class BaseDatabaseAdapter(ABC):
    """Abstract base class for database adapters."""

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
    def get_cursor(
        self, connection: Any, dictionary: bool = False, buffered: bool = True
    ):
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
    def get_tables_query(self) -> str:
        """
        Return SQL query to list all tables in a database.

        Returns:
            SQL query string with placeholder for database name
        """
        pass

    @abstractmethod
    def get_table_schema_query(self) -> str:
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

    @abstractmethod
    def format_column_info(self, raw_column: Any) -> Dict:
        """
        Format database-specific column information into standard format.

        Args:
            raw_column: Raw column information from database

        Returns:
            Dict with keys: name, type, nullable, key, default, extra
        """
        pass

    # =========================================================================
    # Schema Caching Methods (for AI context)
    # =========================================================================

    def get_all_tables_for_cache(self, db_name: str, schema: str = "public") -> str:
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

    def get_columns_for_table_cache(
        self, db_name: str, table_name: str, schema: str = "public"
    ) -> tuple:
        """
        Return SQL query and params to get columns for a table (for caching).

        Args:
            db_name: Database name
            table_name: Table name
            schema: Schema name (PostgreSQL)

        Returns:
            Tuple of (query_string, params_tuple)
        """
        # Default: use standard table schema query but only return column names
        return self.get_table_schema_query(), (db_name, table_name)

    def get_column_details_for_table(
        self, db_name: str, table_name: str, schema: str = "public"
    ) -> tuple:
        """
        Return SQL query and params to get full column details for a table.
        Query should return: column_name, data_type, is_nullable, column_default

        Args:
            db_name: Database name
            table_name: Table name
            schema: Schema name (PostgreSQL)

        Returns:
            Tuple of (query_string, params_tuple)
        """
        # Default: use standard table schema query
        return self.get_table_schema_query(), (db_name, table_name)

    def get_set_timeout_sql(self, timeout_seconds: int) -> Optional[str]:
        """
        Return SQL statement to set query timeout, or None if not supported.

        Args:
            timeout_seconds: Timeout in seconds

        Returns:
            SQL statement string or None
        """
        return None  # Default: no timeout support

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

    def get_batch_columns_for_tables(
        self, db_name: str, tables: List[str], schema: str = "public"
    ) -> tuple:
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

    # =========================================================================
    # Schema Metadata Methods (for AI tools)
    # =========================================================================

    def get_indexes_query(
        self, table_name: str, db_name: str = None, schema: str = "public"
    ) -> tuple:
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

    def get_constraints_query(
        self, table_name: str, db_name: str = None, schema: str = "public"
    ) -> tuple:
        """
        Return SQL query and params to get constraints for a table.

        Query should return: constraint_name, constraint_type, column_name

        Args:
            table_name: Table name
            db_name: Database name (MySQL)
            schema: Schema name (PostgreSQL)

        Returns:
            Tuple of (query_string, params_tuple)
        """
        return None, ()  # Default: not supported

    def get_foreign_keys_query(
        self, table_name: str = None, db_name: str = None, schema: str = "public"
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
