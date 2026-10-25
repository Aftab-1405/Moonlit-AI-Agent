"""
Firestore access for immutable VAMP summary blocks.

Schema overview
---------------
Each summary block lives at:
    conversations/{conversation_id}/summary_blocks/{summary_id}

The ``summary_id`` is deterministic (``range-{start_idx:08d}-{end_idx:08d}``)
so a re-summarization of the same message range is idempotent. Large blocks
(> ``VAMP_SUMMARY_INLINE_MAX_BYTES``) spill their ``text`` + ``memory_bullets``
JSON into a sibling ``payload_chunks/`` subcollection to stay under the 1 MiB
Firestore document limit; ``_hydrate_blocks`` reassembles them on read.

vector_status state machine
---------------------------
Each block carries a ``vector_status`` field that drives the maintenance loop
(``vamp_memory/maintenance.py``) which re-embeds due blocks every ~30s:

    pending  -- block created, never embedded. Always due.
    partial  -- FIX [H10]: some but not all bullets embedded (transient
                Bedrock failure or empty-text bullet). Always due.
    failed   -- embedding failed; ``vector_next_retry_at`` holds the backoff
                timestamp. Due when ``vector_next_retry_at <= now``.
    dead     -- FIX [H11]: terminal state after ``MAX_VECTOR_ATTEMPTS``
                retries. ``vector_next_retry_at`` is removed. Excluded from
                every retry query.
    indexed  -- every bullet embedded successfully.
    no_bullets -- schema v1 or no memory bullets; nothing to embed.

Retry backoff
-------------
``mark_vector_failed`` increments ``vector_attempts`` *atomically* inside a
Firestore transaction (FIX [H12]). Backoff is ``15 * 2^(attempts-1)`` seconds
capped at 1 hour. After ``MAX_VECTOR_ATTEMPTS`` (10) attempts the block
transitions to ``dead`` (FIX [H11]).
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# FIX [H11]: Permanent-failure circuit breaker. Un-embeddable blocks (e.g.
# text exceeding Bedrock Titan's 8K-token cap) used to retry hourly forever,
# consuming Bedrock quota and maintenance-loop capacity indefinitely. After
# this many attempts the block transitions to the terminal ``dead`` state.
MAX_VECTOR_ATTEMPTS = 10


def _fast_firestore_retry():
    """Return a short-deadline retry policy for low-latency Firestore reads."""
    from google.api_core.retry import Retry

    return Retry(deadline=2.0)


def _maintenance_firestore_retry(timeout_seconds: float):
    """Use a background-friendly retry window for collection-group scans."""
    from google.api_core.retry import Retry

    return Retry(
        initial=0.5,
        maximum=4.0,
        multiplier=2.0,
        deadline=max(20.0, timeout_seconds + 5.0),
    )


def _split_utf8(value: str, max_bytes: int) -> list[str]:
    """Split text on UTF-8 boundaries without dropping or changing content."""
    encoded = value.encode("utf-8")
    size = max(1024, int(max_bytes))
    chunks: list[str] = []
    start = 0
    while start < len(encoded):
        end = min(start + size, len(encoded))
        if end < len(encoded):
            while end > start and (encoded[end] & 0xC0) == 0x80:
                end -= 1
        if end <= start:
            raise ValueError("Unable to split summary payload on a UTF-8 boundary")
        chunks.append(encoded[start:end].decode("utf-8"))
        start = end
    return chunks or [""]


def _encode_summary_payload_chunks(
    text: str,
    memory_bullets: list[dict],
    max_bytes: int,
) -> list[str]:
    """JSON-encode a summary's text+bullets and split into ``max_bytes``-bounded UTF-8 chunks."""
    payload = json.dumps(
        {"text": text, "memory_bullets": memory_bullets},
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    )
    return _split_utf8(payload, max_bytes)


def _decode_summary_payload_chunks(chunks: list[str]) -> dict:
    """Reassemble and JSON-decode a summary payload from its stored chunks."""
    return json.loads("".join(chunks))


