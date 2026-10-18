"""Database request schemas."""

from typing import Literal, Optional

from pydantic import ConfigDict, Field, field_validator

from api_contract.common import ExternalRequestModel
from config import get_config

Config = get_config()


class ConnectDBRequest(ExternalRequestModel):
    """Schema for /connect_db."""

    db_type: Literal["mysql", "postgresql", "sqlserver", "oracle"] = Field(...)
    database: Optional[str] = Field(None, max_length=Config.DB_IDENTIFIER_MAX_LENGTH, validation_alias="db_name")
    host: Optional[str] = Field(None, max_length=Config.DB_IDENTIFIER_MAX_LENGTH)
    port: Optional[int] = Field(None, ge=1, le=65535)
    username: Optional[str] = Field(None, max_length=Config.DB_IDENTIFIER_MAX_LENGTH, validation_alias="user")
    # FIX [AUDIT-2-D]: the previous ``password`` field had no max_length,
    # allowing a malicious client to send a multi-MB payload. 256 chars
    # is generous for any DB password.
    password: Optional[str] = Field(None, max_length=256)
    is_remote: bool = Field(default=False)
    connection_string: Optional[str] = Field(None, max_length=Config.DB_CONNECTION_STRING_MAX_LENGTH)

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    @field_validator("database")
    @classmethod
    def sanitize_database(cls, v):
        """Strip SQL-injection markers from an optional database name."""
        if v:
            return v.replace(";", "").replace("--", "").strip()
        return v

    @field_validator("connection_string")
    @classmethod
    def sanitize_connection_string(cls, v):
        """Trim surrounding whitespace and quote characters from a connection string."""
        if v:
            return v.strip(" \"'")
        return v


class SwitchDatabaseRequest(ExternalRequestModel):
    """Schema for /switch_remote_database."""

    database: str = Field(..., min_length=1, max_length=Config.DB_IDENTIFIER_MAX_LENGTH)

    @field_validator("database")
    @classmethod
    def sanitize_database(cls, v):
        """Require a non-empty database name and strip SQL-injection markers."""
        if not v or not v.strip():
            raise ValueError("Database name is required")
        return v.replace(";", "").replace("--", "").strip()


class SelectSchemaRequest(ExternalRequestModel):
    """Schema for /select_schema."""

    schema_name: str = Field(..., min_length=1, max_length=Config.DB_IDENTIFIER_MAX_LENGTH)

    @field_validator("schema_name")
    @classmethod
    def sanitize_schema(cls, v):
        """Require a non-empty schema name matching a safe identifier pattern."""
        if not v or not v.strip():
            raise ValueError("Schema name is required")
        import re

        if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", v.strip()):
            raise ValueError("Invalid schema name. Only alphanumeric characters and underscores are allowed.")
        return v.strip()


class GetTableSchemaRequest(ExternalRequestModel):
    """Schema for /get_table_schema."""

    table_name: str = Field(..., min_length=1, max_length=Config.DB_IDENTIFIER_MAX_LENGTH)

    @field_validator("table_name")
    @classmethod
    def sanitize_table_name(cls, v):
        """Require a non-empty table name and strip SQL-injection markers."""
        if not v or not v.strip():
            raise ValueError("Table name is required")
        return v.replace(";", "").replace("--", "").strip()


class RunQueryRequest(ExternalRequestModel):
    """Schema for /run_sql_query."""

    sql_query: str = Field(..., min_length=1, max_length=Config.SQL_QUERY_MAX_LENGTH)
    max_rows: Optional[int] = Field(default=Config.DEFAULT_REQUEST_MAX_ROWS, ge=1, le=Config.REQUEST_MAX_ROWS_LIMIT)
    timeout: int = Field(
        default=Config.QUERY_TIMEOUT_DEFAULT_SECONDS,
        ge=Config.QUERY_TIMEOUT_MIN_SECONDS,
        le=Config.QUERY_TIMEOUT_MAX_SECONDS,
    )

    @field_validator("sql_query")
    @classmethod
    def validate_query(cls, v):
        """Reject blank SQL queries and return the trimmed query text."""
        if not v or not v.strip():
            raise ValueError("SQL query cannot be empty")
        return v.strip()
