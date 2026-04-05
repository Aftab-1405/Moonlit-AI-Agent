"""
API Response Schemas

Pydantic models for standardizing API responses.
Provides type safety, automatic serialization, and clear response structures.
"""

from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field


# =============================================================================
# BASE RESPONSE SCHEMAS
# =============================================================================

class BaseResponse(BaseModel):
    """Base response schema with status field"""
    status: Literal['success', 'error', 'connected', 'disconnected'] = Field(...)


class SuccessResponse(BaseResponse):
    """Simple success response"""
    status: Literal['success'] = 'success'
    message: Optional[str] = None


class ErrorResponse(BaseResponse):
    """Error response schema"""
    status: Literal['error'] = 'error'
    message: str = Field(..., description="Error message")
    detail: Optional[str] = None


# =============================================================================
# CONVERSATION RESPONSE SCHEMAS
# =============================================================================

class AuthHealthCheckResponse(BaseResponse):
    """Response for authenticated health check endpoint"""
    status: Literal['success'] = 'success'
    message: str = 'Authenticated'


class MessageSchema(BaseModel):
    """Schema for individual conversation message"""
    role: Literal['user', 'assistant', 'system'] = Field(...)
    content: str = Field(...)
    timestamp: Optional[str] = None


class ConversationDataSchema(BaseModel):
    """Schema for conversation data"""
    conversation_id: str = Field(...)
    messages: List[MessageSchema] = Field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class GetConversationResponse(BaseResponse):
    """Response for GET /get_conversation/{conversation_id}"""
    status: Literal['success'] = 'success'
    conversation: ConversationDataSchema


class ConversationListItemSchema(BaseModel):
    """Schema for conversation list item"""
    conversation_id: str = Field(...)
    title: Optional[str] = None
    last_message: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    message_count: Optional[int] = None


class GetConversationsResponse(BaseResponse):
    """Response for GET /get_conversations"""
    status: Literal['success'] = 'success'
    conversations: List[ConversationListItemSchema] = Field(default_factory=list)


class NewConversationResponse(BaseResponse):
    """Response for POST /new_conversation"""
    status: Literal['success'] = 'success'
    conversation_id: str = Field(...)


class DeleteConversationResponse(SuccessResponse):
    """Response for DELETE /delete_conversation/{conversation_id}"""
    pass


# =============================================================================
# DATABASE CONNECTION RESPONSE SCHEMAS
# =============================================================================

class DatabaseConfigSchema(BaseModel):
    """Database configuration object returned in responses"""
    db_type: Literal['mysql', 'postgresql', 'sqlserver', 'oracle'] = Field(...)
    database: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    is_remote: bool = Field(default=False)
    schema: Optional[str] = None  # For PostgreSQL schema selection


class ConnectDBResponse(BaseResponse):
    """Response for POST /connect_db"""
    status: Literal['connected', 'success'] = 'connected'
    message: str = Field(...)
    db_config: DatabaseConfigSchema
    schemas: Optional[List[str]] = Field(default=None, description="Available schemas (PostgreSQL)")
    databases: Optional[List[str]] = Field(default=None, description="Available databases")


class DisconnectDBResponse(SuccessResponse):
    """Response for POST /disconnect_db"""
    message: str = 'Database disconnected successfully'


class DatabaseStatusResponse(BaseResponse):
    """Response for GET /db_status"""
    connected: bool = Field(...)
    db_type: Optional[Literal['mysql', 'postgresql', 'sqlserver', 'oracle']] = None
    current_database: Optional[str] = None
    is_remote: Optional[bool] = None
    databases: Optional[List[str]] = Field(default=None, description="Available databases for switching")


class DisconnectedStatusResponse(BaseResponse):
    """Response when database is disconnected"""
    status: Literal['disconnected'] = 'disconnected'
    connected: bool = False


class DatabaseHeartbeatResponse(BaseResponse):
    """Response for GET /db_heartbeat"""
    connected: bool = Field(...)


class GetDatabasesResponse(BaseResponse):
    """Response for GET /get_databases"""
    status: Literal['success'] = 'success'
    databases: List[str] = Field(default_factory=list)
    is_remote: Optional[bool] = None


class SwitchDatabaseResponse(BaseResponse):
    """Response for POST /switch_remote_database or POST /select_database"""
    status: Literal['success', 'connected'] = 'success'
    message: Optional[str] = None
    db_config: Optional[DatabaseConfigSchema] = None
    tables: Optional[List[str]] = None


# =============================================================================
# SCHEMA RESPONSE SCHEMAS
# =============================================================================

class GetSchemasResponse(BaseResponse):
    """Response for GET /get_schemas"""
    status: Literal['success'] = 'success'
    schemas: List[str] = Field(default_factory=list)


class SelectSchemaResponse(BaseResponse):
    """Response for POST /select_schema"""
    status: Literal['success'] = 'success'
    message: Optional[str] = None
    db_config: Optional[DatabaseConfigSchema] = None


# =============================================================================
# TABLE RESPONSE SCHEMAS
# =============================================================================

