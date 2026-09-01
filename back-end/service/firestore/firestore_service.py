"""Firestore service for application storage.

This module owns the Firebase Admin SDK lifecycle and exposes the
module-level convenience functions used throughout the backend for
persisting conversation data, fetching conversations, and storing
large query-result payloads.

Chunked storage atomicity
-------------------------

``store_execution_result`` splits oversized query results (above
``_EXECUTION_INLINE_BYTES``) into per-chunk sibling documents under
``conversations/{cid}/execution_results/{eid}/chunks/{NNNNNN}``. The
chunk writes and the final ``"complete"`` status flip are committed in
a single Firestore ``WriteBatch`` (FIX [H15]) so a process crash
mid-write can never leave the parent document permanently stuck in the
``"writing"`` state with ``chunk_count=N`` but missing chunks — a state
that previously caused ``get_execution_result`` to raise an unrecoverable
``RuntimeError``.
"""

import json
import logging
from datetime import datetime, timezone
from functools import lru_cache

import firebase_admin
from firebase_admin import credentials, firestore

from config import get_config

Config = get_config()
logger = logging.getLogger(__name__)

_EXECUTION_INLINE_BYTES = 700_000
_EXECUTION_CHUNK_BYTES = 700_000


def _chunk_rows(rows: list[dict], max_bytes: int) -> list[list[dict]]:
    """Split ``rows`` into byte-bounded chunks no larger than ``max_bytes``."""
    chunks: list[list[dict]] = []
    current: list[dict] = []
    current_bytes = 2
    for row in rows:
        row_bytes = len(json.dumps(row, default=str).encode("utf-8")) + 1
        if row_bytes > max_bytes:
            raise ValueError("A single query-result row exceeds the persistence limit")
        if current and current_bytes + row_bytes > max_bytes:
            chunks.append(current)
            current = []
            current_bytes = 2
        current.append(row)
        current_bytes += row_bytes
    if current:
        chunks.append(current)
    return chunks


def _initialize_firebase():
    """Initialize Firebase Admin SDK if not already initialized."""
    if not firebase_admin._apps:
        try:
            if not Config.validate_firebase_credentials():
                raise ValueError("Firebase credentials validation failed")

            firebase_credentials = Config.get_firebase_credentials()
            cred = credentials.Certificate(firebase_credentials)
            firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin SDK initialized successfully")
            logger.info(
                "Firebase SDK configured for project %s (network not yet verified)",
                firebase_credentials["project_id"],
            )

        except Exception as e:
            logger.error(f"Failed to initialize Firebase Admin SDK: {e}")
            raise


@lru_cache(maxsize=1)
def get_firestore_db():
    """
    Get Firestore database instance.

    Uses @lru_cache for lazy initialization and singleton behavior.
    For testing, call get_firestore_db.cache_clear() to reset.
    """
    _initialize_firebase()
    return firestore.client()


def store_conversation(conversation_id, sender, message, user_id, tools=None):
    """Store conversation message in Firestore."""
    try:
        db = get_firestore_db()
        conversation_ref = db.collection("conversations").document(conversation_id)

        if not conversation_ref.get().exists:
            conversation_ref.set(
                {
                    "user_id": user_id,
                    "timestamp": datetime.now(timezone.utc),
                    "messages": [],
                }
            )

        content = str(message or "").strip()

        message_data = {
            "sender": sender,
            "content": content,
            "timestamp": datetime.now(timezone.utc),
        }

        if tools:
            message_data["tools"] = tools

        conversation_ref.update({"messages": firestore.ArrayUnion([message_data])})
        logger.debug(f"Conversation {conversation_id} updated successfully")
    except Exception as e:
        logger.error(f"Error storing conversation: {e}")
        raise


def get_conversations(user_id):
    """Get all conversations for a user."""
    try:
        db = get_firestore_db()
        from google.cloud.firestore_v1 import FieldFilter

        conversations = db.collection("conversations").where(filter=FieldFilter("user_id", "==", user_id)).get()
        conversation_list = []
        for conv in conversations:
            conv_data = conv.to_dict()
            if conv_data.get("messages"):
                conversation_list.append(
                    {
                        "id": conv.id,
                        "timestamp": conv_data["timestamp"],
                        "title": conv_data["messages"][0]["content"][: Config.CONVERSATION_TITLE_MAX_LENGTH],
                    }
                )
        conversation_list.sort(key=lambda x: x["timestamp"], reverse=True)
        return conversation_list
    except Exception as e:
        logger.error(f"Error retrieving conversations: {e}")
        raise


