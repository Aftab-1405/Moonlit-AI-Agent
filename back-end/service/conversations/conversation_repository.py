"""
Conversation Repository

Encapsulates Firestore data access for conversation documents.
Collection: conversations/{conversation_id}

Document schema
---------------

Each conversation document has the shape::

    {
        "user_id":   "<owner uid>",
        "timestamp": Datetime,
        "title":     "<preview title>",
        "preview":   "<short preview>",
        "messages":  [ { sender, content, timestamp, ... }, ... ],
        "task_mode": str | None,
        "task_status": str | None,
    }

Transactional writes
--------------------

``store_message`` performs a read-check-create-append sequence. Two
concurrent calls for the same brand-new ``conversation_id`` used to both see
"not exists", both call ``set()``, and the second would overwrite the first
— silently losing messages (FIX [H14]). The sequence is now wrapped in a
Firestore transaction so concurrent calls serialize on the document and the
first writer's messages survive a concurrent second writer.
"""

import logging
import threading
from datetime import datetime, timezone
from typing import Dict, List, Optional

from core.errors import log_safe_exception, public_tool_error

logger = logging.getLogger(__name__)

_REST_READ_FALLBACK_ACTIVE = False
_REST_READ_FALLBACK_LOCK = threading.Lock()


def _is_transient_firestore_error(exc: Exception) -> bool:
    """Return True if ``exc`` is a retryable/transient Firestore error."""
    from google.api_core import exceptions

    return isinstance(
        exc,
        (
            exceptions.DeadlineExceeded,
            exceptions.ResourceExhausted,
            exceptions.ServiceUnavailable,
            exceptions.TooManyRequests,
        ),
    )


def _interactive_firestore_policy():
    """Build a (retry, timeout) policy for interactive Firestore reads."""
    from google.api_core.retry import Retry

    from config import get_config

    timeout = max(
        2.0,
        float(get_config().FIRESTORE_INTERACTIVE_READ_TIMEOUT_SECONDS),
    )
    retry = Retry(
        initial=0.2,
        maximum=1.5,
        multiplier=2.0,
        deadline=timeout,
    )
    return retry, timeout


def _get_conversation_via_rest(
    db,
    conversation_id: str,
    timeout: float,
    *,
    field_paths: list[str] | None = None,
):
    """Read one document through Firestore's non-streaming REST endpoint."""
    from urllib.parse import quote

    from google.api_core import exceptions
    from google.auth.transport.requests import AuthorizedSession
    from google.cloud.firestore_v1 import _helpers
    from google.cloud.firestore_v1.types import Document
    from google.protobuf.json_format import ParseDict
    from requests import RequestException

    project = quote(str(db.project), safe="")
    database = quote(str(getattr(db, "_database", "(default)")), safe="()")
    document_id = quote(str(conversation_id), safe="")
    url = (
        "https://firestore.googleapis.com/v1/projects/"
        f"{project}/databases/{database}/documents/"
        f"{ConversationRepository.COLLECTION_NAME}/{document_id}"
    )
    session = AuthorizedSession(db._credentials)
    try:
        params = [("mask.fieldPaths", path) for path in (field_paths or [])]
        response = session.get(url, params=params or None, timeout=timeout)
    except RequestException as exc:
        raise exceptions.DeadlineExceeded("Firestore REST fallback timed out") from exc
    finally:
        session.close()

    if response.status_code == 404:
        return None
    if response.status_code == 429:
        raise exceptions.ResourceExhausted("Firestore REST quota exhausted")
    if response.status_code in (502, 503, 504):
        raise exceptions.ServiceUnavailable(f"Firestore REST unavailable ({response.status_code})")
    if not response.ok:
        raise exceptions.GoogleAPICallError(f"Firestore REST read failed ({response.status_code})")

    document = Document()
    ParseDict(response.json(), document._pb)
    return _helpers.decode_dict(document.fields, db)


