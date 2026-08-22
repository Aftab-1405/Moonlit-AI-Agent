"""Regression tests for canonical, server-owned conversation identity."""

from __future__ import annotations

import inspect
from types import SimpleNamespace
from urllib.parse import quote
from uuid import UUID

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from pydantic import TypeAdapter, ValidationError

CONVERSATION_ID = "123e4567-e89b-42d3-a456-426614174000"
OTHER_CONVERSATION_ID = "223e4567-e89b-42d3-a456-426614174001"
USER_ID = "conversation-owner"

INVALID_CONVERSATION_IDS = [
    "legacy-conversation-id",
    "tenant:123e4567-e89b-42d3-a456-426614174000",
    "tenant/123e4567-e89b-42d3-a456-426614174000",
    "123E4567-E89B-42D3-A456-426614174000",
    "123e4567e89b42d3a456426614174000",
    "123e4567-e89b-12d3-a456-426614174000",
    "",
    "not-a-uuid",
]


class _QuotaBoundary:
    def __init__(self, events: list[tuple[object, ...]]) -> None:
        self.events = events

    async def check_and_increment(self, user_id: str):
        self.events.append(("quota", user_id))
        return True, SimpleNamespace(to_dict=lambda: {})

    async def refund(self, user_id: str) -> None:
        self.events.append(("refund", user_id))


class _RateLimiterBoundary:
    def __init__(self, events: list[tuple[object, ...]]) -> None:
        self.events = events

    async def acquire(self, provider: str, user_id: str):
        self.events.append(("acquire", provider, user_id))
        return True, "test-api-key"

    async def release(self, provider: str, user_id: str) -> None:
        self.events.append(("release", provider, user_id))


def _request_with_resource_boundaries(events: list[tuple[object, ...]]):
    return SimpleNamespace(
        app=SimpleNamespace(
            state=SimpleNamespace(
                user_quota=_QuotaBoundary(events),
                llm_rate_limiter=_RateLimiterBoundary(events),
            )
        )
    )


def _install_stream_boundary(monkeypatch, controller, events: list[tuple[object, ...]]) -> None:
    def create_streaming_generator(**kwargs):
        events.append(("stream", kwargs["conversation_id"], kwargs["user_id"]))

        async def stream():
            yield 'data: {"type":"done"}\n\n'

        return stream()

    monkeypatch.setattr(
        controller.ConversationService,
        "create_streaming_generator",
        create_streaming_generator,
    )


async def _consume_stream(response) -> list[str]:
    return [chunk async for chunk in response.body_iterator]


async def _call_chat(controller, request, data):
    return await inspect.unwrap(controller.chat)(
        request=request,
        data=data,
        user={"uid": USER_ID},
        db_config=None,
    )


async def _call_resume(controller, request, data):
    return await inspect.unwrap(controller.resume_agent)(
        request=request,
        data=data,
        user={"uid": USER_ID},
        db_config=None,
    )


def test_conversation_id_type_accepts_only_canonical_uuid4() -> None:
    """Catch weakening of the shared body/path conversation identifier type."""
    from api_contract.conversations import ConversationId

    adapter = TypeAdapter(ConversationId)

    assert adapter.validate_python(CONVERSATION_ID) == CONVERSATION_ID
    for invalid_id in INVALID_CONVERSATION_IDS:
        with pytest.raises(ValidationError):
            adapter.validate_python(invalid_id)


@pytest.fixture
def path_validation_app(monkeypatch):
    """Expose the production router while replacing only persistence boundaries."""
    from controller import conversations_controller as controller

    calls: list[tuple[object, ...]] = []

    def get_conversation_data(conversation_id: str, user_id: str):
        calls.append(("get", conversation_id, user_id))
        return None

    def verify_conversation_owner(conversation_id: str, user_id: str):
        calls.append(("verify", conversation_id, user_id))
        return False

    def delete_user_conversation(conversation_id: str, user_id: str):
        calls.append(("delete", conversation_id, user_id))

    def rename_user_conversation(conversation_id: str, user_id: str, title: str):
        calls.append(("rename", conversation_id, user_id, title))
        return title

    monkeypatch.setattr(
        controller.ConversationService,
        "get_conversation_data",
        get_conversation_data,
    )
    monkeypatch.setattr(
        controller.ConversationService,
        "verify_conversation_owner",
        verify_conversation_owner,
    )
    monkeypatch.setattr(
        controller.ConversationService,
        "delete_user_conversation",
        delete_user_conversation,
    )
    monkeypatch.setattr(
        controller.ConversationService,
        "rename_user_conversation",
        rename_user_conversation,
    )
    async def current_user():
        return {"uid": USER_ID}

    async def authenticated_db_config():
        return None

    app = FastAPI()
    app.include_router(controller.router)
    app.dependency_overrides[controller.get_current_user] = current_user
    app.dependency_overrides[controller.get_authenticated_db_config] = authenticated_db_config
    return app, calls