def store_execution_result(conversation_id: str, execution_id: str, data: dict) -> None:
    """
    Persist a query result, splitting oversized payloads into sibling chunk documents.

    Small results (``<= _EXECUTION_INLINE_BYTES`` serialized) are stored
    inline on the parent document with ``storage_status="complete"``.

    Large results are split into ``chunks/{NNNNNN}`` sibling documents. The
    parent ``set()``, all chunk ``set()`` calls, and the final
    ``storage_status="complete"`` flip are committed in a single Firestore
    ``WriteBatch`` (FIX [H15]) so a crash mid-write cannot leave the parent
    permanently stuck in ``"writing"`` with missing chunks. If the batch
    fails atomically, ``get_execution_result`` will see no document and
    return ``{}`` — the caller can retry cleanly.

    Args:
        conversation_id: The owning conversation ID.
        execution_id: The execution ID produced by the AI tool path.
        data: The result payload (``columns``, ``data``, ``row_count``, …).
    """
    try:
        db = get_firestore_db()
        # Path: conversations/{conversation_id}/execution_results/{execution_id}
        doc_ref = (
            db.collection("conversations")
            .document(conversation_id)
            .collection("execution_results")
            .document(execution_id)
        )

        rows = list(data.get("data") or [])
        serialized_size = len(json.dumps(rows, default=str).encode("utf-8"))
        chunks = []
        if serialized_size > _EXECUTION_INLINE_BYTES:
            chunks = _chunk_rows(rows, _EXECUTION_CHUNK_BYTES)

        # FIX [H15]: All chunks and the final status flip commit atomically.
        # Previously the parent doc was written with storage_status="writing",
        # then chunks were written one-by-one, then status was flipped to
        # "complete" in a separate update — a crash between any two of those
        # steps left the parent permanently unreadable.
        batch = db.batch()
        if chunks:
            payload = {
                **data,
                "data": [],
                "created_at": firestore.SERVER_TIMESTAMP,
                "storage_version": 2,
                "storage_status": "complete",
                "chunk_count": len(chunks),
            }
            batch.set(doc_ref, payload)
            for index, chunk in enumerate(chunks):
                batch.set(
                    doc_ref.collection("chunks").document(f"{index:06d}"),
                    {"index": index, "rows": chunk},
                )
        else:
            # Fits inline — single-op batch is still atomic for free.
            payload = {
                **data,
                "created_at": firestore.SERVER_TIMESTAMP,
                "storage_version": 2,
                "storage_status": "complete",
            }
            batch.set(doc_ref, payload)
        batch.commit()
        logger.debug(f"Stored execution result {execution_id} for conversation {conversation_id}")
    except Exception as e:
        logger.error(f"Error storing execution result {execution_id}: {e}")
        raise


def get_execution_result(conversation_id: str, execution_id: str) -> dict:
    """
    Retrieve a query result previously persisted via :func:`store_execution_result`.

    Reassembles chunked payloads by reading each ``chunks/{NNNNNN}`` sibling
    document in index order. If any chunk is missing (which can only happen
    after a non-atomic write — now prevented by FIX [H15]) the function raises
    ``RuntimeError`` so the controller can surface a 500 to the caller rather
    than silently returning truncated data.

    Args:
        conversation_id: The owning conversation ID.
        execution_id: The execution ID produced by the AI tool path.

    Returns:
        The reassembled result payload, or ``{}`` if no document exists.
    """
    try:
        db = get_firestore_db()
        doc_ref = (
            db.collection("conversations")
            .document(conversation_id)
            .collection("execution_results")
            .document(execution_id)
        )

        doc = doc_ref.get()
        if doc.exists:
            result = doc.to_dict()
            if result.get("storage_status") == "writing":
                raise RuntimeError("Execution result persistence is incomplete")
            chunk_count = int(result.get("chunk_count", 0) or 0)
            if chunk_count:
                rows = []
                for index in range(chunk_count):
                    chunk = doc_ref.collection("chunks").document(f"{index:06d}").get()
                    if not chunk.exists:
                        raise RuntimeError(f"Execution result chunk {index} is missing")
                    rows.extend((chunk.to_dict() or {}).get("rows") or [])
                result["data"] = rows
            return result
        return {}
    except Exception as e:
        logger.error(f"Error retrieving execution result {execution_id}: {e}")
        raise


def get_conversation(conversation_id):
    """Get specific conversation by ID."""
    try:
        db = get_firestore_db()
        conversation = db.collection("conversations").document(conversation_id).get()
        if conversation.exists:
            return conversation.to_dict()
        return None
    except Exception as e:
        logger.error(f"Error retrieving conversation {conversation_id}: {e}")
        raise


def delete_conversation(conversation_id, user_id):
    """Delete a conversation by ID and ensure user owns it."""
    try:
        db = get_firestore_db()
        conversation_ref = db.collection("conversations").document(conversation_id)
        conversation = conversation_ref.get()

        if conversation.exists:
            conv_data = conversation.to_dict()
            if conv_data["user_id"] == user_id:
                conversation_ref.delete()
                logger.info(f"Conversation {conversation_id} deleted successfully")
                return True
            raise PermissionError("User does not own this conversation")
        raise ValueError("Conversation not found")
    except Exception as e:
        logger.error(f"Error deleting conversation {conversation_id}: {e}")
        raise


class FirestoreService:
    """Backward-compatible class facade over module-level Firestore functions."""

    @classmethod
    def initialize(cls):
        """Initialize the Firebase Admin SDK (idempotent)."""
        _initialize_firebase()

    @classmethod
    def get_db(cls):
        """Return the singleton Firestore client, initializing on first use."""
        return get_firestore_db()

    @staticmethod
    def store_conversation(conversation_id, sender, message, user_id, tools=None):
        """Delegate to :func:`store_conversation` (appends a message to a conversation)."""
        return store_conversation(conversation_id, sender, message, user_id, tools)

    @staticmethod
    def get_conversations(user_id):
        """Delegate to :func:`get_conversations` (lists conversations for a user)."""
        return get_conversations(user_id)

    @staticmethod
    def get_conversation(conversation_id):
        """Delegate to :func:`get_conversation` (fetch a single conversation by id)."""
        return get_conversation(conversation_id)

    @staticmethod
    def delete_conversation(conversation_id, user_id):
        """Delegate to :func:`delete_conversation` (delete after owner verification)."""
        return delete_conversation(conversation_id, user_id)
