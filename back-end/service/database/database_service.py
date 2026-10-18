"""
Database Service - Pure FastAPI Version

High-level database operations. All methods accept db_config and user_id explicitly.
No Flask dependencies.
"""

import logging
import re
from typing import List

from core.errors import log_safe_exception, public_database_error

logger = logging.getLogger(__name__)


def _database_service_failure(operation: str, exc: BaseException) -> dict:
    """Return a stable status-style database failure with safe diagnostics."""
    public = public_database_error(exc)
    log_safe_exception(logger, operation, exc, public)
    return {
        "status": "error",
        "error_code": public.code,
        "message": public.message,
    }


class DatabaseService:
    """Service for database operations - accepts config explicitly."""

    @staticmethod
    def switch_remote_database(db_config: dict, new_db_name: str, user_id: str = None) -> dict:
        """
        Switch to a different database on an existing remote connection.

        Substitutes the new database name into the existing connection
        string, validates the resulting connection, then fetches and caches
        the new database's tables.

        Args:
            db_config: Current database configuration
            new_db_name: Name of database to switch to
            user_id: User ID for context tracking

        Returns:
            Dict with status, message, tables, new db_config
        """
        from service.database.adapters import get_adapter
        from service.database.connection_manager import get_connection_manager

        if not new_db_name:
            return {"status": "error", "message": "Database name is required"}

        if not db_config:
            return {"status": "error", "message": "No database connected"}

        connection_string = db_config.get("connection_string")
        if not connection_string:
            return {
                "status": "error",
                "message": "Only for connection string based connections",
            }

        db_type = db_config.get("db_type", "postgresql")

        new_config = {
            **db_config,
            "database": new_db_name,
            "is_remote": True,
        }
        if user_id:
            new_config["_pool_owner"] = user_id

        try:
            if db_type == "postgresql":
                from psycopg2.extensions import make_dsn

                new_config["connection_string"] = make_dsn(connection_string, dbname=new_db_name)
            else:
                from urllib.parse import quote

                new_config["connection_string"] = re.sub(
                    r"(/[^/?]+)(\?|$)",
                    lambda m: f"/{quote(new_db_name, safe='') if db_type == 'mysql' else new_db_name}{m.group(2)}",
                    connection_string,
                )
            manager = get_connection_manager()
            adapter = get_adapter(db_type)

            # FIX [C2]: Previously, manager.get_connection() was called for
            # validate_connection but the connection was NEVER returned to the
            # pool. After ~5 switch attempts (or interleaved with other
            # connect attempts), the pool was exhausted and every subsequent
            # connect/switch/query hung. Now we use the context manager so
            # the validation connection is always returned.
            with manager.get_connection_context(new_config) as conn:
                if not adapter.validate_connection(conn):
                    return {
                        "status": "error",
                        "message": "Failed to connect to new database",
                    }
            tables = DatabaseService._fetch_tables(new_config, new_db_name, db_type)
            if user_id:
                DatabaseService._update_context(user_id, db_type, new_db_name, "remote", True)

            logger.info(f"Switched to {db_type} database: {new_db_name}")
            return {
                "status": "success",
                "message": f"Switched to database: {new_db_name}",
                "selectedDatabase": new_db_name,
                "tables": tables,
                "db_config": new_config,
            }
        except Exception as err:
            return _database_service_failure("switch_remote_database", err)

    @staticmethod
    def select_schema(db_config: dict, schema_name: str, user_id: str = None) -> dict:
        """
        Select a PostgreSQL schema on the current connection.

        Fetches the tables in the requested schema, updates the user's
        connection context with the new schema, and returns the table list
        for the frontend.

        Args:
            db_config: Database configuration
            schema_name: Name of schema to select
            user_id: User ID for context tracking

        Returns:
            Dict with status, schema, tables

        Error handling (FIX [M12]): Previously, if the table fetch failed
        (permission denied, schema does not exist, transient connection
        error), the exception was swallowed and the response returned
        ``status:"success"`` with an empty table list. The AI agent would
        then operate on a wrong/empty schema and persist the bad
        ``db_config["schema"]`` to the session. We now return
        ``status:"error"`` and do NOT update the context when the fetch
        fails, so the bad schema is never persisted.
        """
        from service.database.adapters import get_adapter
        from service.database.connection_manager import get_connection_manager

        if not schema_name:
            return {"status": "error", "message": "Schema name is required"}

        if not db_config:
            return {"status": "error", "message": "No database connected"}

        db_type = db_config.get("db_type", "mysql")
        if db_type != "postgresql":
            return {
                "status": "error",
                "message": "Schema selection only for PostgreSQL",
            }
        new_config = db_config.copy()
        new_config["schema"] = schema_name
        adapter = get_adapter(db_type)
        manager = get_connection_manager()
        tables = []

        try:
            with manager.get_cursor(new_config) as cursor:
                cursor.execute(adapter.get_tables_query(schema_name))
                tables = [row[0] for row in cursor.fetchall()]
        except Exception as err:
            # FIX [M12]: do NOT swallow the fetch error. Surface it to the
            # caller, do not update context, and do not persist the bad
            # schema on the db_config.
            public = public_database_error(err)
            log_safe_exception(logger, "select_database_schema", err, public)
            return {
                "status": "error",
                "error_code": public.code,
                "message": public.message,
                "schema": schema_name,
                "tables": [],
                "db_config": db_config,
            }

        # Update context — only reached on a successful fetch
        if user_id:
            try:
                from service.database.context_sync import (
                    get_default_context_sync,
                )

                get_default_context_sync().update_schema(user_id, schema_name)
            except Exception as e:
                public = public_database_error(e)
                log_safe_exception(logger, "update_selected_schema_context", e, public)

            # FIX [EC4]: the schema cache key in
            # ``ContextService.get_schema_context`` is ``database`` only
            # (see ``context_service.py``). After switching ``public`` →
            # ``analytics`` on the same database, the cached entry still
            # holds the ``public`` table list and would serve stale data
            # to the AI for up to ``SCHEMA_CONTEXT_TTL_SECONDS`` (24h).
            # We invalidate the stale cache entry and trigger a fresh
            # fetch+store with the new ``schema`` on the db_config so the
            # AI immediately sees the new schema's tables. Both calls are
            # best-effort: a cache-clear failure must not block the
            # schema switch itself.
            try:
                from service.context.context_service import ContextService

                ContextService.clear_schema_context(user_id, db_config.get("database"))
                # Repopulate with the new schema's tables/columns.
                ContextService.refresh_schema_context_from_database(user_id, new_config)
                logger.info(
                    "Invalidated + repopulated schema cache for %s after switching to schema %s",
                    db_config.get("database"),
                    schema_name,
                )
            except Exception as cache_err:
                public = public_database_error(cache_err)
                log_safe_exception(
                    logger,
                    "refresh_selected_schema_cache",
                    cache_err,
                    public,
                )

        logger.info(f"Selected schema: {schema_name} with {len(tables)} tables")

        return {
            "status": "success",
            "message": f"Selected schema: {schema_name}",
            "schema": schema_name,
            "tables": tables,
            "db_config": new_config,
        }

    @staticmethod
    def get_schemas(db_config: dict) -> dict:
        """Get all schemas in PostgreSQL database."""
        from service.database.adapters import get_adapter
        from service.database.connection_manager import get_connection_manager

        if not db_config:
            return {"status": "error", "message": "No database connected"}

        db_type = db_config.get("db_type", "mysql")
        if db_type != "postgresql":
            return {
                "status": "error",
                "message": "Schema selection only for PostgreSQL",
            }

        adapter = get_adapter(db_type)
        manager = get_connection_manager()

        schemas = []
        with manager.get_cursor(db_config) as cursor:
            cursor.execute(adapter.get_schemas_query())
            schemas = [row[0] for row in cursor.fetchall()]

        return {
            "status": "success",
            "schemas": schemas,
            "current_schema": db_config.get("schema", "public"),
        }

    @staticmethod
    def get_tables(db_config: dict) -> dict:
        """Get all tables in current database/schema."""
        from service.database.operations import DatabaseOperations

        if not db_config:
            return {"status": "error", "message": "No database connected"}

        db_name = db_config.get("database")
        if not db_name:
            return {"status": "error", "message": "No database selected"}

        schema = db_config.get("schema", "public")
        tables = DatabaseOperations.get_tables(db_config, db_name, schema=schema)

        return {
            "status": "success",
            "tables": tables,
            "database": db_name,
            "schema": schema,
        }

    @staticmethod
    def get_table_info(db_config: dict, table_name: str) -> dict:
        """Get table schema + row count."""
        from service.database.operations import DatabaseOperations

        if not table_name:
            return {"status": "error", "message": "Table name is required"}

        if not db_config:
            return {"status": "error", "message": "No database connected"}

        db_name = db_config.get("database")
        if not db_name:
            return {"status": "error", "message": "No database selected"}

        schema = DatabaseOperations.get_table_schema(db_config, table_name, db_name)
        row_counts = DatabaseOperations.get_table_row_counts(db_config, [table_name], db_name)
        row_count = row_counts[0]["row_count"]

        return {
            "status": "success",
            "table_name": table_name,
            "schema": schema,
            "row_count": row_count,
        }

    @staticmethod
    def disconnect(db_config: dict, user_id: str = None) -> dict:
        """
        Close connection pool + clear context.

        Args:
            db_config: Database configuration
            user_id: User ID for context clearing

        Returns:
            Dict with status and message
        """
        from service.database.connection_manager import get_connection_manager

        try:
            manager = get_connection_manager()
            closed = manager.close_pool(db_config) if db_config else False

            # Clear Firestore context
            if user_id:
                try:
                    from service.database.context_sync import (
                        get_default_context_sync,
                    )

                    get_default_context_sync().clear_connection(user_id)
                except Exception as e:
                    public = public_database_error(e)
                    log_safe_exception(logger, "clear_database_context", e, public)

            logger.info(f"Disconnected (pool closed: {closed})")
            return {"status": "success", "message": "Disconnected from database."}
        except Exception as e:
            return _database_service_failure("disconnect_database", e)

    @staticmethod
    def execute_query(
        db_config: dict,
        sql_query: str,
        user_id: str = None,
        max_rows: int = 1000,
        timeout: int = 30,
    ) -> dict:
        """
        Execute SQL query + log to context.

        Args:
            db_config: Database configuration
            sql_query: SQL query to execute
            user_id: User ID for context logging
            max_rows: Maximum rows to return
            timeout: Query timeout in seconds

        Returns:
            Query result dict
        """
        from service.database.operations import execute_sql_query

        result = execute_sql_query(
            db_config,
            sql_query,
            user_id=user_id,
            max_rows=max_rows,
            timeout_seconds=timeout,
        )
        if user_id:
            try:
                from service.database.context_sync import (
                    get_default_context_sync,
                )

                db_name = db_config.get("database") if db_config else None
                row_count = result.get("row_count", 0)
                status = "success" if result["status"] == "success" else "error"
                get_default_context_sync().add_query(user_id, sql_query, db_name, row_count, status)
            except Exception as e:
                public = public_database_error(e)
                log_safe_exception(logger, "record_database_query", e, public)

        return result

    @staticmethod
    def get_databases(db_config: dict) -> dict:
        """Get list of databases with is_remote flag and db_type."""
        from service.database.operations import DatabaseOperations

        result = DatabaseOperations.get_databases(db_config)

        if db_config:
            result["db_type"] = db_config.get("db_type")

            if db_config.get("connection_string"):
                result["is_remote"] = True

        return result

    @staticmethod
    def _fetch_tables(db_config: dict, db_name: str, db_type: str) -> List[str]:
        """
        Fetch the list of tables in a database.

        Used by ``switch_remote_database`` to populate the table list after
        switching databases. Wraps the adapter's
        ``get_all_tables_for_cache`` query and tolerates a fetch failure by
        returning an empty list (the caller decides whether to surface this
        to the user).

        FIX [M13]: forwards ``db_config.get("schema")`` to the adapter so
        non-default PostgreSQL schemas (e.g. ``analytics``) get the correct
        table list instead of the ``public`` default.
        """
        from service.database.adapters import get_adapter
        from service.database.connection_manager import get_connection_manager

        tables = []
        adapter = get_adapter(db_type)
        manager = get_connection_manager()

        try:
            with manager.get_cursor(db_config) as cursor:
                # FIX [M13]: forward the user's selected schema so the
                # adapter does not default to "public" / "dbo".
                schema = db_config.get("schema") or "public"
                tables_query, tables_params = adapter.get_all_tables_for_cache(db_name, schema)
                cursor.execute(tables_query, tables_params)
                tables = [row[0] for row in cursor.fetchall()]
        except Exception as e:
            public = public_database_error(e)
            log_safe_exception(logger, "fetch_database_tables", e, public)

        return tables

    @staticmethod
    def _update_context(user_id: str, db_type: str, database: str, host: str, is_remote: bool):
        """Update user's connection context in Firestore."""
        try:
            from service.database.context_sync import (
                get_default_context_sync,
            )

            get_default_context_sync().set_connection(user_id, db_type, database, host, is_remote)
        except Exception as e:
            public = public_database_error(e)
            log_safe_exception(logger, "update_database_context", e, public)
