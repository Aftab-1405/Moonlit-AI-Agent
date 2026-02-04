"""
Database Service - Pure FastAPI Version

High-level database operations. All methods accept db_config and user_id explicitly.
No Flask dependencies.
"""

import re
import logging
from typing import List

logger = logging.getLogger(__name__)


class DatabaseService:
    """Service for database operations - accepts config explicitly."""
    
    @staticmethod
    def switch_remote_database(db_config: dict, new_db_name: str, user_id: str = None) -> dict:
        """
        Switch to different database on remote server.
        
        Args:
            db_config: Current database configuration
            new_db_name: Name of database to switch to
            user_id: User ID for context tracking
            
        Returns:
            Dict with status, message, tables, new db_config
        """
        from database.adapters import get_adapter
        from database.connection_manager import get_connection_manager
        
        if not new_db_name:
            return {'status': 'error', 'message': 'Database name is required'}
        
        if not db_config:
            return {'status': 'error', 'message': 'No database connected'}
        
        connection_string = db_config.get('connection_string')
        if not connection_string:
            return {'status': 'error', 'message': 'Only for connection string based connections'}
        
        db_type = db_config.get('db_type', 'postgresql')
        
        # Modify connection string to use new database
        new_connection_string = re.sub(
            r'(/[^/?]+)(\?|$)',
            f'/{new_db_name}\\2',
            connection_string
        )
        
        # Create new config
        new_config = {
            'db_type': db_type,
            'connection_string': new_connection_string,
            'database': new_db_name,
            'is_remote': True
        }
        
        try:
            manager = get_connection_manager()
            adapter = get_adapter(db_type)
            
            # Test new connection
            conn = manager.get_connection(new_config)
            
            if adapter.validate_connection(conn):
                # Fetch tables
                tables = DatabaseService._fetch_tables(new_config, new_db_name, db_type)
                
                # Update context
                if user_id:
                    DatabaseService._update_context(user_id, db_type, new_db_name, 'remote', True)
                
                logger.info(f"Switched to {db_type} database: {new_db_name}")
                return {
                    'status': 'success',
                    'message': f'Switched to database: {new_db_name}',
                    'selectedDatabase': new_db_name,
                    'tables': tables,
                    'db_config': new_config
                }
            
            return {'status': 'error', 'message': 'Failed to connect to new database'}
        except Exception as err:
            logger.exception('Error switching database')
            return {'status': 'error', 'message': str(err)}
    
    @staticmethod
    def select_schema(db_config: dict, schema_name: str, user_id: str = None) -> dict:
        """
        Select PostgreSQL schema.
        
        Args:
            db_config: Database configuration
            schema_name: Name of schema to select
            user_id: User ID for context tracking
            
        Returns:
            Dict with status, schema, tables
        """
        from database.adapters import get_adapter
        from database.connection_manager import get_connection_manager
        
        if not schema_name:
            return {'status': 'error', 'message': 'Schema name is required'}
        
        if not db_config:
            return {'status': 'error', 'message': 'No database connected'}
        
        db_type = db_config.get('db_type', 'mysql')
        if db_type != 'postgresql':
            return {'status': 'error', 'message': 'Schema selection only for PostgreSQL'}
        
        # Update config with schema
        new_config = db_config.copy()
        new_config['schema'] = schema_name
        
        # Get tables in schema
        adapter = get_adapter(db_type)
        manager = get_connection_manager()
        tables = []
        
        try:
            with manager.get_cursor(new_config) as cursor:
                cursor.execute(adapter.get_tables_query(schema_name))
                tables = [row[0] for row in cursor.fetchall()]
        except Exception as err:
            logger.error(f"Error fetching tables for schema {schema_name}: {err}")
        
        # Update context
        if user_id:
            try:
                from services.context_service import ContextService
                ContextService.update_schema(user_id, schema_name)
            except Exception as e:
                logger.warning(f"Failed to update schema context: {e}")
        
        logger.info(f"Selected schema: {schema_name} with {len(tables)} tables")
        
        return {
            'status': 'success',
            'message': f'Selected schema: {schema_name}',
            'schema': schema_name,
            'tables': tables,
            'db_config': new_config
        }
    
    @staticmethod
    def get_schemas(db_config: dict) -> dict:
        """Get all schemas in PostgreSQL database."""
        from database.adapters import get_adapter
        from database.connection_manager import get_connection_manager
        
        if not db_config:
            return {'status': 'error', 'message': 'No database connected'}
        
        db_type = db_config.get('db_type', 'mysql')
        if db_type != 'postgresql':
            return {'status': 'error', 'message': 'Schema selection only for PostgreSQL'}
        
        adapter = get_adapter(db_type)
        manager = get_connection_manager()
        
        schemas = []
        with manager.get_cursor(db_config) as cursor:
            cursor.execute(adapter.get_schemas_query())
            schemas = [row[0] for row in cursor.fetchall()]
        
        return {
            'status': 'success', 
            'schemas': schemas,
            'current_schema': db_config.get('schema', 'public')
        }
    
    @staticmethod
    def get_tables(db_config: dict) -> dict:
        """Get all tables in current database/schema."""
        from database.operations import DatabaseOperations
        
        if not db_config:
            return {'status': 'error', 'message': 'No database connected'}
        
        db_name = db_config.get('database')
        if not db_name:
            return {'status': 'error', 'message': 'No database selected'}
        
        schema = db_config.get('schema', 'public')
        tables = DatabaseOperations.get_tables(db_config, db_name, schema=schema)
        
        return {'status': 'success', 'tables': tables, 'database': db_name, 'schema': schema}
    
    @staticmethod
    def get_table_info(db_config: dict, table_name: str) -> dict:
        """Get table schema + row count."""
        from database.operations import DatabaseOperations
        
        if not table_name:
            return {'status': 'error', 'message': 'Table name is required'}
        
        if not db_config:
            return {'status': 'error', 'message': 'No database connected'}
        
        db_name = db_config.get('database')
        if not db_name:
            return {'status': 'error', 'message': 'No database selected'}
        
        schema = DatabaseOperations.get_table_schema(db_config, table_name, db_name)
        row_count = DatabaseOperations.get_table_row_count(db_config, table_name, db_name)
        
        return {
            'status': 'success',
            'table_name': table_name,
            'schema': schema,
            'row_count': row_count
        }
    
    @staticmethod
    def disconnect(db_config: dict, user_id: str = None) -> dict:
        """
        Close connection pool + clear context.
        
        Args:
            db_config: Database configuration
            user_id: User ID for context clearing
            
        Returns:
            Dict with status and message
        """
        from database.operations import DatabaseOperations
        from database.connection_manager import get_connection_manager
        
        try:
            manager = get_connection_manager()
            closed = manager.close_pool(db_config) if db_config else False
            
            DatabaseOperations.clear_cache()
            
            # Clear Firestore context
            if user_id:
                try:
                    from services.context_service import ContextService
                    ContextService.clear_connection(user_id)
                except Exception as e:
                    logger.warning(f"Failed to clear context: {e}")
            
            logger.info(f"Disconnected (pool closed: {closed})")
            return {'status': 'success', 'message': 'Disconnected from database.'}
        except Exception as e:
            logger.exception('Error disconnecting')
            return {'status': 'error', 'message': str(e)}
    
    @staticmethod
    def execute_query(db_config: dict, sql_query: str, user_id: str = None,
                      max_rows: int = 1000, timeout: int = 30) -> dict:
        """
        Execute SQL query + log to context.
        
        Args:
            db_config: Database configuration
            sql_query: SQL query to execute
            user_id: User ID for context logging
            max_rows: Maximum rows to return
            timeout: Query timeout in seconds
            
        Returns:
            Query result dict
        """
        from database.operations import execute_sql_query
        
        result = execute_sql_query(db_config, sql_query, max_rows=max_rows, timeout_seconds=timeout)
        
        # Log query to context
        if user_id:
            try:
                from services.context_service import ContextService
                db_name = db_config.get('database') if db_config else None
                row_count = result.get('row_count', 0)
                status = 'success' if result['status'] == 'success' else 'error'
                ContextService.add_query(user_id, sql_query, db_name, row_count, status)
            except Exception as e:
                logger.warning(f"Failed to log query: {e}")
        
        return result
    
    @staticmethod
    def get_databases(db_config: dict) -> dict:
        """Get list of databases with is_remote flag and db_type."""
        from database.operations import DatabaseOperations
        
        result = DatabaseOperations.get_databases(db_config)
        
        if db_config:
            # Always include db_type for frontend to use
            result['db_type'] = db_config.get('db_type')
            
            if db_config.get('connection_string'):
                result['is_remote'] = True
        
        return result
    
    @staticmethod
    def _fetch_tables(db_config: dict, db_name: str, db_type: str) -> List[str]:
        """Fetch tables for a database."""
        from database.adapters import get_adapter
        from database.connection_manager import get_connection_manager
        
        tables = []
        adapter = get_adapter(db_type)
        manager = get_connection_manager()
        
        try:
            with manager.get_cursor(db_config) as cursor:
                tables_query, tables_params = adapter.get_all_tables_for_cache(db_name)
                cursor.execute(tables_query, tables_params)
                tables = [row[0] for row in cursor.fetchall()]
        except Exception as e:
            logger.warning(f"Failed to fetch tables: {e}")
        
        return tables
    
    @staticmethod
    def _update_context(user_id: str, db_type: str, database: str, host: str, is_remote: bool):
        """Update user's connection context in Firestore."""
        try:
            from services.context_service import ContextService
            ContextService.set_connection(user_id, db_type, database, host, is_remote)
        except Exception as e:
            logger.warning(f"Failed to update context: {e}")
