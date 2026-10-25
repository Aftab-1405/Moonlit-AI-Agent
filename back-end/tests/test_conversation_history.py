"""Cursor history stays ordered while new messages are appended."""

import pytest

from service.conversations.conversation_history import page_messages

CID = "123e4567-e89b-42d3-a456-426614174000"
OTHER = "223e4567-e89b-42d3-a456-426614174001"


def messages(count):
    return [{"sender": "user", "content": str(i)} for i in range(count)]


def test_cursor_pages_do_not_shift_on_append_and_ids_do_not_depend_on_page():
    first, pagination = page_messages(CID, messages(36), limit=30)
    assert [m["content"] for m in first] == [str(i) for i in range(6, 36)]
    assert pagination["has_more"] is True
    second, end = page_messages(CID, messages(40), limit=30, before=pagination["before"])
    assert [m["content"] for m in second] == [str(i) for i in range(6)]
    assert end == {"has_more": False, "before": None}
    all_messages, _ = page_messages(CID, messages(40), limit=100)
    assert [m["id"] for m in second + first] == [m["id"] for m in all_messages[:36]]


@pytest.mark.parametrize("count", [0, 1, 30])
def test_short_and_empty_histories_are_exhausted(count):
    page, pagination = page_messages(CID, messages(count), limit=30)
    assert len(page) == count
    assert pagination == {"has_more": False, "before": None}


def test_cursor_rejects_invalid_or_cross_conversation_boundaries():
    _, page = page_messages(CID, messages(36), limit=30)
    for cursor in ["garbage", "", "x" * 1000]:
        with pytest.raises(ValueError):
            page_messages(CID, messages(36), limit=30, before=cursor)
    with pytest.raises(ValueError):
        page_messages(OTHER, messages(36), limit=30, before=page["before"])


@pytest.mark.parametrize("limit", [0, -1, 101])
def test_page_size_is_bounded(limit):
    with pytest.raises(ValueError):
        page_messages(CID, messages(36), limit=limit)


@pytest.mark.asyncio
async def test_history_route_sanitizes_only_the_page_and_enforces_ownership(monkeypatch):
    import httpx
    from fastapi import FastAPI

    from controller import conversations_controller as controller

    app = FastAPI()
    app.include_router(controller.router)
    app.dependency_overrides[controller.get_current_user] = lambda: {"uid": "owner"}
    stored = messages(36)
    stored[-1]["timeline"] = [
        {
            "type": "tool",
            "name": "execute_query",
            "args": '{"query":"select 1"}',
            "result": '{"data":[1],"preview":[1],"row_count":1}',
        }
    ]

    def get_data(conversation_id, user_id):
        assert user_id == "owner"
        if conversation_id == OTHER:
            raise PermissionError("Private")
        return {"messages": stored, "title": "History"}

    monkeypatch.setattr(controller.ConversationService, "get_conversation_data", get_data)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/get_conversation/{CID}?limit=30")
        assert response.status_code == 200
        data = response.json()["conversation"]
        assert len(data["messages"]) == 30
        assert data["messages"][-1]["timeline"][0]["result"] == {"row_count": 1}
        assert data["first_user_message"] == "0"
        older = await client.get(
            f"/get_conversation/{CID}", params={"limit": 30, "before": data["pagination"]["before"]}
        )
        assert [m["content"] for m in older.json()["conversation"]["messages"]] == [str(i) for i in range(6)]
        assert (await client.get(f"/get_conversation/{CID}?limit=101")).status_code == 422
        assert (await client.get(f"/get_conversation/{CID}?limit=30&before=garbage")).status_code == 400
        assert (await client.get(f"/get_conversation/{OTHER}?limit=30")).status_code == 403
        # Existing internal consumers continue to receive the complete transcript.
        assert len((await client.get(f"/get_conversation/{CID}")).json()["conversation"]["messages"]) == 36
