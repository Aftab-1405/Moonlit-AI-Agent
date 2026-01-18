# File: api/routes/context.py
"""User context and settings related API routes."""

import logging

from fastapi import APIRouter, Request, Depends
from fastapi.concurrency import run_in_threadpool

from dependencies import (
    get_current_user,
    require_db_config,
    get_session_data,
    update_session_data,
)
from api.request_schemas import SaveUserSettingsRequest

logger = logging.getLogger(__name__)
router = APIRouter(tags=["context"])


# =============================================================================
# USER CONTEXT ROUTES
# =============================================================================

@router.get('/user/context')
async def get_user_context(user: dict = Depends(get_current_user)):
    """Get full user context including connection state and cached schemas."""
    from services.context_service import ContextService
    
    user_id = user.get('uid') or user
    context = await run_in_threadpool(ContextService.get_full_context, user_id)
    
    # Convert schemas dict to array for frontend
    schemas_dict = context.get('schemas', {})
    schemas_list = []
    for db_name, schema_data in schemas_dict.items():
        schemas_list.append({
            'database': db_name,
            'tables': schema_data.get('tables', []),
            'columns': schema_data.get('columns', {}),
            'cached_at': schema_data.get('cached_at')
        })
    
    return {
        'status': 'success',
        'connection': context.get('connection', {'connected': False}),
        'schemas': schemas_list,
        'recent_queries': context.get('recent_queries', [])
    }


@router.post('/user/context/refresh')
async def refresh_user_context(
    db_config: dict = Depends(require_db_config),
    user: dict = Depends(get_current_user)
):
    """Refresh schema cache for current database."""
    from services.context_service import ContextService
    from database.operations import DatabaseOperations
    
    user_id = user.get('uid') or user
    database = db_config.get('database')
    
    # Get fresh schema data
    tables_result = await run_in_threadpool(DatabaseOperations.get_tables, db_config)
    tables = tables_result.get('tables', [])
    
    # Get columns for each table
    columns = {}
    for table in tables:
        schema_result = await run_in_threadpool(
            DatabaseOperations.get_table_schema, 
            db_config, table
        )
        if schema_result.get('status') == 'success':
            columns[table] = schema_result.get('columns', [])
    
    # Store schema as AI context
    await run_in_threadpool(
        ContextService.store_schema_context,
        user_id, database, tables, columns
    )
    
    return {'status': 'success', 'tables': len(tables)}


@router.delete('/user/context/schema/{database}')
async def delete_schema_context(
    database: str,
    user: dict = Depends(get_current_user)
):
    """Delete stored schema context for a specific database."""
    from services.context_service import ContextService
    
    user_id = user.get('uid') or user
    success = await run_in_threadpool(
        ContextService.clear_schema_context,
        user_id, database
    )
    
    if success:
        return {'status': 'success', 'message': f'Schema context for {database} cleared'}
    return {'status': 'error', 'message': 'Failed to clear schema context'}


@router.delete('/user/context/schemas')
async def delete_all_schema_contexts(user: dict = Depends(get_current_user)):
    """Delete all stored schema contexts for user."""
    from services.context_service import ContextService
    
    user_id = user.get('uid') or user
    # Get all schemas first
    context = await run_in_threadpool(ContextService.get_full_context, user_id)
    schemas = context.get('schemas', {})
    
    # Delete each schema context
    for db_name in schemas.keys():
        await run_in_threadpool(ContextService.clear_schema_context, user_id, db_name)
    
    return {'status': 'success', 'message': f'Cleared {len(schemas)} schema contexts'}


@router.delete('/user/context/queries')
async def clear_query_history(user: dict = Depends(get_current_user)):
    """Clear query history for user."""
    from services.context_service import ContextService
    
    user_id = user.get('uid') or user
    success = await run_in_threadpool(ContextService.clear_query_history, user_id)
    
    if success:
        return {'status': 'success', 'message': 'Query history cleared'}
    return {'status': 'error', 'message': 'Failed to clear query history'}


# =============================================================================
# CONTEXT METRICS ROUTES
# =============================================================================

@router.get('/context/metrics')
async def get_context_metrics(user: dict = Depends(get_current_user)):
    """
    Get context hit/miss metrics for monitoring effectiveness.
    
    Returns:
        - hits: Number of times context was found and fresh
        - misses: Number of times context was stale or not found
        - stores: Number of context store operations
        - clears: Number of context clear operations
        - hit_rate_percent: Hit rate percentage
        - metrics_enabled: Whether metrics tracking is enabled
    """
    from services.context_service import ContextMetrics
    from config import get_config
    
    config = get_config()
    stats = ContextMetrics.get_stats()
    
    # Add config values for reference
    stats['config'] = {
        'schema_context_ttl_seconds': config.SCHEMA_CONTEXT_TTL_SECONDS,
        'schema_context_max_tables': config.SCHEMA_CONTEXT_MAX_TABLES,
        'connection_context_ttl_seconds': config.CONNECTION_CONTEXT_TTL_SECONDS
    }
    
    return {'status': 'success', 'metrics': stats}


@router.post('/context/metrics/reset')
async def reset_context_metrics(user: dict = Depends(get_current_user)):
    """Reset context metrics counters (for testing/monitoring)."""
    from services.context_service import ContextMetrics
    
    ContextMetrics.reset()
    return {'status': 'success', 'message': 'Context metrics reset'}


# =============================================================================
# USER SETTINGS ROUTES
# =============================================================================

@router.get('/user/settings')
async def get_user_settings(
    user: dict = Depends(get_current_user),
    session: dict = Depends(get_session_data)
):
    """Get user settings from session."""
    return {
        'connectionPersistenceMinutes': session.get('connectionPersistenceMinutes', 30)
    }


@router.post('/user/settings')
async def save_user_settings(
    request: Request,
    data: SaveUserSettingsRequest,
    user: dict = Depends(get_current_user)
):
    """Save user settings to session."""
    await update_session_data(request, data.model_dump(exclude_unset=True))
    return {'status': 'success'}