def _conversation_route_cases(conversation_id: str):
    encoded_id = quote(conversation_id, safe="")
    return [
        ("GET", f"/get_conversation/{encoded_id}", None),
        ("GET", f"/get_execution_result/{encoded_id}/execution-1", None),
        ("DELETE", f"/delete_conversation/{encoded_id}", None),
        (
            "PATCH",
            f"/rename_conversation/{encoded_id}",
            {"title": "Renamed"},
        ),
    ]


@pytest.mark.parametrize("conversation_id", INVALID_CONVERSATION_IDS)
@pytest.mark.asyncio
async def test_every_conversation_path_rejects_noncanonical_ids_before_persistence(
    path_validation_app,
    conversation_id: str,
) -> None:
    """Catch any route that accepts a legacy or noncanonical conversation key."""
    app, calls = path_validation_app
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        for method, path, body in _conversation_route_cases(conversation_id):
            response = await client.request(method, path, json=body)
            if conversation_id in {"", "tenant/123e4567-e89b-42d3-a456-426614174000"}:
                assert response.status_code == 404
            else:
                assert response.status_code == 422

    assert calls == []


@pytest.mark.asyncio
async def test_canonical_conversation_path_reaches_persistence_with_exact_id(
    path_validation_app,
) -> None:
    """Accept canonical UUIDv4 route IDs without transforming the persistence key."""
    app, calls = path_validation_app
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(f"/get_conversation/{CONVERSATION_ID}")

    assert response.status_code == 404
    assert calls == [("get", CONVERSATION_ID, USER_ID)]


@pytest.mark.asyncio
async def test_new_chat_mints_canonical_uuid4_and_skips_owner_lookup(
    monkeypatch,
) -> None:
    """Catch client-owned creation or unnecessary ownership reads for a new chat."""
    from api_contract.conversations import ChatRequest
    from controller import conversations_controller as controller

    events: list[tuple[object, ...]] = []

    def verify_owner(conversation_id: str, user_id: str):
        events.append(("owner", conversation_id, user_id))
        return True

    monkeypatch.setattr(
        controller.ConversationService,
        "verify_conversation_owner",
        verify_owner,
    )
    _install_stream_boundary(monkeypatch, controller, events)

    response = await _call_chat(
        controller,
        _request_with_resource_boundaries(events),
        ChatRequest(prompt="Start a new conversation"),
    )
    body = await _consume_stream(response)
    minted_id = response.headers["X-Conversation-Id"]
    parsed_id = UUID(minted_id)

    assert parsed_id.version == 4
    assert str(parsed_id) == minted_id
    assert body == ['data: {"type":"done"}\n\n']
    assert not any(event[0] == "owner" for event in events)
    assert ("stream", minted_id, USER_ID) in events
    assert [event[0] for event in events] == ["quota", "acquire", "stream", "release"]


@pytest.mark.asyncio
async def test_owned_supplied_chat_checks_owner_before_quota_and_uses_exact_id(
    monkeypatch,
) -> None:
    """Catch continuation admission that debits quota before proving ownership."""
    from api_contract.conversations import ChatRequest
    from controller import conversations_controller as controller

    events: list[tuple[object, ...]] = []

    def verify_owner(conversation_id: str, user_id: str):
        events.append(("owner", conversation_id, user_id))
        return True

    monkeypatch.setattr(
        controller.ConversationService,
        "verify_conversation_owner",
        verify_owner,
    )
    _install_stream_boundary(monkeypatch, controller, events)

    response = await _call_chat(
        controller,
        _request_with_resource_boundaries(events),
        ChatRequest(
            prompt="Continue",
            conversation_id=CONVERSATION_ID,
        ),
    )
    await _consume_stream(response)

    assert response.headers["X-Conversation-Id"] == CONVERSATION_ID
    assert events[0] == ("owner", CONVERSATION_ID, USER_ID)
    assert [event[0] for event in events] == [
        "owner",
        "quota",
        "acquire",
        "stream",
        "release",
    ]


@pytest.mark.parametrize("request_kind", ["chat", "resume"])
@pytest.mark.asyncio
async def test_missing_continuation_or_resume_returns_404_before_quota(
    monkeypatch,
    request_kind: str,
) -> None:
    """Catch missing client-supplied IDs being treated as implicit creation."""
    from api_contract.conversations import AgentResumeRequest, ChatRequest
    from controller import conversations_controller as controller

    events: list[tuple[object, ...]] = []

    def missing_owner(conversation_id: str, user_id: str):
        events.append(("owner", conversation_id, user_id))
        return False

    monkeypatch.setattr(
        controller.ConversationService,
        "verify_conversation_owner",
        missing_owner,
    )
    _install_stream_boundary(monkeypatch, controller, events)
    request = _request_with_resource_boundaries(events)

    with pytest.raises(HTTPException) as exc_info:
        if request_kind == "chat":
            await _call_chat(
                controller,
                request,
                ChatRequest(prompt="Continue", conversation_id=CONVERSATION_ID),
            )
        else:
            await _call_resume(
                controller,
                request,
                AgentResumeRequest(
                    conversation_id=CONVERSATION_ID,
                    resume={"action": "continue"},
                ),
            )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Conversation not found"
    assert events == [("owner", CONVERSATION_ID, USER_ID)]