class GetTablesResponse(BaseResponse):
    """Response for GET /get_tables"""
    status: Literal['success'] = 'success'
    tables: List[str] = Field(default_factory=list)


class ColumnSchema(BaseModel):
    """Schema for table column information"""
    column_name: str = Field(...)
    data_type: str = Field(...)
    is_nullable: Optional[bool] = None
    column_default: Optional[str] = None
    max_length: Optional[int] = None
    numeric_precision: Optional[int] = None
    numeric_scale: Optional[int] = None


class GetTableSchemaResponse(BaseResponse):
    """Response for POST /get_table_schema"""
    status: Literal['success'] = 'success'
    table_name: str = Field(...)
    columns: List[ColumnSchema] = Field(default_factory=list)


# =============================================================================
# QUERY RESPONSE SCHEMAS
# =============================================================================

class QueryResultSchema(BaseModel):
    """Schema for query result data"""
    columns: List[str] = Field(default_factory=list)
    rows: List[List[Any]] = Field(default_factory=list)


class RunQueryResponse(BaseResponse):
    """Response for POST /run_sql_query"""
    status: Literal['success'] = 'success'
    result: QueryResultSchema
    row_count: int = Field(..., description="Number of rows returned")
    execution_time_ms: float = Field(..., description="Query execution time in milliseconds")
    query_type: Optional[Literal['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'OTHER']] = None
    affected_rows: Optional[int] = Field(default=None, description="For INSERT/UPDATE/DELETE operations")


# =============================================================================
# CONTEXT RESPONSE SCHEMAS
# =============================================================================

class ConnectionContextSchema(BaseModel):
    """Schema for connection state in user context"""
    connected: bool = Field(...)
    db_type: Optional[str] = None
    database: Optional[str] = None
    is_remote: Optional[bool] = None


class SchemaContextItemSchema(BaseModel):
    """Schema for cached database schema in user context"""
    database: str = Field(...)
    tables: List[str] = Field(default_factory=list)
    columns: Dict[str, List[Dict[str, Any]]] = Field(default_factory=dict)
    cached_at: Optional[str] = None


class RecentQuerySchema(BaseModel):
    """Schema for recent query in user context"""
    query: str = Field(...)
    timestamp: Optional[str] = None
    execution_time_ms: Optional[float] = None


class GetUserContextResponse(BaseResponse):
    """Response for GET /user/context"""
    status: Literal['success'] = 'success'
    connection: ConnectionContextSchema
    schemas: List[SchemaContextItemSchema] = Field(default_factory=list)
    recent_queries: List[RecentQuerySchema] = Field(default_factory=list)


class RefreshContextResponse(BaseResponse):
    """Response for POST /user/context/refresh"""
    status: Literal['success'] = 'success'
    tables: int = Field(..., description="Number of tables cached")


class DeleteSchemaCacheResponse(BaseResponse):
    """Response for DELETE /user/context/schema/{database}"""
    status: Literal['success', 'error']
    message: str = Field(...)


class DeleteAllSchemaCachesResponse(BaseResponse):
    """Response for DELETE /user/context/schemas"""
    status: Literal['success'] = 'success'
    message: str = Field(...)


class ClearQueryHistoryResponse(BaseResponse):
    """Response for DELETE /user/context/queries"""
    status: Literal['success', 'error']
    message: str = Field(...)


# =============================================================================
# USER SETTINGS RESPONSE SCHEMAS
# =============================================================================

class UserSettingsSchema(BaseModel):
    """Schema for user settings"""
    connectionPersistenceMinutes: Literal[0, 5, 15, 30, 60] = Field(default=30)


class GetUserSettingsResponse(UserSettingsSchema):
    """Response for GET /user/settings"""
    pass


class SaveUserSettingsResponse(SuccessResponse):
    """Response for POST /user/settings"""
    pass


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def success_response(message: Optional[str] = None, **extra_fields) -> Dict[str, Any]:
    """
    Helper function to create a success response dict.

    Usage:
        return success_response("Operation completed", data=result)
    """
    response = {"status": "success"}
    if message:
        response["message"] = message
    response.update(extra_fields)
    return response


def error_response(message: str, detail: Optional[str] = None) -> Dict[str, Any]:
    """
    Helper function to create an error response dict.

    Usage:
        return error_response("Database not found", detail="Check connection string")
    """
    response = {"status": "error", "message": message}
    if detail:
        response["detail"] = detail
    return response


# =============================================================================
# USAGE NOTES
# =============================================================================
#
# FastAPI automatically serializes Pydantic models to JSON when returned from routes.
#
# Example usage in routes:
#
#   @router.get('/get_tables', response_model=GetTablesResponse)
#   async def get_tables(db_config: dict = Depends(require_db_config)):
#       result = await run_in_threadpool(DatabaseService.get_tables, db_config)
#       return GetTablesResponse(**result)
#
# Or use the helper functions for dict responses:
#
#   @router.post('/disconnect_db')
#   async def disconnect_db():
#       # ... disconnect logic ...
#       return success_response("Disconnected successfully")
#
# =============================================================================
