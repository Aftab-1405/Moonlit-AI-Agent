"""VAMP (Vector Augmented Memory Persistence) memory service.

This module coordinates the three-stage VAMP pipeline:

1. **Summary block persistence** — immutable, content-hashed summary blocks
   are written to Firestore under ``conversations/{cid}/summary_blocks``.
   Each block carries one or more *memory bullets* (atomic facts extracted
   from the conversation by the LangGraph compaction node).

2. **Vector indexing** — each memory bullet is embedded via Bedrock Titan
   Text Embeddings V2 (see ``bedrock_embedding_provider.py``) and upserted
   as a Qdrant point whose payload is a *pointer* back to the Firestore
   block + bullet id (see ``qdrant_vector_store.py``). The block's
   ``vector_status`` field tracks progress through the
   ``pending → indexed | partial | failed → dead`` state machine (see
   ``summary_block_repository.py`` for the full state diagram).

3. **Retrieval** — at conversation turn time the user's prompt is embedded,
   Qdrant returns the top-k matching bullet pointers, the corresponding
   Firestore blocks are fetched, and the bullets are deduped + budgeted
   (see ``budget_selection.py``) before being formatted into a historical
   context string for the system prompt.

Lifecycle
---------
New blocks are scheduled for indexing via ``_schedule_index`` which adds a
background ``asyncio.Task`` to ``_background_tasks``. A periodic maintenance
loop (``maintenance.py``) re-embeds any ``pending`` / ``partial`` / due
``failed`` blocks every ~30s. After ``MAX_VECTOR_ATTEMPTS`` retries a block
transitions to the terminal ``dead`` state and is excluded from future
retries (FIX [H11]).

Concurrency
-----------
The maintenance loop and the synchronous scheduled-index path can both
retry the same block concurrently. ``mark_vector_failed`` uses a Firestore
transaction so the ``vector_attempts`` counter is incremented atomically
(FIX [H12]). ``asyncio.gather`` over per-bullet embeds uses
``return_exceptions=True`` so a single bullet failure doesn't abandon
in-flight sibling embeds (FIX [M24]).
"""

import asyncio
import copy
import inspect
import logging
import threading
from typing import Callable

from config import get_config
from core.errors import log_safe_exception, public_tool_error
from vamp_memory.bedrock_embedding_provider import (
    DEFAULT_EMBEDDING_MODEL,
    default_embedding_provider,
)
from vamp_memory.budget_selection import adaptive_k, dedupe_select_budget_then_sort
from vamp_memory.historical_context_builder import format_historical_context
from vamp_memory.protocols import VectorMemoryStore
from vamp_memory.qdrant_vector_store import QdrantVectorMemoryStore

logger = logging.getLogger(__name__)

DEFAULT_CONTEXT_TOKEN_BUDGET = get_config().VAMP_CONTEXT_MAX_TOKENS
_VECTOR_STORE_SINGLETON = None
_VAMP_MEMORY_SERVICE_SINGLETON = None

#: Locks guarding singleton initialization. Without these, two concurrent
#: sync calls to ``get_vamp_memory_service()`` / ``get_default_vector_store()``
#: could both observe ``_SINGLETON is None``, both construct an instance,
#: and the second assignment would clobber the first — leaking the first
#: instance's Qdrant connection pool (FIX [AUDIT-2-C]).
_singleton_lock = threading.Lock()
_vector_store_lock = threading.Lock()


def _log_vamp_exception(
    operation: str,
    exc: BaseException,
    *,
    code: str = "VAMP_OPERATION_FAILED",
    message: str = "Memory operation failed.",
) -> None:
    """Emit correlated, sanitized diagnostics for a VAMP operation."""
    log_safe_exception(logger, operation, exc, public_tool_error(code, message))


