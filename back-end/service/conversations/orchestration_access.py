"""Conversation ports exposed to orchestration."""

from datetime import datetime, timedelta, timezone
from typing import Callable

from firebase_admin import firestore
from google.api_core.exceptions import (
    Aborted,
    DeadlineExceeded,
    FailedPrecondition,
    GatewayTimeout,
    RetryError,
    ServiceUnavailable,
)
from google.api_core.retry import Retry
from google.cloud.firestore_v1 import LastUpdateOption

from api_contract.orchestration_protocols import (
    ConversationStateReader,
    ConversationSummarizer,
    ConversationTaskStateStore,
    TaskRunAcquisition,
)
from api_contract.run_context import CheckpointGeneration, create_checkpoint_generation
from service.conversations.conversation_repository import ConversationRepository
from service.conversations.conversation_service import ConversationService
from service.firestore.firestore_service import FirestoreService

_TASK_STATE_RPC_TIMEOUT_SECONDS = 8.0
_TASK_STATE_CAS_ATTEMPTS = 3
_AMBIGUOUS_TASK_STATE_ERRORS = (DeadlineExceeded, GatewayTimeout, ServiceUnavailable)


def _generation_to_record(generation: CheckpointGeneration | None) -> dict | None:
    """Serialize a generation without deriving identity from its physical ID."""
    if generation is None:
        return None
    return {
        "logical_thread_id": generation.logical_thread_id,
        "physical_thread_id": generation.physical_thread_id,
        "run_id": generation.run_id,
        "fence": generation.fence,
        "source_generation": _generation_to_record(generation.source_generation),
    }


def _generation_from_record(value: object) -> CheckpointGeneration | None:
    """Deserialize and validate explicit generation identity fields."""
    if value is None:
        return None
    if not isinstance(value, dict):
        raise RuntimeError("Checkpoint generation state is malformed.")
    try:
        source = _generation_from_record(value.get("source_generation"))
        generation = create_checkpoint_generation(
            str(value["logical_thread_id"]),
            str(value["run_id"]),
            int(value["fence"]),
            source_generation=source,
        )
    except (KeyError, TypeError, ValueError) as error:
        raise RuntimeError("Checkpoint generation state is malformed.") from error
    if value.get("physical_thread_id") != generation.physical_thread_id:
        raise RuntimeError("Checkpoint generation physical identity is invalid.")
    return generation


def _is_ambiguous_task_state_error(error: Exception) -> bool:
    """Return whether a failed RPC may have committed its write durably."""
    if isinstance(error, _AMBIGUOUS_TASK_STATE_ERRORS):
        return True
    return isinstance(error, RetryError) and isinstance(
        error.cause,
        _AMBIGUOUS_TASK_STATE_ERRORS,
    )


def _same_generation_identity(
    left: CheckpointGeneration | None,
    right: CheckpointGeneration | None,
) -> bool:
    """Compare one generation's explicit identity without its prior lineage."""
    if left is None or right is None:
        return False
    return (
        left.logical_thread_id == right.logical_thread_id
        and left.physical_thread_id == right.physical_thread_id
        and left.run_id == right.run_id
        and left.fence == right.fence
    )


def _task_state_retry() -> Retry:
    """Build a Retry policy for Firestore task-state RPCs."""
    return Retry(deadline=_TASK_STATE_RPC_TIMEOUT_SECONDS)


class ConversationOrchestrationAccess:
    """Conversation access backed by conversation services/repositories."""

    def get_conversation(self, conversation_id: str) -> dict | None:
        """Fetch the conversation document by id (no owner check)."""
        return ConversationRepository.get(conversation_id)

    def get_background_summary_pressure(
        self,
        conv_data: dict | None,
        *,
        new_messages: list[dict] | None = None,
        assistant_message: dict | None = None,
        pressure_budget_tokens: int | None = None,
        model_id: str | None = None,
    ) -> dict:
        """Compute unsummarized-tail pressure used to schedule background summarization."""
        from service.conversations.conversation_compaction_service import (
            _get_background_summary_pressure,
        )

        return _get_background_summary_pressure(
            conv_data,
            new_messages=new_messages,
            assistant_message=assistant_message,
            pressure_budget_tokens=pressure_budget_tokens,
            model_id=model_id,
        )

    async def check_and_summarize(
        self,
        conversation_id: str,
        user_id: str,
        model: str | None = None,
        pressure_budget_tokens: int | None = None,
    ) -> dict:
        """Trigger a compaction/summarization pass on the conversation (delegates to ConversationService)."""
        return await ConversationService.check_and_summarize(
            conversation_id,
            user_id,
            model,
            pressure_budget_tokens=pressure_budget_tokens,
        )


