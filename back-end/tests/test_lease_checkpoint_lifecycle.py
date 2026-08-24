"""Clock-controlled lifecycle tests for task-run leases and run fences."""

from __future__ import annotations

import asyncio
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from api_contract.orchestration_protocols import TaskRunAcquisition
from api_contract.run_context import create_checkpoint_generation
from api_contract.runtime_ports import register_port
from langgraph_orchestration.stream_lifecycle import TaskRunLease

WALL_NOW = datetime(2026, 8, 24, 10, 0, tzinfo=timezone.utc)


class FakeMonotonicClock:
    """A manually advanced clock whose waiters share one asyncio lock."""

    def __init__(self, initial: float = 0.0) -> None:
        self.now = initial
        self._condition = asyncio.Condition()

    def __call__(self) -> float:
        return self.now

    async def wait_until(self, deadline: float, stop_event: asyncio.Event) -> bool:
        async with self._condition:
            await self._condition.wait_for(lambda: self.now >= deadline or stop_event.is_set())
        return stop_event.is_set()

    async def advance_to(self, value: float) -> None:
        assert value >= self.now
        async with self._condition:
            self.now = value
            self._condition.notify_all()


class ScriptedTaskStateStore:
    """Deterministic synchronous store double used through the real to-thread boundary."""

    def __init__(
        self,
        loop: asyncio.AbstractEventLoop,
        *,
        renew_script: list[str] | None = None,
        fence: int = 1,
    ) -> None:
        self.loop = loop
        self.owner = "run-a"
        self.fence = fence
        self.lease_expires_at = WALL_NOW + timedelta(seconds=10)
        self.renew_script = list(renew_script or [])
        self.mutations: list[tuple] = []
        self.renew_observed = asyncio.Event()
        self.renew_finished = asyncio.Event()
        self.block_renewal = False
        self.renew_release = threading.Event()
        self._lock = threading.Lock()

    def try_acquire_task_run(
        self,
        conversation_id,
        task_mode,
        run_id,
        lease_seconds,
        logical_thread_id,
        resume_checkpoint,
    ):
        del resume_checkpoint
        with self._lock:
            self.owner = run_id
            self.mutations.append(("acquire", conversation_id, run_id, self.fence))
            generation = create_checkpoint_generation(logical_thread_id, run_id, self.fence)
            return TaskRunAcquisition(
                acquired=True,
                run_id=run_id,
                fence=self.fence,
                lease_expires_at=self.lease_expires_at,
                previous_status="",
                previous_task_mode=task_mode,
                reserved_checkpoint_generation=generation,
                active_checkpoint_generation=None,
            )

    def renew_task_run(self, conversation_id, run_id, fence, lease_seconds):
        with self._lock:
            action = self.renew_script.pop(0) if self.renew_script else "success"
            self.mutations.append(("renew", conversation_id, run_id, fence, action))
        self.loop.call_soon_threadsafe(self.renew_observed.set)
        if self.block_renewal:
            self.renew_release.wait()
        if action == "failure":
            self.loop.call_soon_threadsafe(self.renew_finished.set)
            raise RuntimeError("scripted renewal outage")
        if action == "ambiguous":
            with self._lock:
                self.lease_expires_at += timedelta(seconds=lease_seconds)
            self.loop.call_soon_threadsafe(self.renew_finished.set)
            raise TimeoutError("scripted ambiguous renewal")
        if action == "lost":
            self.loop.call_soon_threadsafe(self.renew_finished.set)
            return False
        with self._lock:
            self.lease_expires_at += timedelta(seconds=lease_seconds)
        self.loop.call_soon_threadsafe(self.renew_finished.set)
        return True

    def reset_task_checkpoint(self, conversation_id, task_mode, run_id, fence):
        return self._owned("reset", conversation_id, run_id, fence)

    def activate_checkpoint_generation(
        self,
        conversation_id,
        generation,
        run_id,
        fence,
    ):
        return self._owned("activate_generation", conversation_id, run_id, fence, generation)

    def update_task_checkpoint_summary(self, conversation_id, summary, run_id, fence):
        return self._owned("checkpoint", conversation_id, run_id, fence, summary)

    def update_task_mode(self, conversation_id, task_mode, run_id, fence):
        return self._owned("mode", conversation_id, run_id, fence, task_mode)

    def save_paused_task(self, conversation_id, task_mode, run_id, fence):
        return self._owned("pause", conversation_id, run_id, fence)

    def save_interrupted_task(self, conversation_id, task_mode, reason, run_id, fence):
        return self._owned("interrupt", conversation_id, run_id, fence, reason)

    def clear_task_status(self, conversation_id, task_mode, run_id, fence):
        return self._owned("complete", conversation_id, run_id, fence)

    def _owned(self, operation, conversation_id, run_id, fence, *extra):
        with self._lock:
            allowed = self.owner == run_id and self.fence == fence
            if allowed:
                self.mutations.append((operation, conversation_id, run_id, fence, *extra))
            return allowed