class ConversationRepository:
    """Data access layer for conversations in Firestore."""

    COLLECTION_NAME = "conversations"

    @staticmethod
    def get(conversation_id: str) -> Optional[Dict]:
        """
        Get a conversation document by ID.

        Reads use an interactive-read retry policy with a short deadline so a
        slow Firestore doesn't tie up the request thread indefinitely. If the
        gRPC read fails transiently and the REST-read fallback is enabled in
        config, the call is retried once over the non-streaming REST endpoint
        (some Firestore backends stop responding on the streaming gRPC channel
        while the REST API still works).

        Args:
            conversation_id: The conversation ID

        Returns:
            Conversation document as dict, or None if not exists
        """
        from service.firestore.firestore_service import FirestoreService

        global _REST_READ_FALLBACK_ACTIVE
        from config import get_config

        db = FirestoreService.get_db()
        retry, timeout = _interactive_firestore_policy()
        config = get_config()

        if config.FIRESTORE_REST_READ_FALLBACK_ENABLED and _REST_READ_FALLBACK_ACTIVE:
            return _get_conversation_via_rest(db, conversation_id, timeout)

        try:
            doc = (
                db.collection(ConversationRepository.COLLECTION_NAME)
                .document(conversation_id)
                .get(retry=retry, timeout=timeout)
            )
            if doc.exists:
                return doc.to_dict()
            return None
        except Exception as exc:
            if not (config.FIRESTORE_REST_READ_FALLBACK_ENABLED and _is_transient_firestore_error(exc)):
                public = public_tool_error(
                    "CONVERSATION_READ_FAILED",
                    "Conversation could not be read.",
                )
                log_safe_exception(logger, "get_conversation", exc, public)
                raise

            with _REST_READ_FALLBACK_LOCK:
                _REST_READ_FALLBACK_ACTIVE = True
            public = public_tool_error(
                "CONVERSATION_READ_FAILED",
                "Conversation could not be read.",
            )
            log_safe_exception(logger, "get_conversation_grpc", exc, public)
            return _get_conversation_via_rest(db, conversation_id, timeout)

    @staticmethod
    def get_for_user(conversation_id: str, user_id: str) -> Optional[Dict]:
        """
        Get conversation by ID, verifying user ownership.

        Args:
            conversation_id: The conversation ID
            user_id: The user ID (must own the conversation)

        Returns:
            Conversation document as dict, or None if not exists

        Raises:
            PermissionError: If the user doesn't own the conversation
        """
        conv = ConversationRepository.get(conversation_id)
        if conv is None:
            return None
        if conv.get("user_id") != user_id:
            raise PermissionError("User does not own this conversation")
        return conv

    @staticmethod
    def verify_owner(conversation_id: str, user_id: str) -> bool:
        """Verify ownership without downloading the conversation message array."""
        from service.firestore.firestore_service import FirestoreService

        db = FirestoreService.get_db()
        retry, timeout = _interactive_firestore_policy()
        try:
            snapshot = (
                db.collection(ConversationRepository.COLLECTION_NAME)
                .document(conversation_id)
                .get(
                    field_paths=["user_id"],
                    retry=retry,
                    timeout=timeout,
                )
            )
            if not snapshot.exists:
                return False
            owner_id = (snapshot.to_dict() or {}).get("user_id")
        except Exception as exc:
            if not _is_transient_firestore_error(exc):
                raise
            data = _get_conversation_via_rest(
                db,
                conversation_id,
                timeout,
                field_paths=["user_id"],
            )
            if data is None:
                return False
            owner_id = data.get("user_id")

        if owner_id != user_id:
            raise PermissionError("User does not own this conversation")
        return True

    @staticmethod
    def get_by_user(user_id: str) -> List[Dict]:
        """
        Get all conversations for a user.

        Args:
            user_id: The user ID

        Returns:
            List of conversation summaries (id, timestamp, title)
        """
        from google.cloud.firestore_v1 import FieldFilter

        from service.firestore.firestore_service import FirestoreService

        try:
            db = FirestoreService.get_db()
            retry, timeout = _interactive_firestore_policy()
            conversations = (
                db.collection(ConversationRepository.COLLECTION_NAME)
                .where(filter=FieldFilter("user_id", "==", user_id))
                .select(["timestamp", "title"])
                .get(retry=retry, timeout=timeout)
            )

            conversation_list = []
            for conv in conversations:
                conv_data = conv.to_dict()
                title = conv_data.get("title") or "Conversation"
                conversation_list.append(
                    {
                        "id": conv.id,
                        "timestamp": conv_data.get("timestamp"),
                        "title": title,
                    }
                )

            conversation_list.sort(
                key=lambda x: x["timestamp"] if x["timestamp"] else datetime.min,
                reverse=True,
            )
            return conversation_list
        except Exception as e:
            public = public_tool_error(
                "CONVERSATION_LIST_FAILED",
                "Conversations could not be listed.",
            )
            log_safe_exception(logger, "list_conversations", e, public)
            raise

    @staticmethod
    def rename(conversation_id: str, user_id: str, title: str) -> str:
        """
        Rename a conversation. Verifies user ownership.

        Args:
            conversation_id: The conversation ID
            user_id: The user ID (must own the conversation)
            title: New conversation title

        Returns:
            Sanitized title stored on the conversation

        Raises:
            PermissionError: If the user doesn't own the conversation
            ValueError: If conversation is not found
        """
        from service.firestore.firestore_service import FirestoreService

        try:
            db = FirestoreService.get_db()
            conversation_ref = db.collection(ConversationRepository.COLLECTION_NAME).document(conversation_id)
            conversation = conversation_ref.get()

            if not conversation.exists:
                raise ValueError("Conversation not found")

            conv_data = conversation.to_dict()
            if conv_data["user_id"] != user_id:
                raise PermissionError("User does not own this conversation")

            sanitized_title = title.strip()
            conversation_ref.update({"title": sanitized_title})
            logger.info(f"Conversation {conversation_id} renamed successfully")
            return sanitized_title
        except (ValueError, PermissionError):
            raise
        except Exception as e:
            public = public_tool_error(
                "CONVERSATION_RENAME_FAILED",
                "Conversation could not be renamed.",
            )
            log_safe_exception(logger, "rename_conversation", e, public)
            raise

    @staticmethod
    def store_message(
        conversation_id: str,
        sender: str,
        message: str,
        user_id: str,
        tools: List[Dict] = None,
        *,
        thinking: Optional[str] = None,
        timeline: Optional[List[Dict]] = None,
        append: bool = False,
        usage: Optional[Dict] = None,
        turn_id: Optional[str] = None,
        turn_index: Optional[int] = None,
        message_role: Optional[str] = None,
        is_final_assistant_response: Optional[bool] = None,
        tool_trace_summary: Optional[str] = None,
    ) -> None:
        """
        Store a message in a conversation, creating the conversation document if needed.

        The entire read-check-create-append sequence runs inside a Firestore
        transaction (FIX [H14]) so two concurrent ``store_message`` calls for
        the same brand-new ``conversation_id`` cannot race and overwrite each
        other's first message. The transaction serializes writers on the
        document via Firestore's optimistic-concurrency check; the loser
        retries the read-then-write automatically.

        Args:
            conversation_id: The conversation ID
            sender: 'user' or 'ai'
            message: Plain message body (no legacy markers)
            user_id: The user ID (owner)
            tools: Optional list of tools used (for AI messages)
            thinking: Optional reasoning text (AI messages)
            append: If True, merges content/thinking/tools into the last message if it is from the same sender
            usage: Optional dictionary of usage metrics (tokens, budget)
            turn_id: unique turn identifier
            turn_index: index of the current turn
            message_role: role ('user' or 'assistant')
            is_final_assistant_response: whether it is the final assistant response
            tool_trace_summary: optional tool execution summary
        """
        from firebase_admin import firestore

        from service.firestore.firestore_service import FirestoreService

        db = FirestoreService.get_db()
        conversation_ref = db.collection(ConversationRepository.COLLECTION_NAME).document(conversation_id)

        @firestore.transactional
        def _store_in_txn(
            txn,
            ref,
            *,
            sender: str,
            message: str,
            user_id: str,
            tools: Optional[List[Dict]],
            thinking: Optional[str],
            timeline: Optional[List[Dict]],
            append: bool,
            usage: Optional[Dict],
            turn_id: Optional[str],
            turn_index: Optional[int],
            message_role: Optional[str],
            is_final_assistant_response: Optional[bool],
            tool_trace_summary: Optional[str],
        ) -> None:
            snap = ref.get(transaction=txn)
            if snap.exists:
                conv_data = snap.to_dict() or {}
                if conv_data.get("user_id") != user_id:
                    raise PermissionError("User does not own this conversation")
            else:
                # Brand-new conversation. The transaction's optimistic lock
                # guarantees only one writer creates the document; concurrent
                # writers retry and see the freshly-created snapshot, so the
                # append branch (below) handles their message correctly.
                content_str = (message or "").strip()
                preview = content_str[:50] + "..." if len(content_str) > 50 else content_str
                from config import get_config

                title = content_str[: get_config().CONVERSATION_TITLE_MAX_LENGTH]
                txn.set(
                    ref,
                    {
                        "user_id": user_id,
                        "timestamp": datetime.now(timezone.utc),
                        "messages": [],
                        "title": title,
                        "preview": preview,
                    },
                )
                conv_data = {
                    "user_id": user_id,
                    "messages": [],
                    "title": title,
                    "preview": preview,
                }
            if append and snap.exists and conv_data.get("messages"):
                messages_list = conv_data["messages"]
                last_message = messages_list[-1]
                if last_message.get("sender") == sender:
                    orig_content = last_message.get("content", "")
                    new_content = (message or "").strip()
                    if orig_content and new_content:
                        # Smart spacing: if both boundary characters are alphanumeric, insert a space
                        if orig_content[-1].isalnum() and new_content[0].isalnum():
                            last_message["content"] = orig_content + " " + new_content
                        else:
                            last_message["content"] = orig_content + new_content
                    elif new_content:
                        last_message["content"] = new_content
                    if thinking and thinking.strip():
                        orig_thinking = last_message.get("thinking", "")
                        new_thinking = thinking.strip()
                        if orig_thinking:
                            last_message["thinking"] = orig_thinking + "\n" + new_thinking
                        else:
                            last_message["thinking"] = new_thinking
                    if tools:
                        orig_tools = last_message.get("tools", [])
                        last_message["tools"] = orig_tools + tools
                    if timeline:
                        orig_tl = last_message.get("timeline", [])
                        last_message["timeline"] = orig_tl + timeline
                    if usage:
                        last_message["usage"] = usage
                    if turn_id is not None:
                        last_message["turn_id"] = turn_id
                    if turn_index is not None:
                        last_message["turn_index"] = turn_index
                    if message_role is not None:
                        last_message["message_role"] = message_role
                    if is_final_assistant_response is not None:
                        last_message["is_final_assistant_response"] = is_final_assistant_response
                    if tool_trace_summary is not None:
                        last_message["tool_trace_summary"] = tool_trace_summary

                    txn.update(ref, {"messages": messages_list})
                    return

            content = (message or "").strip()

            message_data: Dict = {
                "sender": sender,
                "content": content,
                "timestamp": datetime.now(timezone.utc),
            }

            if sender == "ai" and thinking and thinking.strip():
                message_data["thinking"] = thinking.strip()

            if tools:
                message_data["tools"] = tools

            if timeline:
                message_data["timeline"] = timeline

            if usage:
                message_data["usage"] = usage

            if turn_id is not None:
                message_data["turn_id"] = turn_id
            if turn_index is not None:
                message_data["turn_index"] = turn_index
            if message_role is not None:
                message_data["message_role"] = message_role
            if is_final_assistant_response is not None:
                message_data["is_final_assistant_response"] = is_final_assistant_response
            if tool_trace_summary is not None:
                message_data["tool_trace_summary"] = tool_trace_summary

            txn.update(ref, {"messages": firestore.ArrayUnion([message_data])})

        try:
            transaction = db.transaction()
            _store_in_txn(
                transaction,
                conversation_ref,
                sender=sender,
                message=message,
                user_id=user_id,
                tools=tools,
                thinking=thinking,
                timeline=timeline,
                append=append,
                usage=usage,
                turn_id=turn_id,
                turn_index=turn_index,
                message_role=message_role,
                is_final_assistant_response=is_final_assistant_response,
                tool_trace_summary=tool_trace_summary,
            )
            logger.debug(f"Conversation {conversation_id} updated successfully")
        except PermissionError:
            raise
        except Exception as e:
            public = public_tool_error(
                "CONVERSATION_WRITE_FAILED",
                "Conversation message could not be stored.",
            )
            log_safe_exception(logger, "store_conversation_message", e, public)
            raise

    @staticmethod
    def delete(conversation_id: str, user_id: str) -> bool:
        """
        Delete a conversation and its subcollections (summary blocks, execution results).

        Verifies user ownership before deleting. Best-effort cleans up the
        ``summary_blocks`` and ``execution_results`` subcollections (including
        their ``payload_chunks`` / ``chunks`` grandchild docs) before removing
        the conversation document itself. Subcollection cleanup failures are
        logged but do NOT abort the conversation delete — orphaned chunk docs
        are reclaimed by a periodic janitor job.

        Args:
            conversation_id: The conversation ID
            user_id: The user ID (must own the conversation)

        Returns:
            True if deleted successfully

        Raises:
            PermissionError: If the user doesn't own the conversation
            ValueError: If conversation is not found
        """
        from service.firestore.firestore_service import FirestoreService

        try:
            db = FirestoreService.get_db()
            conversation_ref = db.collection(ConversationRepository.COLLECTION_NAME).document(conversation_id)
            conversation = conversation_ref.get()

            if not conversation.exists:
                raise ValueError("Conversation not found")

            conv_data = conversation.to_dict()
            if conv_data["user_id"] != user_id:
                raise PermissionError("User does not own this conversation")
            try:
                summary_blocks_ref = conversation_ref.collection("summary_blocks")
                summary_docs = summary_blocks_ref.get()
                for doc in summary_docs:
                    for chunk_doc in doc.reference.collection("payload_chunks").get():
                        chunk_doc.reference.delete()
                    doc.reference.delete()
                logger.debug(
                    "Deleted Firestore summary blocks for conversation %s",
                    conversation_id,
                )
            except Exception as blocks_err:
                public = public_tool_error(
                    "SUMMARY_BLOCK_CLEANUP_FAILED",
                    "Summary block cleanup failed.",
                )
                log_safe_exception(logger, "cleanup_summary_blocks", blocks_err, public)
            try:
                execution_results_ref = conversation_ref.collection("execution_results")
                for execution_doc in execution_results_ref.get():
                    for chunk_doc in execution_doc.reference.collection("chunks").get():
                        chunk_doc.reference.delete()
                    execution_doc.reference.delete()
                logger.debug(
                    "Deleted Firestore execution results for conversation %s",
                    conversation_id,
                )
            except Exception as execution_err:
                public = public_tool_error(
                    "EXECUTION_RESULT_CLEANUP_FAILED",
                    "Execution result cleanup failed.",
                )
                log_safe_exception(
                    logger,
                    "cleanup_execution_results",
                    execution_err,
                    public,
                )
            conversation_ref.delete()
            logger.info(f"Conversation {conversation_id} deleted successfully")
            return True
        except (ValueError, PermissionError):
            raise
        except Exception as e:
            public = public_tool_error(
                "CONVERSATION_DELETE_FAILED",
                "Conversation could not be deleted.",
            )
            log_safe_exception(logger, "delete_conversation", e, public)
            raise

    @staticmethod
    def create_memory_cleanup_retry(conversation_id: str, user_id: str, cleanup_error: Exception) -> None:
        """Create a Firestore retry record for failed external memory cleanup."""
        from service.firestore.firestore_service import FirestoreService

        public = public_tool_error(
            "MEMORY_CLEANUP_FAILED",
            "Memory cleanup failed.",
        )
        log_safe_exception(logger, "cleanup_conversation_memory", cleanup_error, public)
        try:
            db = FirestoreService.get_db()
            db.collection("qdrant_conversation_cleanup").add(
                {
                    "type": "qdrant_conversation_cleanup",
                    "conversation_id": conversation_id,
                    "user_id": user_id,
                    "status": "pending",
                    "attempts": 0,
                    "error_code": public.code,
                    "last_error": public.message,
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc),
                }
            )
            logger.info(
                "Created qdrant_conversation_cleanup retry record for conversation %s",
                conversation_id,
            )
        except Exception as db_err:
            persist_public = public_tool_error(
                "MEMORY_CLEANUP_RETRY_PERSIST_FAILED",
                "Memory cleanup retry could not be stored.",
            )
            log_safe_exception(
                logger,
                "create_memory_cleanup_retry",
                db_err,
                persist_public,
            )

    @staticmethod
    def retry_qdrant_cleanups(memory_cleaner) -> int:
        """
        Scan Firestore for pending qdrant_conversation_cleanup records,
        attempt pointer deletion, and update/delete records accordingly.
        Returns the number of successfully cleaned up conversations.
        """
        import asyncio
        import threading

        from google.api_core.retry import Retry
        from google.cloud.firestore_v1 import FieldFilter

        from config import get_config
        from service.firestore.firestore_service import FirestoreService

        db = FirestoreService.get_db()
        timeout = max(
            4.0,
            float(get_config().VAMP_MAINTENANCE_QUERY_TIMEOUT_SECONDS),
        )
        pending_docs = (
            db.collection("qdrant_conversation_cleanup")
            .where(filter=FieldFilter("status", "==", "pending"))
            .get(
                retry=Retry(
                    initial=0.5,
                    maximum=4.0,
                    multiplier=2.0,
                    deadline=max(20.0, timeout + 5.0),
                ),
                timeout=timeout,
            )
        )
        success_count = 0

        for doc in pending_docs:
            doc_data = doc.to_dict()
            conversation_id = doc_data.get("conversation_id")
            user_id = doc_data.get("user_id")
            attempts = doc_data.get("attempts", 0)

            if not conversation_id or not user_id:
                doc.reference.delete()
                continue

            try:
                cleanup_errors: list[BaseException] = []

                def _delete():
                    try:
                        # FIX [M29]: This worker thread's `asyncio.run` creates
                        # a fresh event loop. The underlying
                        # `QdrantVectorMemoryStore.ensure_ready` creates its
                        # `asyncio.Lock` lazily inside the running loop, so
                        # this is safe even when startup `ensure_ready` failed
                        # (which would have bound the old eager lock to the
                        # main loop and raised `RuntimeError: bound to a
                        # different event loop` here).
                        asyncio.run(memory_cleaner.delete_conversation_pointers(conversation_id, user_id))
                    except BaseException as exc:
                        cleanup_errors.append(exc)

                thread = threading.Thread(target=_delete)
                thread.start()
                thread.join()
                if cleanup_errors:
                    raise cleanup_errors[0]
                doc.reference.delete()
                success_count += 1
                logger.info(
                    "Successfully retired cleanup for conversation %s on attempt %s",
                    conversation_id,
                    attempts + 1,
                )
            except Exception as e:
                attempts += 1
                status = "failed" if attempts >= 5 else "pending"
                public = public_tool_error(
                    "MEMORY_CLEANUP_FAILED",
                    "Memory cleanup failed.",
                )
                doc.reference.update(
                    {
                        "attempts": attempts,
                        "status": status,
                        "error_code": public.code,
                        "last_error": public.message,
                        "updated_at": datetime.now(timezone.utc),
                    }
                )
                log_safe_exception(logger, "retry_conversation_memory_cleanup", e, public)

        return success_count
