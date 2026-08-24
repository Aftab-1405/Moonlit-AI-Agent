"""Behavioral tests for the Firestore-backed task-run ownership fence."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import MappingProxyType

import pytest
from firebase_admin import firestore
from google.api_core.exceptions import Aborted, DeadlineExceeded
from google.cloud.firestore_v1 import LastUpdateOption

from api_contract.run_context import create_checkpoint_generation
from service.conversations import orchestration_access
from service.conversations.orchestration_access import FirestoreConversationTaskStateStore

NOW = datetime(2026, 8, 24, 9, 30, tzinfo=timezone.utc)


class _FrozenDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        return NOW if tz is not None else NOW.replace(tzinfo=None)


class _ImmutableSnapshot:
    def __init__(self, data: dict | None, update_time: int) -> None:
        self._data = MappingProxyType(deepcopy(data or {}))
        self.exists = data is not None
        self.update_time = update_time

    def to_dict(self) -> dict:
        return deepcopy(dict(self._data))


class _FakeDocumentReference:
    """Small immutable-snapshot CAS model of one Firestore document."""

    def __init__(
        self,
        data: dict | None,
        *,
        update_script: list[str] | None = None,
        get_hook=None,
    ) -> None:
        self.data = deepcopy(data) if data is not None else None
        self.update_time = 1
        self.update_script = list(update_script or [])
        self.mutations: list[dict] = []
        self.get_hook = get_hook

    def get(self, **_kwargs) -> _ImmutableSnapshot:
        snapshot = _ImmutableSnapshot(self.data, self.update_time)
        if self.get_hook is not None:
            self.get_hook()
        return snapshot

    def update(self, updates: dict, *, option: LastUpdateOption, **_kwargs) -> None:
        assert option._last_update_time == self.update_time
        action = self.update_script.pop(0) if self.update_script else "commit"
        if action == "abort":
            raise Aborted("scripted compare-and-set conflict")
        self._commit(updates)
        if action == "commit_then_abort":
            raise Aborted("scripted ambiguous commit")
        if action == "commit_then_timeout":
            raise DeadlineExceeded("scripted ambiguous timeout")

    def _commit(self, updates: dict) -> None:
        assert self.data is not None
        next_data = deepcopy(self.data)
        for key, value in updates.items():
            if value is firestore.DELETE_FIELD:
                next_data.pop(key, None)
            else:
                next_data[key] = deepcopy(value)
        self.data = next_data
        self.update_time += 1
        self.mutations.append(deepcopy(updates))


@pytest.fixture
def store(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(orchestration_access, "datetime", _FrozenDateTime)

    def build(data: dict | None, *, update_script: list[str] | None = None):
        ref = _FakeDocumentReference(data, update_script=update_script)
        task_store = FirestoreConversationTaskStateStore()
        monkeypatch.setattr(task_store, "_conversation_ref", lambda _conversation_id: ref)
        return task_store, ref

    return build


def _conversation(**overrides) -> dict:
    conversation = {
        "task_status": "",
        "task_mode": "normal",
        "task_run_fence": 0,
        **overrides,
    }
    if (
        conversation.get("task_status") == "running"
        and "reserved_checkpoint_generation" not in conversation
    ):
        generation = create_checkpoint_generation(
            "user-1:conversation-1",
            conversation["task_run_id"],
            conversation["task_run_fence"],
        )
        conversation["reserved_checkpoint_generation"] = (
            orchestration_access._generation_to_record(generation)
        )
        conversation.setdefault(
            "active_checkpoint_generation",
            orchestration_access._generation_to_record(generation),
        )
    return conversation


def _acquire(task_store, task_mode: str, run_id: str, lease_seconds: int, *, resume=False):
    return task_store.try_acquire_task_run(
        "conversation-1",
        task_mode,
        run_id,
        lease_seconds,
        "user-1:conversation-1",
        resume,
    )


def _store_whose_read_crosses_expiry(monkeypatch, data: dict):
    class _CrossingDateTime(datetime):
        current = NOW

        @classmethod
        def now(cls, tz=None):
            return cls.current if tz is not None else cls.current.replace(tzinfo=None)

    monkeypatch.setattr(orchestration_access, "datetime", _CrossingDateTime)
    ref = _FakeDocumentReference(
        data,
        get_hook=lambda: setattr(_CrossingDateTime, "current", NOW + timedelta(seconds=2)),
    )
    task_store = FirestoreConversationTaskStateStore()
    monkeypatch.setattr(task_store, "_conversation_ref", lambda _conversation_id: ref)
    return task_store, ref


def test_first_acquisition_assigns_first_fence_and_exact_expiry(store) -> None:
    task_store, ref = store(_conversation(task_status="paused_error", task_mode="long_task"))

    result = _acquire(task_store, "tool_task", "run-a", 30)

    expected_expiry = NOW + timedelta(seconds=30)
    assert result.acquired is True
    assert result.run_id == "run-a"
    assert result.fence == 1
    assert result.lease_expires_at == expected_expiry
    assert result.previous_status == "paused_error"
    assert result.previous_task_mode == "long_task"
    assert ref.data["task_run_id"] == "run-a"
    assert ref.data["task_run_fence"] == 1
    assert ref.data["task_lease_expires_at"] == expected_expiry


def test_active_collision_preserves_owner_state_without_mutation(store) -> None:
    expiry = NOW + timedelta(seconds=20)
    original = _conversation(
        task_status="running",
        task_mode="tool_task",
        task_run_id="run-a",
        task_run_fence=7,
        task_lease_expires_at=expiry,
    )
    task_store, ref = store(original)

    result = _acquire(task_store, "long_task", "run-b", 30)

    assert result.acquired is False
    assert result.run_id == "run-b"
    assert result.fence == 7
    assert result.lease_expires_at == expiry
    assert result.previous_status == "running"
    assert result.previous_task_mode == "tool_task"
    assert ref.data == original
    assert ref.mutations == []


def test_expired_takeover_increments_fence_and_replaces_owner(store) -> None:
    task_store, ref = store(
        _conversation(
            task_status="running",
            task_mode="normal",
            task_run_id="run-a",
            task_run_fence=4,
            task_lease_expires_at=NOW - timedelta(microseconds=1),
        )
    )

    result = _acquire(task_store, "long_task", "run-b", 45)

    assert result.acquired is True
    assert result.run_id == "run-b"
    assert result.fence == 5
    assert result.previous_status == "running"
    assert result.previous_task_mode == "normal"
    assert ref.data["task_run_id"] == "run-b"
    assert ref.data["task_run_fence"] == 5


def test_same_attempt_reentry_returns_original_fence_without_extending_lease(store) -> None:
    expiry = NOW + timedelta(seconds=10)
    task_store, ref = store(
        _conversation(
            task_status="running",
            task_mode="tool_task",
            task_run_id="run-a",
            task_run_fence=9,
            task_lease_expires_at=expiry,
            task_run_previous_status="paused_error",
            task_run_previous_mode="long_task",
        )
    )

    result = _acquire(task_store, "tool_task", "run-a", 90)

    assert result.acquired is True
    assert result.run_id == "run-a"
    assert result.fence == 9
    assert result.lease_expires_at == expiry
    assert result.previous_status == "paused_error"
    assert result.previous_task_mode == "long_task"
    assert ref.mutations == []


def test_ambiguous_acquisition_commit_reenters_without_allocating_second_fence(store) -> None:
    task_store, ref = store(_conversation(), update_script=["commit_then_abort"])

    result = _acquire(task_store, "normal", "run-a", 30)

    assert result.acquired is True
    assert result.run_id == "run-a"
    assert result.fence == 1
    assert ref.data["task_run_fence"] == 1
    assert len(ref.mutations) == 1


def test_acquisition_reconciles_commit_then_timeout_without_second_fence(store) -> None:
    task_store, ref = store(
        _conversation(task_status="paused_error", task_mode="long_task"),
        update_script=["commit_then_timeout"],
    )

    result = _acquire(task_store, "tool_task", "run-a", 30)

    assert result == orchestration_access.TaskRunAcquisition(
        acquired=True,
        run_id="run-a",
        fence=1,
        lease_expires_at=NOW + timedelta(seconds=30),
        previous_status="paused_error",
        previous_task_mode="long_task",
        reserved_checkpoint_generation=create_checkpoint_generation(
            "user-1:conversation-1",
            "run-a",
            1,
        ),
        active_checkpoint_generation=None,
    )
    assert ref.data["task_run_fence"] == 1
    assert len(ref.mutations) == 1


def test_expired_same_owner_cannot_renew_or_mutate(store) -> None:
    task_store, ref = store(
        _conversation(
            task_status="running",
            task_run_id="run-a",
            task_run_fence=3,
            task_lease_expires_at=NOW,
        )
    )

    renewed = task_store.renew_task_run("conversation-1", "run-a", 3, 30)
    mutated = task_store.update_task_checkpoint_summary(
        "conversation-1",
        "must-not-write",
        "run-a",
        3,
    )

    assert renewed is False
    assert mutated is False
    assert "task_checkpoint_summary" not in ref.data
    assert ref.data["task_lease_expires_at"] == NOW
    assert ref.mutations == []


def test_renew_cas_retry_rechecks_expiry_at_each_snapshot(monkeypatch) -> None:
    times = iter([NOW, NOW + timedelta(seconds=2)])

    class _SequencedDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            value = next(times)
            return value if tz is not None else value.replace(tzinfo=None)

    monkeypatch.setattr(orchestration_access, "datetime", _SequencedDateTime)
    ref = _FakeDocumentReference(
        _conversation(
            task_status="running",
            task_run_id="run-a",
            task_run_fence=3,
            task_lease_expires_at=NOW + timedelta(seconds=1),
        ),
        update_script=["abort"],
    )
    task_store = FirestoreConversationTaskStateStore()
    monkeypatch.setattr(task_store, "_conversation_ref", lambda _conversation_id: ref)

    renewed = task_store.renew_task_run("conversation-1", "run-a", 3, 30)

    assert renewed is False
    assert ref.data["task_lease_expires_at"] == NOW + timedelta(seconds=1)
    assert ref.mutations == []


def test_acquisition_uses_post_read_time_for_expired_takeover(monkeypatch) -> None:
    task_store, ref = _store_whose_read_crosses_expiry(
        monkeypatch,
        _conversation(
            task_status="running",
            task_mode="normal",
            task_run_id="run-a",
            task_run_fence=4,
            task_lease_expires_at=NOW + timedelta(seconds=1),
        ),
    )

    result = _acquire(task_store, "long_task", "run-b", 30)

    assert result.acquired is True
    assert result.fence == 5
    assert result.lease_expires_at == NOW + timedelta(seconds=32)
    assert ref.data["task_run_id"] == "run-b"
    assert ref.data["task_run_fence"] == 5


def test_renewal_uses_post_read_time_and_cannot_revive_expired_lease(monkeypatch) -> None:
    task_store, ref = _store_whose_read_crosses_expiry(
        monkeypatch,
        _conversation(
            task_status="running",
            task_run_id="run-a",
            task_run_fence=3,
            task_lease_expires_at=NOW + timedelta(seconds=1),
        ),
    )

    renewed = task_store.renew_task_run("conversation-1", "run-a", 3, 30)

    assert renewed is False
    assert ref.data["task_lease_expires_at"] == NOW + timedelta(seconds=1)
    assert ref.mutations == []


def test_owned_mutation_uses_post_read_time_and_rejects_expired_lease(monkeypatch) -> None:
    task_store, ref = _store_whose_read_crosses_expiry(
        monkeypatch,
        _conversation(
            task_status="running",
            task_run_id="run-a",
            task_run_fence=3,
            task_lease_expires_at=NOW + timedelta(seconds=1),
        ),
    )

    updated = task_store.update_task_checkpoint_summary(
        "conversation-1",
        "must-not-write",
        "run-a",
        3,
    )

    assert updated is False
    assert "task_checkpoint_summary" not in ref.data
    assert ref.mutations == []


@pytest.mark.parametrize(
    ("method_name", "args"),
    [
        ("update_task_checkpoint_summary", ("summary",)),
        ("reset_task_checkpoint", ("long_task",)),
        ("update_task_mode", ("long_task",)),
        ("save_paused_task", ("long_task",)),
        ("save_interrupted_task", ("long_task", "error")),
        ("clear_task_status", ("long_task",)),
    ],
)
def test_stale_fence_cannot_mutate_successor_run(store, method_name, args) -> None:
    successor = _conversation(
        task_status="running",
        task_mode="tool_task",
        task_run_id="run-b",
        task_run_fence=12,
        task_lease_expires_at=NOW + timedelta(seconds=30),
    )
    task_store, ref = store(successor)

    updated = getattr(task_store, method_name)("conversation-1", *args, "run-a", 11)

    assert updated is False
    assert ref.data == successor
    assert ref.mutations == []