async def _eventually(predicate) -> None:
    """Yield through scheduled callbacks until an observable state transition occurs."""
    loop = asyncio.get_running_loop()
    for _attempt in range(100):
        if predicate():
            return
        resumed = loop.create_future()
        loop.call_soon(resumed.set_result, None)
        await resumed
    pytest.fail("expected lifecycle state transition did not occur")


def _lease(
    store: ScriptedTaskStateStore,
    clock: FakeMonotonicClock,
    *,
    lease_seconds: int = 10,
    renew_interval_seconds: int = 2,
) -> TaskRunLease:
    from api_contract.run_context import RunControl

    register_port("conversation_task_state_store", store)
    control = RunControl(deadline_monotonic=100.0, tool_limit=20)
    return TaskRunLease(
        "conversation-1",
        "user-1:conversation-1",
        "normal",
        "run-a",
        control,
        resume_checkpoint=False,
        lease_seconds=lease_seconds,
        renew_interval_seconds=renew_interval_seconds,
        monotonic=clock,
        utcnow=lambda: WALL_NOW,
        wait_until=clock.wait_until,
    )


@pytest.mark.asyncio
async def test_successful_renewal_deadline_is_anchored_before_store_call() -> None:
    loop = asyncio.get_running_loop()
    clock = FakeMonotonicClock()
    store = ScriptedTaskStateStore(loop)
    store.block_renewal = True
    lease = _lease(store, clock)
    await lease.acquire()

    await clock.advance_to(2.0)
    await store.renew_observed.wait()
    await clock.advance_to(6.0)
    store.renew_release.set()
    await store.renew_finished.wait()
    await _eventually(lambda: lease.confirmed_deadline_monotonic == 12.0)

    assert lease.confirmed_deadline_monotonic == 12.0
    assert lease.acquired is True
    await lease.close()


@pytest.mark.asyncio
async def test_renewal_failure_cancels_before_last_confirmed_deadline() -> None:
    loop = asyncio.get_running_loop()
    clock = FakeMonotonicClock()
    store = ScriptedTaskStateStore(loop, renew_script=["failure"])
    lease = _lease(store, clock)
    cancelled = asyncio.Event()

    async def stream_work() -> None:
        lease.register_stream_task(asyncio.current_task())
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    await lease.acquire()
    stream_task = asyncio.create_task(stream_work())
    await clock.advance_to(2.0)
    await store.renew_finished.wait()
    assert lease.confirmed_deadline_monotonic == 10.0

    await clock.advance_to(10.0)
    await cancelled.wait()

    assert stream_task.cancelled()
    assert lease.acquired is False
    assert lease.run_control.ownership_lost is True
    await lease.close()


@pytest.mark.asyncio
async def test_blocked_renewal_cancels_at_last_confirmed_deadline() -> None:
    loop = asyncio.get_running_loop()
    clock = FakeMonotonicClock()
    store = ScriptedTaskStateStore(loop)
    store.block_renewal = True
    lease = _lease(store, clock)
    cancelled = asyncio.Event()

    async def stream_work() -> None:
        lease.register_stream_task(asyncio.current_task())
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    await lease.acquire()
    stream_task = asyncio.create_task(stream_work())
    try:
        await clock.advance_to(2.0)
        await store.renew_observed.wait()
        await clock.advance_to(10.0)
        await _eventually(lambda: not lease.acquired)
        await cancelled.wait()

        assert stream_task.cancelled()
        assert lease.run_control.ownership_lost is True
    finally:
        store.renew_release.set()
        await lease.close()


@pytest.mark.asyncio
async def test_ambiguous_renewal_never_extends_local_deadline() -> None:
    loop = asyncio.get_running_loop()
    clock = FakeMonotonicClock()
    store = ScriptedTaskStateStore(loop, renew_script=["ambiguous"])
    lease = _lease(store, clock)
    await lease.acquire()

    await clock.advance_to(2.0)
    await store.renew_finished.wait()

    assert store.lease_expires_at == WALL_NOW + timedelta(seconds=20)
    assert lease.confirmed_deadline_monotonic == 10.0
    await lease.close()


