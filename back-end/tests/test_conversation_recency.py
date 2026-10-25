from __future__ import annotations

from datetime import datetime, timezone

from service.conversations.conversation_repository import ConversationRepository
from service.firestore.firestore_service import FirestoreService


class _Snapshot:
    def __init__(self, document_id, value, exists=True):
        self.id = document_id
        self._value = value
        self.exists = exists

    def to_dict(self):
        return dict(self._value)


class _ListQuery:
    def __init__(self, snapshots):
        self.snapshots = snapshots
        self.selected = None

    def where(self, **_kwargs):
        return self

    def select(self, fields):
        self.selected = fields
        return self

    def get(self, **_kwargs):
        return self.snapshots


class _Reference:
    def __init__(self, snapshot):
        self.snapshot = snapshot
        self.updates = []

    def get(self, **_kwargs):
        return self.snapshot

    def update(self, value):
        self.updates.append(value)


class _Collection:
    def __init__(self, query=None, reference=None):
        self.query = query
        self.reference = reference

    def where(self, **kwargs):
        return self.query.where(**kwargs)

    def document(self, _document_id):
        return self.reference


class _Transaction:
    def __init__(self):
        self.updates = []

    def update(self, _reference, value):
        self.updates.append(value)

    def set(self, *_args, **_kwargs):
        pass


def test_conversation_list_prefers_updated_at_and_preserves_creation_time(monkeypatch):
    created = datetime(2026, 1, 1, tzinfo=timezone.utc)
    updated = datetime(2026, 9, 1, tzinfo=timezone.utc)
    query = _ListQuery(
        [
            _Snapshot("active", {"title": "Active", "timestamp": created, "updated_at": updated}),
            _Snapshot(
                "newer-created", {"title": "Newer created", "timestamp": datetime(2026, 8, 1, tzinfo=timezone.utc)}
            ),
        ]
    )
    monkeypatch.setattr(
        FirestoreService,
        "get_db",
        lambda: type("DB", (), {"collection": lambda _self, _name: _Collection(query=query)})(),
    )

    result = ConversationRepository.get_by_user("user-1")

    assert query.selected == ["timestamp", "updated_at", "title"]
    assert [item["id"] for item in result] == ["active", "newer-created"]
    assert result[0]["timestamp"] == created
    assert result[0]["updated_at"] == updated
    assert result[1]["updated_at"] == result[1]["timestamp"]


def test_store_message_stamps_conversation_activity(monkeypatch):
    from firebase_admin import firestore

    transaction = _Transaction()
    reference = _Reference(_Snapshot("conversation-1", {"user_id": "user-1", "messages": []}))
    db = type(
        "DB",
        (),
        {
            "collection": lambda _self, _name: _Collection(reference=reference),
            "transaction": lambda _self: transaction,
        },
    )()
    monkeypatch.setattr(FirestoreService, "get_db", lambda: db)
    monkeypatch.setattr(
        firestore,
        "transactional",
        lambda function: lambda txn, *args, **kwargs: function(txn, *args, **kwargs),
    )
    monkeypatch.setattr(firestore, "ArrayUnion", lambda values: values)

    ConversationRepository.store_message("conversation-1", "user", "hello", "user-1")

    assert len(transaction.updates) == 1
    assert isinstance(transaction.updates[0]["updated_at"], datetime)
