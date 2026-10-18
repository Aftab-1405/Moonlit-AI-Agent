"""Database context-sync adapters."""

import logging
import uuid

from api_contract.database_protocols import DatabaseContextSync
from core.errors import log_safe_exception, public_database_error

logger = logging.getLogger(__name__)


class UserContextDatabaseSync:
    """Database context sync backed by the context feature."""

    def get_connection(self, user_id: str) -> dict:
        """Return the user's current database connection context."""
        from service.context.context_service import ContextService

        return ContextService.get_connection(user_id)

    def get_schema_context(self, user_id: str, database: str) -> dict | None:
        """Return the cached schema context for the given user/database."""
        from service.context.context_service import ContextService

        return ContextService.get_schema_context(user_id, database)

    def get_recent_queries(self, user_id: str) -> list[dict]:
        """Return the user's recent query history from the context store."""
        from service.context.context_service import ContextService

        return ContextService.get_full_context(user_id).get("recent_queries", [])

    def set_connection(
        self,
        user_id: str,
        db_type: str,
        database: str,
        host: str,
        is_remote: bool,
        schema: str = "public",
    ) -> None:
        """Persist the user's active connection details into the context store."""
        from service.context.context_service import ContextService

        ContextService.set_connection(user_id, db_type, database, host, is_remote, schema)

    def clear_connection(self, user_id: str) -> None:
        """Clear the user's connection context (e.g. on disconnect)."""
        from service.context.context_service import ContextService

        ContextService.clear_connection(user_id)

    def update_schema(self, user_id: str, schema_name: str) -> None:
        """Update the active schema on the user's stored connection context."""
        from service.context.context_service import ContextService

        ContextService.update_schema(user_id, schema_name)

    def store_schema_context(self, user_id: str, database: str, tables: list, columns: dict) -> None:
        """Cache the schema (tables + columns) for a database as AI context."""
        from service.context.context_service import ContextService

        ContextService.store_schema_context(user_id, database, tables, columns)

    def add_query(
        self,
        user_id: str,
        query: str,
        database: str | None,
        row_count: int,
        status: str,
    ) -> None:
        """Append an executed query to the user's recent-query history."""
        from service.context.context_service import ContextService

        ContextService.add_query(user_id, query, database, row_count, status)
        try:
            from service.dashboard.usage_analytics import UsageAnalyticsService

            UsageAnalyticsService.record_sql_execution(
                user_id,
                event_id=f"sql:{uuid.uuid4()}",
                status=status,
                rows_returned=row_count,
            )
        except Exception as error:
            public = public_database_error(error)
            log_safe_exception(logger, "save_sql_usage_analytics", error, public)


def get_default_context_sync() -> DatabaseContextSync:
    """Return the configured database context-sync adapter."""
    return UserContextDatabaseSync()
