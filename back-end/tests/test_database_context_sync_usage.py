from service.context.context_service import ContextService
from service.dashboard.usage_analytics import UsageAnalyticsService
from service.database.context_sync import UserContextDatabaseSync


def test_add_query_records_only_privacy_safe_sql_usage(monkeypatch):
    context_calls = []
    usage_calls = []

    monkeypatch.setattr(
        ContextService,
        "add_query",
        staticmethod(lambda *args: context_calls.append(args)),
    )
    monkeypatch.setattr(
        UsageAnalyticsService,
        "record_sql_execution",
        staticmethod(lambda user_id, **fields: usage_calls.append((user_id, fields))),
    )

    UserContextDatabaseSync().add_query(
        "user-1",
        "select * from private_customers",
        "production",
        37,
        "success",
    )

    assert context_calls == [("user-1", "select * from private_customers", "production", 37, "success")]
    assert len(usage_calls) == 1
    user_id, usage = usage_calls[0]
    assert user_id == "user-1"
    assert usage["status"] == "success"
    assert usage["rows_returned"] == 37
    assert usage["event_id"].startswith("sql:")
    assert "private_customers" not in repr(usage)
    assert "production" not in repr(usage)
