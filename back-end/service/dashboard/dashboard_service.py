"""Privacy-safe dashboard summary composition."""

from datetime import datetime, timezone


def _activity_time(value):
    if not isinstance(value, datetime):
        return datetime.min.replace(tzinfo=timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _table_count(database_schemas) -> int:
    schemas = database_schemas.values() if isinstance(database_schemas, dict) else database_schemas or []
    count = 0
    for schema in schemas:
        if not isinstance(schema, dict):
            continue
        tables = schema.get("tables") or []
        count += len(tables) if isinstance(tables, (list, tuple, set, dict)) else 0
    return count


class DashboardService:
    @staticmethod
    def get_overview(
        user_id,
        *,
        conversation_repository=None,
        context_repository=None,
        usage_repository=None,
    ):
        if conversation_repository is None:
            from service.conversations.conversation_repository import ConversationRepository

            conversation_repository = ConversationRepository
        if context_repository is None:
            from service.context.context_repository import ContextRepository

            context_repository = ContextRepository

        conversations = conversation_repository.get_by_user(user_id)
        context = context_repository.get(user_id) or {}
        normalized_conversations = [
            {
                "id": conversation.get("id"),
                "title": conversation.get("title") or "Conversation",
                "updated_at": conversation.get("updated_at") or conversation.get("timestamp"),
            }
            for conversation in conversations
        ]
        normalized_conversations.sort(
            key=lambda item: _activity_time(item.get("updated_at")),
            reverse=True,
        )

        activity_candidates = [item.get("updated_at") for item in normalized_conversations]
        activity_candidates.append(context.get("updated_at"))
        last_activity_at = max(
            (value for value in activity_candidates if isinstance(value, datetime)),
            key=_activity_time,
            default=None,
        )
        usage_tracking_started_at = None
        if usage_repository is not None:
            metadata = usage_repository.get_metadata(user_id) or {}
            usage_tracking_started_at = metadata.get("tracking_started_at")

        database_schemas = context.get("database_schemas") or {}
        recent_queries = context.get("recent_queries") or []
        return {
            "conversation_count": len(conversations),
            "last_activity_at": last_activity_at,
            "recent_conversations": normalized_conversations[:5],
            "cached_database_count": len(database_schemas),
            "cached_table_count": _table_count(database_schemas),
            "saved_recent_query_count": len(recent_queries),
            "usage_tracking_started_at": usage_tracking_started_at,
        }
