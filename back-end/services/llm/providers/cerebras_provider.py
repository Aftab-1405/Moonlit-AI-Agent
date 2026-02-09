"""
Cerebras provider adapter.
"""

import logging
import os
from typing import Any, Sequence

from cerebras.cloud.sdk import Cerebras

from .base import ProviderStreamDelta, ProviderToolCall

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gpt-oss-120b"
REASONING_MODELS = {"gpt-oss-120b", "zai-glm-4.6"}


class CerebrasProvider:
    """Provider adapter for Cerebras SDK."""
    provider_name = "cerebras"

    def get_client(self, api_key: str | None = None) -> Cerebras:
        key = self._resolve_api_key(api_key)
        return Cerebras(api_key=key)

    def get_default_model(self) -> str:
        return DEFAULT_MODEL

    def supports_reasoning(self, model_name: str) -> bool:
        return model_name in REASONING_MODELS

    def format_tools(self, raw_tools: Sequence[dict]) -> list[dict]:
        return [{"type": "function", "function": tool} for tool in raw_tools]

    def create_text_response(
        self,
        *,
        client: Any,
        model_name: str,
        messages: list[dict],
    ) -> Any:
        return client.chat.completions.create(
            model=model_name,
            messages=messages,
        )

    def extract_text(self, response: Any) -> str:
        content = response.choices[0].message.content
        return content or ""

    def create_tool_planning_response(
        self,
        *,
        client: Any,
        model_name: str,
        messages: list[dict],
        tools: list[dict],
    ) -> Any:
        return client.chat.completions.create(
            model=model_name,
            messages=messages,
            tools=tools,
            tool_choice="auto",
            parallel_tool_calls=False,  # Sequential tool execution for reliability
            temperature=0.1,  # Low temp for accurate tool usage
            top_p=0.1,
        )

    def extract_tool_calls(self, response: Any) -> list[ProviderToolCall]:
        response_message = response.choices[0].message
        tool_calls = getattr(response_message, "tool_calls", None) or []
        return [
            ProviderToolCall(
                id=tool_call.id,
                name=tool_call.function.name,
                arguments=tool_call.function.arguments or "{}",
            )
            for tool_call in tool_calls
        ]

    def build_assistant_message(self, response: Any) -> dict:
        response_message = response.choices[0].message
        message: dict = {
            "role": "assistant",
            "content": response_message.content or "",
        }

        tool_calls = getattr(response_message, "tool_calls", None) or []
        if tool_calls:
            message["tool_calls"] = [
                {
                    "id": tool_call.id,
                    "type": "function",
                    "function": {
                        "name": tool_call.function.name,
                        "arguments": tool_call.function.arguments or "{}",
                    },
                }
                for tool_call in tool_calls
            ]
        return message

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
        request = {
            "model": model_name,
            "messages": messages,
            "stream": True,
            "temperature": 0.2,
            "top_p": 0.2,
        }
        if use_reasoning:
            request["reasoning_effort"] = reasoning_effort
            request["max_completion_tokens"] = max_completion_tokens
        else:
            request["max_tokens"] = max_tokens

        return client.chat.completions.create(**request)

    def extract_stream_delta(self, chunk: Any) -> ProviderStreamDelta:
        delta = chunk.choices[0].delta
        return ProviderStreamDelta(
            reasoning=getattr(delta, "reasoning", None),
            content=getattr(delta, "content", None),
        )

    @staticmethod
    def _resolve_api_key(api_key: str | None = None) -> str:
        key = api_key or os.getenv("CEREBRAS_API_KEY") or os.getenv("LLM_API_KEY")
        if not key:
            keys_raw = os.getenv("CEREBRAS_API_KEYS", "") or os.getenv("LLM_API_KEYS", "")
            keys = [k.strip() for k in keys_raw.split(",") if k.strip()]
            if keys:
                key = keys[0]

        if not key:
            logger.error("No LLM API key found in environment variables")
            raise ValueError("LLM_API_KEY or LLM_API_KEYS is required")
        return key