class FirestoreConversationTaskStateStore:
    """Conversation task-state persistence backed by Firestore."""

    def _conversation_ref(self, conversation_id: str):
        """Return the Firestore DocumentReference for the given conversation."""
        db = FirestoreService.get_db()
        return db.collection("conversations").document(conversation_id)

    @staticmethod
    def _lease_is_active(data: dict, now: datetime) -> bool:
        """Return True if the task lease in ``data`` has not expired as of ``now``."""
        expires_at = data.get("task_lease_expires_at")
        return bool(expires_at and expires_at > now)

    def try_acquire_task_run(
        self,
        conversation_id: str,
        task_mode: str,
        run_id: str,
        lease_seconds: int,
        logical_thread_id: str,
        resume_checkpoint: bool,
    ) -> TaskRunAcquisition:
        """Acquire a task run lease via Firestore compare-and-set.

        If no active lease exists, atomically marks the conversation as
        ``running`` under ``run_id`` with a lease expiring at
        ``now + lease_seconds``. If a lease is already held by ``run_id``,
        the acquisition succeeds (re-entrant). If a lease is held by a
        different run, the acquisition fails and returns the previous
        status/mode so the caller can decide whether to abort or wait.

        Args:
            conversation_id: Target conversation id.
            task_mode: Mode to record on the run (e.g. ``normal``).
            run_id: Unique id of the run attempting to acquire the lease.
            lease_seconds: Lease duration in seconds.

        Returns:
            TaskRunAcquisition indicating success and the prior status/mode.

        Raises:
            ValueError: If the conversation document does not exist.
            RuntimeError: If the CAS retry budget is exhausted.
        """
        ref = self._conversation_ref(conversation_id)
        for _attempt in range(_TASK_STATE_CAS_ATTEMPTS):
            snapshot = ref.get(
                retry=_task_state_retry(),
                timeout=_TASK_STATE_RPC_TIMEOUT_SECONDS,
            )
            now = datetime.now(timezone.utc)
            data = snapshot.to_dict() if snapshot.exists else {}
            previous_status = data.get("task_status", "")
            previous_task_mode = data.get("task_mode", "normal") or "normal"
            current_fence = max(0, int(data.get("task_run_fence", 0) or 0))
            current_expiry = data.get("task_lease_expires_at")
            active_generation = _generation_from_record(
                data.get("active_checkpoint_generation")
            )
            running_with_active_lease = (
                data.get("task_status") == "running"
                and self._lease_is_active(data, now)
            )
            reserved_generation = None
            if resume_checkpoint or running_with_active_lease:
                reserved_generation = _generation_from_record(
                    data.get("reserved_checkpoint_generation")
                )
            if running_with_active_lease:
                if reserved_generation is None:
                    raise RuntimeError("Active task run has no reserved checkpoint generation.")
                if data.get("task_run_id") == run_id:
                    if resume_checkpoint:
                        source_generation = reserved_generation.source_generation
                        valid_resume_reentry = (
                            data.get("task_run_previous_status")
                            == "resumable_interrupt"
                            and reserved_generation.logical_thread_id
                            == logical_thread_id
                            and reserved_generation.run_id == run_id
                            and reserved_generation.fence == current_fence
                            and source_generation is not None
                            and source_generation.logical_thread_id
                            == logical_thread_id
                            and source_generation.run_id != run_id
                            and source_generation.fence < current_fence
                            and (
                                _same_generation_identity(
                                    active_generation,
                                    source_generation,
                                )
                                or active_generation == reserved_generation
                            )
                        )
                        if not valid_resume_reentry:
                            raise RuntimeError(
                                "Resume requires a quiesced resumable checkpoint source generation."
                            )
                    return TaskRunAcquisition(
                        acquired=True,
                        run_id=run_id,
                        fence=current_fence,
                        lease_expires_at=current_expiry,
                        previous_status=data.get("task_run_previous_status", ""),
                        previous_task_mode=data.get("task_run_previous_mode", "normal") or "normal",
                        reserved_checkpoint_generation=reserved_generation,
                        active_checkpoint_generation=active_generation,
                    )
                return TaskRunAcquisition(
                    acquired=False,
                    run_id=run_id,
                    fence=current_fence,
                    lease_expires_at=current_expiry,
                    previous_status=previous_status,
                    previous_task_mode=previous_task_mode,
                    reserved_checkpoint_generation=reserved_generation,
                    active_checkpoint_generation=active_generation,
                )
            if not snapshot.exists:
                raise ValueError(f"Conversation {conversation_id} does not exist")
            if resume_checkpoint:
                resumable_source_matches = (
                    data.get("task_status") == "resumable_interrupt"
                    and not data.get("task_run_id")
                    and data.get("task_lease_expires_at") is None
                    and active_generation is not None
                    and reserved_generation == active_generation
                    and active_generation.logical_thread_id == logical_thread_id
                    and active_generation.fence == current_fence
                )
                if not resumable_source_matches:
                    raise RuntimeError(
                        "Resume requires a quiesced resumable checkpoint source generation."
                    )
            next_fence = current_fence + 1
            lease_expires_at = now + timedelta(seconds=max(1, lease_seconds))
            source_generation = None
            if resume_checkpoint and active_generation is not None:
                source_generation = CheckpointGeneration(
                    logical_thread_id=active_generation.logical_thread_id,
                    physical_thread_id=active_generation.physical_thread_id,
                    run_id=active_generation.run_id,
                    fence=active_generation.fence,
                )
            reserved_generation = create_checkpoint_generation(
                logical_thread_id,
                run_id,
                next_fence,
                source_generation=source_generation,
            )
            reserved_record = _generation_to_record(reserved_generation)
            try:
                ref.update(
                    {
                        "task_status": "running",
                        "task_mode": task_mode,
                        "task_run_id": run_id,
                        "task_run_fence": next_fence,
                        "task_run_previous_status": previous_status,
                        "task_run_previous_mode": previous_task_mode,
                        "task_status_updated_at": now,
                        "task_lease_expires_at": lease_expires_at,
                        "reserved_checkpoint_generation": reserved_record,
                    },
                    option=LastUpdateOption(snapshot.update_time),
                    retry=_task_state_retry(),
                    timeout=_TASK_STATE_RPC_TIMEOUT_SECONDS,
                )
                return TaskRunAcquisition(
                    acquired=True,
                    run_id=run_id,
                    fence=next_fence,
                    lease_expires_at=lease_expires_at,
                    previous_status=previous_status,
                    previous_task_mode=previous_task_mode,
                    reserved_checkpoint_generation=reserved_generation,
                    active_checkpoint_generation=active_generation,
                )
            except (Aborted, FailedPrecondition):
                continue
            except Exception as write_error:
                if not _is_ambiguous_task_state_error(write_error):
                    raise
                try:
                    reconciliation = ref.get(
                        retry=_task_state_retry(),
                        timeout=_TASK_STATE_RPC_TIMEOUT_SECONDS,
                    )
                except Exception as read_error:
                    if not _is_ambiguous_task_state_error(read_error):
                        raise
                    continue
                reconciled_at = datetime.now(timezone.utc)
                reconciled = reconciliation.to_dict() if reconciliation.exists else {}
                committed = (
                    reconciled.get("task_status") == "running"
                    and reconciled.get("task_mode") == task_mode
                    and reconciled.get("task_run_id") == run_id
                    and reconciled.get("task_run_fence") == next_fence
                    and reconciled.get("task_lease_expires_at") == lease_expires_at
                    and reconciled.get("task_run_previous_status") == previous_status
                    and reconciled.get("task_run_previous_mode") == previous_task_mode
                    and reconciled.get("reserved_checkpoint_generation") == reserved_record
                    and self._lease_is_active(reconciled, reconciled_at)
                )
                if committed:
                    return TaskRunAcquisition(
                        acquired=True,
                        run_id=run_id,
                        fence=next_fence,
                        lease_expires_at=lease_expires_at,
                        previous_status=previous_status,
                        previous_task_mode=previous_task_mode,
                        reserved_checkpoint_generation=reserved_generation,
                        active_checkpoint_generation=active_generation,
                    )
                continue
        raise RuntimeError("Could not acquire task lease after concurrent updates")

    def activate_checkpoint_generation(
        self,
        conversation_id: str,
        generation: CheckpointGeneration,
        run_id: str,
        fence: int,
    ) -> bool:
        """Owner-CAS select a completely prepared reserved generation."""
        reserved_record = _generation_to_record(generation)
        ref = self._conversation_ref(conversation_id)
        for _attempt in range(_TASK_STATE_CAS_ATTEMPTS):
            snapshot = ref.get(
                retry=_task_state_retry(),
                timeout=_TASK_STATE_RPC_TIMEOUT_SECONDS,
            )
            checked_at = datetime.now(timezone.utc)
            data = snapshot.to_dict() if snapshot.exists else {}
            if data.get("task_run_id") != run_id or data.get("task_run_fence") != fence:
                return False
            if data.get("task_status") != "running" or not self._lease_is_active(data, checked_at):
                return False
            if data.get("reserved_checkpoint_generation") != reserved_record:
                return False
            if data.get("active_checkpoint_generation") == reserved_record:
                return True
            try:
                ref.update(
                    {"active_checkpoint_generation": reserved_record},
                    option=LastUpdateOption(snapshot.update_time),
                    retry=_task_state_retry(),
                    timeout=_TASK_STATE_RPC_TIMEOUT_SECONDS,
                )
                return True
            except (Aborted, FailedPrecondition):
                continue
            except Exception as write_error:
                if not _is_ambiguous_task_state_error(write_error):
                    raise
                try:
                    reconciliation = ref.get(
                        retry=_task_state_retry(),
                        timeout=_TASK_STATE_RPC_TIMEOUT_SECONDS,
                    )
                except Exception as read_error:
                    if not _is_ambiguous_task_state_error(read_error):
                        raise
                    continue
                reconciled_at = datetime.now(timezone.utc)
                reconciled = reconciliation.to_dict() if reconciliation.exists else {}
                owner_matches = (
                    reconciled.get("task_run_id") == run_id
                    and reconciled.get("task_run_fence") == fence
                )
                if not owner_matches:
                    return False
                if (
                    reconciled.get("task_status") != "running"
                    or not self._lease_is_active(reconciled, reconciled_at)
                    or reconciled.get("reserved_checkpoint_generation") != reserved_record
                ):
                    return False
                if reconciled.get("active_checkpoint_generation") == reserved_record:
                    return True
                continue
        raise RuntimeError("Could not activate checkpoint generation after concurrent updates")

    def renew_task_run(
        self,
        conversation_id: str,
        run_id: str,
        fence: int,
        lease_seconds: int,
    ) -> bool:
        """Extend an unexpired task run owned by ``(run_id, fence)``."""
        return self._update_if_owner(
            conversation_id,
            run_id,
            fence,
            lambda checked_at: {
                "task_status_updated_at": checked_at,
                "task_lease_expires_at": checked_at + timedelta(seconds=max(1, lease_seconds)),
            },
        )

    def update_task_checkpoint_summary(
        self,
        conversation_id: str,
        summary: str,
        run_id: str,
        fence: int,
    ) -> bool:
        """Persist the latest checkpoint summary for an owned task run."""
        return self._update_if_owner(
            conversation_id,
            run_id,
            fence,
            {"task_checkpoint_summary": summary},
        )

    def _update_if_owner(
        self,
        conversation_id: str,
        run_id: str,
        fence: int,
        updates: dict | Callable[[datetime], dict],
        *,
        require_active_reserved_match: bool = False,
        committed_state_matches: Callable[[dict], bool] | None = None,
    ) -> bool:
        """Apply an owned update and optionally reconcile an ambiguous commit."""
        ref = self._conversation_ref(conversation_id)
        for _attempt in range(_TASK_STATE_CAS_ATTEMPTS):
            snapshot = ref.get(
                retry=_task_state_retry(),
                timeout=_TASK_STATE_RPC_TIMEOUT_SECONDS,
            )
            checked_at = datetime.now(timezone.utc)
            data = snapshot.to_dict() if snapshot.exists else {}
            if committed_state_matches is not None and committed_state_matches(data):
                return True
            if data.get("task_run_id") != run_id or data.get("task_run_fence") != fence:
                return False
            if data.get("task_status") != "running" or not self._lease_is_active(data, checked_at):
                return False
            if require_active_reserved_match and (
                data.get("active_checkpoint_generation") is None
                or data.get("active_checkpoint_generation")
                != data.get("reserved_checkpoint_generation")
            ):
                return False
            resolved_updates = updates(checked_at) if callable(updates) else updates
            try:
                ref.update(
                    resolved_updates,
                    option=LastUpdateOption(snapshot.update_time),
                    retry=_task_state_retry(),
                    timeout=_TASK_STATE_RPC_TIMEOUT_SECONDS,
                )
                return True
            except (Aborted, FailedPrecondition):
                continue
            except Exception as write_error:
                if committed_state_matches is None or not _is_ambiguous_task_state_error(write_error):
                    raise
                try:
                    reconciliation = ref.get(
                        retry=_task_state_retry(),
                        timeout=_TASK_STATE_RPC_TIMEOUT_SECONDS,
                    )
                except Exception as read_error:
                    if not _is_ambiguous_task_state_error(read_error):
                        raise
                    continue
                reconciled = reconciliation.to_dict() if reconciliation.exists else {}
                if committed_state_matches(reconciled):
                    return True
                continue
        raise RuntimeError("Could not update task lease after concurrent updates")

    def reset_task_checkpoint(
        self,
        conversation_id: str,
        task_mode: str,
        run_id: str,
        fence: int,
    ) -> bool:
        """Clear the checkpoint summary and set a fresh task mode for the run."""
        return self._update_if_owner(
            conversation_id,
            run_id,
            fence,
            {"task_checkpoint_summary": "", "task_mode": task_mode},
        )

    def update_task_mode(
        self,
        conversation_id: str,
        task_mode: str,
        run_id: str,
        fence: int,
    ) -> bool:
        """Update the task mode for an owned, in-flight task run."""
        return self._update_if_owner(
            conversation_id,
            run_id,
            fence,
            {"task_mode": task_mode},
        )

    def save_paused_task(
        self,
        conversation_id: str,
        task_mode: str,
        run_id: str,
        fence: int,
    ) -> bool:
        """Publish a quiesced resumable checkpoint source and clear its lease."""
        paused_at = datetime.now(timezone.utc)

        def pause_is_committed(data: dict) -> bool:
            active_record = data.get("active_checkpoint_generation")
            if not (
                data.get("task_status") == "resumable_interrupt"
                and data.get("task_mode") == task_mode
                and data.get("task_status_updated_at") == paused_at
                and data.get("task_run_fence") == fence
                and "task_run_id" not in data
                and "task_lease_expires_at" not in data
                and "task_run_previous_status" not in data
                and "task_run_previous_mode" not in data
                and active_record == data.get("reserved_checkpoint_generation")
            ):
                return False
            active_generation = _generation_from_record(active_record)
            return bool(
                active_generation is not None
                and active_generation.run_id == run_id
                and active_generation.fence == fence
            )

        return self._update_if_owner(
            conversation_id,
            run_id,
            fence,
            {
                "task_status": "resumable_interrupt",
                "task_mode": task_mode,
                "task_status_updated_at": paused_at,
                "task_run_id": firestore.DELETE_FIELD,
                "task_lease_expires_at": firestore.DELETE_FIELD,
                "task_run_previous_status": firestore.DELETE_FIELD,
                "task_run_previous_mode": firestore.DELETE_FIELD,
            },
            require_active_reserved_match=True,
            committed_state_matches=pause_is_committed,
        )

    def save_interrupted_task(
        self,
        conversation_id: str,
        task_mode: str,
        reason: str,
        run_id: str,
        fence: int,
    ) -> bool:
        """Persist an interrupted (cancelled/error) task run and clear the lease."""
        safe_reason = reason if reason in {"cancelled", "error"} else "error"
        return self._update_if_owner(
            conversation_id,
            run_id,
            fence,
            {
                "task_status": f"paused_{safe_reason}",
                "task_mode": task_mode,
                "task_status_updated_at": datetime.now(timezone.utc),
                "task_run_id": firestore.DELETE_FIELD,
                "task_lease_expires_at": firestore.DELETE_FIELD,
                "task_run_previous_status": firestore.DELETE_FIELD,
                "task_run_previous_mode": firestore.DELETE_FIELD,
            },
        )

    def clear_task_status(
        self,
        conversation_id: str,
        task_mode: str,
        run_id: str,
        fence: int,
    ) -> bool:
        """Reset the conversation to idle (no task running) and clear lease fields."""
        return self._update_if_owner(
            conversation_id,
            run_id,
            fence,
            {
                "task_status": "",
                "task_mode": task_mode,
                "task_run_id": firestore.DELETE_FIELD,
                "task_lease_expires_at": firestore.DELETE_FIELD,
                "task_run_previous_status": firestore.DELETE_FIELD,
                "task_run_previous_mode": firestore.DELETE_FIELD,
            },
        )


def create_conversation_state_reader() -> ConversationStateReader:
    """Build the ConversationStateReader port implementation."""
    return ConversationOrchestrationAccess()


def create_conversation_summarizer() -> ConversationSummarizer:
    """Build the ConversationSummarizer port implementation."""
    return ConversationOrchestrationAccess()


def create_conversation_task_state_store() -> ConversationTaskStateStore:
    """Build the ConversationTaskStateStore port implementation."""
    return FirestoreConversationTaskStateStore()
