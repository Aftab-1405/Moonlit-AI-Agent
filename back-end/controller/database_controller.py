"""Database connection and query related API routes."""

import logging
import time
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool

from api_contract.common import COMMON_ERROR_RESPONSES, ApiSuccess
from api_contract.database import (
    ConnectDBRequest,
    RunQueryRequest,
    SwitchDatabaseRequest,
)
from api_contract.database_schemas import (
    ConnectDatabaseData,
    DatabaseConfigPublic,
    DatabaseListData,
    DatabaseSelectionData,
    DatabaseStatusData,
    DisconnectDatabaseData,
)
from api_contract.query_schemas import QueryResultData, RunSqlQueryData
from core.errors import PublicError, log_safe_exception, public_error_for_code
from dependencies import (
    get_authenticated_db_config,
    get_current_user,
    require_authenticated_db_config,
    update_session_data,
)
from service.database.connection_service import ConnectionService
from service.database.database_service import DatabaseService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Database Operations End Points"])

_DB_METADATA_ERROR = PublicError("DB_METADATA_FAILED", "Database metadata retrieval failed.")


def _raise_service_error(result: dict, status_code: int = 400) -> None:
    """Raise an ``HTTPException`` if the service result carries an error status."""
    if result.get("status") == "error":
        error_code = result.get("error_code") if "error_code" in result else "DB_OPERATION_FAILED"
        public = public_error_for_code(error_code)
        raise HTTPException(
            status_code=status_code,
            detail={
                "error": public.code,
                "message": public.message,
            },
        )


def _public_db_config(raw_config: dict | None, fallback_db_type: str | None = None):
    """Project a raw internal db_config dict into the public ``DatabaseConfigPublic`` response model."""
    if not raw_config and not fallback_db_type:
        return None

    raw_config = raw_config or {}
    db_type = raw_config.get("db_type") or fallback_db_type
    if not db_type:
        return None

    return DatabaseConfigPublic(
        db_type=db_type,
        database=raw_config.get("database"),
        host=raw_config.get("host"),
        port=raw_config.get("port"),
        username=raw_config.get("username") or raw_config.get("user"),
        is_remote=bool(raw_config.get("is_remote") or raw_config.get("connection_string")),
        schema_name=raw_config.get("schema"),
        service_name=raw_config.get("service_name"),
    )


def _selected_database(result: dict, db_config: DatabaseConfigPublic | None = None):
    """Resolve the selected database name from a service result, falling back to the db_config's database field."""
    return (
        result.get("selected_database")
        or result.get("selectedDatabase")
        or (db_config.database if db_config else None)
    )


async def _schema_metadata_for_config(raw_config: dict | None) -> dict[str, Any]:
    """Fetch PostgreSQL schema list and current schema for a connection config (no-op for non-Postgres)."""
    if not raw_config or raw_config.get("db_type") != "postgresql":
        return {"schemas": [], "current_schema": None}

    try:
        result = await run_in_threadpool(DatabaseService.get_schemas, raw_config)
        if result.get("status") == "success":
            return {
                "schemas": result.get("schemas") or [],
                "current_schema": result.get("current_schema") or raw_config.get("schema", "public"),
            }
    except Exception as e:
        log_safe_exception(logger, "fetch_connection_schema_metadata", e, _DB_METADATA_ERROR)

    return {
        "schemas": [],
        "current_schema": raw_config.get("schema", "public"),
    }


def _schema_metadata_from_result(
    result: dict,
    db_config: DatabaseConfigPublic,
    schema_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Merge explicit schema metadata with a service result, falling back to the db_config's schema_name."""
    metadata = schema_metadata or {}
    return {
        "schemas": metadata.get("schemas") or result.get("schemas") or [],
        "current_schema": (
            metadata.get("current_schema")
            or result.get("current_schema")
            or result.get("schema")
            or db_config.schema_name
        ),
    }


def _normalize_connect_response(
    result: dict,
    schema_metadata: dict[str, Any] | None = None,
) -> ConnectDatabaseData:
    """Shape a raw connect-database service result into the public ``ConnectDatabaseData`` response model."""
    db_config = _public_db_config(result.get("db_config"), result.get("db_type"))
    if not db_config:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "invalid_database_response",
                "message": "Database connection response did not include db_config.",
            },
        )

    normalized_schema_metadata = _schema_metadata_from_result(
        result,
        db_config,
        schema_metadata,
    )
    return ConnectDatabaseData(
        db_config=db_config,
        db_type=db_config.db_type,
        selected_database=_selected_database(result, db_config),
        schemas=normalized_schema_metadata["schemas"],
        current_schema=normalized_schema_metadata["current_schema"],
        databases=result.get("databases") or [],
        tables=result.get("tables") or [],
        is_remote=db_config.is_remote,
    )


