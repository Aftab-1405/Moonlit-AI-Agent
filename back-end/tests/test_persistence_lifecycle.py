"""Background result writes and retryable conversation deletion."""

import threading
from types import SimpleNamespace

import pytest

import langgraph_orchestration.tools as tools
from service.conversations.conversation_repository import ConversationRepository
from service.firestore import firestore_service


@pytest.mark.asyncio
async def test_execution_result_write_is_off_loop_and_admitted(monkeypatch):
    loop_thread = threading.get_ident()
    active = set()
    writes = []

    async def admitted(user_id, operation):
        active.add(user_id)
        try:
            return await operation()
        finally:
            active.remove(user_id)

    def persist(conversation_id, execution_id, data):
        writes.append((threading.get_ident(), set(active), conversation_id, data["execution_id"]))

    monkeypatch.setattr(tools, "run_account_work", admitted)
    monkeypatch.setattr(tools, "_required_skill_message", lambda *args: None)
    monkeypatch.setattr(tools, "_try_writer", lambda: lambda event: None)
    monkeypatch.setattr(firestore_service, "store_execution_result", persist)
    await tools._execute_tool(
        "execute_query",
        {"query": "SELECT 1"},
        {"configurable": {"user_id": "owner", "conversation_id": "conversation"}},
        lambda *args: {"success": True, "rows": [], "columns": []},
    )
    assert len(writes) == 1
    assert writes[0][0] != loop_thread
    assert writes[0][1] == {"owner"}
    assert writes[0][2] == "conversation"
    assert active == set()


@pytest.mark.parametrize("failing_collection", ["summary_blocks", "execution_results"])
def test_delete_retains_parent_after_child_cleanup_failure(monkeypatch, failing_collection):
    deleted = []

    class Conversation:
        def get(self):
            return SimpleNamespace(exists=True, to_dict=lambda: {"user_id": "owner"})

        def collection(self, name):
            def get():
                if name == failing_collection:
                    raise RuntimeError("storage unavailable")
                return []

            return SimpleNamespace(get=get)

        def delete(self):
            deleted.append("parent")

    ref = Conversation()
    db = SimpleNamespace(collection=lambda name: SimpleNamespace(document=lambda cid: ref))
    monkeypatch.setattr(firestore_service.FirestoreService, "get_db", lambda: db)
    with pytest.raises(RuntimeError, match="storage unavailable"):
        ConversationRepository.delete("conversation", "owner")
    assert deleted == []