def get_vamp_memory_service():
    """Create or return the configured ``VampMemoryService`` singleton.

    Thread-safe: the first caller to reach the lock constructs the
    instance; subsequent callers receive the cached instance.

    Returns:
        The process-wide ``VampMemoryService`` instance.
    """
    global _VAMP_MEMORY_SERVICE_SINGLETON
    if _VAMP_MEMORY_SERVICE_SINGLETON is None:
        with _singleton_lock:
            # Double-checked locking: re-test inside the lock so only the
            # first caller constructs.
            if _VAMP_MEMORY_SERVICE_SINGLETON is None:
                _VAMP_MEMORY_SERVICE_SINGLETON = VampMemoryService()
    return _VAMP_MEMORY_SERVICE_SINGLETON


def get_default_vector_store() -> VectorMemoryStore:
    """Create the configured vector store once per process.

    Thread-safe via double-checked locking.

    Returns:
        The process-wide ``VectorMemoryStore`` instance.

    Raises:
        RuntimeError: If VAMP is misconfigured (wrong backend or missing
            Qdrant URL).
    """
    global _VECTOR_STORE_SINGLETON
    if _VECTOR_STORE_SINGLETON is not None:
        return _VECTOR_STORE_SINGLETON

    with _vector_store_lock:
        if _VECTOR_STORE_SINGLETON is not None:
            return _VECTOR_STORE_SINGLETON

        config = get_config()

        if config.VAMP_VECTOR_BACKEND != "qdrant":
            raise RuntimeError("VAMP requires Qdrant. Set VAMP_VECTOR_BACKEND=qdrant.")
        if not config.VAMP_QDRANT_URL:
            raise RuntimeError("VAMP_VECTOR_BACKEND=qdrant requires VAMP_QDRANT_URL")

        _VECTOR_STORE_SINGLETON = QdrantVectorMemoryStore(
            url=config.VAMP_QDRANT_URL,
            api_key=config.VAMP_QDRANT_API_KEY,
            collection_name=config.VAMP_QDRANT_COLLECTION,
            vector_size=config.VAMP_EMBEDDING_DIMENSIONS,
        )
        return _VECTOR_STORE_SINGLETON


