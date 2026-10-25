"""Real indexing+retry selection with in-memory Firestore command boundaries."""
import graph_common
import asyncio
import copy
import json
from unittest.mock import patch

from config import get_config
from service.firestore.firestore_service import FirestoreService
from vamp_memory.summary_block_repository import SummaryBlockRepository as Repo
from vamp_memory.vamp_memory_service import VampMemoryService


class Snapshot:
    exists = True
    def __init__(self, value): self.value = copy.deepcopy(value)
    def to_dict(self): return copy.deepcopy(self.value)


class Query:
    def __init__(self, block):
        self.block = block
        self.filters = []
    def where(self, *, filter):
        self.filters.append(filter)
        return self
    def limit(self, limit): return self
    def get(self, **kwargs):
        for f in self.filters:
            value = self.block.get(f.field_path)
            if f.op_string == "in" and value not in f.value: return []
            if f.op_string == "==" and value != f.value: return []
            if f.op_string == "<=" and (value is None or value > f.value): return []
        return [Snapshot(self.block)]


class FirestoreCommands:
    def __init__(self, block): self.block = block
    def collection_group(self, name): return Query(self.block)
    def update(self, payload, **kwargs): self.block.update(copy.deepcopy(payload))


class VectorStore:
    def __init__(self): self.calls = []
    async def upsert(self, **kwargs): self.calls.append(kwargs["point_seed"])


async def case(partial):
    block = {"conversation_id": "synthetic-conversation", "user_id": "synthetic-user",
             "summary_id": "synthetic-summary", "schema_version": 2,
             "vector_status": "pending", "vector_attempts": 0,
             "memory_bullets": [{"bullet_id": "bad", "text": "fails"}]}
    if partial:
        block["memory_bullets"].insert(0, {"bullet_id": "good", "text": "works"})
    db = FirestoreCommands(block)
    vectors = VectorStore()
    embed_calls = []
    failed_calls = []
    async def embed(text):
        embed_calls.append(text)
        if text == "fails": raise RuntimeError("synthetic transient embedding outage")
        return [0.0] * get_config().VAMP_EMBEDDING_DIMENSIONS
    class AsyncRepoBoundary:
        # Preserve production persistence code; only adapt the synthetic DB
        # boundary to avoid spawning unnecessary worker threads for this probe.
        @staticmethod
        async def mark_vector_indexed(*args, **kwargs):
            return Repo.mark_vector_indexed(*args, **kwargs)
        @staticmethod
        async def mark_vector_failed(*args, **kwargs):
            failed_calls.append((args, kwargs))
    service = VampMemoryService(summary_repo=AsyncRepoBoundary, vector_store=vectors, embedding_provider=embed)
    statuses = []
    with patch.object(FirestoreService, "get_db", return_value=db), \
         patch.object(Repo, "_summary_ref", return_value=db):
        for _ in range(3):
            success = await service._index_and_record_failure(copy.deepcopy(block))
            due = Repo.get_vector_retry_blocks()
            statuses.append({"reported_success": success, "status": block["vector_status"],
                             "retry_selected": len(due), "attempts": block["vector_attempts"],
                             "next_retry_at": block.get("vector_next_retry_at")})
            if not due: break
    return {"passes": statuses, "embedding_calls": embed_calls,
            "upserts": len(vectors.calls), "mark_vector_failed_calls": len(failed_calls)}


async def main():
    total = await case(False)
    partial = await case(True)
    assert total["passes"][0]["status"] == "no_bullets"
    assert total["passes"][0]["retry_selected"] == 0
    assert len(partial["embedding_calls"]) == 6
    assert partial["mark_vector_failed_calls"] == 0
    print(json.dumps({"F24": total, "F25": partial}, sort_keys=True))


asyncio.run(main())