def _normalize_database_list_response(result: dict) -> DatabaseListData:
    """Shape a raw list-databases service result into the public ``DatabaseListData`` response model."""
    return DatabaseListData(
        databases=result.get("databases") or [],
        db_type=result.get("db_type"),
        is_remote=bool(result.get("is_remote")),
    )


def _normalize_database_selection_response(
    result: dict,
    requested_database: str,
    schema_metadata: dict[str, Any] | None = None,
) -> DatabaseSelectionData:
    """Shape a raw select/switch-database service result into the public ``DatabaseSelectionData`` response model."""
    db_config = _public_db_config(result.get("db_config"))
    if not db_config:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "invalid_database_response",
                "message": "Database selection response did not include db_config.",
            },
        )

    selected_database = _selected_database(result, db_config) or requested_database
    normalized_schema_metadata = _schema_metadata_from_result(
        result,
        db_config,
        schema_metadata,
    )
    return DatabaseSelectionData(
        db_config=db_config,
        selected_database=selected_database,
        tables=result.get("tables") or [],
        db_type=db_config.db_type,
        is_remote=db_config.is_remote,
        schemas=normalized_schema_metadata["schemas"],
        current_schema=normalized_schema_metadata["current_schema"],
    )


def _normalize_rows(rows: list[Any]) -> list[list[Any]]:
    """Convert database rows to JSON-serializable lists.

    Handles non-JSON-native types that database drivers return:
      - ``bytes`` / ``bytearray``  → UTF-8 string or hex string (binary)
      - ``decimal.Decimal``        → ``float`` (so Perspective's ``float``
                                     schema receives a native JS number, not
                                     a Pydantic-serialized string)
      - ``datetime.datetime``      → ISO 8601 string (frontend converts to
                                     epoch ms for Perspective's ``datetime``)
      - ``datetime.date``          → ISO 8601 ``YYYY-MM-DD`` string
      - ``datetime.time``          → ISO 8601 ``HH:MM:SS`` string
      - ``datetime.timedelta``     → total seconds as ``float``
      - ``uuid.UUID``              → canonical string form
      - ``enum.Enum``              → ``.value``

    Without this, FastAPI/Pydantic would attempt to serialize these types
    at the response boundary. Pydantic v2's ``model_dump_json()`` converts
    ``Decimal`` to a JSON string (``"19.99"``) rather than a number
    (``19.99``), which creates a type mismatch in Perspective — the schema
    says ``float`` but the value arrives as a string. Converting explicitly
    here ensures the JSON response contains the correct native types.
    """
    import datetime as _dt
    import decimal as _decimal
    import enum as _enum
    import uuid as _uuid

    normalized = []
    for row in rows:
        row_list = []
        if isinstance(row, list):
            row_list = row
        elif isinstance(row, tuple):
            row_list = list(row)
        else:
            row_list = [row]

        normalized_row = []
        for val in row_list:
            if val is None:
                normalized_row.append(None)
            elif isinstance(val, bool):
                # bool is a subclass of int — keep as-is (JSON-native).
                normalized_row.append(val)
            elif isinstance(val, (str, int, float)):
                normalized_row.append(val)  # JSON-native
            elif isinstance(val, bytes):
                try:
                    normalized_row.append(val.decode("utf-8"))
                except UnicodeDecodeError:
                    normalized_row.append(f"\\x{val.hex()}")
            elif isinstance(val, _decimal.Decimal):
                # Convert to float so Perspective's float schema receives a
                # native JS number, not a Pydantic-serialized string.
                normalized_row.append(float(val))
            elif isinstance(val, _dt.datetime):
                normalized_row.append(val.isoformat())
            elif isinstance(val, _dt.date):
                normalized_row.append(val.isoformat())
            elif isinstance(val, _dt.time):
                normalized_row.append(val.isoformat())
            elif isinstance(val, _dt.timedelta):
                normalized_row.append(val.total_seconds())
            elif isinstance(val, _uuid.UUID):
                normalized_row.append(str(val))
            elif isinstance(val, _enum.Enum):
                normalized_row.append(val.value)
            else:
                # Fallback: stringify any other non-JSON-serializable type.
                normalized_row.append(str(val))
        normalized.append(normalized_row)
    return normalized


