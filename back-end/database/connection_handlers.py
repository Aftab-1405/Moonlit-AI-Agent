"""
Connection Handlers - Pure FastAPI Version

Database connection handlers that return dicts (not Flask responses).
All methods accept db_config explicitly - no Flask dependencies.
"""

import re
import logging
from typing import Dict

logger = logging.getLogger(__name__)


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _clear_cache():
    """Clear any cached database metadata."""
    try:
        from database.operations import DatabaseOperations
        DatabaseOperations.clear_cache()
    except Exception:
        logger.debug('Failed to clear DatabaseOperations cache')


def _parse_connection_string(connection_string: str) -> Dict[str, str]:
    """Parse connection string to extract database name and host."""
    db_match = re.search(r'/([^/?]+)(\?|$)', connection_string)
    host_match = re.search(r'@([^/:]+)', connection_string)
    
    return {
        'database': db_match.group(1) if db_match else 'remote_db',
        'host': host_match.group(1) if host_match else 'remote'
    }


def _sync_context(user_id: str, db_type: str, database: str, host: str, is_remote: bool, schema: str = 'public'):
    """Sync connection state to Firestore for AI context."""
    if not user_id:
        return
    try:
        from services.context_service import ContextService
        ContextService.set_connection(user_id, db_type, database, host, is_remote, schema)
        logger.info(f"Synced context for user {user_id}: {db_type}/{database}")
    except Exception as e:
        logger.warning(f"Failed to sync context: {e}")


def _store_schema_context(user_id: str, db_config: dict, database: str, tables: list, db_type: str):
    """Store database schema as AI context in Firestore.
    
    This provides the AI agent with understanding of the database
    structure (tables, columns) it's working with.
    """
    if not user_id:
        return
    try:
        from services.context_service import ContextService
        from database.connection_manager import get_connection_manager
        from database.adapters import get_adapter
        from config import get_config
        
        config = get_config()
        max_tables = config.SCHEMA_CONTEXT_MAX_TABLES
        
        adapter = get_adapter(db_type)
        manager = get_connection_manager()
        
        columns = {}
        with manager.get_cursor(db_config) as cursor:
            for table in tables[:max_tables]:
                try:
                    cols_query, cols_params = adapter.get_columns_for_table_cache(database, table)
                    cursor.execute(cols_query, cols_params)
                    rows = cursor.fetchall()
                    # SQLite PRAGMA table_info returns (cid, name, type, notnull, dflt_value, pk)
                    # Other DBs return column name in first position
                    if db_type == 'sqlite':
                        columns[table] = [row[1] for row in rows]  # name is at index 1
                    else:
                        columns[table] = [row[0] for row in rows]
                except Exception as e:
                    logger.debug(f"Failed to get columns for {table}: {e}")
                    columns[table] = []
        
        ContextService.store_schema_context(user_id, database, tables, columns)
        logger.info(f"Stored schema context for {database}: {len(tables)} tables (limit: {max_tables})")
    except Exception as e:
        logger.warning(f"Failed to store schema context: {e}")


# =============================================================================
# CONNECTION FUNCTIONS - Return dicts, not Flask responses
# =============================================================================

def connect_local_sqlite(file_path: str, user_id: str = None) -> dict:
    """Connect to a local SQLite database file."""
    from database.adapters import get_adapter
    from database.connection_manager import get_connection_manager
    import os
    
    if not file_path:
        return {'status': 'error', 'message': 'Database file path required'}
    
    _clear_cache()
    
    # Extract just the filename for display purposes
    display_name = os.path.basename(file_path)
    
    db_config = {
        'db_type': 'sqlite',
        'database': display_name,  # Use filename for display
        'file_path': file_path,    # Store full path for actual connection
    }
    
    try:
        manager = get_connection_manager()
        conn = manager.get_connection(db_config)
        adapter = get_adapter('sqlite')
        
        if adapter.validate_connection(conn):
            # Sync connection context
            _sync_context(user_id, 'sqlite', display_name, 'local', False)
            
            # Fetch tables for caching and mindmap
            tables = []
            try:
                tables_query, tables_params = adapter.get_all_tables_for_cache(display_name)
                with manager.get_cursor(db_config) as cursor:
                    cursor.execute(tables_query, tables_params)
                    tables = [row[0] for row in cursor.fetchall()]
            except Exception as e:
                logger.warning(f"Failed to fetch SQLite tables: {e}")
            
            # Cache schema for mindmap/AI context
            if tables and user_id:
                _store_schema_context(user_id, db_config, display_name, tables, 'sqlite')
            
            logger.info(f"Connected to SQLite: {file_path} with {len(tables)} tables")
            return {
                'status': 'connected',
                'message': 'Connected to SQLite database',
                'schemas': [display_name],  # Just the one database
                'tables': tables,
                'db_type': 'sqlite',
                'db_config': db_config,
                'selectedDatabase': display_name,
            }
        return {'status': 'error', 'message': 'Failed to connect to SQLite'}
    except Exception as err:
        logger.exception('Error connecting to SQLite')
        return {'status': 'error', 'message': str(err)}


