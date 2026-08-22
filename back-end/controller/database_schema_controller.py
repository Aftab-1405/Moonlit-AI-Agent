"""Schema and table related API routes."""

import logging
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool

from api_contract.common import COMMON_ERROR_RESPONSES, ApiSuccess
from api_contract.database import (
    GetTableSchemaRequest,
    SelectSchemaRequest,
)
from api_contract.database_schemas import (
    DatabaseConfigPublic,
    SchemaListData,
    SelectSchemaData,
    TableColumnData,
    TableListData,
    TableSchemaData,
)
from dependencies import (
    get_current_user,
    require_authenticated_db_config,
    update_session_data,
)
from service.database.database_service import DatabaseService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Database Operations End Points"])


def _raise_service_error(result: dict) -> None:
    """Raise an ``HTTPException`` if the schema-service result carries an error status."""
    if result.get("status") == "error":
        raise HTTPException(
            status_code=400,
            detail={
                "error": "database_schema_operation_failed",
                "message": result.get("message") or "Database schema operation failed.",
            },
        )


def _bool_from_nullable(value: Any) -> bool | None:
    """Coerce a nullable database-driver nullability value (``'YES'``/``'NO'``/bool/None) into a tri-state bool."""
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.upper() in {"YES", "Y", "TRUE", "1"}
    return bool(value)


def _column_at(raw_column: Any, index: int, default: Any = None) -> Any:
    """Safely index a tuple/list/dict column descriptor, returning ``default`` on out-of-range or wrong-type access."""
    try:
        return raw_column[index]
    except (IndexError, KeyError, TypeError):
        return default


def _normalize_column(raw_column: Any) -> TableColumnData:
    """Normalize a heterogeneous column descriptor (dict or positional tuple/list) into the ``TableColumnData`` model."""
    if isinstance(raw_column, dict):
        name = raw_column.get("name") or raw_column.get("column_name") or raw_column.get("COLUMN_NAME")
        data_type = (
            raw_column.get("data_type")
            or raw_column.get("type")
            or raw_column.get("COLUMN_TYPE")
            or raw_column.get("DATA_TYPE")
        )
        nullable = raw_column.get("nullable")
        if nullable is None:
            nullable = raw_column.get("is_nullable") or raw_column.get("IS_NULLABLE")
        return TableColumnData(
            name=str(name or ""),
            data_type=str(data_type or ""),
            nullable=_bool_from_nullable(nullable),
            key=raw_column.get("key") or raw_column.get("column_key") or raw_column.get("COLUMN_KEY"),
            default=raw_column.get("default")
            if "default" in raw_column
            else raw_column.get("column_default") or raw_column.get("COLUMN_DEFAULT"),
            extra=raw_column.get("extra") or raw_column.get("EXTRA"),
            max_length=raw_column.get("max_length") or raw_column.get("character_maximum_length"),
            numeric_precision=raw_column.get("numeric_precision"),
            numeric_scale=raw_column.get("numeric_scale"),
        )

    column_len = len(raw_column) if hasattr(raw_column, "__len__") else 0
    return TableColumnData(
        name=str(_column_at(raw_column, 0, "")),
        data_type=str(_column_at(raw_column, 1, "")),
        nullable=_bool_from_nullable(_column_at(raw_column, 2)),
        key=_column_at(raw_column, 3) if column_len <= 6 else _column_at(raw_column, 4),
        default=_column_at(raw_column, 4) if column_len <= 6 else _column_at(raw_column, 3),
        extra=_column_at(raw_column, 5) if column_len <= 6 else "",
        max_length=_column_at(raw_column, 5) if column_len > 6 else None,
        numeric_precision=_column_at(raw_column, 6) if column_len > 6 else None,
        numeric_scale=_column_at(raw_column, 7) if column_len > 7 else None,
    )


def _normalize_table_schema_response(result: dict, db_config: dict) -> TableSchemaData:
    """Shape a raw table-schema service result into the public ``TableSchemaData`` response model."""
    return TableSchemaData(
        table_name=result.get("table_name", ""),
        columns=[_normalize_column(column) for column in result.get("schema", [])],
        row_count=result.get("row_count"),
        database=db_config.get("database"),
        schema_name=db_config.get("schema"),
    )


