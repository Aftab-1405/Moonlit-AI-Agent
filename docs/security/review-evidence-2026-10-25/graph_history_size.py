"""Measure actual repository append and real Firestore protobuf size locally."""
import graph_common
import copy
import json
from unittest.mock import patch

from firebase_admin import firestore
from google.api_core.exceptions import InvalidArgument
from google.cloud.firestore_v1 import _helpers
from google.cloud.firestore_v1.types import Document

from api_contract.conversations import ChatRequest
from graph_firestore_double import DB, Ref, transactional
from service.conversations.conversation_repository import ConversationRepository as Repo
from service.firestore.firestore_service import FirestoreService


MAX_DOCUMENT_BYTES = 1_048_576


class LimitedRef(Ref):
    def set(self, data, merge=False):
        old = copy.deepcopy(self.db.docs.get(self.path))
        super().set(data, merge=merge)
        candidate = self.db.docs[self.path]
        content_bytes = sum(len(str(m.get("content", "")).encode("utf-8"))
                            for m in candidate.get("messages", []))
        # A necessary lower bound only: content alone must fit. This does
        # not pretend protobuf encoding equals Firestore's storage formula.
        if content_bytes > MAX_DOCUMENT_BYTES:
            self.db.rejected = {"content_bytes_alone": content_bytes,
                                "messages": len(candidate["messages"]),
                                "protobuf_wire_bytes": Document(fields=_helpers.encode_dict(candidate))._pb.ByteSize()}
            if old is None: self.db.docs.pop(self.path, None)
            else: self.db.docs[self.path] = old
            raise InvalidArgument("Synthetic SDK boundary: document content alone exceeds Firestore 1MiB limit")


class LimitedCollection:
    def __init__(self, db, name): self.db, self.name = db, name
    def document(self, name): return LimitedRef(self.db, self.name + "/" + name)


class LimitedDB(DB):
    def collection(self, name): return LimitedCollection(self, name)


db = LimitedDB()
body = "x" * 16_384
ChatRequest(prompt=body)  # Real request model accepts this payload.
accepted = 0
failure = None
with patch.object(FirestoreService, "get_db", return_value=db), \
     patch.object(firestore, "transactional", transactional):
    for turn in range(1, 41):
        try:
            for sender in ("user", "ai"):
                Repo.store_message("synthetic-conversation", sender, body, "synthetic-user",
                                   turn_index=turn, is_final_assistant_response=sender == "ai")
                accepted += 1
            # Compaction's cursor can advance completely; canonical data
            # remains in the array. This metadata update makes that explicit.
            db.docs["conversations/synthetic-conversation"]["last_summarized_idx"] = accepted
        except InvalidArgument as exc:
            failure = type(exc).__name__
            break
stored = db.docs["conversations/synthetic-conversation"]
assert failure == "InvalidArgument" and db.rejected["content_bytes_alone"] > MAX_DOCUMENT_BYTES
print(json.dumps({"F37": {"per_message_chars": len(body), "request_validation": "accepted",
                         "accepted_messages_before_rejection": accepted,
                         "completed_turns": accepted // 2,
                         "last_summarized_idx": stored["last_summarized_idx"],
                         "document_limit_bytes": MAX_DOCUMENT_BYTES,
                         "rejected_candidate": db.rejected, "boundary_error": failure}}, sort_keys=True))
