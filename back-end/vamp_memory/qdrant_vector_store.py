"""Qdrant-backed vector store for VAMP memory bullets.

Point schema
------------
Each Qdrant point corresponds to one *memory bullet* inside a summary block.
The point id is a deterministic UUIDv5 of ``f"{conversation_id}:{summary_id}:{bullet_id}"``
so re-embedding the same bullet is idempotent (overwrites the same point).

Payload (stored alongside the vector):

* ``pointer_type``   -- always ``"memory_bullet"`` (reserved for future types)
* ``user_id``        -- owner (used for multi-tenant filter on delete)
* ``conversation_id``-- partitions the search space
* ``summary_id``     -- back-pointer to the Firestore summary block
* ``idx``            -- block index (used for recency labeling)
* ``bullet_id``      -- bullet id within the block
* ``bullet_index``   -- ordinal within the block (for stable display order)
* ``schema_version`` -- summary-block schema version
* ``content_hash``   -- summary block content hash (drift detection)
* ``embedding_model``-- model that produced the vector (drift detection)

Payload indexes are created on ``conversation_id``, ``user_id``,
``pointer_type``, ``summary_id`` so filtered searches are O(log n).

Lifecycle
---------
``ensure_ready()`` is idempotent and uses a lazily-created ``asyncio.Lock``
to serialize collection-creation across concurrent callers within the same
loop (FIX [M29]). ``aclose()`` releases the underlying HTTP connection pool
and is registered for shutdown in ``main.py``'s lifespan (FIX [M26]).
"""

import asyncio
import logging
import uuid
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from qdrant_client.http.models import Condition

from vamp_memory.protocols import VectorMemoryStore

logger = logging.getLogger(__name__)