@pytest.mark.asyncio
async def test_ownership_theft_before_registration_cancels_before_graph_entry() -> None:
    loop = asyncio.get_running_loop()
    clock = FakeMonotonicClock()
    store = ScriptedTaskStateStore(loop, renew_script=["lost"])
    lease = _lease(store, clock)
    acquired = asyncio.Event()
    allow_registration = asyncio.Event()
    graph_entered = False

    async def stream_work() -> None:
        nonlocal graph_entered
        await lease.acquire()
        acquired.set()
        await allow_registration.wait()
        lease.register_stream_task(asyncio.current_task())
        await asyncio.Event().wait()
        lease.ensure_owned()
        graph_entered = True

    stream_task = asyncio.create_task(stream_work())
    await acquired.wait()
    await clock.advance_to(2.0)
    await store.renew_finished.wait()
    await _eventually(lambda: not lease.acquired)
    allow_registration.set()

    with pytest.raises(asyncio.CancelledError):
        await stream_task
    assert graph_entered is False
    assert lease.acquired is False
    await lease.close()


@pytest.mark.asyncio
async def test_local_expiry_closes_mutation_fence_without_a_renewal_result() -> None:
    loop = asyncio.get_running_loop()
    clock = FakeMonotonicClock()
    store = ScriptedTaskStateStore(loop)
    lease = _lease(store, clock, renew_interval_seconds=20)
    await lease.acquire()

    await clock.advance_to(10.0)
    await _eventually(lambda: not lease.acquired)

    with pytest.raises(RuntimeError, match="lease"):
        lease.ensure_owned()
    assert lease.acquired is False
    await lease.close()


@pytest.mark.asyncio
async def test_close_is_idempotent_and_leaves_no_renewal_task() -> None:
    loop = asyncio.get_running_loop()
    clock = FakeMonotonicClock()
    store = ScriptedTaskStateStore(loop)
    lease = _lease(store, clock)
    await lease.acquire()
    lease.register_stream_task(asyncio.current_task())
    renewal_task = lease._renew_task

    await asyncio.gather(lease.close(), lease.close())

    assert lease._closed is True
    assert lease._renew_task is None
    assert lease._stream_task is None
    assert renewal_task is not None and renewal_task.done()


@pytest.mark.asyncio
async def test_concurrent_close_waiters_share_blocked_renewal_cleanup() -> None:
    loop = asyncio.get_running_loop()
    clock = FakeMonotonicClock()
    store = ScriptedTaskStateStore(loop)
    store.block_renewal = True
    lease = _lease(store, clock)
    await lease.acquire()
    await clock.advance_to(2.0)
    await store.renew_observed.wait()

    first_close = asyncio.create_task(lease.close())
    await _eventually(lambda: lease._closed)
    second_close = asyncio.create_task(lease.close())
    try:
        for _attempt in range(10):
            resumed = loop.create_future()
            loop.call_soon(resumed.set_result, None)
            await resumed
        assert first_close.done() is False
        assert second_close.done() is False

        first_close.cancel()
        await _eventually(first_close.done)
        with pytest.raises(asyncio.CancelledError):
            await first_close
        assert second_close.done() is False

        store.renew_release.set()
        await second_close
        assert lease._renew_task is None
        assert lease._close_task is None
        assert [mutation[0] for mutation in store.mutations].count("renew") == 1
    finally:
        store.renew_release.set()
        await asyncio.gather(first_close, second_close, return_exceptions=True)


def test_run_control_rejects_expired_cancelled_and_fenced_mutations() -> None:
    from api_contract.run_context import RunControl

    control = RunControl(deadline_monotonic=10.0, tool_limit=2)
    assert control.remaining_seconds(now=4.0) == 6.0
    control.ensure_mutation_allowed(now=9.999)

    with pytest.raises(RuntimeError, match="deadline"):
        control.ensure_mutation_allowed(now=10.0)

    cancelled = RunControl(deadline_monotonic=10.0, tool_limit=2)
    cancelled.cancel("client_disconnect")
    with pytest.raises(RuntimeError, match="client_disconnect"):
        cancelled.ensure_mutation_allowed(now=1.0)

    fenced = RunControl(deadline_monotonic=10.0, tool_limit=2)
    fenced.mark_ownership_lost()
    with pytest.raises(RuntimeError, match="ownership"):
        fenced.ensure_mutation_allowed(now=1.0)


def test_run_control_reserves_each_action_once_and_enforces_tool_limit() -> None:
    from api_contract.run_context import RunControl

    control = RunControl(deadline_monotonic=time.monotonic() + 100.0, tool_limit=2)

    assert control.reserve_tool_call("action-1") is True
    assert control.reserve_tool_call("action-1") is False
    assert control.reserve_tool_call("action-2") is True
    with pytest.raises(RuntimeError, match="tool call budget"):
        control.reserve_tool_call("action-3")


