"""
Context Service - Pure FastAPI Version

Manages persistent AI context in Firestore.
Provides schema context, connection state, and query history.
No Flask dependencies - context validation is done by caller.
"""

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from config import get_config

logger = logging.getLogger(__name__)
_config = get_config()


class ContextMetrics:
    """Tracks context hit/miss metrics for monitoring effectiveness."""

    @classmethod
    def record_hit(cls, user_id: str):
        """Record a context hit (data found and fresh)."""
        if _config.CONTEXT_METRICS_ENABLED:
            cls._increment_counter(user_id, "hits")

    @classmethod
    def record_miss(cls, user_id: str):
        """Record a context miss (data not found or stale)."""
        if _config.CONTEXT_METRICS_ENABLED:
            cls._increment_counter(user_id, "misses")

    @classmethod
    def record_store(cls, user_id: str):
        """Record a context store operation."""
        if _config.CONTEXT_METRICS_ENABLED:
            cls._increment_counter(user_id, "stores")

    @classmethod
    def record_clear(cls, user_id: str):
        """Record a context clear operation."""
        if _config.CONTEXT_METRICS_ENABLED:
            cls._increment_counter(user_id, "clears")

    @classmethod
    def _increment_counter(cls, user_id: str, field: str):
        """Increment a counter in Firestore under metrics_telemetry field."""
        from firebase_admin import firestore

        from service.context.context_repository import ContextRepository

        try:
            ref = ContextRepository.get_ref(user_id)
            ref.set({"metrics_telemetry": {field: firestore.Increment(1)}}, merge=True)
        except Exception as e:
            logger.error(f"Error incrementing metric {field} for user {user_id}: {e}")

    @classmethod
    def get_stats(cls, user_id: str) -> Dict:
        """Get current metrics statistics."""
        from service.context.context_repository import ContextRepository

        try:
            context = ContextRepository.get(user_id)
            telemetry = context.get("metrics_telemetry", {})
        except Exception as e:
            logger.error(f"Error getting metrics stats for user {user_id}: {e}")
            telemetry = {}

        hits = telemetry.get("hits", 0)
        misses = telemetry.get("misses", 0)
        stores = telemetry.get("stores", 0)
        clears = telemetry.get("clears", 0)

        total = hits + misses
        hit_rate = (hits / total * 100) if total > 0 else 0.0
        return {
            "hits": hits,
            "misses": misses,
            "stores": stores,
            "clears": clears,
            "total_lookups": total,
            "hit_rate_percent": round(hit_rate, 2),
            "metrics_enabled": _config.CONTEXT_METRICS_ENABLED,
        }

    @classmethod
    def reset(cls, user_id: str):
        """Reset all metrics."""
        from service.context.context_repository import ContextRepository

        try:
            ref = ContextRepository.get_ref(user_id)
            ref.set(
                {
                    "metrics_telemetry": {
                        "hits": 0,
                        "misses": 0,
                        "stores": 0,
                        "clears": 0,
                    }
                },
                merge=True,
            )
        except Exception as e:
            logger.error(f"Error resetting metrics for user {user_id}: {e}")


