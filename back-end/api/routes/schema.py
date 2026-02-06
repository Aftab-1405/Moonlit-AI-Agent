# File: api/routes/schema.py
"""Schema and table related API routes."""

import logging
import time

from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from dependencies import get_current_user, require_db_config, update_session_data
from services.database_service import DatabaseService
from api.request_schemas import SelectSchemaRequest, GetTableSchemaRequest

logger = logging.getLogger(__name__)
router = APIRouter(tags=["schema"])


# =============================================================================
# SCHEMA ROUTES
# =============================================================================

@router.get('/get_schemas')
async def get_schemas(db_config: dict = Depends(require_db_config)):
    """Get all schemas in connected PostgreSQL database."""
    result = await run_in_threadpool(DatabaseService.get_schemas, db_config)
    
    if result.get('status') == 'error':
        raise HTTPException(status_code=400, detail=result.get('message'))
    return result


@router.post('/select_schema')
async def select_schema(
    request: Request,
    data: SelectSchemaRequest,
    db_config: dict = Depends(require_db_config),
    user: dict = Depends(get_current_user)
):
    """Select a PostgreSQL schema."""
    user_id = user.get('uid') or user
    
    result = await run_in_threadpool(
        DatabaseService.select_schema,
        db_config, data.schema_name, user_id
    )
    
    # Update session with new db_config containing schema
    if result.get('status') == 'success' and 'db_config' in result:
        await update_session_data(request, {
            'db_config': result['db_config'],
            'db_config_last_used_at': time.time(),
            'db_config_last_closed_at': None,
        })
    
    if result.get('status') == 'error':
        raise HTTPException(status_code=400, detail=result.get('message'))
    return result


# =============================================================================
# TABLE ROUTES
# =============================================================================

@router.get('/get_tables')
async def get_tables(db_config: dict = Depends(require_db_config)):
    """Get all tables in the current database/schema."""
    result = await run_in_threadpool(DatabaseService.get_tables, db_config)
    
    if result.get('status') == 'error':
        raise HTTPException(status_code=400, detail=result.get('message'))
    return result


@router.post('/get_table_schema')
async def get_table_schema_route(
    data: GetTableSchemaRequest,
    db_config: dict = Depends(require_db_config)
):
    """Get schema information for a specific table."""
    result = await run_in_threadpool(
        DatabaseService.get_table_info,
        db_config, data.table_name
    )
    
    if result.get('status') == 'error':
        raise HTTPException(status_code=400, detail=result.get('message'))
    return result
