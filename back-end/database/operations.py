"""
Database Operations - Pure FastAPI Version

Secure database operations that accept db_config as parameter.
No Flask dependencies.
"""

from database.security import DatabaseSecurity
import logging
import time
from typing import Dict, List, Tuple, Optional
import threading
from config import Config

logger = logging.getLogger(__name__)


class DatabaseOperationError(Exception):
    """Specific exception type for database operation failures."""

    pass


class DatabaseOperations:
    """Database operations class - accepts db_config explicitly."""

    # Cache for database and table information
    _info_cache = {}
    _cache_lock = threading.Lock()

    @staticmethod
    def get_databases(db_config: dict) -> Dict:
        """
        Fetch available databases.

        Args:
            db_config: Database configuration dict

        Returns:
            Dict with status and databases list
        """
        try:
            from database.adapters import get_adapter
            from database.connection_manager import get_connection_manager

            if not db_config:
                return {"status": "error", "message": "Not connected to database"}

            db_type = db_config.get("db_type", "mysql")
            adapter = get_adapter(db_type)
            manager = get_connection_manager()

            # For remote PostgreSQL, use the remote-specific query
            is_remote = bool(db_config.get("connection_string"))
            if db_type == "postgresql" and is_remote:
                query = adapter.get_databases_for_remote()
            else:
                query = adapter.get_databases_query()

            with manager.get_cursor(db_config) as cursor:
                cursor.execute(query)
                raw_rows = cursor.fetchall()
                databases = adapter.extract_database_names(raw_rows)

            # Filter out system databases using adapter
            system_dbs = adapter.get_system_databases()
            user_databases = [db for db in databases if db.lower() not in system_dbs]

            logger.info(f"Retrieved {len(user_databases)} user databases ({db_type})")
            return {"status": "success", "databases": user_databases}

        except Exception as err:
            logger.error(f"Error in get_databases: {err}")
            return {
                "status": "error",
                "message": f"Failed to retrieve databases: {str(err)}",
            }

    @staticmethod
    def get_tables(db_config: dict, db_name: str, schema: str = "public") -> List[str]:
        """
        Get all tables in a database.

        Args:
            db_config: Database configuration dict
            db_name: Database name
            schema: Schema name (for PostgreSQL)

        Returns:
            List of table names
        """
        try:
            from database.adapters import get_adapter
            from database.connection_manager import get_connection_manager

            validated_db = DatabaseSecurity.validate_database_name(db_name)

            db_type = db_config.get("db_type", "mysql") if db_config else "mysql"
            adapter = get_adapter(db_type)
            manager = get_connection_manager()

            with manager.get_cursor(db_config) as cursor:
                tables_query, tables_params = adapter.get_all_tables_for_cache(
                    validated_db, schema
                )
                cursor.execute(tables_query, tables_params)
                tables = [table[0] for table in cursor.fetchall()]

            logger.info(f"Retrieved {len(tables)} tables from database {validated_db}")
            return tables

        except ValueError as err:
            logger.warning(f"Validation error in get_tables: {err}")
            raise err
        except Exception as err:
            logger.error(f"Database error in get_tables: {err}")
            raise DatabaseOperationError("Failed to retrieve tables")

    @staticmethod
    def get_table_schema(db_config: dict, table_name: str, db_name: str) -> List[Dict]:
        """Get table schema."""
        try:
            from database.adapters import get_adapter
            from database.connection_manager import get_connection_manager

            validated_table = DatabaseSecurity.validate_table_name(table_name)
            validated_db = DatabaseSecurity.validate_database_name(db_name)

            db_type = db_config.get("db_type", "mysql") if db_config else "mysql"
            adapter = get_adapter(db_type)
            schema = db_config.get("schema", "public") if db_config else "public"

            manager = get_connection_manager()

            with manager.get_cursor(db_config) as cursor:
                if db_type == "postgresql":
                    validated_schema = DatabaseSecurity.validate_database_name(schema)
                    query = adapter.get_table_schema_query(validated_schema)
                    cursor.execute(query, (validated_table, validated_table))
                else:
                    query = adapter.get_table_schema_query()
                    cursor.execute(query, (validated_db, validated_table))
                columns = cursor.fetchall()

            logger.info(f"Retrieved schema for table {validated_table}")
            return columns

        except ValueError as err:
            logger.warning(f"Validation error in get_table_schema: {err}")
            raise err
        except Exception as err:
            logger.error(f"Database error in get_table_schema: {err}")
            raise DatabaseOperationError("Failed to retrieve table schema")

    @staticmethod
    def get_table_row_count(db_config: dict, table_name: str, db_name: str) -> int:
        """Get table row count."""
        try:
            from database.connection_manager import get_connection_manager

            validated_table = DatabaseSecurity.validate_table_name(table_name)
            validated_db = DatabaseSecurity.validate_database_name(db_name)

            db_type = db_config.get("db_type", "mysql") if db_config else "mysql"
            schema = db_config.get("schema", "public") if db_config else "public"

            manager = get_connection_manager()

            with manager.get_cursor(db_config) as cursor:
                if db_type == "postgresql":
                    validated_schema = DatabaseSecurity.validate_database_name(schema)
                    cursor.execute(
                        f'SELECT COUNT(*) FROM "{validated_schema}"."{validated_table}"'
                    )
                elif db_type == "sqlserver":
                    schema_name = DatabaseSecurity.validate_database_name(
                        schema or "dbo"
                    )
                    cursor.execute(
                        f"SELECT COUNT(*) FROM [{schema_name}].[{validated_table}]"
                    )
                elif db_type == "oracle":
                    # Oracle schema = owner, use validated_db
                    cursor.execute(
                        f'SELECT COUNT(*) FROM "{validated_db}"."{validated_table}"'
                    )
                else:
                    # Default MySQL
                    cursor.execute(
                        f"SELECT COUNT(*) FROM `{validated_db}`.`{validated_table}`"
                    )
                result = cursor.fetchone()

                return result[0] if result else 0

        except ValueError as err:
            logger.warning(f"Validation error in get_table_row_count: {err}")
            raise err
        except Exception as err:
            logger.error(f"Database error in get_table_row_count: {err}")
            raise DatabaseOperationError("Failed to retrieve row count")

    @staticmethod
    def clear_cache():
        """Clear all cached data."""
        with DatabaseOperations._cache_lock:
            DatabaseOperations._info_cache.clear()
        try:
            DatabaseSecurity.clear_cache()
        except Exception:
            pass