def connect_local_mysql(host: str, port: int, user: str, password: str, 
                        database: str = None, user_id: str = None) -> dict:
    """Connect to a local MySQL server."""
    from database.operations import DatabaseOperations
    from database.adapters import get_adapter
    from database.connection_manager import get_connection_manager
    
    _clear_cache()
    
    db_config = {
        'db_type': 'mysql',
        'host': host or 'localhost',
        'port': int(port) if port else 3306,
        'user': user,
        'password': password
    }
    if database:
        db_config['database'] = database
    
    try:
        manager = get_connection_manager()
        conn = manager.get_connection(db_config)
        adapter = get_adapter('mysql')
        
        if adapter.validate_connection(conn):
            dbs_result = DatabaseOperations.get_databases(db_config)
            
            if dbs_result.get('status') == 'success':
                _sync_context(user_id, 'mysql', database or 'mysql', host, False)
                
                # Cache schema if a database is selected
                if database and user_id:
                    try:
                        tables_query, tables_params = adapter.get_all_tables_for_cache(database)
                        with manager.get_cursor(db_config) as cursor:
                            cursor.execute(tables_query, tables_params)
                            tables = [row[0] for row in cursor.fetchall()]
                        if tables:
                            _store_schema_context(user_id, db_config, database, tables, 'mysql')
                    except Exception as e:
                        logger.warning(f"Failed to cache MySQL schema: {e}")
                
                logger.info(f"Connected to MySQL: {host}:{port}")
                return {
                    'status': 'connected',
                    'message': f'Connected to MySQL at {host}:{port}',
                    'schemas': dbs_result['databases'],
                    'db_type': 'mysql',
                    'db_config': db_config,
                    'selectedDatabase': database
                }
            
            return {
                'status': 'connected',
                'message': 'Connected, but failed to fetch databases',
                'schemas': [],
                'db_type': 'mysql',
                'db_config': db_config
            }
        return {'status': 'error', 'message': 'Failed to connect to MySQL'}
    except Exception as err:
        logger.exception('Error connecting to MySQL')
        return {'status': 'error', 'message': str(err)}


def connect_local_postgresql(host: str, port: int, user: str, password: str,
                             database: str = None, user_id: str = None) -> dict:
    """Connect to a local PostgreSQL server."""
    from database.operations import DatabaseOperations
    from database.adapters import get_adapter
    from database.connection_manager import get_connection_manager
    
    _clear_cache()
    
    db_config = {
        'db_type': 'postgresql',
        'host': host or 'localhost',
        'port': int(port) if port else 5432,
        'user': user,
        'password': password
    }
    if database:
        db_config['database'] = database
    
    try:
        manager = get_connection_manager()
        conn = manager.get_connection(db_config)
        adapter = get_adapter('postgresql')
        
        if adapter.validate_connection(conn):
            dbs_result = DatabaseOperations.get_databases(db_config)
            
            if dbs_result.get('status') == 'success':
                _sync_context(user_id, 'postgresql', database or 'postgres', host, False)
                
                # Cache schema if a database is selected
                if database and user_id:
                    try:
                        tables_query, tables_params = adapter.get_all_tables_for_cache(database, 'public')
                        with manager.get_cursor(db_config) as cursor:
                            cursor.execute(tables_query, tables_params)
                            tables = [row[0] for row in cursor.fetchall()]
                        if tables:
                            _store_schema_context(user_id, db_config, database, tables, 'postgresql')
                    except Exception as e:
                        logger.warning(f"Failed to cache PostgreSQL schema: {e}")
                
                logger.info(f"Connected to PostgreSQL: {host}:{port}")
                return {
                    'status': 'connected',
                    'message': f'Connected to PostgreSQL at {host}:{port}',
                    'schemas': dbs_result['databases'],
                    'db_type': 'postgresql',
                    'db_config': db_config,
                    'selectedDatabase': database
                }
            
            return {
                'status': 'connected',
                'message': 'Connected, but failed to fetch databases',
                'schemas': [],
                'db_type': 'postgresql',
                'db_config': db_config
            }
        return {'status': 'error', 'message': 'Failed to connect to PostgreSQL'}
    except Exception as err:
        logger.exception('Error connecting to PostgreSQL')
        return {'status': 'error', 'message': str(err)}