def test_run_control_tool_reservations_are_atomic_across_threads() -> None:
    from api_contract.run_context import RunControl

    control = RunControl(deadline_monotonic=time.monotonic() + 100.0, tool_limit=20)
    workers = 30
    barrier = threading.Barrier(workers)

    def reserve(index: int) -> bool:
        barrier.wait()
        try:
            return control.reserve_tool_call(f"action-{index}")
        except RuntimeError:
            return False

    with ThreadPoolExecutor(max_workers=workers) as executor:
        outcomes = list(executor.map(reserve, range(workers)))

    assert outcomes.count(True) == 20
    assert outcomes.count(False) == 10


@pytest.mark.asyncio
async def test_stream_registers_current_task_before_prompt_or_graph_setup(monkeypatch) -> None:
    from langgraph_orchestration import stream_conversation as stream_module
    from service.conversations.run_context import resolve_run_policy

    register_port(
        "conversation_task_state_store",
        ScriptedTaskStateStore(asyncio.get_running_loop()),
    )
    observed_registration: list[bool] = []

    class FakeLease:
        instance = None

        def __init__(self, *_args, **_kwargs) -> None:
            self.acquired = False
            self.registered_task = None
            self.run_id = "run-a"
            self.fence = 1
            FakeLease.instance = self

        async def acquire(self):
            self.acquired = True
            generation = create_checkpoint_generation(
                "user-1:conversation-1",
                self.run_id,
                self.fence,
            )
            return TaskRunAcquisition(
                acquired=True,
                run_id=self.run_id,
                fence=self.fence,
                lease_expires_at=WALL_NOW + timedelta(seconds=30),
                previous_status="",
                previous_task_mode="normal",
                reserved_checkpoint_generation=generation,
                active_checkpoint_generation=None,
            )

        def register_stream_task(self, task) -> None:
            self.registered_task = task

        def ensure_owned(self) -> None:
            return None

        async def reset_checkpoint(self):
            return True

        async def interrupt(self, _reason):
            self.acquired = False
            return True

        async def close(self):
            return None

    def stop_after_observation(*_args, **_kwargs):
        observed_registration.append(FakeLease.instance.registered_task is asyncio.current_task())
        raise RuntimeError("stop after registration observation")

    monkeypatch.setattr(stream_module, "TaskRunLease", FakeLease)
    monkeypatch.setattr(
        stream_module.PromptBuilder,
        "build_system_prompt",
        staticmethod(stop_after_observation),
    )
    policy = resolve_run_policy(
        "hello",
        "normal",
        None,
        "bedrock",
        "provider.model-v1",
        False,
    )

    _events = [
        event
        async for event in stream_module.stream_conversation(
            "conversation-1",
            "hello",
            "user-1",
            run_policy=policy,
        )
    ]

    assert observed_registration == [True]


@pytest.mark.asyncio
async def test_checkpoint_summary_mutation_uses_run_id_and_fence(monkeypatch) -> None:
    from langgraph_orchestration import stream_conversation as stream_module

    loop = asyncio.get_running_loop()
    store = ScriptedTaskStateStore(loop, fence=8)
    register_port("conversation_task_state_store", store)

    class FakeAgent:
        def __init__(self) -> None:
            self.state_updates = []

        async def aget_state(self, _config):
            return SimpleNamespace(values={"messages": [{"id": "m1", "type": "human", "content": "old"}]})

        async def aupdate_state(self, _config, update):
            self.state_updates.append(update)

    async def summary(*_args, **_kwargs):
        return "fenced summary"

    monkeypatch.setattr(
        stream_module,
        "truncate_messages_to_budget",
        lambda messages, budget, model_id=None: (messages, []),
    )
    monkeypatch.setattr(stream_module, "generate_task_checkpoint_summary", summary)
    monkeypatch.setattr(
        stream_module,
        "_cached_conversation_reader",
        lambda: SimpleNamespace(get_conversation=lambda _conversation_id: {}),
    )
    agent = FakeAgent()
    config = {
        "configurable": {
            "model": "mock-model",
            "task_checkpoint_summary": "",
            "task_run_id": "run-a",
            "task_run_fence": 8,
        }
    }

    await stream_module.check_and_perform_compaction(
        agent,
        config,
        "conversation-1",
        object(),
        100,
    )

    assert ("checkpoint", "conversation-1", "run-a", 8, "fenced summary") in store.mutations
    assert config["configurable"]["task_checkpoint_summary"] == "fenced summary"
    assert agent.state_updates
