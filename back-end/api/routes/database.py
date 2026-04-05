# File: api/routes/database.py
"""Database connection and query related API routes."""

import logging
import time
from typing import Optional

from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from dependencies import (
    get_current_user,
    get_db_config,
    require_db_config,
    update_session_data,
)
from services.database_service import DatabaseService
from database import connection_handlers
from api.request_schemas import RunQueryRequest, SwitchDatabaseRequest, ConnectDBRequest

logger = logging.getLogger(__name__)
router = APIRouter(tags=["database"])


# =============================================================================
# DATABASE CONNECTION ROUTES
# =============================================================================

@router.post('/connect_db')
async def connect_db(
    request: Request,
    data: ConnectDBRequest,
    user: dict = Depends(get_current_user)
):
    """Connect to a remote database via connection string or host/port credentials."""
    user_id = user.get('uid') or user

    # Log connection request without sensitive fields
    safe_log_data = {k: v for k, v in data.model_dump().items()
                     if k not in ('password', 'connection_string')}
    logger.info(f"Connect request data: {safe_log_data}")

    db_type = data.db_type
    connection_string = data.connection_string

    _REMOTE_STRING_HANDLERS = {
        'postgresql': connection_handlers.connect_remote_postgresql,
        'mysql':      connection_handlers.connect_remote_mysql,
        'sqlserver':  connection_handlers.connect_remote_sqlserver,
        'oracle':     connection_handlers.connect_remote_oracle,
    }

    _HOST_PORT_HANDLERS = {
        'postgresql': connection_handlers.connect_postgresql,
        'mysql':      connection_handlers.connect_mysql,
        'sqlserver':  connection_handlers.connect_sqlserver,
        'oracle':     connection_handlers.connect_oracle,
    }

    if connection_string:
        # Connection string path (remote)
        handler = _REMOTE_STRING_HANDLERS.get(db_type)
        if not handler:
            raise HTTPException(status_code=400, detail=f'Remote {db_type} via connection string is not supported.')
        result = await run_in_threadpool(handler, connection_string, user_id)
    else:
        # Host/port/credentials path — loopback addresses are rejected inside the handler
        handler = _HOST_PORT_HANDLERS.get(db_type)
        if not handler:
            raise HTTPException(status_code=400, detail=f'{db_type} is not supported.')
        result = await run_in_threadpool(
            handler,
            data.host, data.port, data.username, data.password,
            data.database, user_id,
        )
    
    # Store db_config in session if connection successful
    if result.get('status') in ['connected', 'success'] and 'db_config' in result:
        await update_session_data(request, {
            'db_config': result['db_config'],
            'db_config_last_used_at': time.time(),
            'db_config_last_closed_at': None,
        })
    
    if result.get('status') == 'error':
        logger.error(f"Connection failed: {result.get('message')}")
        raise HTTPException(status_code=400, detail=result.get('message'))
    
    return result


@router.post('/disconnect_db')
async def disconnect_db(
    request: Request,
    db_config: Optional[dict] = Depends(get_db_config),
    user: dict = Depends(get_current_user)
):
    """Disconnect from the current database."""
    user_id = user.get('uid') or user
    
    result = await run_in_threadpool(
        DatabaseService.disconnect,
        db_config, user_id
    )
    
    # Clear db_config from session
    await update_session_data(request, {
        'db_config': None,
        'db_config_last_used_at': None,
        'db_config_last_closed_at': None,
    })
    
    if result.get('status') == 'error':
        raise HTTPException(status_code=500, detail=result.get('message'))
    return result


@router.get('/db_status')
async def db_status(db_config: Optional[dict] = Depends(get_db_config)):
    """Get current database connection status.
    
    Returns all state needed by frontend DatabaseContext:
    - connected: boolean connection status
    - current_database: currently selected database name
    - db_type: database type (mysql, postgresql, sqlserver, oracle)
    - is_remote: whether using connection string
    - databases: list of available databases for switching
    """
    if not db_config:
        return {'status': 'disconnected', 'connected': False}
    
    # Fetch available databases for the switcher chip
    databases = []
    try:
        result = await run_in_threadpool(DatabaseService.get_databases, db_config)
        if result.get('status') == 'success':
            databases = result.get('databases', [])
    except Exception as e:
        logger.warning(f"Failed to fetch databases for status: {e}")
    
    return {
        'status': 'connected',
        'connected': True,
        'db_type': db_config.get('db_type'),
        'current_database': db_config.get('database'),
        'is_remote': db_config.get('is_remote', False),
        'databases': databases,
    }


@router.get('/db_heartbeat')
async def db_heartbeat(db_config: Optional[dict] = Depends(get_db_config)):
    """Lightweight database connection health check."""
    if not db_config:
        return {'status': 'error', 'connected': False}
    
    try:
        from database.connection_manager import get_connection_manager
        from database.adapters import get_adapter
        
        manager = get_connection_manager()
        adapter = get_adapter(db_config.get('db_type', 'mysql'))
        
        conn = await run_in_threadpool(manager.get_connection, db_config)
        is_valid = await run_in_threadpool(adapter.validate_connection, conn)
        
        return {'status': 'success', 'connected': is_valid}
    except Exception:
        return {'status': 'error', 'connected': False}


@router.get('/get_databases')
async def get_databases_route(db_config: Optional[dict] = Depends(get_db_config)):
    """Get list of available databases."""
    result = await run_in_threadpool(DatabaseService.get_databases, db_config)
    return result


@router.post('/switch_remote_database')
async def switch_remote_database(
    request: Request,
    data: SwitchDatabaseRequest,
    db_config: dict = Depends(require_db_config),
    user: dict = Depends(get_current_user)
):
    """Switch to a different database on remote server."""
    user_id = user.get('uid') or user
    
    result = await run_in_threadpool(
        DatabaseService.switch_remote_database,
        db_config, data.database, user_id
    )
    
    # Update session with new db_config
    if result.get('status') == 'success' and 'db_config' in result:
        await update_session_data(request, {
            'db_config': result['db_config'],
            'db_config_last_used_at': time.time(),
            'db_config_last_closed_at': None,
        })
    
    if result.get('status') == 'error':
        raise HTTPException(status_code=400, detail=result.get('message'))
    return result


@router.post('/select_database')
async def select_database(
    request: Request,
    data: SwitchDatabaseRequest,
    db_config: dict = Depends(require_db_config),
    user: dict = Depends(get_current_user)
):
    """Select a database on existing connection."""
    user_id = user.get('uid') or user
    
    result = await run_in_threadpool(
        connection_handlers.select_database,
        db_config, data.database, user_id
    )
    
    if result.get('status') in ['connected', 'success'] and 'db_config' in result:
        await update_session_data(request, {
            'db_config': result['db_config'],
            'db_config_last_used_at': time.time(),
            'db_config_last_closed_at': None,
        })
    
    if result.get('status') == 'error':
        raise HTTPException(status_code=400, detail=result.get('message'))
    return result


# =============================================================================
# QUERY ROUTES
# =============================================================================

@router.post('/run_sql_query')
async def run_sql_query(
    data: RunQueryRequest,
    db_config: dict = Depends(require_db_config),
    user: dict = Depends(get_current_user)
):
    """Execute a SQL query."""
    from config import Config
    
    user_id = user.get('uid') or user
    sql_query = data.sql_query
    max_rows = data.max_rows or Config.MAX_QUERY_RESULTS
    timeout = data.timeout
    
    result = await run_in_threadpool(
        DatabaseService.execute_query,
        db_config, sql_query, user_id,
        max_rows=max_rows, timeout=timeout
    )
    return result
