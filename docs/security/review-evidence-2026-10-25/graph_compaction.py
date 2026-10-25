"""Exercise actual compaction, summary repository and deletion against local doubles."""
import graph_common
import asyncio
import json
import time
from unittest.mock import patch

from firebase_admin import firestore
from langchain_core.messages import AIMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import START, END, StateGraph
from typing import TypedDict

from config import get_config
from graph_firestore_double import DB, Ref, Snapshot, transactional
from service.firestore.firestore_service import FirestoreService
from service.conversations.conversation_compaction_service import ConversationCompactionService as Compaction
from service.conversations.conversation_service import ConversationService
from service.conversations import summary_memory, vector_memory_cleanup
from llm_provider import model_factory
from vamp_memory.summary_block_repository import SummaryBlockRepository as Repo
from vamp_memory.vamp_memory_service import VampMemoryService
from langgraph_orchestration import checkpointing


class Cleaner:
    async def delete_conversation_pointers(self, conversation_id, user_id): pass


class VectorStore:
    def __init__(self): self.calls = []
    async def upsert(self, **kwargs): self.calls.append(kwargs["point_seed"])


class AsyncRepo:
    @staticmethod
    async def create_block(*args, **kwargs): return Repo.create_block(*args, **kwargs)
    @staticmethod
    async def mark_vector_indexed(*args, **kwargs): return Repo.mark_vector_indexed(*args, **kwargs)


def seed(db, cid="synthetic-conversation"):
    db.collection("conversations").document(cid).set({
        "user_id": "synthetic-user", "messages": [
            {"sender": "user", "content": "Question " * 100, "turn_index": 1},
            {"sender": "ai", "content": "Answer " * 100, "turn_index": 1,
             "is_final_assistant_response": True},
        ], "last_summarized_idx": 0,
    })


async def creation_case():
    db = DB()
    seed(db)
    service = VampMemoryService(summary_repo=AsyncRepo, vector_store=VectorStore(),
                                embedding_provider=lambda _: [])
    scheduled = []
    with patch.object(FirestoreService, "get_db", return_value=db), \
         patch.object(service, "_schedule_index", side_effect=lambda block: scheduled.append(block["summary_id"])), \
         patch.object(firestore, "transactional", transactional):
        kwargs = dict(text="Stored summary", start_message_idx=0, end_message_idx=1,
                      memory_bullets=[{"text": "Durable fact", "bullet_id": "b1"}])
        first = await service.store_summary_block("synthetic-conversation", "synthetic-user", **kwargs)
        second = await service.store_summary_block("synthetic-conversation", "synthetic-user", **kwargs)
    result = {"first_created": first["created"], "replayed_created": second["created"],
              "stored_created": db.docs["conversations/synthetic-conversation/summary_blocks/" + first["summary_id"]]["created"],
              "summary_count": db.docs["conversations/synthetic-conversation"]["summary_count"],
              "scheduled_index_count": len(scheduled)}
    assert result["replayed_created"] is True and len(scheduled) == 2
    return result


async def blocking_case():
    class SlowRef(Ref):
        def get(self, **kwargs):
            time.sleep(0.08)  # Synthetic synchronous RPC latency; no I/O.
            return Snapshot(self, {"user_id": "synthetic-user", "messages": []})
    class SlowCollection:
        def document(self, name): return SlowRef(None, "conversations/" + name)
    class SlowDB:
        def collection(self, name): return SlowCollection()
    loop = asyncio.get_running_loop()
    heartbeat = loop.create_future()
    start = loop.time()
    loop.call_later(0.01, lambda: heartbeat.set_result(loop.time() - start))
    with patch.object(FirestoreService, "get_db", return_value=SlowDB()):
        outcomes = await asyncio.gather(*(
            Compaction.check_and_summarize(str(i), "synthetic-user", "mock", pressure_budget_tokens=100)
            for i in range(5)
        ))
    observed = await heartbeat
    result = {"requests": 5, "synthetic_sync_rpc_seconds_each": 0.08,
              "heartbeat_due_seconds": 0.01, "heartbeat_observed_seconds": round(observed, 3),
              "results": [r["reason"] for r in outcomes]}
    assert observed > 0.35
    return result