@pytest.mark.asyncio
async def test_unowned_continuation_returns_403_before_quota(monkeypatch) -> None:
    """Catch an ownership denial that consumes quota or reaches orchestration."""
    from api_contract.conversations import ChatRequest
    from controller import conversations_controller as controller

    events: list[tuple[object, ...]] = []

    def reject_owner(conversation_id: str, user_id: str):
        events.append(("owner", conversation_id, user_id))
        raise PermissionError("User does not own this conversation")

    monkeypatch.setattr(
        controller.ConversationService,
        "verify_conversation_owner",
        reject_owner,
    )
    _install_stream_boundary(monkeypatch, controller, events)

    with pytest.raises(HTTPException) as exc_info:
        await _call_chat(
            controller,
            _request_with_resource_boundaries(events),
            ChatRequest(prompt="Continue", conversation_id=CONVERSATION_ID),
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "User does not own this conversation"
    assert events == [("owner", CONVERSATION_ID, USER_ID)]


def _artifact_config() -> dict:
    return {
        "configurable": {
            "thread_id": f"account:region:{OTHER_CONVERSATION_ID}",
            "conversation_id": CONVERSATION_ID,
            "user_id": USER_ID,
            "db_config": {"db_type": "postgresql"},
            "max_rows": 25,
            "activated_skills": ["database-querying"],
            "tool_cache": {},
            "tool_call_log": {},
            "model": "test-model",
        }
    }


@pytest.mark.asyncio
async def test_query_result_persistence_uses_direct_conversation_config(
    monkeypatch,
) -> None:
    """Catch execution artifacts being keyed by parsing a namespaced thread ID."""
    from langgraph_orchestration import tools as tool_module
    from service.firestore import firestore_service

    stored: list[tuple[str, str, dict]] = []

    def execute_query(user_id, query, max_rows, db_config=None):
        assert user_id == USER_ID
        assert query == "SELECT 1"
        assert max_rows == 10
        assert db_config == {"db_type": "postgresql"}
        return {
            "success": True,
            "columns": ["value"],
            "data": [{"value": 1}],
            "row_count": 1,
            "total_rows": 1,
            "truncated": False,
        }

    def store_execution_result(conversation_id, execution_id, result):
        stored.append((conversation_id, execution_id, result))

    monkeypatch.setattr(tool_module.DBTools, "_execute_query", execute_query)
    monkeypatch.setattr(
        firestore_service,
        "store_execution_result",
        store_execution_result,
    )

    await tool_module.execute_query.ainvoke(
        {"query": "SELECT 1", "max_rows": 10},
        config=_artifact_config(),
    )

    assert len(stored) == 1
    stored_conversation_id, execution_id, result = stored[0]
    assert stored_conversation_id == CONVERSATION_ID
    assert UUID(execution_id).version == 4
    assert result["conversation_id"] == CONVERSATION_ID


@pytest.mark.asyncio
async def test_query_analysis_uses_direct_conversation_config(monkeypatch) -> None:
    """Catch analysis loading an artifact from a parsed checkpointer namespace."""
    from langgraph_orchestration import result_analysis
    from langgraph_orchestration import tools as tool_module
    from service.firestore import firestore_service

    reads: list[tuple[str, str]] = []

    def get_execution_result(conversation_id: str, execution_id: str):
        reads.append((conversation_id, execution_id))
        return {"columns": ["value"], "data": [{"value": 1}]}

    monkeypatch.setattr(
        firestore_service,
        "get_execution_result",
        get_execution_result,
    )
    monkeypatch.setattr(
        result_analysis,
        "analyze_execution_result",
        lambda execution, **kwargs: {"success": True, "row_count": len(execution["data"])},
    )

    await tool_module.analyze_query_result.ainvoke(
        {"execution_id": "execution-1", "operation": "profile"},
        config=_artifact_config(),
    )

    assert reads == [(CONVERSATION_ID, "execution-1")]


@pytest.mark.asyncio
async def test_vamp_retrieval_uses_direct_conversation_config(monkeypatch) -> None:
    """Catch VAMP retrieval deriving identity from the checkpointer thread ID."""
    from langgraph_orchestration import tools as tool_module
    from vamp_memory import vamp_memory_service

    retrievals: list[tuple[object, ...]] = []

    class VampBoundary:
        async def retrieve_context_for_query(
            self,
            conversation_id: str,
            user_id: str,
            query: str,
            *,
            model_id: str | None = None,
        ) -> str:
            retrievals.append(
                (conversation_id, user_id, query, model_id)
            )
            return "Remembered context"

    monkeypatch.setattr(
        vamp_memory_service,
        "get_vamp_memory_service",
        lambda: VampBoundary(),
    )

    await tool_module.retrieve_memory.ainvoke(
        {"query": "revenue targets"},
        config=_artifact_config(),
    )

    assert retrievals == [
        (CONVERSATION_ID, USER_ID, "revenue targets", "test-model")
    ]