def connect_remote_postgresql(connection_string: str, user_id: str = None) -> dict:
    """Connect to a remote PostgreSQL database using connection string."""
    from database.adapters import get_adapter
    from database.connection_manager import get_connection_manager
    
    _clear_cache()
    
    parsed = _parse_connection_string(connection_string)
    db_name = parsed['database']
    host = parsed['host']
    
    db_config = {
        'db_type': 'postgresql',
        'connection_string': connection_string,
        'database': db_name,
        'is_remote': True
    }
    
    try:
        manager = get_connection_manager()
        conn = manager.get_connection(db_config)
        adapter = get_adapter('postgresql')
        
        if adapter.validate_connection(conn):
            logger.info(f"Connected to remote PostgreSQL: {db_name} at {host}")
            
            # Get databases
            all_databases = []
            try:
                with manager.get_cursor(db_config) as cursor:
                    cursor.execute(adapter.get_databases_for_remote())
                    all_databases = [row[0] for row in cursor.fetchall()]
            except Exception:
                all_databases = [db_name]
            
            # Get tables
            tables = []
            try:
                with manager.get_cursor(db_config) as cursor:
                    query, params = adapter.get_all_tables_for_cache(db_name, 'public')
                    cursor.execute(query, params)
                    tables = [row[0] for row in cursor.fetchall()]
            except Exception as e:
                logger.warning(f"Failed to fetch tables: {e}")
            
            _sync_context(user_id, 'postgresql', db_name, host, True)
            _store_schema_context(user_id, db_config, db_name, tables, 'postgresql')
            
            message = f'Connected to remote PostgreSQL: {db_name}'
            if tables:
                message += f' ({len(tables)} tables)'
            
            return {
                'status': 'connected',
                'message': message,
                'schemas': all_databases,
                'selectedDatabase': db_name,
                'is_remote': True,
                'tables': tables,
                'db_type': 'postgresql',
                'db_config': db_config
            }
        return {'status': 'error', 'message': 'Failed to connect to remote PostgreSQL'}
    except Exception as err:
        logger.exception('Error connecting to remote PostgreSQL')
        return {'status': 'error', 'message': str(err)}


def connect_remote_mysql(connection_string: str, user_id: str = None) -> dict:
    """Connect to a remote MySQL database using connection string."""
    from database.adapters import get_adapter
    from database.connection_manager import get_connection_manager
    
    _clear_cache()
    
    parsed = _parse_connection_string(connection_string)
    db_name = parsed['database']
    host = parsed['host']
    
    db_config = {
        'db_type': 'mysql',
        'connection_string': connection_string,
        'database': db_name,
        'is_remote': True
    }
    
    try:
        manager = get_connection_manager()
        conn = manager.get_connection(db_config)
        adapter = get_adapter('mysql')
        
        if adapter.validate_connection(conn):
            logger.info(f"Connected to remote MySQL: {db_name} at {host}")
            
            # Get databases
            all_databases = []
            try:
                with manager.get_cursor(db_config) as cursor:
                    cursor.execute(adapter.get_databases_query())
                    all_databases = [row[0] for row in cursor.fetchall()]
                    system_dbs = adapter.get_system_databases()
                    all_databases = [db for db in all_databases if db.lower() not in system_dbs]
            except Exception:
                all_databases = [db_name]
            
            # Get tables
            tables = []
            try:
                with manager.get_cursor(db_config) as cursor:
                    cursor.execute(
                        """
                        SELECT TABLE_NAME FROM information_schema.TABLES 
                        WHERE TABLE_SCHEMA = %s AND TABLE_TYPE = 'BASE TABLE'
                        ORDER BY TABLE_NAME
                        """,
                        (db_name,)
                    )
                    tables = [row[0] for row in cursor.fetchall()]
            except Exception as e:
                logger.warning(f"Failed to fetch tables: {e}")
            
            _sync_context(user_id, 'mysql', db_name, host, True)
            _store_schema_context(user_id, db_config, db_name, tables, 'mysql')
            
            message = f'Connected to remote MySQL: {db_name}'
            if tables:
                message += f' ({len(tables)} tables)'
            
            return {
                'status': 'connected',
                'message': message,
                'schemas': all_databases,
                'selectedDatabase': db_name,
                'is_remote': True,
                'tables': tables,
                'db_type': 'mysql',
                'db_config': db_config
            }
        return {'status': 'error', 'message': 'Failed to connect to remote MySQL'}
    except Exception as err:
        logger.exception('Error connecting to remote MySQL')
        return {'status': 'error', 'message': str(err)}