class GraphState(TypedDict):
    transcript: str


async def checkpoint_deletion_case():
    db = DB()
    seed(db)
    saver = InMemorySaver()
    builder = StateGraph(GraphState)
    async def node(state): return state
    builder.add_node("agent", node)
    builder.add_edge(START, "agent")
    builder.add_edge("agent", END)
    graph = builder.compile(checkpointer=saver)
    cfg = {"configurable": {"thread_id": "synthetic-user:synthetic-conversation:g:run:1"}}
    await graph.ainvoke({"transcript": "Sensitive synthetic transcript"}, cfg)
    with patch.object(FirestoreService, "get_db", return_value=db), \
         patch.object(vector_memory_cleanup, "get_default_memory_cleaner", return_value=Cleaner()), \
         patch.object(checkpointing, "_checkpointer", saver):
        ConversationService.delete_user_conversation("synthetic-conversation", "synthetic-user")
    after = await saver.aget_tuple(cfg)
    result = {"conversation_exists_after_delete": "conversations/synthetic-conversation" in db.docs,
              "checkpoint_exists_after_delete": after is not None,
              "checkpoint_transcript": after.checkpoint["channel_values"]["transcript"]}
    assert not result["conversation_exists_after_delete"] and result["checkpoint_exists_after_delete"]
    return result


async def resurrection_case():
    db = DB()
    seed(db)
    model_entered = asyncio.Event()
    finish_model = asyncio.Event()
    order = []
    class Chat:
        async def ainvoke(self, messages):
            order.append("compaction_claimed_and_model_waiting")
            model_entered.set()
            await finish_model.wait()
            order.append("model_returns_after_deletion")
            return AIMessage(content=json.dumps({"summary_text": "Summary of deleted synthetic history",
                       "memory_bullets": [{"type": "overview", "text": "Synthetic private fact"}]}))
    async def embed(text): return [0.0] * get_config().VAMP_EMBEDDING_DIMENSIONS
    vectors = VectorStore()
    service = VampMemoryService(summary_repo=AsyncRepo, vector_store=vectors, embedding_provider=embed)
    with patch.object(FirestoreService, "get_db", return_value=db), \
         patch.object(firestore, "transactional", transactional), \
         patch.object(get_config(), "VAMP_MEMORY_ENABLED", True), \
         patch.object(model_factory, "get_chat_model", return_value=Chat()), \
         patch.object(summary_memory, "get_default_summary_memory_writer", return_value=service), \
         patch.object(vector_memory_cleanup, "get_default_memory_cleaner", return_value=Cleaner()):
        compaction = asyncio.create_task(Compaction.check_and_summarize(
            "synthetic-conversation", "synthetic-user", "mock", pressure_budget_tokens=1))
        await model_entered.wait()
        ConversationService.delete_user_conversation("synthetic-conversation", "synthetic-user")
        assert "conversations/synthetic-conversation" not in db.docs
        order.append("delete_finished_parent_absent")
        finish_model.set()
        outcome = await compaction
        while service._background_tasks:
            await asyncio.gather(*service._background_tasks)
    result = {"order": order, "compaction_reason": outcome["reason"],
              "conversation_recreated": "conversations/synthetic-conversation" in db.docs,
              "summary_blocks_after_deletion": sum("/summary_blocks/" in key for key in db.docs),
              "vectors_upserted_after_deletion": len(vectors.calls)}
    assert result["conversation_recreated"] and result["summary_blocks_after_deletion"] == 1
    assert result["vectors_upserted_after_deletion"] == 1
    return result


async def main():
    output = {"F26": await creation_case(), "F31": await blocking_case(),
              "F32": await checkpoint_deletion_case(), "F33": await resurrection_case()}
    print(json.dumps(output, sort_keys=True))


asyncio.run(main())
