# File: api/routes/context.py
"""User context and settings related API routes."""

import logging
import time

from fastapi import APIRouter, Request, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from dependencies import (
    get_current_user,
    require_db_config,
    get_session_data,
    update_session_data,
    _expire_db_config,
)
from api.request_schemas import (
    SaveUserSettingsRequest,
    CloseSessionRequest,
    SessionActiveRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["context"])


# =============================================================================
# USER CONTEXT ROUTES
# =============================================================================


@router.get("/user/context")
async def get_user_context(user: dict = Depends(get_current_user)):
    """Get full user context including connection state and cached schemas."""
    from services.context_service import ContextService

    user_id = user.get("uid") or user
    context = await run_in_threadpool(ContextService.get_full_context, user_id)

    # Convert schemas dict to array for frontend
    schemas_dict = context.get("schemas", {})
    schemas_list = []
    for db_name, schema_data in schemas_dict.items():
        schemas_list.append(
            {
                "database": db_name,
                "tables": schema_data.get("tables", []),
                "columns": schema_data.get("columns", {}),
                "cached_at": schema_data.get("cached_at"),
            }
        )

    return {
        "status": "success",
        "connection": context.get("connection", {"connected": False}),
        "schemas": schemas_list,
        "recent_queries": context.get("recent_queries", []),
    }


@router.post("/user/context/refresh")
async def refresh_user_context(
    db_config: dict = Depends(require_db_config), user: dict = Depends(get_current_user)
):
    """Refresh schema cache for current database."""
    from services.context_service import ContextService
    from services.db_tool_executors import AIToolExecutor

    user_id = user.get("uid") or user
    database = db_config.get("database")
    db_type = db_config.get("db_type", "postgresql")

    # Use AIToolExecutor's batch fetch which includes primary key info
    tables, columns = await run_in_threadpool(
        AIToolExecutor._fetch_tables_and_columns, db_config, db_type, database
    )

    # Store schema as AI context
    await run_in_threadpool(
        ContextService.store_schema_context, user_id, database, tables, columns
    )

    return {"status": "success", "tables": len(tables)}


@router.delete("/user/context/schema/{database}")
async def delete_schema_context(database: str, user: dict = Depends(get_current_user)):
    """Delete stored schema context for a specific database."""
    from services.context_service import ContextService

    user_id = user.get("uid") or user
    success = await run_in_threadpool(
        ContextService.clear_schema_context, user_id, database
    )

    if success:
        return {
            "status": "success",
            "message": f"Schema context for {database} cleared",
        }
    return {"status": "error", "message": "Failed to clear schema context"}


@router.delete("/user/context/schemas")
async def delete_all_schema_contexts(user: dict = Depends(get_current_user)):
    """Delete all stored schema contexts for user."""
    from services.context_service import ContextService

    user_id = user.get("uid") or user
    # Get all schemas first
    context = await run_in_threadpool(ContextService.get_full_context, user_id)
    schemas = context.get("schemas", {})

    # Delete each schema context
    for db_name in schemas.keys():
        await run_in_threadpool(ContextService.clear_schema_context, user_id, db_name)

    return {"status": "success", "message": f"Cleared {len(schemas)} schema contexts"}


@router.delete("/user/context/queries")
async def clear_query_history(user: dict = Depends(get_current_user)):
    """Clear query history for user."""
    from services.context_service import ContextService

    user_id = user.get("uid") or user
    success = await run_in_threadpool(ContextService.clear_query_history, user_id)

    if success:
        return {"status": "success", "message": "Query history cleared"}
    return {"status": "error", "message": "Failed to clear query history"}


# =============================================================================
# CONTEXT METRICS ROUTES
# =============================================================================


@router.get("/context/metrics")
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
    stats["config"] = {
        "schema_context_ttl_seconds": config.SCHEMA_CONTEXT_TTL_SECONDS,
        "schema_context_max_tables": config.SCHEMA_CONTEXT_MAX_TABLES,
        "connection_context_ttl_seconds": config.CONNECTION_CONTEXT_TTL_SECONDS,
    }

    return {"status": "success", "metrics": stats}


@router.post("/context/metrics/reset")
async def reset_context_metrics(user: dict = Depends(get_current_user)):
    """Reset context metrics counters (for testing/monitoring)."""
    from services.context_service import ContextMetrics
    from config import get_config

    config = get_config()
    if not config.DEBUG and not config.TESTING:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Context metrics reset is disabled in this environment",
        )

    ContextMetrics.reset()
    return {"status": "success", "message": "Context metrics reset"}