def _normalize_query_response(result: dict) -> RunSqlQueryData:
    """Shape a raw query-execution service result into the public ``RunSqlQueryData`` response model."""
    result_payload = result.get("result") or {}
    columns = result_payload.get("columns") or result_payload.get("fields") or []
    column_types = result_payload.get("column_types") or {}
    rows = _normalize_rows(result_payload.get("rows") or [])
    query_type = result.get("query_type") or "SELECT"
    if query_type not in {"SELECT", "WITH"}:
        query_type = "OTHER"

    return RunSqlQueryData(
        result=QueryResultData(columns=columns, column_types=column_types, rows=rows),
        row_count=result.get("row_count", len(rows)),
        total_rows=result.get("total_rows"),
        truncated=bool(result.get("truncated", False)),
        execution_time_ms=result.get("execution_time_ms", 0),
        query_type=query_type,
    )


# DATABASE CONNECTION ROUTES


@router.post(
    "/connect_db",
    response_model=ApiSuccess[ConnectDatabaseData],
    responses=COMMON_ERROR_RESPONSES,
)
async def connect_db(
    request: Request, data: ConnectDBRequest, user: dict = Depends(get_current_user)
):
    """Connect to a remote database via connection string or host/port credentials."""
    user_id = user.get("uid") or user
    logger.info("Database connection requested: db_type=%s is_remote=%s", data.db_type, data.is_remote)

    result = await run_in_threadpool(
        ConnectionService.connect_database, data.model_dump(), user_id
    )
    if result.get("status") in ["connected", "success"] and "db_config" in result:
        await update_session_data(
            request,
            {
                "db_config": result["db_config"],
                "db_config_last_used_at": time.time(),
                "db_config_last_closed_at": None,
            },
        )

    if result.get("status") == "error":
        public = public_error_for_code(
            result.get("error_code") if "error_code" in result else "DB_OPERATION_FAILED"
        )
        logger.error("Database connection failed: error_code=%s", public.code)
        _raise_service_error(result)

    schema_metadata = await _schema_metadata_for_config(result.get("db_config"))
    return ApiSuccess(
        data=_normalize_connect_response(result, schema_metadata),
        message=result.get("message"),
    )


@router.post(
    "/disconnect_db",
    response_model=ApiSuccess[DisconnectDatabaseData],
    responses=COMMON_ERROR_RESPONSES,
)
async def disconnect_db(
    request: Request,
    db_config: Optional[dict] = Depends(get_authenticated_db_config),
    user: dict = Depends(get_current_user),
):
    """Disconnect from the current database."""
    user_id = user.get("uid") or user

    result = await run_in_threadpool(DatabaseService.disconnect, db_config, user_id)
    await update_session_data(
        request,
        {
            "db_config": None,
            "db_config_last_used_at": None,
            "db_config_last_closed_at": None,
        },
    )

    if result.get("status") == "error":
        _raise_service_error(result, status_code=500)

    return ApiSuccess(
        data=DisconnectDatabaseData(disconnected=True),
        message="Database disconnected successfully",
    )


@router.get(
    "/sync_connection_state",
    response_model=ApiSuccess[DatabaseStatusData],
    responses=COMMON_ERROR_RESPONSES,
)
async def sync_connection_state(
    db_config: Optional[dict] = Depends(get_authenticated_db_config),
):
    """Synchronize the active database connection state with the consumer.

    This endpoint is used primarily by the frontend React application to restore,
    hydrate, and synchronize its local state (e.g. green badges, active tables,
    and sidebar schema explorers) on page reload or fresh tab visits.

    Returns all state needed by the client-side DatabaseContext:
    - connected: boolean indicating if there is an active session connection
    - current_database: name of the currently selected database
    - db_type: database type (mysql, postgresql, sqlserver, oracle)
    - is_remote: whether using connection string
    - databases: list of available databases for switching
    - schemas: list of available schemas (for Postgres)
    - current_schema: name of the active schema
    """
    if not db_config:
        return ApiSuccess(
            data=DatabaseStatusData(
                connected=False,
                db_type=None,
                current_database=None,
                is_remote=False,
                databases=[],
                schemas=[],
                current_schema=None,
            ),
            message=None,
        )
    databases = []
    schema_metadata = await _schema_metadata_for_config(db_config)
    try:
        result = await run_in_threadpool(DatabaseService.get_databases, db_config)
        if result.get("status") == "success":
            databases = result.get("databases", [])
    except Exception as e:
        log_safe_exception(logger, "fetch_connection_database_metadata", e, _DB_METADATA_ERROR)

    return ApiSuccess(
        data=DatabaseStatusData(
            connected=True,
            db_type=db_config.get("db_type"),
            current_database=db_config.get("database"),
            is_remote=db_config.get("is_remote", False),
            databases=databases,
            schemas=schema_metadata["schemas"],
            current_schema=schema_metadata["current_schema"],
        ),
        message=None,
    )