class QdrantVectorMemoryStore(VectorMemoryStore):
    """Qdrant-backed pointer index for VAMP summary blocks."""

    def __init__(
        self,
        *,
        url: str,
        api_key: str | None,
        collection_name: str,
        vector_size: int,
    ):
        """Initialize the Qdrant client and store collection/vector configuration.

        Args:
            url: Qdrant cluster URL (cloud or local).
            api_key: Optional Qdrant API key (``None`` for local deployments).
            collection_name: Name of the Qdrant collection to read/write.
            vector_size: Expected embedding dimensionality. ``_ensure_collection_sync``
                raises if the existing collection uses a different size.
        """
        from qdrant_client import QdrantClient, models

        self.client: QdrantClient | None = QdrantClient(url=url, api_key=api_key or None)
        self.models = models
        self.collection_name = collection_name
        self.vector_size = vector_size
        self._ready = False
        # FIX [M29]: Do NOT instantiate asyncio.Lock() here — it would bind
        # to whatever loop was active at construction time. When startup
        # `ensure_ready` failed (leaving _ready=False) and a later cleanup
        # ran `asyncio.run(...)` in a worker thread (a different event
        # loop), acquiring the lock raised `RuntimeError: bound to a
        # different event loop` and blocked Qdrant cleanup forever. The
        # lock is now created lazily inside the running loop on first use.
        self._ready_lock: asyncio.Lock | None = None

    async def ensure_ready(self) -> None:
        """Initialize and validate the Qdrant collection without blocking the loop.

        Idempotent. The first call creates the collection if missing, verifies
        the configured vector size matches, and creates payload field indexes.
        Subsequent calls short-circuit on ``self._ready``.
        """
        if self.client is None:
            raise RuntimeError("Qdrant memory store is closed")
        if self._ready:
            return
        # FIX [M29]: Create the lock inside the currently-running loop so it
        # is never bound to a different (or no) loop. Each loop gets its own
        # lock; concurrent ensure_ready calls from different loops fall back
        # to Qdrant's idempotent collection-creation race handling.
        if self._ready_lock is None:
            self._ready_lock = asyncio.Lock()
        async with self._ready_lock:
            if self._ready:
                return
            await asyncio.to_thread(self._ensure_collection_sync)
            self._ready = True

    async def aclose(self) -> None:
        """Close the underlying ``QdrantClient`` and free its HTTP connection pool.

        FIX [M26]: Previously the client was never closed. The HTTP
        connection pool leaked on every test/fixture teardown and every
        worker restart. ``main.py``'s lifespan shutdown calls this so the
        process exits cleanly. After ``aclose`` the store is unusable:
        ``_ready`` is reset so any later call to ``ensure_ready`` would try
        to use ``self.client`` (which is now ``None``) and raise.
        """
        if self.client is None:
            return
        try:
            close = getattr(self.client, "close", None)
            if callable(close):
                # qdrant-client's close() is synchronous in current releases;
                # support a future async variant defensively.
                if asyncio.iscoroutinefunction(close):
                    await close()
                else:
                    await asyncio.to_thread(close)
        except Exception as exc:
            logger.warning("Failed to close Qdrant client cleanly: %s", exc)
        finally:
            self.client = None
            self._ready = False
            self._ready_lock = None

    def _ensure_collection_sync(self) -> None:
        """Create the Qdrant collection if missing and validate its vector size + payload indexes."""
        client = self.client
        if client is None:
            raise RuntimeError("Qdrant memory store is closed")
        exists = client.collection_exists(self.collection_name)
        if not exists:
            try:
                client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=self.models.VectorParams(
                        size=self.vector_size,
                        distance=self.models.Distance.COSINE,
                    ),
                )
            except Exception:
                # Another process may have created it between the existence
                # check and create. Re-check; otherwise preserve the real error.
                if not client.collection_exists(self.collection_name):
                    raise

        info = client.get_collection(self.collection_name)
        vectors = info.config.params.vectors
        configured_size = getattr(vectors, "size", None)
        if configured_size is None and isinstance(vectors, dict):
            sizes = {getattr(item, "size", None) for item in vectors.values()}
            sizes.discard(None)
            configured_size = next(iter(sizes)) if len(sizes) == 1 else None
        if configured_size != self.vector_size:
            raise RuntimeError(
                f"Qdrant collection {self.collection_name!r} uses vector size "
                f"{configured_size!r}; configured embedding model requires "
                f"{self.vector_size}. Use a matching collection or dimensions."
            )

        for field_name in ("conversation_id", "user_id", "pointer_type", "summary_id"):
            try:
                client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name=field_name,
                    field_schema=self.models.PayloadSchemaType.KEYWORD,
                )
            except Exception:
                logger.debug("Could not create Qdrant payload index for %s", field_name)

    async def upsert(
        self,
        *,
        conversation_id: str,
        summary_id: str,
        vector: list[float],
        payload: dict,
        point_seed: str | None = None,
    ) -> None:
        """Upsert one bullet vector + payload as a deterministic UUIDv5 point.

        ``point_seed`` defaults to ``f"{conversation_id}:{summary_id}"``; for
        bullet-level points the caller passes
        ``f"{conversation_id}:{summary_id}:{bullet_id}"`` so each bullet gets
        its own point. Re-embedding the same bullet overwrites the same point
        (idempotent).
        """
        await self.ensure_ready()
        seed = point_seed or f"{conversation_id}:{summary_id}"
        point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, seed))

        def _upsert():
            client = self.client
            if client is None:
                raise RuntimeError("Qdrant memory store is closed")
            client.upsert(
                collection_name=self.collection_name,
                points=[
                    self.models.PointStruct(
                        id=point_id,
                        vector=vector,
                        payload=payload,
                    )
                ],
            )

        await asyncio.to_thread(_upsert)

    async def search(
        self,
        *,
        conversation_id: str,
        query_vector: list[float],
        k: int,
        user_id: str | None = None,
        pointer_type: str | None = None,
        score_threshold: float | None = None,
    ) -> list[dict]:
        """Search the collection for the top-``k`` points matching ``query_vector``.

        Args:
            conversation_id: Required filter — restricts the search to one conversation.
            query_vector: Embedding vector to search against.
            k: Maximum number of hits to return.
            user_id: Optional multi-tenant filter; restricts to one owner.
            pointer_type: Optional filter (e.g. ``"memory_bullet"``).
            score_threshold: Optional minimum similarity score.

        Returns:
            List of hit dicts (``summary_id``, ``idx``, ``score``, ``bullet_id``,
            ``pointer_type``), ordered by descending score from Qdrant.
        """
        await self.ensure_ready()
        must: list[Condition] = [
            self.models.FieldCondition(
                key="conversation_id",
                match=self.models.MatchValue(value=conversation_id),
            )
        ]
        if user_id:
            must.append(
                self.models.FieldCondition(
                    key="user_id",
                    match=self.models.MatchValue(value=user_id),
                )
            )
        if pointer_type:
            must.append(
                self.models.FieldCondition(
                    key="pointer_type",
                    match=self.models.MatchValue(value=pointer_type),
                )
            )
        query_filter = self.models.Filter(must=must)

        def _search():
            client = self.client
            if client is None:
                raise RuntimeError("Qdrant memory store is closed")
            if hasattr(client, "query_points"):
                result = client.query_points(
                    collection_name=self.collection_name,
                    query=query_vector,
                    query_filter=query_filter,
                    limit=k,
                    with_payload=True,
                    score_threshold=score_threshold,
                )
                return getattr(result, "points", result)
            return client.search(
                collection_name=self.collection_name,
                query_vector=query_vector,
                query_filter=query_filter,
                limit=k,
                with_payload=True,
                score_threshold=score_threshold,
            )

        points = await asyncio.to_thread(_search)
        hits = []
        for point in points:
            payload = getattr(point, "payload", {}) or {}
            hits.append(
                {
                    "summary_id": payload.get("summary_id"),
                    "idx": payload.get("idx", 0),
                    "score": getattr(point, "score", 0.0),
                    "bullet_id": payload.get("bullet_id"),
                    "pointer_type": payload.get("pointer_type"),
                }
            )
        return hits

    async def delete_conversation_pointers(
        self,
        conversation_id: str,
        user_id: str,
    ) -> None:
        """Delete all points matching both ``conversation_id`` and ``user_id``.

        Used on conversation deletion to prevent orphaned vectors (the
        Firestore conversation doc is gone but the Qdrant points would
        otherwise survive forever). Filters on BOTH fields so a stale
        ``conversation_id`` from another tenant can never delete our points.
        """
        await self.ensure_ready()
        must: list[Condition] = [
            self.models.FieldCondition(
                key="conversation_id",
                match=self.models.MatchValue(value=conversation_id),
            ),
            self.models.FieldCondition(
                key="user_id",
                match=self.models.MatchValue(value=user_id),
            ),
        ]
        query_filter = self.models.Filter(must=must)

        def _delete():
            client = self.client
            if client is None:
                raise RuntimeError("Qdrant memory store is closed")
            client.delete(
                collection_name=self.collection_name,
                points_selector=self.models.FilterSelector(filter=query_filter),
            )

        await asyncio.to_thread(_delete)
