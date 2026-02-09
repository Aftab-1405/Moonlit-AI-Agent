"""
Provider interface for LLM backends.

Each provider adapter normalizes request/response behavior so the orchestrator
can remain provider-agnostic.
"""

from dataclasses import dataclass
from typing import Any, Optional, Protocol, Sequence


@dataclass(frozen=True)
class ProviderToolCall:
    """Normalized tool call shape returned by provider adapters."""
    id: str
    name: str
    arguments: str


@dataclass(frozen=True)
class ProviderStreamDelta:
    """Normalized streaming chunk content."""
    reasoning: Optional[str] = None
    content: Optional[str] = None


class LLMProvider(Protocol):
    """Contract every provider adapter must implement."""
    provider_name: str

    def get_client(self, api_key: str | None = None) -> Any:
        ...

    def get_default_model(self) -> str:
        ...

    def supports_reasoning(self, model_name: str) -> bool:
        ...

    def format_tools(self, raw_tools: Sequence[dict]) -> list[dict]:
        ...

    def create_text_response(
        self,
        *,
        client: Any,
        model_name: str,
        messages: list[dict],
    ) -> Any:
        ...

    def extract_text(self, response: Any) -> str:
        ...

    def create_tool_planning_response(
        self,
        *,
        client: Any,
        model_name: str,
        messages: list[dict],
        tools: list[dict],
    ) -> Any:
        ...

    def extract_tool_calls(self, response: Any) -> list[ProviderToolCall]:
        ...

    def build_assistant_message(self, response: Any) -> dict:
        ...

    def create_streaming_response(
        self,
        *,
        client: Any,
        model_name: str,
        messages: list[dict],
        use_reasoning: bool,
        reasoning_effort: str,
        max_tokens: int,
        max_completion_tokens: int,
    ) -> Any:
        ...

    def extract_stream_delta(self, chunk: Any) -> ProviderStreamDelta:
        ...