# =============================================================================
# USER SETTINGS ROUTES
# =============================================================================


@router.get("/user/settings")
async def get_user_settings(
    user: dict = Depends(get_current_user), session: dict = Depends(get_session_data)
):
    """Get user settings from session."""
    session = session or {}
    return {
        "connectionPersistenceMinutes": session.get("connectionPersistenceMinutes", 30)
    }


@router.post("/user/settings")
async def save_user_settings(
    request: Request,
    data: SaveUserSettingsRequest,
    user: dict = Depends(get_current_user),
):
    """Save user settings to session."""
    await update_session_data(request, data.model_dump(exclude_unset=True))

    # Enforce connection persistence immediately if applicable
    if data.connectionPersistenceMinutes is not None:
        session = await get_session_data(request) or {}
        db_config = session.get("db_config")
        if db_config:
            closed_at = session.get("db_config_last_closed_at")
            if closed_at and data.connectionPersistenceMinutes > 0:
                if time.time() - float(closed_at) > (
                    data.connectionPersistenceMinutes * 60
                ):
                    await _expire_db_config(request, db_config, "settings_update")
            elif closed_at and (
                not data.connectionPersistenceMinutes
                or data.connectionPersistenceMinutes <= 0
            ):
                await _expire_db_config(
                    request, db_config, "settings_update_no_persistence"
                )

    return {"status": "success"}


@router.post("/user/session/close")
async def close_user_session(
    request: Request, data: CloseSessionRequest, user: dict = Depends(get_current_user)
):
    """Mark session as closed to enforce connection persistence window."""
    now = time.time()

    # Store the latest persistence setting in the session if provided
    if data.connectionPersistenceMinutes is not None:
        await update_session_data(
            request, {"connectionPersistenceMinutes": data.connectionPersistenceMinutes}
        )
    if data.sessionInstanceId:
        await update_session_data(
            request, {"session_instance_id": data.sessionInstanceId}
        )

    session = await get_session_data(request) or {}
    db_config = session.get("db_config")
    if not db_config:
        return {"status": "success"}

    persistence_minutes = data.connectionPersistenceMinutes
    if persistence_minutes is None:
        try:
            persistence_minutes = int(session.get("connectionPersistenceMinutes"))
        except (TypeError, ValueError):
            persistence_minutes = 0

    if not persistence_minutes or persistence_minutes <= 0:
        await _expire_db_config(request, db_config, "tab_close_no_persistence")
        return {"status": "success"}

    # Mark closed time; reopened requests will enforce persistence window
    await update_session_data(
        request,
        {
            "db_config_last_closed_at": now,
        },
    )

    return {"status": "success"}


@router.post("/user/session/active")
async def mark_user_session_active(
    request: Request, data: SessionActiveRequest, user: dict = Depends(get_current_user)
):
    """Heartbeat to mark session as active."""
    session = await get_session_data(request) or {}
    incoming_id = data.sessionInstanceId
    stored_id = session.get("session_instance_id")
    db_config = session.get("db_config")

    # Ignore heartbeats without an instance id to avoid extending activity
    # for ambiguous clients/tabs.
    if not incoming_id:
        logger.warning("Ignoring session heartbeat without sessionInstanceId")
        return {"status": "success"}

    if incoming_id and stored_id and incoming_id != stored_id and db_config:
        # Treat as a new session instance (e.g., browser reopened)
        try:
            persistence_minutes = int(session.get("connectionPersistenceMinutes", 0))
        except (TypeError, ValueError):
            persistence_minutes = 0
        last_active = session.get("session_active_at") or time.time()
        now = time.time()

        if persistence_minutes <= 0:
            await _expire_db_config(
                request, db_config, "session_instance_changed_no_persistence"
            )
        elif now - float(last_active) > (persistence_minutes * 60):
            await _expire_db_config(
                request, db_config, "session_instance_changed_expired"
            )
        else:
            await update_session_data(
                request,
                {
                    "db_config_last_closed_at": None,
                    "db_config_last_used_at": now,
                },
            )

    updates = {"session_instance_id": incoming_id}
    await update_session_data(request, updates)
    return {"status": "success"}