def fetch_database_info(
    db_config: dict, db_name: str
) -> Tuple[Optional[str], Optional[str]]:
    """Fetch detailed information about a database."""
    try:
        validated_db = DatabaseSecurity.validate_database_name(db_name)
        tables = DatabaseOperations.get_tables(db_config, validated_db)

        if not tables:
            return f"The database {validated_db} has no tables.", ""

        db_info = f"The database {validated_db} has been selected. It contains {len(tables)} tables:\n"
        detailed_info = ""

        for table in tables:
            db_info += f"Table {table}:\n"
            try:
                schema = DatabaseOperations.get_table_schema(
                    db_config, table, validated_db
                )
                row_count = DatabaseOperations.get_table_row_count(
                    db_config, table, validated_db
                )

                for column in schema:
                    detailed_info += f"  {column[0]} {column[1]}\n"
                detailed_info += f"  count: {row_count}\n"
            except Exception as e:
                detailed_info += f"  Error: {e}\n"

        return db_info, detailed_info

    except ValueError as err:
        logger.warning(f"Validation error in fetch_database_info: {err}")
        return None, str(err)
    except Exception as err:
        logger.error(f"Error in fetch_database_info: {err}")
        return None, str(err)


def execute_sql_query(
    db_config: dict, sql_query: str, max_rows: int = None, timeout_seconds: int = None
) -> Dict:
    """
    Execute SQL query securely - READ-ONLY.

    Args:
        db_config: Database configuration dict
        sql_query: SQL query to execute
        max_rows: Maximum rows to return
        timeout_seconds: Query timeout in seconds
    """
    try:
        from database.adapters import get_adapter
        from database.connection_manager import get_connection_manager

        if not db_config:
            return {"status": "error", "message": "No database connection"}

        # Check query length limit
        if len(sql_query) > Config.MAX_QUERY_LENGTH:
            return {
                "status": "error",
                "message": f"Query too long. Maximum: {Config.MAX_QUERY_LENGTH} characters.",
            }

        # Analyze query for security
        analysis = DatabaseSecurity.analyze_sql_query(sql_query)

        if not analysis["is_safe"]:
            return {
                "status": "error",
                "message": f"Query blocked: {', '.join(analysis['warnings'])}",
            }

        # Only allow SELECT and WITH (CTE) queries
        if analysis["query_type"] not in ("SELECT", "WITH"):
            return {
                "status": "error",
                "message": f"READ-ONLY: Only SELECT/WITH queries allowed. {analysis['query_type']} blocked.",
                "query_type_blocked": analysis["query_type"],
            }

        start_time = time.time()

        db_type = db_config.get("db_type", "mysql")
        adapter = get_adapter(db_type)
        manager = get_connection_manager()

        with manager.get_cursor(db_config) as cursor:
            actual_timeout = (
                timeout_seconds if timeout_seconds else Config.QUERY_TIMEOUT_SECONDS
            )

            timeout_sql = adapter.get_set_timeout_sql(actual_timeout)
            if timeout_sql:
                try:
                    cursor.execute(timeout_sql)
                except Exception:
                    pass

            cursor.execute(sql_query)

            actual_max_rows = max_rows if max_rows else Config.MAX_QUERY_RESULTS
            fetch_limit = actual_max_rows + 1
            raw_rows = cursor.fetchmany(fetch_limit)

            truncated = len(raw_rows) > actual_max_rows
            if truncated:
                raw_rows = raw_rows[:actual_max_rows]

            # Convert rows to simple lists for JSON serialization
            # This handles sqlite3.Row objects and other cursor row types
            rows = []
            for row in raw_rows:
                if hasattr(row, "keys"):
                    # sqlite3.Row or similar dict-like object
                    rows.append(list(row))
                elif isinstance(row, (list, tuple)):
                    rows.append(list(row))
                else:
                    rows.append([row])

            end_time = time.time()
            execution_time = round((end_time - start_time) * 1000, 2)

            column_names = adapter.get_column_names_from_cursor(cursor)

            row_count = len(rows)
            total_rows = None if truncated else row_count

            result = {"fields": column_names, "rows": rows}

            message = f"Query executed in {execution_time}ms. "
            if truncated:
                message += f"Truncated to {row_count} rows. "
            else:
                message += f"{row_count} rows. "

            logger.info(f"Query executed: {row_count} rows in {execution_time}ms")
            return {
                "status": "success",
                "result": result,
                "message": message,
                "row_count": row_count,
                "total_rows": total_rows,
                "truncated": truncated,
                "execution_time_ms": execution_time,
                "query_type": "SELECT",
            }

    except ValueError as err:
        logger.warning(f"Query validation error: {err}")
        return {"status": "error", "message": str(err)}
    except Exception as err:
        logger.error(f"Database error in execute_sql_query: {err}")
        error_msg = str(err)
        if "relation" in error_msg.lower() and "does not exist" in error_msg.lower():
            return {"status": "error", "message": "Table not found."}
        elif "column" in error_msg.lower() and "does not exist" in error_msg.lower():
            return {"status": "error", "message": "Column not found."}
        elif "permission denied" in error_msg.lower():
            return {"status": "error", "message": "Permission denied."}
        return {"status": "error", "message": f"Database error: {error_msg}"}
