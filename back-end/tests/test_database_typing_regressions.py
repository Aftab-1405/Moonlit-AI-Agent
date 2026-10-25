"""Reject incomplete tool connection state before database/cache access."""

from types import SimpleNamespace

import pytest

from service.database.ai_tool_executor import AIToolExecutor


@pytest.mark.parametrize("tool", ["indexes", "foreign_keys", "overview"])
def test_schema_tools_require_config_before_borrowing_connection(monkeypatch, tool):
    context = SimpleNamespace(
        get_connection=lambda user_id: {"connected": True, "database": "analytics", "db_type": "mysql"},
        get_schema_context=lambda user_id, database: None,
    )
    monkeypatch.setattr("service.database.context_sync.get_default_context_sync", lambda: context)

    def fail_borrow(*args, **kwargs):
        pytest.fail("Incomplete configuration must not reach the database")

    monkeypatch.setattr("service.database.ai_tool_executor.get_tool_connection", fail_borrow)
    actions = {
        "indexes": lambda: AIToolExecutor._get_table_indexes("user-1", "customers"),
        "foreign_keys": lambda: AIToolExecutor._get_foreign_keys("user-1"),
        "overview": lambda: AIToolExecutor._get_schema_overview("user-1"),
    }
    assert actions[tool]() == {"error": "No database config available. Please re-connect to the database."}


def test_schema_overview_requires_named_database_before_reading_cache(monkeypatch):
    context = SimpleNamespace(get_connection=lambda user_id: {"connected": True, "database": None})
    monkeypatch.setattr("service.database.context_sync.get_default_context_sync", lambda: context)
    assert AIToolExecutor._get_schema_overview("user-1", db_config={"db_type": "mysql"}) == {
        "error": "No database selected"
    }