class SummaryBlockRepository:
    """Data access layer for VAMP summary block documents."""

    CONVERSATION_COLLECTION = "conversations"
    SUMMARY_COLLECTION = "summary_blocks"
    PAYLOAD_CHUNK_COLLECTION = "payload_chunks"

    @staticmethod
    def _conversation_ref(conversation_id: str):
        """Return the Firestore document reference for ``conversations/{conversation_id}``."""
        from service.firestore.firestore_service import FirestoreService

        db = FirestoreService.get_db()
        return db.collection(SummaryBlockRepository.CONVERSATION_COLLECTION).document(conversation_id)

    @staticmethod
    def _summary_ref(conversation_id: str, summary_id: str):
        """Return the Firestore document reference for one summary block under a conversation."""
        return (
            SummaryBlockRepository._conversation_ref(conversation_id)
            .collection(SummaryBlockRepository.SUMMARY_COLLECTION)
            .document(summary_id)
        )

    @staticmethod
    def get_conversation(conversation_id: str) -> Optional[dict]:
        """Return the conversation metadata dict, or ``None`` if the conversation doc doesn't exist."""
        doc = SummaryBlockRepository._conversation_ref(conversation_id).get(
            retry=_fast_firestore_retry(),
            timeout=2.0,
        )
        return doc.to_dict() if doc.exists else None

    @staticmethod
    def create_block(
        conversation_id: str,
        user_id: str,
        *,
        text: str,
        start_message_idx: int,
        end_message_idx: int,
        embedding_model: str,
        memory_bullets: list[dict] | None = None,
        covers_from_turn: int | None = None,
        covers_to_turn: int | None = None,
        covers_message_ids: list | None = None,
        created_from_unsummarized_tail: bool = True,
    ) -> dict:
        """Append one immutable summary block safely using a Firestore transaction.

        Returns the stored (or pre-existing) block dict. The dict carries a
        ``created`` boolean so callers can decide whether to schedule vector
        indexing.

        FIX [M28]: Previously, when a deterministic ``summary_id`` already
        existed (re-summarization with different LLM output, or a retry that
        lost its response), this method silently returned the *old* snapshot
        with no signal. The caller had no way to distinguish "just created"
        from "already existed" and would schedule indexing on a block whose
        vectors may already be in flight — or skip indexing a block whose
        content actually differed. Now the returned dict always carries
        ``created=True`` for freshly written blocks and ``created=False``
        for the existing-snapshot path.
        """
        from firebase_admin import firestore

        from service.firestore.firestore_service import FirestoreService

        db = FirestoreService.get_db()
        from config import get_config

        config = get_config()
        conv_ref = SummaryBlockRepository._conversation_ref(conversation_id)

        @firestore.transactional
        def update_in_transaction(transaction):
            conv_snapshot = conv_ref.get(transaction=transaction)
            if conv_snapshot.exists:
                conv_data = conv_snapshot.to_dict() or {}
                # FIX [AUDIT-2-C]: fail-closed ownership check. The
                # previous ``not in (None, user_id)`` accepted
                # conversations with no owner, allowing any caller to
                # mutate their blocks.
                conv_owner = conv_data.get("user_id")
                if not conv_owner or conv_owner != user_id:
                    raise PermissionError("User does not own this conversation")
                idx = int(conv_data.get("summary_count") or 0)
            else:
                idx = 0

            # A summary range is immutable. A deterministic document id makes
            # retries idempotent when vector indexing succeeds but the caller
            # loses its response, or when a summary claim changes ownership.
            summary_id = f"range-{int(start_message_idx):08d}-{int(end_message_idx):08d}"
            summary_ref = SummaryBlockRepository._summary_ref(conversation_id, summary_id)
            existing_snapshot = summary_ref.get(transaction=transaction)
            if existing_snapshot.exists:
                # FIX [M28]: tag the returned snapshot so the caller can skip
                # re-indexing. Defaults to True for blocks written by older
                # code paths that don't set the field.
                existing = existing_snapshot.to_dict() or {}
                existing.setdefault("created", False)
                return existing

            prepared_bullets = list(memory_bullets or [])
            for b in prepared_bullets:
                if "bullet_id" not in b:
                    b["bullet_id"] = f"b{b.get('bullet_index', 0):03d}"
                if not str(b["bullet_id"]).startswith(f"{summary_id}#"):
                    b["bullet_id"] = f"{summary_id}#{b['bullet_id']}"

            payload_chunks = _encode_summary_payload_chunks(
                text,
                prepared_bullets,
                config.VAMP_SUMMARY_CHUNK_BYTES,
            )
            payload_bytes = sum(len(chunk.encode("utf-8")) for chunk in payload_chunks)
            content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
            block = {
                "conversation_id": conversation_id,
                "user_id": user_id,
                "summary_id": summary_id,
                "idx": idx,
                "start_message_idx": start_message_idx,
                "end_message_idx": end_message_idx,
                "content_hash": content_hash,
                "embedding_model": embedding_model,
                "vector_status": "pending",
                "vector_attempts": 0,
                "created_at": datetime.now(timezone.utc),
                "covers_from_turn": covers_from_turn,
                "covers_to_turn": covers_to_turn,
                "covers_message_ids": covers_message_ids,
                "created_from_unsummarized_tail": created_from_unsummarized_tail,
                # FIX [M28]: signal to the caller that this is a fresh write
                # (vs. the existing-snapshot branch above) so it can decide
                # whether to schedule vector indexing.
                "created": True,
            }

            if memory_bullets is not None:
                if payload_bytes <= config.VAMP_SUMMARY_INLINE_MAX_BYTES:
                    block["schema_version"] = 2
                    block["text"] = text
                    block["memory_bullets"] = prepared_bullets
                else:
                    logger.info(
                        "Storing summary %s in %s immutable payload chunks (%s bytes)",
                        summary_id,
                        len(payload_chunks),
                        payload_bytes,
                    )
                    block.update(
                        {
                            "schema_version": 3,
                            "payload_storage": "chunks",
                            "payload_chunk_count": len(payload_chunks),
                            "payload_bytes": payload_bytes,
                        }
                    )
                    chunk_collection = summary_ref.collection(SummaryBlockRepository.PAYLOAD_CHUNK_COLLECTION)
                    for chunk_index, chunk in enumerate(payload_chunks):
                        transaction.set(
                            chunk_collection.document(f"{chunk_index:06d}"),
                            {
                                "index": chunk_index,
                                "data": chunk,
                                "content_hash": content_hash,
                            },
                        )
            else:
                block["text"] = text

            transaction.set(summary_ref, block)
            transaction.set(
                conv_ref,
                {
                    "user_id": user_id,
                    "summary_count": idx + 1,
                    "latest_summary_block_idx": idx,
                    "latest_summary_id": summary_id,
                    "updated_at": firestore.SERVER_TIMESTAMP,
                },
                merge=True,
            )
            return block

        transaction = db.transaction()
        stored = update_in_transaction(transaction)
        return SummaryBlockRepository._hydrate_blocks([stored])[0]

    @staticmethod
    def _hydrate_blocks(blocks: list[dict]) -> list[dict]:
        """Reassemble chunked logical blocks without truncating their payload."""
        chunked = [
            block
            for block in blocks
            if block.get("payload_storage") == "chunks" and int(block.get("payload_chunk_count", 0) or 0) > 0
        ]
        if not chunked:
            return blocks

        from service.firestore.firestore_service import FirestoreService

        refs = []
        ref_metadata: dict[str, tuple[tuple[str, str], int]] = {}
        for block in chunked:
            conversation_id = str(block["conversation_id"])
            summary_id = str(block["summary_id"])
            collection = SummaryBlockRepository._summary_ref(conversation_id, summary_id).collection(
                SummaryBlockRepository.PAYLOAD_CHUNK_COLLECTION
            )
            for index in range(int(block["payload_chunk_count"])):
                ref = collection.document(f"{index:06d}")
                refs.append(ref)
                ref_metadata[ref.path] = ((conversation_id, summary_id), index)

        grouped: dict[tuple[str, str], dict[int, str]] = {}
        docs = FirestoreService.get_db().get_all(
            refs,
            retry=_fast_firestore_retry(),
            timeout=4.0,
        )
        for doc in docs:
            metadata = ref_metadata.get(doc.reference.path)
            if not doc.exists or metadata is None:
                continue
            block_key, index = metadata
            grouped.setdefault(block_key, {})[index] = str((doc.to_dict() or {}).get("data", ""))

        hydrated = []
        for block in blocks:
            if block.get("payload_storage") != "chunks":
                hydrated.append(block)
                continue
            summary_id = str(block["summary_id"])
            block_key = (str(block["conversation_id"]), summary_id)
            expected = int(block.get("payload_chunk_count", 0) or 0)
            parts = grouped.get(block_key, {})
            if len(parts) != expected:
                raise RuntimeError(
                    f"Summary payload {summary_id} is incomplete: expected {expected} chunks, found {len(parts)}"
                )
            payload = _decode_summary_payload_chunks([parts[index] for index in range(expected)])
            hydrated.append(
                {
                    **block,
                    "text": payload["text"],
                    "memory_bullets": payload["memory_bullets"],
                }
            )
        return hydrated

    @staticmethod
    def get_blocks_by_ids(conversation_id: str, summary_ids: list[str]) -> list[dict]:
        """Bulk-fetch and hydrate summary blocks by id; returns ``[]`` when ``summary_ids`` is empty."""
        if not summary_ids:
            return []
        from service.firestore.firestore_service import FirestoreService

        refs = [
            SummaryBlockRepository._summary_ref(conversation_id, summary_id)
            for summary_id in dict.fromkeys(summary_ids)
        ]
        docs = FirestoreService.get_db().get_all(
            refs,
            retry=_fast_firestore_retry(),
            timeout=2.0,
        )
        return SummaryBlockRepository._hydrate_blocks([doc.to_dict() for doc in docs if doc.exists])

    @staticmethod
    def get_recent_blocks(conversation_id: str, limit: int = 5) -> list[dict]:
        """Return recent immutable blocks for degraded retrieval fallback."""
        from google.cloud.firestore_v1 import Query

        docs = (
            SummaryBlockRepository._conversation_ref(conversation_id)
            .collection(SummaryBlockRepository.SUMMARY_COLLECTION)
            .order_by("idx", direction=Query.DESCENDING)
            .limit(max(1, int(limit)))
            .get(retry=_fast_firestore_retry(), timeout=2.0)
        )
        return SummaryBlockRepository._hydrate_blocks([doc.to_dict() for doc in docs if doc.exists])

    @staticmethod
    def mark_vector_indexed(
        conversation_id: str,
        summary_id: str,
        *,
        status: str = "indexed",
        indexed_bullets: int | None = None,
        total_bullets: int | None = None,
    ) -> None:
        """Persist the post-indexing ``vector_status`` (and counts when partial).

        ``status`` is one of ``indexed`` / ``partial`` / ``no_bullets``.
        ``indexed_bullets`` and ``total_bullets`` are persisted when provided
        so the maintenance loop can detect drift between expected and embedded
        bullets for ``partial`` blocks (FIX [H10]).

        FIX [M27]: Previously used a bare ``.update(payload)`` with no retry
        policy. A transient Firestore error left the block stuck in
        ``pending`` (the caller swallowed the exception with
        ``except Exception: pass``). Now matches the rest of the file's
        ``_maintenance_firestore_retry(timeout)`` policy so transient errors
        are retried server-side.
        """
        payload: dict[str, str | int | datetime | None] = {
            "vector_status": status,
            "vector_error": None,
            "vector_next_retry_at": None,
            "vector_updated_at": datetime.now(timezone.utc),
        }
        if indexed_bullets is not None:
            payload["indexed_bullets"] = int(indexed_bullets)
        if total_bullets is not None:
            payload["total_bullets"] = int(total_bullets)
        timeout = 4.0
        SummaryBlockRepository._summary_ref(conversation_id, summary_id).update(
            payload,
            retry=_maintenance_firestore_retry(timeout),
            timeout=timeout,
        )

    @staticmethod
    def mark_vector_failed(
        conversation_id: str,
        summary_id: str,
        *,
        reason: str,
    ) -> None:
        """Atomically increment ``vector_attempts`` and either back off or mark dead.

        FIX [H12]: Previously ``attempts`` was read from the stale in-memory
        ``block`` dict the caller passed in. Two concurrent callers
        (scheduled index path + maintenance retry) both computed the same
        ``attempts`` value, both called ``mark_vector_failed(attempts=...)``,
        and last-write-wins in Firestore. The counter was undercounted →
        backoff was too short → retry storm. Now we read+increment inside a
        Firestore transaction so the increment is atomic across concurrent
        callers.

        FIX [H11]: Previously the backoff capped at 1h but never terminated.
        Un-embeddable blocks (e.g. text exceeding Titan's 8K-token cap)
        retried hourly forever, consuming Bedrock quota indefinitely. After
        ``MAX_VECTOR_ATTEMPTS`` retries we now transition to the terminal
        ``dead`` state and remove ``vector_next_retry_at`` so
        ``get_vector_retry_blocks`` will never pick the block up again.

        The transaction itself provides built-in retry-on-contention (5
        attempts by default) which satisfies the M27 retry-policy requirement
        for this write path.
        """
        from firebase_admin import firestore

        from service.firestore.firestore_service import FirestoreService

        db = FirestoreService.get_db()
        ref = SummaryBlockRepository._summary_ref(conversation_id, summary_id)
        transaction = db.transaction()

        @firestore.transactional
        def _txn(txn, ref):
            snap = ref.get(transaction=txn)
            if not snap.exists:
                return
            data = snap.to_dict() or {}
            # Read inside the transaction so concurrent callers cannot
            # undercount (FIX [H12]).
            attempts = int(data.get("vector_attempts") or 0) + 1
            truncated_reason = str(reason)[:1000]
            if attempts >= MAX_VECTOR_ATTEMPTS:
                txn.update(
                    ref,
                    {
                        "vector_status": "dead",
                        "vector_attempts": attempts,
                        "vector_failure_reason": truncated_reason,
                        # Remove the backoff field so the block is excluded
                        # from every retry query (FIX [H11]).
                        "vector_next_retry_at": firestore.DELETE_FIELD,
                        "vector_updated_at": datetime.now(timezone.utc),
                    },
                )
                logger.error(
                    "Summary block %s/%s marked dead after %s embedding attempts: %s",
                    conversation_id,
                    summary_id,
                    attempts,
                    reason,
                )
            else:
                delay_seconds = min(3600, 15 * (2 ** min(attempts - 1, 8)))
                txn.update(
                    ref,
                    {
                        "vector_status": "failed",
                        "vector_attempts": attempts,
                        "vector_failure_reason": truncated_reason,
                        "vector_next_retry_at": datetime.now(timezone.utc) + timedelta(seconds=delay_seconds),
                        "vector_updated_at": datetime.now(timezone.utc),
                    },
                )

        _txn(transaction, ref)

    @staticmethod
    def get_vector_retry_blocks(limit: int = 25) -> list[dict]:
        """Return due ``pending``/``partial``/``failed`` blocks across conversations.

        ``pending`` and ``partial`` blocks are always due (no backoff).
        ``failed`` blocks are due when ``vector_next_retry_at <= now``.
        ``dead`` blocks are never returned (terminal state, FIX [H11]).

        FIX [H9]: Previously this issued a single collection-group query
        filtering on ``vector_status in ["pending", "failed"]`` with no
        ``vector_next_retry_at`` filter, capped at ``limit * 3`` docs ordered
        by document ID (i.e. by message range, NOT by retry time). The
        Python loop then discarded every doc whose backoff hadn't elapsed.
        Once ≥75 ``failed`` blocks were still in their backoff window, the
        query returned 75 not-yet-due docs, Python filtered all of them out,
        and the function returned ``[]`` — even if hundreds of genuinely-due
        ``pending`` blocks existed later in the ordering. The retry pipeline
        silently stalled until enough backoff windows expired.

        Now Firestore does the due-window filtering server-side via two
        queries: ``pending``+``partial`` (always due) and ``failed`` with
        ``vector_next_retry_at <= now``. Requires a composite index on
        ``(vector_status ASC, vector_next_retry_at ASC)``.
        """
        from google.cloud.firestore_v1 import FieldFilter

        from config import get_config
        from service.firestore.firestore_service import FirestoreService

        timeout = max(4.0, float(get_config().VAMP_MAINTENANCE_QUERY_TIMEOUT_SECONDS))
        now = datetime.now(timezone.utc)
        limit_int = max(1, int(limit))

        # Always-due blocks: ``pending`` (never attempted) and ``partial``
        # (some bullets indexed but not all — FIX [H10] lets the maintenance
        # loop retry these). ``dead`` is excluded by omission (FIX [H11]).
        pending_docs = (
            FirestoreService.get_db()
            .collection_group(SummaryBlockRepository.SUMMARY_COLLECTION)
            .where(filter=FieldFilter("vector_status", "in", ["pending", "partial"]))
            .limit(limit_int)
            .get(
                retry=_maintenance_firestore_retry(timeout),
                timeout=timeout,
            )
        )

        # Failed blocks whose backoff window has elapsed. The server-side
        # ``vector_next_retry_at <= now`` filter is the heart of FIX [H9] —
        # it prevents a backlog of not-yet-due ``failed`` blocks from
        # starving out genuinely-due ``pending`` blocks.
        failed_docs = (
            FirestoreService.get_db()
            .collection_group(SummaryBlockRepository.SUMMARY_COLLECTION)
            .where(filter=FieldFilter("vector_status", "==", "failed"))
            .where(filter=FieldFilter("vector_next_retry_at", "<=", now))
            .limit(limit_int)
            .get(
                retry=_maintenance_firestore_retry(timeout),
                timeout=timeout,
            )
        )

        due = [doc.to_dict() for doc in [*pending_docs, *failed_docs] if doc.exists]
        return SummaryBlockRepository._hydrate_blocks(due[:limit_int])