def select_database(db_config: dict, db_name: str, user_id: str = None) -> dict:
    """
    Select a database on an existing connection.
    
    Args:
        db_config: Current database configuration
        db_name: Name of database to select
        user_id: User ID for context tracking
        
    Returns:
        Dict with status and updated db_config
    """
    from database.operations import fetch_database_info, DatabaseOperations
    
    if not db_name:
        return {'status': 'error', 'message': 'Database name required'}
    
    if not db_config:
        return {'status': 'error', 'message': 'No database connected'}
    
    db_type = db_config.get('db_type', 'mysql')
    
    # For SQLite, there's only one database per file - no switching needed
    if db_type == 'sqlite':
        current_db = db_config.get('database')
        logger.info(f"SQLite database already selected: {current_db}")
        return {
            'status': 'connected',
            'message': f'Already connected to {current_db}',
            'db_config': db_config
        }
    
    # Create new config with selected database
    new_config = db_config.copy()
    new_config['database'] = db_name
    
    try:
        db_info, detailed_info = fetch_database_info(new_config, db_name)
        
        db_type = db_config.get('db_type', 'mysql')
        host = db_config.get('host', 'local')
        _sync_context(user_id, db_type, db_name, host, False)
        
        tables = DatabaseOperations.get_tables(new_config, db_name)
        if tables:
            _store_schema_context(user_id, new_config, db_name, tables, db_type)
        
        logger.info(f"Selected database: {db_name}")
        return {
            'status': 'connected',
            'message': f'Connected to database {db_name}',
            'db_config': new_config
        }
    except Exception as err:
        logger.exception(f'Error selecting database {db_name}')
        return {'status': 'error', 'message': str(err)}


# =============================================================================
# ORACLE CONNECTION HANDLERS
# =============================================================================

def connect_local_oracle(host: str, port: int, user: str, password: str,
                         service_name: str = None, user_id: str = None) -> dict:
    """Connect to a local Oracle database server."""
    from database.adapters import get_adapter
    from database.connection_manager import get_connection_manager
    
    _clear_cache()
    
    db_config = {
        'db_type': 'oracle',
        'host': host or 'localhost',
        'port': int(port) if port else 1521,
        'user': user,
        'password': password,
        'service_name': service_name or 'ORCL',
        'database': user.upper() if user else 'SYSTEM'  # Oracle schema = user
    }
    
    try:
        manager = get_connection_manager()
        conn = manager.get_connection(db_config)
        adapter = get_adapter('oracle')
        
        if adapter.validate_connection(conn):
            # Get schemas (users) as "databases"
            schemas = []
            try:
                with manager.get_cursor(db_config) as cursor:
                    cursor.execute(adapter.get_databases_query())
                    schemas = [row[0] for row in cursor.fetchall()]
            except Exception as e:
                logger.warning(f"Failed to fetch Oracle schemas: {e}")
                schemas = [user.upper()] if user else []
            
            schema_name = user.upper() if user else 'SYSTEM'
            _sync_context(user_id, 'oracle', schema_name, host, False)
            
            # Cache schema if we have a user/schema
            if schema_name and user_id:
                try:
                    tables_query, tables_params = adapter.get_all_tables_for_cache(schema_name)
                    with manager.get_cursor(db_config) as cursor:
                        cursor.execute(tables_query, tables_params)
                        tables = [row[0] for row in cursor.fetchall()]
                    if tables:
                        _store_schema_context(user_id, db_config, schema_name, tables, 'oracle')
                except Exception as e:
                    logger.warning(f"Failed to cache Oracle schema: {e}")
            
            logger.info(f"Connected to Oracle: {host}:{port}/{service_name}")
            return {
                'status': 'connected',
                'message': f'Connected to Oracle at {host}:{port}/{service_name}',
                'schemas': schemas,
                'db_type': 'oracle',
                'db_config': db_config,
                'selectedDatabase': schema_name
            }
        return {'status': 'error', 'message': 'Failed to connect to Oracle'}
    except Exception as err:
        logger.exception('Error connecting to Oracle')
        return {'status': 'error', 'message': str(err)}


