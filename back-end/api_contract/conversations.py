"""Conversation request schemas."""

from typing import Annotated, Any, Literal, Optional
from uuid import UUID

from pydantic import AfterValidator, Field, field_validator

from api_contract.common import ExternalRequestModel
from config import get_config

Config = get_config()


def validate_conversation_id(value: str) -> str:
    """Require the canonical lowercase, hyphenated representation of a UUIDv4."""
    try:
        parsed = UUID(str(value))
    except (TypeError, ValueError, AttributeError) as exc:
        raise ValueError("Conversation ID must be a canonical UUIDv4") from exc
    canonical = str(parsed)
    if parsed.version != 4 or str(value) != canonical:
        raise ValueError("Conversation ID must be a canonical UUIDv4")
    return canonical


ConversationId = Annotated[str, AfterValidator(validate_conversation_id)]


class BaseConversationRequest(ExternalRequestModel):
    """Base schema for conversation requests."""

    enable_reasoning: bool = Field(default=True)
    reasoning_effort: Literal["low", "medium", "high"] = Field(default="medium")
    response_style: Literal["concise", "balanced", "detailed"] = Field(default="balanced")
    max_rows: Optional[int] = Field(default=Config.DEFAULT_REQUEST_MAX_ROWS, ge=1, le=Config.REQUEST_MAX_ROWS_LIMIT)
    provider: Optional[str] = Field(default=None, max_length=Config.LLM_PROVIDER_MAX_LENGTH)
    model: Optional[str] = Field(default=None, max_length=Config.LLM_MODEL_MAX_LENGTH)
    task_mode: Literal["normal", "tool_task", "long_task"] = Field(default="normal")

    @field_validator("provider")
    @classmethod
    def sanitize_provider(cls, v):
        """Normalize the LLM provider to a trimmed lowercase value."""
        if v is None:
            return None
        provider = v.strip().lower()
        return provider or None

    @field_validator("model")
    @classmethod
    def sanitize_model(cls, v):
        """Normalize the LLM model to a trimmed value."""
        if v is None:
            return None
        model = v.strip()
        return model or None


class ChatRequest(BaseConversationRequest):
    """Schema for chat request."""

    prompt: str = Field(..., min_length=1, max_length=Config.CHAT_PROMPT_MAX_LENGTH)
    conversation_id: Optional[ConversationId] = Field(None, max_length=Config.CONVERSATION_ID_MAX_LENGTH)

    @field_validator("prompt")
    @classmethod
    def prompt_not_empty(cls, v):
        """Reject blank prompts and return the trimmed value."""
        if not v or not v.strip():
            raise ValueError("Prompt cannot be empty")
        return v.strip()


class AgentResumeRequest(BaseConversationRequest):
    """Schema for resuming a paused LangGraph conversation."""

    conversation_id: ConversationId = Field(..., max_length=Config.CONVERSATION_ID_MAX_LENGTH)
    # FIX [AUDIT-2-D]: the previous ``resume: dict[str, Any]`` had no
    # size cap, allowing a malicious client to send a multi-MB payload
    # and exhaust process memory. Additive constraint: cap the number
    # of top-level keys at 64 and the JSON-serialized size at 64 KiB.
    resume: dict[str, Any] = Field(..., max_length=64)

    @field_validator("resume")
    @classmethod
    def resume_not_empty(cls, v):
        """Reject empty resume payloads and enforce a serialized size cap."""
        if not isinstance(v, dict) or not v:
            raise ValueError("Resume payload cannot be empty")
        # Defense-in-depth: cap the serialized size to protect against
        # pathological nested inputs that pass the key-count cap but
        # expand when serialized. 64 KiB is generous for a LangGraph
        # resume payload (typically <1 KiB).
        import json

        serialized = json.dumps(v, default=str)
        if len(serialized) > 65536:
            raise ValueError("Resume payload too large (max 65536 bytes serialized)")
        return v


class RenameConversationRequest(ExternalRequestModel):
    """Schema for renaming a saved conversation."""

    title: str = Field(..., min_length=1, max_length=Config.CONVERSATION_TITLE_MAX_LENGTH)

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v):
        """Reject blank conversation titles and return the trimmed value."""
        title = v.strip()
        if not title:
            raise ValueError("Conversation title cannot be empty")
        return title
