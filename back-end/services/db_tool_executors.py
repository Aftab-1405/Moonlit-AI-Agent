"""
Database Tool Executors

Contains the actual DB execution logic for each LangGraph tool.
Called directly by @tool functions in agent/tools.py — no dispatcher needed.
"""

import logging
import re
from typing import Dict, List, Optional
from contextlib import contextmanager

logger = logging.getLogger(__name__)


# =============================================================================
# CONNECTION HELPER (Reusable for all tools)
# =============================================================================

@contextmanager
def get_tool_connection(db_config: dict):
    """
    Context manager for getting a database connection from db_config.
    
    Uses the adapter pattern to support all database types:
    - PostgreSQL (psycopg2)
    - MySQL (mysql-connector)
    - SQL Server (pyodbc)
    - Oracle (oracledb)
    
    Centralizes connection logic to reduce code duplication across tools.
    Automatically closes connection when done.
    
    Usage:
        with get_tool_connection(db_config) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
    """
    from database.adapters import get_adapter
    
    db_type = db_config.get('db_type', 'postgresql')
    adapter = get_adapter(db_type)
    pool = None
    conn = None
    
    try:
        # Use adapter to create connection pool and get connection
        pool = adapter.create_connection_pool(db_config)
        conn = adapter.get_connection_from_pool(pool)
        yield conn
        
    finally:
        if conn:
            try:
                if pool:
                    adapter.return_connection_to_pool(pool, conn)
                else:
                    conn.close()
            except Exception:
                pass
        # Clean up pool if we created one
        if pool:
            try:
                adapter.close_pool(pool)
            except Exception:
                pass

# =============================================================================
# TOOL EXECUTOR
# =============================================================================