def connect_remote_oracle(connection_string: str, user_id: str = None) -> dict:
    """
    Connect to a remote Oracle database using connection string.
    
    Expected format: user/password@host:port/service_name
    """
    from database.adapters import get_adapter
    from database.connection_manager import get_connection_manager
    import re
    
    _clear_cache()
    
    # Parse Oracle connection string: user/password@host:port/service_name
    match = re.match(r'([^/]+)/([^@]+)@([^:]+):?(\d+)?/(.+)', connection_string)
    if match:
        user, password, host, port, service_name = match.groups()
        port = int(port) if port else 1521
        schema_name = user.upper()
    else:
        # Simple format - try direct connection
        host = 'remote'
        schema_name = 'REMOTE'
    
    db_config = {
        'db_type': 'oracle',
        'connection_string': connection_string,
        'database': schema_name,
        'is_remote': True
    }
    
    try:
        manager = get_connection_manager()
        conn = manager.get_connection(db_config)
        adapter = get_adapter('oracle')
        
        if adapter.validate_connection(conn):
            logger.info(f"Connected to remote Oracle: {schema_name}")
            
            # Get schemas
            schemas = []
            try:
                with manager.get_cursor(db_config) as cursor:
                    cursor.execute(adapter.get_databases_query())
                    schemas = [row[0] for row in cursor.fetchall()]
            except Exception:
                schemas = [schema_name]
            
            # Get tables
            tables = []
            try:
                tables_query, tables_params = adapter.get_all_tables_for_cache(schema_name)
                with manager.get_cursor(db_config) as cursor:
                    cursor.execute(tables_query, tables_params)
                    tables = [row[0] for row in cursor.fetchall()]
            except Exception as e:
                logger.warning(f"Failed to fetch Oracle tables: {e}")
            
            _sync_context(user_id, 'oracle', schema_name, host, True)
            if tables:
                _store_schema_context(user_id, db_config, schema_name, tables, 'oracle')
            
            message = f'Connected to remote Oracle: {schema_name}'
            if tables:
                message += f' ({len(tables)} tables)'
            
            return {
                'status': 'connected',
                'message': message,
                'schemas': schemas,
                'selectedDatabase': schema_name,
                'is_remote': True,
                'tables': tables,
                'db_type': 'oracle',
                'db_config': db_config
            }
        return {'status': 'error', 'message': 'Failed to connect to remote Oracle'}
    except Exception as err:
        logger.exception('Error connecting to remote Oracle')
        return {'status': 'error', 'message': str(err)}


# =============================================================================
# SQL SERVER CONNECTION HANDLERS
# =============================================================================