class ContextService:
    """
    Manages AI context in Firestore.

    Firestore Structure:
        user_context/{user_id}
            ├── current_connection
            ├── database_schemas
            └── recent_queries
    """

    COLLECTION_NAME = "user_context"
    MAX_RECENT_QUERIES = 10

    # Firestore Access (delegated to repository)

    @staticmethod
    def _normalize_user_id(user_id) -> str:
        """Normalize user_id to string for Firestore document ID."""
        from service.context.context_repository import ContextRepository

        return ContextRepository._normalize_user_id(user_id)

    @staticmethod
    def _get_context(user_id: str) -> Dict:
        """Get full context document, or empty dict if not exists."""
        from service.context.context_repository import ContextRepository

        return ContextRepository.get(user_id)

    @staticmethod
    def _update_context(user_id: str, data: Dict) -> bool:
        """Update context document with merge."""
        from service.context.context_repository import ContextRepository

        return ContextRepository.update(user_id, data)

    @staticmethod
    def watch_context_document(user_id: str, on_context) -> Any:
        """Subscribe to the user's context document and publish plain dict payloads.

        Registers a Firestore ``on_snapshot`` listener that fires whenever
        the user's context document changes. Each callback delivers the
        current context dict to ``on_context``.

        FIX [M21]: When the document is deleted, Firestore invokes the
        callback with an EMPTY ``doc_snapshot`` list. The previous code
        indexed ``doc_snapshot[0]`` unconditionally, raising ``IndexError``
        on the Firestore background thread — which silently killed the
        watch subscription (the user's metrics stream froze with no error
        sent to the client). We now detect the empty-list case and call
        ``on_context({})`` instead.
        """
        from service.context.context_repository import ContextRepository

        def on_snapshot(doc_snapshot, _changes, _read_time):
            # FIX [M21]: Empty doc_snapshot list means the watched document
            # was deleted. Indexing doc_snapshot[0] raised IndexError on
            # the Firestore background thread and silently killed the
            # subscription. Push an empty context and return cleanly.
            if isinstance(doc_snapshot, list) and not doc_snapshot:
                on_context({})
                return
            snapshot = doc_snapshot[0] if isinstance(doc_snapshot, list) else doc_snapshot
            context = snapshot.to_dict() if snapshot and snapshot.exists else {}
            on_context(context)

        return ContextRepository.get_ref(user_id).on_snapshot(on_snapshot)

    # Connection State Management

    @staticmethod
    def set_connection(
        user_id: str,
        db_type: str,
        database: str,
        host: str,
        is_remote: bool,
        schema: str = "public",
    ) -> bool:
        """
        Set current connection state.

        Args:
            user_id: User ID
            db_type: 'mysql', 'postgresql', 'sqlite'
            database: Database name
            host: Host address
            is_remote: Whether it's a remote connection
            schema: PostgreSQL schema (default 'public')
        """
        connection_data = {
            "current_connection": {
                "connected": True,
                "db_type": db_type,
                "database": database,
                "host": host,
                "is_remote": is_remote,
                "schema": schema,
                "connected_at": datetime.now(timezone.utc).isoformat(),
            }
        }
        logger.info(f"Setting connection context for user {user_id}: {db_type}/{database}")
        return ContextService._update_context(user_id, connection_data)

    @staticmethod
    def clear_connection(user_id: str) -> bool:
        """Clear current connection state (user disconnected)."""
        connection_data = {
            "current_connection": {
                "connected": False,
                "db_type": None,
                "database": None,
                "host": None,
                "is_remote": False,
                "schema": None,
                "disconnected_at": datetime.now(timezone.utc).isoformat(),
            }
        }
        logger.info(f"Clearing connection context for user {user_id}")
        return ContextService._update_context(user_id, connection_data)

    @staticmethod
    def get_connection(user_id: str) -> Dict:
        """
        Get current connection state from Firestore.

        Note: In FastAPI, authentication is handled by the caller.
        This method just returns Firestore data.

        Args:
            user_id: The user ID to check connection for

        Returns:
            Dict with connection state
        """
        context = ContextService._get_context(user_id)
        return context.get("current_connection", {"connected": False})

    @staticmethod
    def update_schema(user_id: str, schema_name: str) -> bool:
        """Update current schema (PostgreSQL)."""
        context = ContextService._get_context(user_id)
        connection = context.get("current_connection", {})
        connection["schema"] = schema_name
        return ContextService._update_context(user_id, {"current_connection": connection})

    # Schema Caching

    @staticmethod
    def compute_schema_hash(tables: List[str], columns: Dict[str, List]) -> str:
        """Compute hash of schema for change detection."""

        def normalize_columns(col_list):
            """Normalize column list for consistent hashing."""
            if not col_list:
                return []
            if isinstance(col_list[0], dict):
                return sorted([c.get("name", "") for c in col_list])
            else:
                return sorted(col_list)

        schema_str = json.dumps(
            {
                "tables": sorted(tables),
                "columns": {k: normalize_columns(v) for k, v in sorted(columns.items())},
            },
            sort_keys=True,
        )
        return hashlib.md5(schema_str.encode()).hexdigest()

    @staticmethod
    def get_schema_context(user_id: str, database: str) -> Optional[Dict]:
        """
        Get stored schema context for a database with TTL check.

        This is AI context (not cache) - stores database structure
        so the AI agent understands the schema it's working with.

        Returns None if context is stale or doesn't exist.
        """
        context = ContextService._get_context(user_id)
        schemas = context.get("database_schemas", {})
        cached = schemas.get(database)

        if not cached:
            ContextMetrics.record_miss(user_id)
            return None
        cached_at = cached.get("cached_at")
        if cached_at:
            try:
                if hasattr(cached_at, "isoformat"):
                    # It's a datetime or Firestore Timestamp - convert to datetime
                    if hasattr(cached_at, "timestamp"):
                        cache_time = datetime.fromtimestamp(cached_at.timestamp())
                    else:
                        cache_time = cached_at
                else:
                    cache_time = datetime.fromisoformat(str(cached_at).replace("Z", "+00:00"))

                if cache_time.tzinfo:
                    cache_time = cache_time.replace(tzinfo=timezone.utc)
                age_seconds = (datetime.now(timezone.utc) - cache_time).total_seconds()

                ttl = _config.SCHEMA_CONTEXT_TTL_SECONDS
                if age_seconds > ttl:
                    logger.debug(
                        f"Schema context stale for {database} (age: {age_seconds:.0f}s, TTL: {ttl}s), will refresh"
                    )
                    ContextMetrics.record_miss(user_id)
                    return None
            except (ValueError, TypeError, AttributeError) as e:
                logger.warning(f"Could not parse cached_at timestamp: {e}")
                ContextMetrics.record_miss(user_id)
                return None

        ContextMetrics.record_hit(user_id)
        return cached

    @staticmethod
    def store_schema_context(user_id: str, database: str, tables: List[str], columns: Dict[str, List]) -> bool:
        """Store database schema as AI context.

        This provides the AI agent with understanding of the database
        structure (tables, columns) it's working with.
        """
        schema_data = {
            "tables": tables,
            "columns": columns,
            "schema_hash": ContextService.compute_schema_hash(tables, columns),
            "cached_at": datetime.now(timezone.utc).isoformat(),
        }

        context = ContextService._get_context(user_id)
        schemas = context.get("database_schemas", {})
        schemas[database] = schema_data

        ContextMetrics.record_store(user_id)
        logger.info(f"Stored schema context for user {user_id}, database {database}: {len(tables)} tables")
        return ContextService._update_context(user_id, {"database_schemas": schemas})

    @staticmethod
    def refresh_schema_context_from_database(user_id: str, db_config: dict) -> dict:
        """Fetch the active database schema and store it as AI context."""
        from service.database.ai_tool_executor import AIToolExecutor

        database = db_config.get("database")
        if not isinstance(database, str) or not database:
            raise ValueError("A database must be selected before refreshing schema context")
        db_type = db_config.get("db_type", "postgresql")
        tables, columns = AIToolExecutor._fetch_tables_and_columns(db_config, db_type, database)
        ContextService.store_schema_context(user_id, database, tables, columns)
        return {"tables": tables, "columns": columns}

    @staticmethod
    def clear_schema_context(user_id: str, database: str) -> bool:
        """Clear schema context for a database (forces refresh on next access)."""
        from service.context.context_repository import ContextRepository

        success = ContextRepository.delete_field(user_id, f"database_schemas.{database}")
        if success:
            ContextMetrics.record_clear(user_id)
            logger.info(f"Cleared schema context for {database}")
        return success

    # Query History

    @staticmethod
    def add_query(
        user_id: str,
        query: str,
        database: str | None,
        row_count: int = 0,
        status: str = "success",
    ) -> bool:
        """Add a query to recent history."""
        query_entry = {
            "query": query[:500],  # Truncate long queries
            "database": database,
            "row_count": row_count,
            "status": status,
            "executed_at": datetime.now(timezone.utc).isoformat(),
        }

        context = ContextService._get_context(user_id)
        queries = context.get("recent_queries", [])
        queries.append(query_entry)
        queries = queries[-ContextService.MAX_RECENT_QUERIES :]

        return ContextService._update_context(user_id, {"recent_queries": queries})

    @staticmethod
    def clear_query_history(user_id: str) -> bool:
        """Clear query history."""
        return ContextService._update_context(user_id, {"recent_queries": []})

    # Full Context for AI

    @staticmethod
    def get_full_context(user_id: str) -> Dict:
        """Get the complete AI-tool-facing context: connection, schemas, queries.

        Aggregates the user's ``current_connection`` (active DB metadata),
        ``database_schemas`` (cached table/column info per database), and
        ``recent_queries`` (recent SQL history used for AI prompt context).
        Returns a stable shape with ``{}`` defaults so callers can dot-access
        fields without a KeyError on first request (when the user has no
        context document yet).

        FIX [M20]: The underlying repository now propagates transient
        Firestore errors so a 503 surfaces to the client; previously a
        Firestore outage silently returned this empty-defaults shape and
        the AI agent generated SQL against a non-existent schema.
        """
        context = ContextService._get_context(user_id)

        return {
            "connection": context.get("current_connection", {"connected": False}),
            "schemas": context.get("database_schemas", {}),
            "recent_queries": context.get("recent_queries", []),
            "updated_at": context.get("updated_at"),
        }