@router.get(
    "/get_databases",
    response_model=ApiSuccess[DatabaseListData],
    responses=COMMON_ERROR_RESPONSES,
)
async def get_databases_route(
    db_config: dict = Depends(require_authenticated_db_config),
):
    """Get list of available databases."""
    result = await run_in_threadpool(DatabaseService.get_databases, db_config)
    _raise_service_error(result)
    return ApiSuccess(data=_normalize_database_list_response(result))


@router.post(
    "/switch_remote_database",
    response_model=ApiSuccess[DatabaseSelectionData],
    responses=COMMON_ERROR_RESPONSES,
)
async def switch_remote_database(
    request: Request,
    data: SwitchDatabaseRequest,
    db_config: dict = Depends(require_authenticated_db_config),
    user: dict = Depends(get_current_user),
):
    """Switch to a different database on remote server."""
    user_id = user.get("uid") or user

    result = await run_in_threadpool(
        DatabaseService.switch_remote_database, db_config, data.database, user_id
    )
    if result.get("status") == "success" and "db_config" in result:
        await update_session_data(
            request,
            {
                "db_config": result["db_config"],
                "db_config_last_used_at": time.time(),
                "db_config_last_closed_at": None,
            },
        )

    _raise_service_error(result)
    schema_metadata = await _schema_metadata_for_config(result.get("db_config"))
    return ApiSuccess(
        data=_normalize_database_selection_response(result, data.database, schema_metadata),
        message=result.get("message"),
    )


@router.post(
    "/select_database",
    response_model=ApiSuccess[DatabaseSelectionData],
    responses=COMMON_ERROR_RESPONSES,
)
async def select_database(
    request: Request,
    data: SwitchDatabaseRequest,
    db_config: dict = Depends(require_authenticated_db_config),
    user: dict = Depends(get_current_user),
):
    """Select a database on existing connection."""
    user_id = user.get("uid") or user

    result = await run_in_threadpool(
        ConnectionService.select_database, db_config, data.database, user_id
    )

    if result.get("status") in ["connected", "success"] and "db_config" in result:
        await update_session_data(
            request,
            {
                "db_config": result["db_config"],
                "db_config_last_used_at": time.time(),
                "db_config_last_closed_at": None,
            },
        )

    _raise_service_error(result)
    schema_metadata = await _schema_metadata_for_config(result.get("db_config"))
    return ApiSuccess(
        data=_normalize_database_selection_response(result, data.database, schema_metadata),
        message=result.get("message"),
    )


# QUERY ROUTES


@router.post(
    "/run_sql_query",
    response_model=ApiSuccess[RunSqlQueryData],
    responses=COMMON_ERROR_RESPONSES,
)
async def run_sql_query(
    data: RunQueryRequest,
    db_config: dict = Depends(require_authenticated_db_config),
    user: dict = Depends(get_current_user),
):
    """Execute a SQL query."""
    from config import get_config
    Config = get_config()

    user_id = user.get("uid") or user
    sql_query = data.sql_query
    max_rows = data.max_rows or Config.MAX_QUERY_RESULTS
    timeout = data.timeout

    result = await run_in_threadpool(
        DatabaseService.execute_query,
        db_config,
        sql_query,
        user_id,
        max_rows=max_rows,
        timeout=timeout,
    )
    _raise_service_error(result)
    return ApiSuccess(
        data=_normalize_query_response(result),
        message=result.get("message"),
    )