class AIToolExecutor:
    """Database tool implementations called directly by LangGraph @tool functions."""

    # =========================================================================
    # Tool Implementations
    # =========================================================================
    
    @staticmethod
    def _get_connection_status(user_id: str) -> Dict:
        """Get current connection status from context."""
        from services.context_service import ContextService
        
        connection = ContextService.get_connection(user_id)
        
        if connection.get('connected'):
            return {
                "connected": True,
                "db_type": connection.get('db_type'),
                "database": connection.get('database'),
                "host": connection.get('host'),
                "is_remote": connection.get('is_remote'),
                "schema": connection.get('schema'),
                "connected_at": connection.get('connected_at')
            }
        else:
            return {
                "connected": False,
                "message": "Not connected to any database"
            }
    
    @staticmethod
    def _get_database_list(user_id: str, db_config: dict = None) -> Dict:
        """
        Get list of databases using db_config if available.
        
        Optimized to use passed db_config for direct database queries.
        """
        from services.context_service import ContextService
        
        connection = ContextService.get_connection(user_id)
        if not connection.get('connected'):
            return {"error": "Not connected to any database server"}
        
        # If db_config is available, query databases directly
        if db_config:
            try:
                databases = AIToolExecutor._query_databases_with_config(db_config)
                return {
                    "databases": databases,
                    "current_database": connection.get('database'),
                    "count": len(databases)
                }
            except Exception as e:
                logger.warning(f"Failed to query databases: {e}")
                # Fall back to context-based response
        
        # Fallback: return current database from context
        current_db = connection.get('database')
        return {
            "databases": [current_db] if current_db else [],
            "current_database": current_db,
            "count": 1 if current_db else 0
        }
    
    @staticmethod
    def _query_databases_with_config(db_config: dict) -> List[str]:
        """Query available databases using db_config (DBMS-agnostic)."""
        from database.adapters import get_adapter
        
        db_type = db_config.get('db_type', 'postgresql')
        adapter = get_adapter(db_type)
        
        with get_tool_connection(db_config) as conn:
            cursor = conn.cursor()
            
            # Use adapter for DBMS-agnostic database query
            query, params = adapter.get_databases_for_cache()
            cursor.execute(query, params) if params else cursor.execute(query)
            all_databases = [row[0] for row in cursor.fetchall()]
            
            # Filter out system databases using adapter
            system_dbs = adapter.get_system_databases()
            databases = [db for db in all_databases if db.lower() not in system_dbs]
            
            cursor.close()
            return databases
    
    @staticmethod
    def _get_database_schema(user_id: str, database: Optional[str] = None, 
                              db_config: dict = None) -> Dict:
        """Get schema (tables and columns) for a database."""
        from services.context_service import ContextService
        
        # Get connection info
        connection = ContextService.get_connection(user_id)
        if not connection.get('connected'):
            return {"error": "Not connected to any database"}
        
        # Use current database if not specified
        target_db = database or connection.get('database')
        
        # Try to get from stored context first (with TTL check)
        schema_context = ContextService.get_schema_context(user_id, target_db)
        if schema_context:
            tables = schema_context.get('tables', [])
            return {
                "database": target_db,
                "tables": tables,
                "columns": schema_context.get('columns', {}),
                "table_count": len(tables),
                "stored_at": schema_context.get('cached_at'),
                "source": "context"
            }
        
        # If not stored or stale, fetch fresh (and store it)
        return AIToolExecutor._fetch_and_store_schema(
            user_id, target_db, connection.get('db_type'), db_config=db_config
        )
    
    @staticmethod
    def _fetch_and_store_schema(user_id: str, database: str, db_type: str, 
                                 db_config: dict = None) -> Dict:
        """
        Fetch schema from database and store as AI context.
        
        Optimized with batch column query instead of per-table queries.
        Uses db_config directly when available for better reliability.
        """
        from services.context_service import ContextService
        from database.operations import DatabaseOperations
        
        try:
            tables = []
            columns = {}
            
            # Use db_config directly if available (more reliable in tool context)
            if db_config:
                try:
                    tables = AIToolExecutor._fetch_tables_with_config(db_config, db_type, db_name=database)
                    if tables:
                        columns = AIToolExecutor._batch_fetch_columns(db_config, tables, db_type, db_name=database)
                except Exception as e:
                    logger.warning(f"Direct schema fetch failed: {e}")
                    tables = []
                    columns = {}
            
            # Fallback to DatabaseOperations using db_config (required)
            if not tables and db_config:
                try:
                    schema = db_config.get('schema', 'public')
                    tables = DatabaseOperations.get_tables(db_config, database, schema=schema)
                    for table in tables:
                        try:
                            table_schema = DatabaseOperations.get_table_schema(db_config, table, database)
                            # get_table_schema returns tuples: (name, type, nullable, default, key)
                            columns[table] = [
                                {
                                    'name': col[0],
                                    'is_primary_key': len(col) > 4 and col[4] == 'PRI'
                                }
                                for col in table_schema
                            ]
                        except Exception as e:
                            logger.warning(f"Could not get columns for table {table}: {e}")
                            columns[table] = []
                except Exception as e:
                    logger.warning(f"DatabaseOperations fallback also failed: {e}")
                    return {"error": f"Could not fetch schema: {str(e)}"}
            elif not tables and not db_config:
                return {"error": "No database config available. Please re-connect to the database."}
            
            # Store schema as AI context
            ContextService.store_schema_context(user_id, database, tables, columns)
            
            return {
                "database": database,
                "tables": tables,
                "columns": columns,
                "table_count": len(tables),
                "source": "fresh"
            }
        except Exception as e:
            logger.exception(f"Error fetching schema for {database}")
            return {"error": str(e)}
    
    @staticmethod
    def _fetch_tables_with_config(db_config: dict, db_type: str, db_name: str = None) -> List[str]:
        """Fetch table names using db_config directly (DBMS-agnostic)."""
        from database.adapters import get_adapter
        
        tables = []
        adapter = get_adapter(db_type)
        
        with get_tool_connection(db_config) as conn:
            cursor = conn.cursor()
            
            # Use explicit db_name if provided, else fall back to db_config
            effective_db_name = db_name or db_config.get('database', '')
            schema = db_config.get('schema', 'public')
            query, params = adapter.get_all_tables_for_cache(effective_db_name, schema=schema)
            cursor.execute(query, params) if params else cursor.execute(query)
            
            tables = [row[0] for row in cursor.fetchall()]
            cursor.close()
        
        logger.debug(f"Fetched {len(tables)} tables using db_config")
        return tables
    
    @staticmethod
    def _fetch_tables_and_columns(db_config: dict, db_type: str, db_name: str = None) -> tuple:
        """
        Fetch tables and columns with primary key info.
        
        Returns:
            tuple: (tables list, columns dict with {name, is_primary_key} objects)
        """
        # Fetch tables
        tables = AIToolExecutor._fetch_tables_with_config(db_config, db_type, db_name)
        
        # Fetch columns with primary key info
        columns = AIToolExecutor._batch_fetch_columns(db_config, tables, db_type, db_name)
        
        return tables, columns
    
    @staticmethod
    def _batch_fetch_columns(db_config: dict, tables: List[str], db_type: str, 
                              db_name: str = None) -> Dict[str, List]:
        """
        Batch fetch columns for all tables in a single query (DBMS-agnostic).
        
        Returns dict where values are lists of column objects with:
        - name: column name
        - is_primary_key: True if column is part of primary key
        
        Much faster than individual queries for each table.
        """
        from database.adapters import get_adapter
        
        columns = {}
        
        if not tables:
            return columns
        
        adapter = get_adapter(db_type)
        # Use explicit db_name if provided, else fall back to db_config
        effective_db_name = db_name or db_config.get('database', '')
        schema = db_config.get('schema', 'public')
        
        with get_tool_connection(db_config) as conn:
            cursor = conn.cursor()
            
            # Use adapter for DBMS-agnostic batch column query
            query, params = adapter.get_batch_columns_for_tables(effective_db_name, tables, schema=schema)
            
            if query is None:
                cursor.close()
                return {}
            
            cursor.execute(query, params)
            
            for row in cursor.fetchall():
                # Query now returns (table_name, column_name, column_key)
                table_name = row[0]
                column_name = row[1]
                column_key = row[2] if len(row) > 2 else ''
                
                if table_name not in columns:
                    columns[table_name] = []
                
                # Build column object with primary key info
                columns[table_name].append({
                    'name': column_name,
                    'is_primary_key': column_key == 'PRI'
                })
            
            cursor.close()
        
        # Ensure all tables have entries (even if empty)
        for table in tables:
            if table not in columns:
                columns[table] = []
        
        logger.debug(f"Batch fetched columns for {len(columns)} tables")
        return columns
    
    @staticmethod
    def _get_table_columns(user_id: str, table_name: str, db_config: dict = None) -> Dict:
        """Get columns for a specific table."""
        from services.context_service import ContextService
        
        if not table_name:
            return {"error": "Table name is required"}
        
        connection = ContextService.get_connection(user_id)
        if not connection.get('connected'):
            return {"error": "Not connected to any database"}
        
        database = connection.get('database')
        db_type = connection.get('db_type', 'postgresql')
        
        try:
            # Try stored context first
            schema_context = ContextService.get_schema_context(user_id, database)
            if schema_context and table_name in schema_context.get('columns', {}):
                return {
                    "table": table_name,
                    "columns": schema_context['columns'][table_name],
                    "column_count": len(schema_context['columns'][table_name]),
                    "source": "context"
                }
            
            # Fetch fresh using db_config (required in FastAPI)
            if not db_config:
                return {"error": "No database config available. Please re-connect to the database."}
            
            # Pass database from connection context (more reliable)
            columns = AIToolExecutor._fetch_table_columns_with_config(
                db_config, table_name, db_type, db_name=database
            )
            
            return {
                "table": table_name,
                "columns": columns,
                "column_count": len(columns),
                "source": "fresh"
            }
        except Exception as e:
            return {"error": f"Could not get columns for table {table_name}: {str(e)}"}
    
    @staticmethod
    def _fetch_table_columns_with_config(db_config: dict, table_name: str, 
                                          db_type: str, db_name: str = None) -> List[Dict]:
        """Fetch column details for a specific table using db_config (DBMS-agnostic)."""
        from database.adapters import get_adapter
        
        columns = []
        adapter = get_adapter(db_type)
        # Use explicit db_name if provided, else fall back to db_config
        effective_db_name = db_name or db_config.get('database', '')
        schema = db_config.get('schema', 'public')
        
        with get_tool_connection(db_config) as conn:
            cursor = conn.cursor()
            
            # Use adapter for DBMS-agnostic column details query
            query, params = adapter.get_column_details_for_table(effective_db_name, table_name, schema=schema)
            cursor.execute(query, params) if params else cursor.execute(query)
            
            for row in cursor.fetchall():
                columns.append({
                    "name": row[0],
                    "type": row[1] if len(row) > 1 else 'unknown',
                    "nullable": (row[2] == 'YES') if len(row) > 2 else True,
                    "default": row[3] if len(row) > 3 else None,
                })
            
            cursor.close()
        
        return columns
    
    @staticmethod
    def _execute_query(user_id: str, query: str, max_rows: int = 100, 
                       db_config: dict = None) -> Dict:
        """Execute a SQL query using provided db_config."""
        from services.context_service import ContextService
        
        if not query:
            return {"error": "Query is required"}
        
        connection = ContextService.get_connection(user_id)
        if not connection.get('connected'):
            return {"error": "Not connected to any database"}
        
        # Safety check: Block write operations (database-agnostic blacklist approach)
        import re
        query_upper = query.strip().upper()
        # Remove string literals to avoid false positives
        cleaned = re.sub(r"'[^']*'", '', query_upper)
        cleaned = re.sub(r'"[^"]*"', '', cleaned)
        
        DANGEROUS_KEYWORDS = {'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE'}
        words = set(re.findall(r'\b[A-Z_]+\b', cleaned))
        dangerous_found = words & DANGEROUS_KEYWORDS
        
        if dangerous_found:
            return {"error": f"Query contains blocked keywords: {', '.join(dangerous_found)}. Only read-only queries are allowed."}
        
        try:
            # Execute query with db_config (required in FastAPI)
            if db_config:
                logger.debug("Executing query with explicit db_config")
                result = AIToolExecutor._execute_query_with_db_config(
                    db_config, connection, query, max_rows
                )
            else:
                return {"error": "No database config available. Please re-connect to the database."}
            
            # Log query to history
            database = connection.get('database')
            row_count = result.get('row_count', 0)
            status = 'success' if result.get('status') == 'success' else 'error'
            ContextService.add_query(user_id, query, database, row_count, status)
            
            if result.get('status') == 'success':
                total_rows = result.get('row_count', 0)
                truncated_data = result.get('result', [])[:max_rows]
                return {
                    "success": True,
                    "columns": result.get('columns', []),
                    "data": truncated_data,
                    "row_count": len(truncated_data),  # Actual rows returned
                    "total_rows": total_rows,          # Total in DB before truncation
                    "truncated": total_rows > max_rows
                }
            else:
                return {"error": result.get('message', 'Query execution failed')}
                
        except Exception as e:
            logger.error(f"Error executing query: {e}")
            return {"error": str(e)}
    
    @staticmethod
    def _execute_query_with_db_config(db_config: Dict, connection: Dict, 
                                       query: str, max_rows: int) -> Dict:
        """Execute query using explicitly passed db_config."""
        from database.security import DatabaseSecurity
        from config import Config
        import time
        
        if not db_config:
            return {
                'status': 'error',
                'message': 'No database connection available. Please connect to a database first.'
            }
        
        db_type = db_config.get('db_type', 'postgresql')
        
        # Security check
        analysis = DatabaseSecurity.analyze_sql_query(query)
        if not analysis['is_safe']:
            return {
                'status': 'error',
                'message': f"Query blocked for security reasons: {', '.join(analysis['warnings'])}"
            }
        
        if analysis['query_type'] not in ('SELECT', 'WITH'):
            return {
                'status': 'error',
                'message': f'READ-ONLY MODE: Only SELECT/WITH queries are allowed. {analysis["query_type"]} is blocked.'
            }
        
        try:
            start_time = time.time()
            
            with get_tool_connection(db_config) as conn:
                cursor = conn.cursor()
                
                # Set schema for PostgreSQL if specified (PostgreSQL-specific feature)
                if db_type == 'postgresql':
                    schema = connection.get('schema', 'public')
                    # Validate schema name to prevent SQL injection
                    if not re.match(r'^[A-Za-z_][A-Za-z0-9_]*$', schema):
                        raise ValueError(f"Invalid schema name: {schema}")
                    cursor.execute(f"SET search_path TO {schema}")
                
                # Execute the query
                cursor.execute(query)
                rows = cursor.fetchall()
                
                end_time = time.time()
                execution_time = round((end_time - start_time) * 1000, 2)
                
                # Get column names using adapter (DBMS-agnostic)
                from database.adapters import get_adapter
                adapter = get_adapter(db_type)
                column_names = adapter.get_column_names_from_cursor(cursor)
                
                cursor.close()
            
            # Process results outside connection context
            actual_max_rows = max_rows if max_rows else Config.MAX_QUERY_RESULTS
            row_count = len(rows)
            truncated = row_count > actual_max_rows
            if truncated:
                rows = rows[:actual_max_rows]
            
            # Convert rows to list of dicts
            result_data = AIToolExecutor._serialize_rows(rows, column_names)
            
            logger.debug(f"AI tool executed query: {row_count} rows in {execution_time}ms")
            
            return {
                'status': 'success',
                'columns': column_names,
                'result': result_data,
                'row_count': row_count,
                'truncated': truncated,
                'execution_time_ms': execution_time
            }
            
        except Exception as e:
            logger.error(f"Error in context-aware query execution: {e}")
            return {
                'status': 'error',
                'message': str(e)
            }
    
    @staticmethod
    def _serialize_rows(rows: List, column_names: List[str]) -> List[Dict]:
        """
        Convert database rows to JSON-serializable dictionaries.
        
        Handles special types: datetime, Decimal, bytes.
        """
        from decimal import Decimal
        
        result_data = []
        for row in rows:
            row_dict = {}
            for i, col in enumerate(column_names):
                value = row[i]
                # Handle non-serializable types
                if value is None:
                    pass  # None is JSON serializable
                elif hasattr(value, 'isoformat'):  # datetime, date
                    value = value.isoformat()
                elif isinstance(value, bytes):
                    value = value.decode('utf-8', errors='replace')
                elif isinstance(value, Decimal):
                    value = float(value)
                row_dict[col] = value
            result_data.append(row_dict)
        
        return result_data
    
    @staticmethod
    def _get_table_indexes(user_id: str, table_name: str, db_config: dict = None) -> Dict:
        """Get indexes for a specific table."""
        from services.context_service import ContextService
        from database.adapters import get_adapter
        
        if not table_name:
            return {"error": "Table name is required"}
        
        connection = ContextService.get_connection(user_id)
        if not connection.get('connected'):
            return {"error": "Not connected to any database"}
        
        db_type = connection.get('db_type', 'postgresql')
        database = connection.get('database')
        schema = connection.get('schema', 'public')
        
        try:
            adapter = get_adapter(db_type)
            query, params = adapter.get_indexes_query(table_name, db_name=database, schema=schema)
            
            if query is None:
                return {"error": f"Index query not supported for {db_type}"}
            
            indexes = []
            with get_tool_connection(db_config) as conn:
                cursor = conn.cursor()
                cursor.execute(query, params)
                
                for row in cursor.fetchall():
                    indexes.append({
                        "index_name": row[0],
                        "column_name": row[1] if len(row) > 1 else None,
                        "is_unique": bool(row[2]) if len(row) > 2 else False,
                        "is_primary": bool(row[3]) if len(row) > 3 else False
                    })
                cursor.close()
            
            return {
                "table": table_name,
                "indexes": indexes,
                "count": len(indexes)
            }
        except Exception as e:
            logger.exception(f"Error getting indexes for {table_name}")
            return {"error": str(e)}
    
    @staticmethod
    def _get_foreign_keys(user_id: str, table_name: str = None, db_config: dict = None) -> Dict:
        """Get foreign key relationships."""
        from services.context_service import ContextService
        from database.adapters import get_adapter
        
        connection = ContextService.get_connection(user_id)
        if not connection.get('connected'):
            return {"error": "Not connected to any database"}
        
        db_type = connection.get('db_type', 'postgresql')
        database = connection.get('database')
        schema = connection.get('schema', 'public')
        
        try:
            adapter = get_adapter(db_type)
            query, params = adapter.get_foreign_keys_query(table_name, db_name=database, schema=schema)
            
            if query is None:
                return {"error": f"Foreign keys query not supported for {db_type}"}
            
            foreign_keys = []
            with get_tool_connection(db_config) as conn:
                cursor = conn.cursor()
                cursor.execute(query, params)
                
                for row in cursor.fetchall():
                    foreign_keys.append({
                        "table_name": row[0],
                        "column_name": row[1] if len(row) > 1 else None,
                        "referenced_table": row[2] if len(row) > 2 else None,
                        "referenced_column": row[3] if len(row) > 3 else None
                    })
                cursor.close()
            
            result = {
                "foreign_keys": foreign_keys,
                "count": len(foreign_keys)
            }
            if table_name:
                result["table"] = table_name
            
            return result
        except Exception as e:
            logger.exception("Error getting foreign keys")
            return {"error": str(e)}