def _normalize_select_schema_response(
    result: dict,
    schema_metadata: dict[str, Any] | None = None,
) -> SelectSchemaData:
    """Shape a raw select-schema service result into the public ``SelectSchemaData`` response model."""
    db_config = result.get("db_config") or {}
    metadata = schema_metadata or {}
    return SelectSchemaData(
        schema_name=result.get("schema", ""),
        tables=result.get("tables") or [],
        db_config=DatabaseConfigPublic(
            db_type=db_config.get("db_type"),
            database=db_config.get("database"),
            host=db_config.get("host"),
            port=db_config.get("port"),
            username=db_config.get("username") or db_config.get("user"),
            is_remote=bool(db_config.get("is_remote") or db_config.get("connection_string")),
            schema_name=db_config.get("schema"),
            service_name=db_config.get("service_name"),
        ),
        schemas=metadata.get("schemas") or [],
        current_schema=metadata.get("current_schema") or result.get("schema"),
    )


# SCHEMA ROUTES


@router.get(
    "/get_schemas",
    response_model=ApiSuccess[SchemaListData],
    responses=COMMON_ERROR_RESPONSES,
)
async def get_schemas(db_config: dict = Depends(require_authenticated_db_config)):
    """Get all schemas in connected PostgreSQL database."""
    result = await run_in_threadpool(DatabaseService.get_schemas, db_config)

    _raise_service_error(result)
    return ApiSuccess(
        data=SchemaListData(
            schemas=result.get("schemas") or [],
            current_schema=result.get("current_schema"),
        )
    )


@router.post(
    "/select_schema",
    response_model=ApiSuccess[SelectSchemaData],
    responses=COMMON_ERROR_RESPONSES,
)
async def select_schema(
    request: Request,
    data: SelectSchemaRequest,
    db_config: dict = Depends(require_authenticated_db_config),
    user: dict = Depends(get_current_user),
):
    """Select a PostgreSQL schema."""
    user_id = user.get("uid") or user

    result = await run_in_threadpool(DatabaseService.select_schema, db_config, data.schema_name, user_id)
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
    schema_metadata = {"schemas": [], "current_schema": result.get("schema")}
    if result.get("status") == "success" and "db_config" in result:
        try:
            schema_result = await run_in_threadpool(
                DatabaseService.get_schemas,
                result["db_config"],
            )
            if schema_result.get("status") == "success":
                schema_metadata = {
                    "schemas": schema_result.get("schemas") or [],
                    "current_schema": schema_result.get("current_schema") or result.get("schema"),
                }
        except Exception as e:
            logger.warning(f"Failed to fetch schemas after schema selection: {e}")

    return ApiSuccess(
        data=_normalize_select_schema_response(result, schema_metadata),
        message=result.get("message"),
    )


# TABLE ROUTES


@router.get(
    "/get_tables",
    response_model=ApiSuccess[TableListData],
    responses=COMMON_ERROR_RESPONSES,
)
async def get_tables(db_config: dict = Depends(require_authenticated_db_config)):
    """Get all tables in the current database/schema."""
    result = await run_in_threadpool(DatabaseService.get_tables, db_config)

    _raise_service_error(result)
    return ApiSuccess(
        data=TableListData(
            tables=result.get("tables") or [],
            database=result.get("database"),
            schema_name=result.get("schema"),
        )
    )


@router.post(
    "/get_table_schema",
    response_model=ApiSuccess[TableSchemaData],
    responses=COMMON_ERROR_RESPONSES,
)
async def get_table_schema_route(
    data: GetTableSchemaRequest,
    db_config: dict = Depends(require_authenticated_db_config),
):
    """Get schema information for a specific table."""
    result = await run_in_threadpool(DatabaseService.get_table_info, db_config, data.table_name)

    _raise_service_error(result)
    return ApiSuccess(data=_normalize_table_schema_response(result, db_config))