class VampMemoryService:
    """Coordinates immutable summary storage, vector indexing, and retrieval."""

    def __init__(
        self,
        *,
        summary_repo=None,
        vector_store: VectorMemoryStore | None = None,
        embedding_provider: Callable[[str], list[float]] | None = None,
        embedding_model: str = DEFAULT_EMBEDDING_MODEL,
        context_budget_tokens: int = DEFAULT_CONTEXT_TOKEN_BUDGET,
    ):
        """Initialize the VAMP service with optional dependency injection.

        Args:
            summary_repo: Summary-block repository class. Defaults to
                :class:`SummaryBlockRepository` when ``None``.
            vector_store: Vector store instance. Lazily resolved via
                :func:`get_default_vector_store` when ``None``.
            embedding_provider: Callable mapping text to its embedding vector.
                Defaults to :func:`default_embedding_provider`.
            embedding_model: Embedding model identifier persisted on each block
                for drift detection.
            context_budget_tokens: Default token budget for retrieved context.
        """
        if summary_repo is None:
            from vamp_memory.summary_block_repository import SummaryBlockRepository

            summary_repo = SummaryBlockRepository
        self.summary_repo = summary_repo
        if embedding_model == DEFAULT_EMBEDDING_MODEL:
            try:
                config = get_config()

                embedding_model = config.VAMP_EMBEDDING_MODEL
                context_budget_tokens = config.VAMP_CONTEXT_MAX_TOKENS
            except Exception:
                pass
        self._vector_store = vector_store
        self.embedding_provider = embedding_provider or default_embedding_provider
        self.embedding_model = embedding_model
        self.context_budget_tokens = max(1, int(context_budget_tokens))
        config = get_config()
        self.similarity_threshold = config.VAMP_SIMILARITY_THRESHOLD
        self.index_concurrency = max(1, config.VAMP_INDEX_CONCURRENCY)
        self._background_tasks: set[asyncio.Task] = set()

    @property
    def vector_store(self) -> VectorMemoryStore:
        """Lazily resolve and return the process-wide vector store singleton."""
        if self._vector_store is None:
            self._vector_store = get_default_vector_store()
        return self._vector_store

    async def _call_maybe_async(self, func, /, *args, **kwargs):
        """Invoke ``func`` awaiting it if coroutine, otherwise offloading to a worker thread."""
        if inspect.iscoroutinefunction(func):
            return await func(*args, **kwargs)
        return await asyncio.to_thread(func, *args, **kwargs)

    async def _embed(self, text: str) -> list[float]:
        """Embed ``text`` via the configured provider, awaiting any deferred coroutine result."""
        result = await self._call_maybe_async(self.embedding_provider, text)
        if asyncio.iscoroutine(result):
            result = await result
        return result

    def _schedule_index(self, block: dict) -> None:
        """Schedule ``index_summary_block`` as a fire-and-forget background task.

        The task is tracked in ``self._background_tasks`` so ``aclose()`` can
        drain it on shutdown (FIX [M30]).
        """
        task = asyncio.create_task(self._index_with_failure_record(block))
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)

    async def _index_with_failure_record(self, block: dict) -> bool:
        """Index a block; on failure record retry state atomically.

        Returns ``True`` on success, ``False`` on failure. Serves the role of
        ``_mark_failed`` in the bug report — wraps ``index_summary_block``
        and persists the failure via ``summary_repo.mark_vector_failed``.

        FIX [H12]: The ``attempts`` counter is no longer passed in from the
        stale in-memory ``block`` dict. ``summary_repo.mark_vector_failed``
        now reads and increments the counter atomically inside a Firestore
        transaction, so concurrent retries (scheduled index path +
        maintenance loop) cannot undercount and trigger a retry storm.
        """
        try:
            await self.index_summary_block(block)
            return True
        except Exception as exc:
            public = public_tool_error(
                "VAMP_VECTOR_INDEX_FAILED",
                "Memory vector indexing failed.",
            )
            log_safe_exception(logger, "index_memory_vectors", exc, public)
            # FIX [H12]: pass `reason=` only — the repository increments
            # `vector_attempts` atomically inside a Firestore transaction.
            mark_failed = getattr(self.summary_repo, "mark_vector_failed", None)
            if callable(mark_failed):
                try:
                    await self._call_maybe_async(
                        mark_failed,
                        block["conversation_id"],
                        block["summary_id"],
                        reason=f"[{public.code}] {public.message}",
                    )
                except Exception as record_exc:
                    _log_vamp_exception(
                        "persist_vector_retry_state",
                        record_exc,
                        code="VAMP_VECTOR_RETRY_SAVE_FAILED",
                        message="Memory vector retry state could not be saved.",
                    )
            return False

    async def store_summary_block(
        self,
        conversation_id: str,
        user_id: str,
        *,
        text: str,
        start_message_idx: int,
        end_message_idx: int,
        memory_bullets: list[dict] | None = None,
        covers_from_turn: int | None = None,
        covers_to_turn: int | None = None,
        covers_message_ids: list | None = None,
        created_from_unsummarized_tail: bool = True,
    ) -> dict:
        """Persist a summary block and schedule its bullets for vector indexing.

        Args:
            conversation_id: Owning conversation id.
            user_id: Calling user id; must own the conversation.
            text: Summary text body.
            start_message_idx: Inclusive lower bound of the summarized message range.
            end_message_idx: Inclusive upper bound of the summarized message range.
            memory_bullets: Optional list of bullet dicts; deep-copied and
                enriched with ``char_length`` before persistence.
            covers_from_turn: Optional first turn covered by the summary.
            covers_to_turn: Optional last turn covered by the summary.
            covers_message_ids: Optional list of covered message ids.
            created_from_unsummarized_tail: Whether the block summarizes the
                previously-unsummarized trailing messages.

        Returns:
            The stored (or pre-existing) summary block dict, carrying a
            ``created`` flag indicating whether vector indexing was scheduled.
        """
        memory_bullets = copy.deepcopy(memory_bullets) if memory_bullets else None
        if memory_bullets:
            for bullet in memory_bullets:
                if "text" in bullet and "char_length" not in bullet:
                    bullet["char_length"] = len(str(bullet["text"]))

        block = await self._call_maybe_async(
            self.summary_repo.create_block,
            conversation_id,
            user_id,
            text=text,
            start_message_idx=start_message_idx,
            end_message_idx=end_message_idx,
            embedding_model=self.embedding_model,
            memory_bullets=memory_bullets,
            covers_from_turn=covers_from_turn,
            covers_to_turn=covers_to_turn,
            covers_message_ids=covers_message_ids,
            created_from_unsummarized_tail=created_from_unsummarized_tail,
        )
        # FIX [M28]: Skip scheduling a duplicate index if the block already
        # existed (re-summarization of the same message range, or a retry
        # that lost its response). The original indexing task is still in
        # flight (or already complete); scheduling a second one would race
        # on the same Qdrant points and double-count Bedrock quota.
        if block.get("created", True):
            self._schedule_index(block)
        return block

    async def index_summary_block(self, block: dict) -> None:
        """Embed every memory bullet in ``block`` and upsert Qdrant points.

        Post-conditions (persisted via ``summary_repo.mark_vector_indexed``):

        * ``no_bullets`` — schema v1, empty bullet list, or every bullet
          had empty text. Nothing to embed.
        * ``partial``   — FIX [H10]: some but not all bullets embedded.
          The maintenance loop will retry. ``indexed_bullets`` and
          ``total_bullets`` counts are persisted so drift is detectable.
        * ``indexed``   — every bullet embedded successfully.

        FIX [M24]: Per-bullet embeds run under ``asyncio.gather(...,
        return_exceptions=True)`` so a single bullet failure doesn't
        abandon in-flight sibling embeds. Previously, the first failure
        cancelled the gather, the other embeds' results were discarded,
        and the block was marked ``failed`` even though 14/15 bullets
        indexed successfully.
        """
        bullets = block.get("memory_bullets") if block.get("schema_version", 1) >= 2 else None
        if not bullets:
            logger.warning("Summary block has no memory_bullets; skipped VAMP v2 vector indexing.")
            await self._mark_indexed(
                block,
                status="no_bullets",
                indexed_bullets=0,
                total_bullets=0,
            )
            return

        semaphore = asyncio.Semaphore(self.index_concurrency)

        async def index_bullet(bullet: dict) -> bool:
            """Embed one bullet and upsert its Qdrant point.

            Returns ``False`` for empty-text bullets (nothing to embed).
            Raises on Bedrock / Qdrant / dimension-mismatch errors so the
            caller can count them as failures via ``return_exceptions=True``
            (FIX [M24]).
            """
            b_text = bullet.get("text", "")
            if not b_text:
                return False
            async with semaphore:
                b_vector = await self._embed(b_text)
                expected = get_config().VAMP_EMBEDDING_DIMENSIONS
                if len(b_vector) != expected:
                    raise ValueError(
                        "Embedding dimension mismatch for "
                        f"{block.get('conversation_id')}/{block.get('summary_id')} "
                        f"{bullet.get('bullet_id')}: got {len(b_vector)}, expected {expected}"
                    )
                b_payload = {
                    "pointer_type": "memory_bullet",
                    "user_id": block.get("user_id"),
                    "conversation_id": block.get("conversation_id"),
                    "summary_id": block.get("summary_id"),
                    "idx": block.get("idx"),
                    "bullet_id": bullet.get("bullet_id"),
                    "bullet_index": bullet.get("bullet_index"),
                    "schema_version": block.get("schema_version"),
                    "content_hash": block.get("content_hash"),
                    "embedding_model": self.embedding_model,
                }
                await self.vector_store.upsert(
                    conversation_id=block["conversation_id"],
                    summary_id=block["summary_id"],
                    vector=b_vector,
                    payload=b_payload,
                    point_seed=f"{block['conversation_id']}:{block['summary_id']}:{bullet.get('bullet_id')}",
                )
                return True

        total_bullets = len(bullets)
        # FIX [M24]: return_exceptions=True so one bullet's failure doesn't
        # abandon in-flight sibling embeds. Count successes; log per-bullet
        # errors so operators can see which bullets failed.
        results = await asyncio.gather(
            *(index_bullet(b) for b in bullets),
            return_exceptions=True,
        )
        indexed_bullets = sum(1 for r in results if r is True)
        for r in results:
            if isinstance(r, Exception):
                _log_vamp_exception("index_memory_bullet", r)

        # FIX [H10]: Distinguish partial indexing from full success.
        # Previously, 0 < indexed_bullets < total_bullets fell through to
        # status="indexed", silently dropping bullets with empty text (or
        # transient embedding failures) forever. Now we mark "partial" so
        # the maintenance loop can retry the missing bullets.
        if indexed_bullets == 0:
            status = "no_bullets"
        elif indexed_bullets < total_bullets:
            status = "partial"
            logger.warning(
                "Summary block %s/%s partially indexed: %s/%s bullets",
                block.get("conversation_id"),
                block.get("summary_id"),
                indexed_bullets,
                total_bullets,
            )
        else:
            status = "indexed"

        await self._mark_indexed(
            block,
            status=status,
            indexed_bullets=indexed_bullets,
            total_bullets=total_bullets,
        )

    async def _mark_indexed(
        self,
        block: dict,
        *,
        status: str,
        indexed_bullets: int | None = None,
        total_bullets: int | None = None,
    ) -> None:
        """Persist post-indexing ``vector_status`` (and bullet counts when partial).

        Wraps ``summary_repo.mark_vector_indexed`` so callers don't have to
        repeat the ``getattr`` + ``callable`` + exception-swallowing dance.
        Logs failures instead of silently passing — the underlying write is
        now retried (FIX [M27]) so an exception reaching here is genuinely
        unexpected and worth surfacing.
        """
        mark_indexed = getattr(self.summary_repo, "mark_vector_indexed", None)
        if not callable(mark_indexed):
            return
        try:
            await self._call_maybe_async(
                mark_indexed,
                block["conversation_id"],
                block["summary_id"],
                status=status,
                indexed_bullets=indexed_bullets,
                total_bullets=total_bullets,
            )
        except Exception as exc:
            _log_vamp_exception("persist_vector_index_status", exc)

    async def aclose(self, *, timeout: float = 30.0) -> None:
        """Drain in-flight background index tasks on shutdown.

        FIX [M30]: Previously ``_background_tasks`` were never drained. On
        loop close, in-flight tasks were cancelled mid-embed, leaving blocks
        stuck in ``pending`` until the next process restart. Now we wait for
        them with a wall-clock timeout, then cancel any survivors so
        ``main.py``'s lifespan shutdown can proceed deterministically.
        """
        tasks = list(self._background_tasks)
        if not tasks:
            return
        logger.info("Draining %s VAMP background index tasks", len(tasks))
        try:
            await asyncio.wait_for(
                asyncio.gather(*tasks, return_exceptions=True),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "VAMP background drain timed out after %ss; cancelling %s tasks",
                timeout,
                len(tasks),
            )
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    async def retrieve_blocks(
        self,
        conversation_id: str,
        user_id: str,
        user_prompt: str,
        *,
        k: int | None = None,
        model_id: str | None = None,
        token_budget: int | None = None,
    ) -> list[dict]:
        """Retrieve the most relevant memory blocks for ``user_prompt``.

        Args:
            conversation_id: Conversation to retrieve from.
            user_id: Calling user ID. Must match the conversation's
                owner; otherwise a :class:`PermissionError` is raised.
            user_prompt: Prompt to embed and match against memory blocks.
            k: Optional override for the number of blocks to retrieve.
            model_id: Optional model ID for token-budget aware retrieval.
            token_budget: Optional token budget cap on retrieved blocks.

        Returns:
            List of memory-block dicts, most relevant first. Returns an
            empty list if the conversation has no blocks yet.

        Raises:
            PermissionError: If ``user_id`` does not own the conversation,
                or if the conversation has no owner recorded (defensive
                fail-closed).
        """
        conv = await self._call_maybe_async(
            self.summary_repo.get_conversation,
            conversation_id,
        )
        conv = conv or {}
        # FIX [AUDIT-2-C]: the previous check ``conv.get("user_id") not
        # in (None, user_id)`` accepted conversations with NO owner
        # (``user_id=None``), allowing any caller to read their blocks.
        # Fail closed: the recorded owner must equal the caller.
        conv_owner = conv.get("user_id") if conv else None
        if not conv_owner or conv_owner != user_id:
            raise PermissionError("User does not own this conversation")

        total = int(conv.get("summary_count", 0) or 0)
        if total <= 0:
            return []

        effective_k = k or adaptive_k(total)
        try:
            query_vector = await self._embed(user_prompt)
            vector_hits = await self._call_maybe_async(
                self.vector_store.search,
                conversation_id=conversation_id,
                query_vector=query_vector,
                k=effective_k,
                user_id=user_id,
                pointer_type="memory_bullet",
                score_threshold=self.similarity_threshold,
            )
            if asyncio.iscoroutine(vector_hits):
                vector_hits = await vector_hits
        except Exception as exc:
            _log_vamp_exception("retrieve_memory_vectors", exc)
            return await self._recent_block_fallback(
                conversation_id,
                effective_k,
                model_id=model_id,
                token_budget=token_budget,
            )

        if not vector_hits:
            return await self._recent_block_fallback(
                conversation_id,
                effective_k,
                model_id=model_id,
                token_budget=token_budget,
            )

        summary_ids = list({hit["summary_id"] for hit in vector_hits if hit.get("summary_id") is not None})
        latest_summary_id = conv.get("latest_summary_id")
        if latest_summary_id and latest_summary_id not in summary_ids:
            # The immutable block is authoritative immediately; its async
            # vectors may still be pending. Pinning the newest block prevents
            # compaction from creating a temporary memory gap.
            summary_ids.append(str(latest_summary_id))
        blocks = await self._call_maybe_async(
            self.summary_repo.get_blocks_by_ids,
            conversation_id,
            summary_ids,
        )

        hits_by_summary = {}
        for rank, hit in enumerate(vector_hits):
            sid = hit.get("summary_id")
            if not sid:
                continue
            if sid not in hits_by_summary:
                hits_by_summary[sid] = []
            hit["rank"] = rank
            hits_by_summary[sid].append(hit)

        units = []
        for block in blocks:
            sid = block.get("summary_id")
            if not block.get("memory_bullets"):
                logger.warning(
                    "Summary block %s has no memory_bullets; skipped VAMP v2 retrieval.",
                    sid,
                )
                continue
            s_hits = hits_by_summary.get(sid, [])
            is_latest = bool(latest_summary_id and sid == str(latest_summary_id))
            if not s_hits and not is_latest:
                continue

            b_dict = {b.get("bullet_id"): b for b in block.get("memory_bullets", [])}

            if is_latest:
                for b_obj in block.get("memory_bullets", []):
                    bid = b_obj.get("bullet_id")
                    text = str(b_obj.get("text") or "").strip()
                    if not bid or not text:
                        continue
                    units.append(
                        {
                            "unit_id": bid,
                            "summary_id": sid,
                            "idx": block.get("idx"),
                            "start_message_idx": block.get("start_message_idx"),
                            "end_message_idx": block.get("end_message_idx"),
                            "bullet_id": bid,
                            "bullet_index": b_obj.get("bullet_index"),
                            "text": text,
                            "is_parent": False,
                            "_retrieval_score": 1.01,
                            "_retrieval_rank": -1,
                        }
                    )

            for h in s_hits:
                if h.get("pointer_type") == "memory_bullet":
                    bid = h.get("bullet_id")
                    if bid and bid in b_dict:
                        b_obj = b_dict[bid]
                        units.append(
                            {
                                "unit_id": bid,
                                "summary_id": sid,
                                "idx": block.get("idx"),
                                "start_message_idx": block.get("start_message_idx"),
                                "end_message_idx": block.get("end_message_idx"),
                                "bullet_id": bid,
                                "bullet_index": b_obj.get("bullet_index"),
                                "text": b_obj.get("text"),
                                "is_parent": False,
                                "_retrieval_score": h.get("score", 0.0),
                                "_retrieval_rank": h.get("rank", 999999),
                            }
                        )

        # All hits may reference deleted/stale Firestore documents. Treat that
        # exactly like no semantic hits so recent memory remains available.
        if not units:
            return await self._recent_block_fallback(
                conversation_id,
                effective_k,
                model_id=model_id,
                token_budget=token_budget,
            )
        return dedupe_select_budget_then_sort(
            units,
            budget_tokens=token_budget or self.context_budget_tokens,
            model_id=model_id,
        )

    async def retry_pending_indexes(self, limit: int = 25) -> int:
        """Re-index up to ``limit`` due blocks; return the count that indexed successfully."""
        get_retry = getattr(self.summary_repo, "get_vector_retry_blocks", None)
        if not callable(get_retry):
            return 0
        blocks = await self._call_maybe_async(get_retry, limit)
        semaphore = asyncio.Semaphore(self.index_concurrency)

        async def retry(block: dict) -> bool:
            async with semaphore:
                return await self._index_with_failure_record(block)

        results = await asyncio.gather(*(retry(block) for block in blocks))
        return sum(bool(result) for result in results)

    async def _recent_block_fallback(
        self,
        conversation_id: str,
        limit: int,
        *,
        model_id: str | None = None,
        token_budget: int | None = None,
    ) -> list[dict]:
        """Degraded retrieval returning the most recent blocks when vector search is unavailable."""
        get_recent = getattr(self.summary_repo, "get_recent_blocks", None)
        if not callable(get_recent):
            return []
        blocks = await self._call_maybe_async(get_recent, conversation_id, limit)
        units = []
        for block in blocks:
            for bullet in block.get("memory_bullets") or []:
                text = str(bullet.get("text") or "").strip()
                if not text:
                    continue
                units.append(
                    {
                        "unit_id": bullet.get("bullet_id"),
                        "summary_id": block.get("summary_id"),
                        "idx": block.get("idx"),
                        "bullet_index": bullet.get("bullet_index"),
                        "text": text,
                        "is_parent": False,
                        # Prefer the newest blocks, then preserve chronological
                        # output order after budget selection.
                        "_retrieval_score": float(block.get("idx", 0) or 0),
                    }
                )
        return dedupe_select_budget_then_sort(
            units,
            budget_tokens=token_budget or self.context_budget_tokens,
            model_id=model_id,
        )

    async def retrieve_context(
        self,
        conversation_id: str,
        user_id: str,
        user_prompt: str,
        *,
        k: int | None = None,
        model_id: str | None = None,
        token_budget: int | None = None,
    ) -> str | None:
        """Retrieve and format historical context for the per-turn system prompt.

        Args:
            conversation_id: Conversation to retrieve from.
            user_id: Calling user id; must own the conversation.
            user_prompt: Prompt to embed and match against memory blocks.
            k: Optional override for the number of blocks to retrieve.
            model_id: Optional model id for token-budget aware retrieval.
            token_budget: Optional token-budget cap on retrieved blocks.

        Returns:
            Formatted historical context string, or ``None`` if no memory is
            available or retrieval failed (the failure is logged at warning).
        """
        try:
            blocks = await self.retrieve_blocks(
                conversation_id,
                user_id,
                user_prompt,
                k=k,
                model_id=model_id,
                token_budget=token_budget,
            )
        except Exception as exc:
            _log_vamp_exception("retrieve_memory_context", exc)
            return None
        latest_idx = await _latest_summary_block_idx_for(conversation_id, blocks)
        context = format_historical_context(
            blocks,
            latest_summary_block_idx=latest_idx,
        )
        return context or None

    # CENH [4]: Mid-turn VAMP retrieval for the `retrieve_memory` tool. Lets
    # the LLM issue an additional VAMP search with a different query when the
    # initial context didn't surface relevant past facts (e.g., the user's
    # follow-up reveals a new angle the original prompt didn't).
    # Ownership is verified inside `retrieve_blocks` (the same path used by
    # the per-turn retrieve_context), so we don't duplicate the check here.
    async def retrieve_context_for_query(
        self,
        conversation_id: str,
        user_id: str,
        query: str,
        *,
        model_id: str | None = None,
        k: int | None = None,
        token_budget: int | None = None,
    ) -> str | None:
        """Retrieve formatted historical context for an arbitrary mid-turn query.

        Mirrors :meth:`retrieve_context` but is intended for ad-hoc LLM-driven
        retrieval (the ``retrieve_memory`` tool). Ownership is verified by
        :meth:`retrieve_blocks` (it raises ``PermissionError`` if
        ``user_id`` does not own ``conversation_id``).

        Returns the formatted historical context string, or ``None`` if no
        memories are found or the conversation is empty.
        """
        try:
            blocks = await self.retrieve_blocks(
                conversation_id,
                user_id,
                query,
                k=k,
                model_id=model_id,
                token_budget=token_budget,
            )
        except PermissionError:
            # Ownership violation — propagate so the tool surfaces it as an
            # explicit error rather than silently returning "no memories".
            raise
        except Exception as exc:
            _log_vamp_exception("retrieve_memory_context_for_query", exc)
            return None
        if not blocks:
            return None
        latest_idx = await _latest_summary_block_idx_for(conversation_id, blocks)
        context = format_historical_context(
            blocks,
            latest_summary_block_idx=latest_idx,
        )
        return context or None

    async def delete_conversation_pointers(
        self,
        conversation_id: str,
        user_id: str,
    ) -> None:
        """Delete all Qdrant vector pointers for the given conversation owned by the user."""
        try:
            await self.vector_store.delete_conversation_pointers(conversation_id, user_id)
            logger.info(
                "Deleted Qdrant pointers for conversation %s and user %s",
                conversation_id,
                user_id,
            )
        except Exception as exc:
            _log_vamp_exception("delete_conversation_memory_vectors", exc)
            # The conversation service records a durable cleanup retry only
            # when this port reports failure. Swallowing it leaves orphaned
            # vectors indefinitely after the Firestore conversation is gone.
            raise


async def _latest_summary_block_idx_for(conversation_id: str, blocks: list[dict]) -> int | None:
    """Fetch the conversation's true ``latest_summary_block_idx`` for recency labeling.

    FIX [M25]: ``format_historical_context`` previously computed ``max_idx``
    from the *selected* blocks. When the token budget dropped the newest
    blocks, older blocks got mislabeled ``recent``. Now we fetch the
    conversation metadata and pass the true ``latest_summary_block_idx`` so
    recency tiers reflect the conversation's actual progression, not the
    post-budget selection.

    Falls back to the max idx in ``blocks`` if the conversation doc is
    unreadable (best-effort — preserves backwards-compatible behavior).
    """
    try:
        from vamp_memory.summary_block_repository import SummaryBlockRepository

        conv = await asyncio.to_thread(SummaryBlockRepository.get_conversation, conversation_id)
        latest = (conv or {}).get("latest_summary_block_idx")
        if latest is not None:
            return int(latest)
    except Exception as exc:
        _log_vamp_exception("read_latest_summary_block_index", exc)
    if not blocks:
        return None
    return max(int(b.get("idx", 0) or 0) for b in blocks)