def connect_local_sqlserver(host: str, port: int, user: str, password: str,
                            database: str = None, user_id: str = None) -> dict:
    """Connect to a local SQL Server database."""
    from database.adapters import get_adapter
    from database.connection_manager import get_connection_manager
    
    _clear_cache()
    
    db_config = {
        'db_type': 'sqlserver',
        'host': host or 'localhost',
        'port': int(port) if port else 1433,
        'user': user,
        'password': password
    }
    if database:
        db_config['database'] = database
    
    try:
        manager = get_connection_manager()
        conn = manager.get_connection(db_config)
        adapter = get_adapter('sqlserver')
        
        if adapter.validate_connection(conn):
            # Get databases
            databases = []
            try:
                with manager.get_cursor(db_config) as cursor:
                    cursor.execute(adapter.get_databases_query())
                    all_dbs = [row[0] for row in cursor.fetchall()]
                    system_dbs = adapter.get_system_databases()
                    databases = [db for db in all_dbs if db.lower() not in system_dbs]
            except Exception as e:
                logger.warning(f"Failed to fetch SQL Server databases: {e}")
                if database:
                    databases = [database]
            
            _sync_context(user_id, 'sqlserver', database or 'master', host, False)
            
            # Cache schema if a database is selected
            if database and user_id:
                try:
                    tables_query, tables_params = adapter.get_all_tables_for_cache(database)
                    with manager.get_cursor(db_config) as cursor:
                        cursor.execute(tables_query, tables_params)
                        tables = [row[0] for row in cursor.fetchall()]
                    if tables:
                        _store_schema_context(user_id, db_config, database, tables, 'sqlserver')
                except Exception as e:
                    logger.warning(f"Failed to cache SQL Server schema: {e}")
            
            logger.info(f"Connected to SQL Server: {host}:{port}")
            return {
                'status': 'connected',
                'message': f'Connected to SQL Server at {host}:{port}',
                'schemas': databases,
                'db_type': 'sqlserver',
                'db_config': db_config,
                'selectedDatabase': database
            }
        return {'status': 'error', 'message': 'Failed to connect to SQL Server'}
    except Exception as err:
        logger.exception('Error connecting to SQL Server')
        return {'status': 'error', 'message': str(err)}


def connect_remote_sqlserver(connection_string: str, user_id: str = None) -> dict:
    """
    Connect to a remote SQL Server database using connection string.
    
    Expected format: Driver={ODBC Driver 17 for SQL Server};Server=xxx;Database=xxx;UID=xxx;PWD=xxx
    Or: Server=xxx;Database=xxx;User Id=xxx;Password=xxx
    """
    from database.adapters import get_adapter
    from database.connection_manager import get_connection_manager
    import re
    
    _clear_cache()
    
    # Parse connection string for database name and server
    db_match = re.search(r'Database=([^;]+)', connection_string, re.IGNORECASE)
    server_match = re.search(r'Server=([^;,]+)', connection_string, re.IGNORECASE)
    
    db_name = db_match.group(1) if db_match else 'master'
    host = server_match.group(1) if server_match else 'remote'
    
    db_config = {
        'db_type': 'sqlserver',
        'connection_string': connection_string,
        'database': db_name,
        'is_remote': True
    }
    
    try:
        manager = get_connection_manager()
        conn = manager.get_connection(db_config)
        adapter = get_adapter('sqlserver')
        
        if adapter.validate_connection(conn):
            logger.info(f"Connected to remote SQL Server: {db_name} at {host}")
            
            # Get databases
            all_databases = []
            try:
                with manager.get_cursor(db_config) as cursor:
                    cursor.execute(adapter.get_databases_query())
                    all_dbs = [row[0] for row in cursor.fetchall()]
                    system_dbs = adapter.get_system_databases()
                    all_databases = [db for db in all_dbs if db.lower() not in system_dbs]
            except Exception:
                all_databases = [db_name]
            
            # Get tables
            tables = []
            try:
                tables_query, tables_params = adapter.get_all_tables_for_cache(db_name)
                with manager.get_cursor(db_config) as cursor:
                    cursor.execute(tables_query, tables_params)
                    tables = [row[0] for row in cursor.fetchall()]
            except Exception as e:
                logger.warning(f"Failed to fetch SQL Server tables: {e}")
            
            _sync_context(user_id, 'sqlserver', db_name, host, True)
            if tables:
                _store_schema_context(user_id, db_config, db_name, tables, 'sqlserver')
            
            message = f'Connected to remote SQL Server: {db_name}'
            if tables:
                message += f' ({len(tables)} tables)'
            
            return {
                'status': 'connected',
                'message': message,
                'schemas': all_databases,
                'selectedDatabase': db_name,
                'is_remote': True,
                'tables': tables,
                'db_type': 'sqlserver',
                'db_config': db_config
            }
        return {'status': 'error', 'message': 'Failed to connect to remote SQL Server'}
    except Exception as err:
        logger.exception('Error connecting to remote SQL Server')
        return {'status': 'error', 'message': str(err)}
