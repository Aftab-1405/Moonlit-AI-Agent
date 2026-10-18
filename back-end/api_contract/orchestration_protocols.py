"""Agent orchestration protocols."""

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol, runtime_checkable

from api_contract.run_context import CheckpointGeneration


@dataclass(frozen=True)
class TaskRunAcquisition:
    """Result of attempting to acquire a conversation's task-run execution lease."""

    acquired: bool
    run_id: str
    fence: int
    lease_expires_at: datetime
    previous_status: str
    previous_task_mode: str
    reserved_checkpoint_generation: CheckpointGeneration
    active_checkpoint_generation: CheckpointGeneration | None


@runtime_checkable
class HistoricalContextProvider(Protocol):
    """Port for retrieving historical context for an agent turn."""

    async def retrieve_context(
        self,
        conversation_id: str,
        user_id: str,
        user_prompt: str,
        *,
        model_id: str | None = None,
        token_budget: int | None = None,
    ) -> str:
        """Return formatted historical context relevant to the prompt."""


@runtime_checkable
class ConversationStateReader(Protocol):
    """Port for reading persisted conversation state."""

    def get_conversation(self, conversation_id: str) -> dict | None:
        """Return a conversation document by id."""


@runtime_checkable
class ConversationSummarizer(Protocol):
    """Port for updating conversation summaries before orchestration."""

    def get_background_summary_pressure(
        self,
        conv_data: dict | None,
        *,
        new_messages: list[dict] | None = None,
        assistant_message: dict | None = None,
        pressure_budget_tokens: int | None = None,
        model_id: str | None = None,
    ) -> dict:
        """Return cheap unsummarized-tail pressure used by summary scheduling."""

    async def check_and_summarize(
        self,
        conversation_id: str,
        user_id: str,
        model: str | None = None,
        pressure_budget_tokens: int | None = None,
    ) -> dict:
        """Summarize conversation history when needed and return write status."""


@runtime_checkable
class ConversationTaskStateStore(Protocol):
    """Port for task-mode state persisted with a conversation."""

    def update_task_checkpoint_summary(
        self,
        conversation_id: str,
        summary: str,
        run_id: str,
        fence: int,
    ) -> bool:
        """Persist a checkpoint summary only for the active run owner."""

    def activate_checkpoint_generation(
        self,
        conversation_id: str,
        generation: CheckpointGeneration,
        run_id: str,
        fence: int,
    ) -> bool:
        """Select a verified reserved generation only for its live owner."""

    def try_acquire_task_run(
        self,
        conversation_id: str,
        task_mode: str,
        run_id: str,
        lease_seconds: int,
        logical_thread_id: str,
        resume_checkpoint: bool,
    ) -> TaskRunAcquisition:
        """Atomically acquire a lease and reserve its immutable generation."""

    def renew_task_run(
        self,
        conversation_id: str,
        run_id: str,
        fence: int,
        lease_seconds: int,
    ) -> bool:
        """Extend an unexpired lease only when ``(run_id, fence)`` owns it."""

    def reset_task_checkpoint(
        self,
        conversation_id: str,
        task_mode: str,
        run_id: str,
        fence: int,
    ) -> bool:
        """Clear checkpoint state when ``run_id`` owns the active lease."""

    def update_task_mode(
        self,
        conversation_id: str,
        task_mode: str,
        run_id: str,
        fence: int,
    ) -> bool:
        """Update the mode when a resumed run restores persisted settings."""

    def save_paused_task(
        self,
        conversation_id: str,
        task_mode: str,
        run_id: str,
        fence: int,
    ) -> bool:
        """Persist paused state and release the owned execution lease."""

    def save_interrupted_task(
        self,
        conversation_id: str,
        task_mode: str,
        reason: str,
        run_id: str,
        fence: int,
    ) -> bool:
        """Persist resumable interruption and release the owned lease."""

    def clear_task_status(
        self,
        conversation_id: str,
        task_mode: str,
        run_id: str,
        fence: int,
    ) -> bool:
        """Clear task status only when ``run_id`` owns the lease."""
