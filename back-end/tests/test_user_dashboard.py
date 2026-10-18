from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pytest
from fastapi import FastAPI

from controller.user_dashboard_controller import account_router, is_recent_authentication, router
from core.account_activity import AccountActivityMiddleware, get_account_activity_store
from dependencies import get_current_user
from service.dashboard.dashboard_service import DashboardService
from service.dashboard.usage_analytics import UsageAnalyticsService


def test_recent_authentication_rejects_missing_stale_and_future_claims():
    now = datetime(2026, 9, 3, 12, 0, tzinfo=timezone.utc).timestamp()

    assert is_recent_authentication({"auth_time": now - 30}, now=now)
    assert not is_recent_authentication({}, now=now)
    assert not is_recent_authentication({"auth_time": now - 301}, now=now)
    assert not is_recent_authentication({"auth_time": now + 61}, now=now)


class _Conversations:
    @staticmethod
    def get_by_user(_user_id: str):
        return [
            {
                "id": "older",
                "title": "Older",
                "timestamp": datetime(2026, 8, 1, tzinfo=timezone.utc),
            },
            {
                "id": "recent",
                "title": "Recent",
                "timestamp": datetime(2026, 8, 2, tzinfo=timezone.utc),
                "updated_at": datetime(2026, 9, 1, tzinfo=timezone.utc),
            },
        ]


class _Context:
    @staticmethod
    def get(_user_id: str):
        return {
            "database_schemas": {
                "warehouse": {"tables": ["orders", "customers"]},
                "reporting": {"tables": ["monthly"]},
            },
            "recent_queries": [
                {"status": "success", "query": "SELECT secret FROM payroll"},
                {"status": "error", "query": "DROP TABLE private"},
            ],
            "updated_at": datetime(2026, 8, 31, tzinfo=timezone.utc),
        }


def test_overview_returns_safe_counts_and_true_recent_activity():
    result = DashboardService.get_overview(
        "user-1",
        conversation_repository=_Conversations,
        context_repository=_Context,
    )

    assert result == {
        "conversation_count": 2,
        "last_activity_at": datetime(2026, 9, 1, tzinfo=timezone.utc),
        "recent_conversations": [
            {
                "id": "recent",
                "title": "Recent",
                "updated_at": datetime(2026, 9, 1, tzinfo=timezone.utc),
            },
            {
                "id": "older",
                "title": "Older",
                "updated_at": datetime(2026, 8, 1, tzinfo=timezone.utc),
            },
        ],
        "cached_database_count": 2,
        "cached_table_count": 3,
        "saved_recent_query_count": 2,
        "usage_tracking_started_at": None,
    }
    rendered = repr(result)
    assert "orders" not in rendered
    assert "SELECT secret" not in rendered
    assert "DROP TABLE" not in rendered


def test_overview_limits_recent_conversations_to_five():
    class ManyConversations:
        @staticmethod
        def get_by_user(_user_id: str):
            return [
                {
                    "id": str(index),
                    "title": str(index),
                    "timestamp": datetime(2026, 1, index + 1, tzinfo=timezone.utc),
                }
                for index in range(7)
            ]

    result = DashboardService.get_overview(
        "user-1",
        conversation_repository=ManyConversations,
        context_repository=_Context,
    )

    assert [item["id"] for item in result["recent_conversations"]] == ["6", "5", "4", "3", "2"]


@pytest.mark.asyncio
async def test_dashboard_routes_are_authenticated_and_return_success_envelopes(monkeypatch):
    from controller import user_dashboard_controller

    async def call_direct(function, *args, **kwargs):
        return function(*args, **kwargs)

    monkeypatch.setattr(user_dashboard_controller, "run_in_threadpool", call_direct)
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.include_router(account_router, prefix="/api/v1")

    async def authenticated_user():
        return {"uid": "user-1"}

    app.dependency_overrides[get_current_user] = authenticated_user
    overview = {"conversation_count": 3}
    usage = {"days": 30, "daily": []}
    monkeypatch.setattr(DashboardService, "get_overview", lambda user_id, **_kwargs: overview)
    monkeypatch.setattr(
        UsageAnalyticsService,
        "get_usage",
        lambda user_id, *, days, **_kwargs: {**usage, "days": days},
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        overview_response = await client.get("/api/v1/user/dashboard/overview")
        usage_response = await client.get("/api/v1/user/dashboard/usage?days=30")
        invalid_response = await client.get("/api/v1/user/dashboard/usage?days=14")

    assert overview_response.status_code == 200
    assert overview_response.json() == {"status": "success", "data": overview}
    assert usage_response.json() == {"status": "success", "data": usage}
    assert invalid_response.status_code == 422


@pytest.mark.asyncio
async def test_account_deletion_requires_recent_firebase_auth_and_clears_session(monkeypatch):
    from controller import user_dashboard_controller
    from service.dashboard.account_deletion import AccountDeletionService

    async def call_direct(function, *args, **kwargs):
        return function(*args, **kwargs)

    deleted = []
    cleared = []
    quota_cleared = []
    now = datetime.now(timezone.utc).timestamp()
    monkeypatch.setattr(user_dashboard_controller, "run_in_threadpool", call_direct)
    monkeypatch.setattr(user_dashboard_controller, "verify_csrf_token", lambda _request: None)
    monkeypatch.setattr(
        user_dashboard_controller.auth,
        "verify_session_cookie",
        lambda *_args, **_kwargs: {"uid": "user-1", "auth_time": now},
    )
    monkeypatch.setattr(user_dashboard_controller, "get_session_data", lambda _request: _async(None))
    monkeypatch.setattr(
        user_dashboard_controller,
        "clear_session_state",
        lambda _request: _record_async(cleared, True),
    )
    async def delete_user(user_id):
        deleted.append(user_id)
        return {"deleted_conversations": 2}

    monkeypatch.setattr(AccountDeletionService, "delete_user", staticmethod(delete_user))

    app = FastAPI()
    app.add_middleware(AccountActivityMiddleware)
    app.state.user_quota = type(
        "Quota",
        (),
        {
            "delete_user_usage": lambda _self, user_id: _record_async(
                quota_cleared,
                user_id,
            )
        },
    )()
    app.include_router(router, prefix="/api/v1")
    app.include_router(account_router, prefix="/api/v1")

    async def authenticated_user():
        return {"uid": "user-1"}

    app.dependency_overrides[get_current_user] = authenticated_user
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
        cookies={"firebase_session": "fresh-session"},
    ) as client:
        activity = get_account_activity_store()
        active_request = await activity.admit('user-1')
        busy_response = await client.delete('/api/v1/user/account')
        assert busy_response.status_code == 409
        assert not deleted and not cleared and not quota_cleared
        await activity.release('user-1', active_request)
        response = await client.delete("/api/v1/user/account")

    assert response.status_code == 200
    assert response.json() == {
        "status": "success",
        "deleted_conversations": 2,
    }
    assert deleted == ["user-1"]
    assert cleared == [True]
    assert quota_cleared == ["user-1"]


async def _async(value):
    return value


async def _record_async(events, value):
    events.append(value)
    return value
