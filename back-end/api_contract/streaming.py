"""SSE streaming API contract models."""

from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from api_contract.common import ApiError


class TokenEvent(BaseModel):
    """SSE event carrying one streamed assistant content token."""

    type: Literal["token"]
    content: str


class ThinkingTokenEvent(BaseModel):
    """SSE event carrying one streamed reasoning/thinking token."""

    type: Literal["thinking_token"]
    content: str


class ToolStartEvent(BaseModel):
    """SSE event signaling that an agent tool invocation has started."""

    type: Literal["tool_start"]
    name: str
    args: dict[str, Any] = Field(default_factory=dict)


class ToolEndEvent(BaseModel):
    """SSE event signaling that an agent tool invocation has completed."""

    type: Literal["tool_end"]
    name: str
    args: dict[str, Any] = Field(default_factory=dict)
    result: Any | None = None


class UiActionEvent(BaseModel):
    """SSE event requesting a client-side UI action with optional payload."""

    type: Literal["ui_action"]
    action: str
    payload: dict[str, Any] | None = None


class InterruptEvent(BaseModel):
    """SSE event signaling an agent-initiated interruption of the stream."""

    type: Literal["agent_interrupt"]
    id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class StreamErrorEvent(BaseModel):
    """SSE event reporting an error encountered mid-stream."""

    type: Literal["error"]
    message: str


class DoneEvent(BaseModel):
    """SSE event marking the terminal frame of a completed stream."""

    type: Literal["done"]


class AgentStepLimitEvent(BaseModel):
    """SSE event warning the client that the agent reached its step limit."""

    type: Literal["agent_step_limit_reached"]
    task_id: str
    conversation_id: str
    can_continue: bool
    steps_used: int
    task_mode: str
    message: str


class UsageMetricsEvent(BaseModel):
    """SSE event reporting token/context-budget usage metrics for a turn."""

    model_config = ConfigDict(extra="allow")

    type: Literal["usage_metrics"]
    activePercent: int | None = None
    modelPercent: int | None = None
    activeContextTokens: int | None = None
    activeContextBudget: int | None = None
    totalContextWindow: int | None = None
    availableInputPayloadTokens: int | None = None
    pressureTriggerTokens: int | None = None
    modelContextWindow: int | None = None
    reservedOutputTokens: int | None = None
    safetyMarginTokens: int | None = None
    systemPromptTokens: int | None = None
    toolSchemaTokens: int | None = None
    vampMemoryTokens: int | None = None
    taskCheckpointTokens: int | None = None
    hotHistoryBudget: int | None = None
    tokenCountingMode: str | None = None
    tokenCountingReason: str | None = None
    inputPayloadTokens: int | None = None
    contextPhase: str | None = None
    summaryThresholdTokens: int | None = None
    summaryCompleteTurns: int | None = None


class WorkflowStatusEvent(BaseModel):
    """SSE event reporting the status of a workflow stage."""

    type: Literal["workflow_status"]
    stage: str
    status: Literal["running", "done", "failed"]
    content: str


class SkillsActivatedEvent(BaseModel):
    """SSE event listing the skills activated for the current turn."""

    type: Literal["skills_activated"]
    skills: list[str]


SseEvent = Annotated[
    Union[
        TokenEvent,
        ThinkingTokenEvent,
        ToolStartEvent,
        ToolEndEvent,
        UiActionEvent,
        InterruptEvent,
        StreamErrorEvent,
        AgentStepLimitEvent,
        DoneEvent,
        UsageMetricsEvent,
        WorkflowStatusEvent,
        SkillsActivatedEvent,
    ],
    Field(discriminator="type"),
]


SSE_EVENT_SCHEMA = TypeAdapter(SseEvent).json_schema()


STREAMING_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: {
        "description": (
            "Server-sent event stream. Each data frame contains one JSON object "
            "matching one of the documented event models."
        ),
        "content": {
            "text/event-stream": {
                "schema": SSE_EVENT_SCHEMA,
                "examples": {
                    "token": {
                        "summary": "Content token",
                        "value": {"type": "token", "content": "Hello"},
                    },
                    "done": {"summary": "Stream complete", "value": {"type": "done"}},
                },
            }
        },
    },
    400: {"model": ApiError, "description": "Invalid request."},
    401: {"model": ApiError, "description": "Authentication required."},
    403: {"model": ApiError, "description": "Forbidden."},
    429: {"model": ApiError, "description": "Rate limit exceeded."},
    500: {"model": ApiError, "description": "Streaming initialization failed."},
}
