"""
Gemini provider adapter using the official Google Gen AI Python SDK.
"""

import json
import logging
import os
from typing import Any, Sequence

from .base import ProviderStreamDelta, ProviderToolCall

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-2.0-flash"

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None
    types = None


class GeminiProvider:
    """Provider adapter for Gemini SDK."""
    provider_name = "gemini"

    def get_client(self, api_key: str | None = None):
        self._require_sdk()
        key = self._resolve_api_key(api_key)
        return genai.Client(api_key=key)

    def get_default_model(self) -> str:
        return os.getenv("GEMINI_MODEL", DEFAULT_MODEL)

    def supports_reasoning(self, model_name: str) -> bool:
        # Thinking token streams are not yet normalized for this adapter.
        return False

    def format_tools(self, raw_tools: Sequence[dict]) -> list[dict]:
        self._require_sdk()
        return [types.Tool(function_declarations=list(raw_tools))]

    def create_text_response(
        self,
        *,
        client: Any,
        model_name: str,
        messages: list[dict],
    ) -> Any:
        system_instruction, contents = self._convert_messages(messages)
        config = types.GenerateContentConfig(
            temperature=0.2,
            top_p=0.2,
            system_instruction=system_instruction or None,
        )
        return client.models.generate_content(
            model=model_name,
            contents=contents,
            config=config,
        )

    def extract_text(self, response: Any) -> str:
        text = getattr(response, "text", None)
        if text:
            return text
        return self._extract_text_from_candidates(response)

    def create_tool_planning_response(
        self,
        *,
        client: Any,
        model_name: str,
        messages: list[dict],
        tools: list[dict],
    ) -> Any:
        system_instruction, contents = self._convert_messages(messages)
        config = types.GenerateContentConfig(
            tools=tools,
            temperature=0.1,
            top_p=0.1,
            system_instruction=system_instruction or None,
        )
        return client.models.generate_content(
            model=model_name,
            contents=contents,
            config=config,
        )

    def extract_tool_calls(self, response: Any) -> list[ProviderToolCall]:
        calls: list[ProviderToolCall] = []

        function_calls = getattr(response, "function_calls", None) or []
        for index, function_call in enumerate(function_calls, start=1):
            name = getattr(function_call, "name", None)
            args = getattr(function_call, "args", None) or {}
            if not name:
                continue
            calls.append(
                ProviderToolCall(
                    id=getattr(function_call, "id", None) or f"gemini-call-{index}",
                    name=name,
                    arguments=json.dumps(dict(args), default=str),
                )
            )

        if calls:
            return calls

        parts = self._extract_parts(response)
        for index, part in enumerate(parts, start=1):
            function_call = getattr(part, "function_call", None)
            if not function_call:
                continue
            name = getattr(function_call, "name", None)
            args = getattr(function_call, "args", None) or {}
            if not name:
                continue
            calls.append(
                ProviderToolCall(
                    id=getattr(function_call, "id", None) or f"gemini-call-{index}",
                    name=name,
                    arguments=json.dumps(dict(args), default=str),
                )
            )
        return calls

    def build_assistant_message(self, response: Any) -> dict:
        text = self.extract_text(response)
        tool_calls = self.extract_tool_calls(response)

        content_obj = None
        try:
            candidates = getattr(response, "candidates", None) or []
            if candidates:
                content_obj = getattr(candidates[0], "content", None)
        except Exception:
            content_obj = None

        message: dict[str, Any] = {
            "role": "assistant",
            "content": text,
        }
        if tool_calls:
            message["tool_calls"] = [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {"name": call.name, "arguments": call.arguments},
                }
                for call in tool_calls
            ]
        if content_obj is not None:
            # Keep raw provider content so the next turn preserves function_call
            # structure exactly as Gemini returned it.
            message["_gemini_content"] = content_obj
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
        system_instruction, contents = self._convert_messages(messages)
        config = types.GenerateContentConfig(
            temperature=0.2,
            top_p=0.2,
            max_output_tokens=max_tokens,
            system_instruction=system_instruction or None,
        )
        return client.models.generate_content_stream(
            model=model_name,
            contents=contents,
            config=config,
        )

    def extract_stream_delta(self, chunk: Any) -> ProviderStreamDelta:
        text = getattr(chunk, "text", None)
        if not text:
            text = self._extract_text_from_candidates(chunk)
        return ProviderStreamDelta(content=text or None)

    @staticmethod
    def _resolve_api_key(api_key: str | None = None) -> str:
        key = (
            api_key
            or os.getenv("GEMINI_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
            or os.getenv("LLM_API_KEY")
        )
        if not key:
            keys_raw = os.getenv("GEMINI_API_KEYS", "") or os.getenv("LLM_API_KEYS", "")
            keys = [k.strip() for k in keys_raw.split(",") if k.strip()]
            if keys:
                key = keys[0]

        if not key:
            logger.error("No Gemini API key found in environment variables")
            raise ValueError(
                "Set one of: LLM_API_KEY, GEMINI_API_KEY, GOOGLE_API_KEY, or LLM_API_KEYS"
            )
        return key

    @staticmethod
    def _require_sdk() -> None:
        if genai is not None and types is not None:
            return
        raise RuntimeError(
            "Gemini SDK is not installed. Install with: pip install google-genai"
        )

    @staticmethod
    def _extract_parts(response: Any) -> list[Any]:
        try:
            candidates = getattr(response, "candidates", None) or []
            if not candidates:
                return []
            content = getattr(candidates[0], "content", None)
            if content is None:
                return []
            parts = getattr(content, "parts", None) or []
            return list(parts)
        except Exception:
            return []

    def _extract_text_from_candidates(self, response: Any) -> str:
        chunks: list[str] = []
        for part in self._extract_parts(response):
            text = getattr(part, "text", None)
            if text:
                chunks.append(text)
        return "".join(chunks)

    def _convert_messages(self, messages: list[dict]) -> tuple[str, list[Any]]:
        self._require_sdk()

        system_chunks: list[str] = []
        contents: list[Any] = []

        for message in messages:
            role = (message.get("role") or "user").strip().lower()
            content = message.get("content") or ""

            if role == "system":
                if content:
                    system_chunks.append(str(content))
                continue

            if role == "assistant":
                raw_content = message.get("_gemini_content")
                if raw_content is not None:
                    contents.append(raw_content)
                    continue
                if content:
                    contents.append(
                        types.Content(role="model", parts=[types.Part(text=str(content))])
                    )
                continue

            if role == "tool":
                tool_name = message.get("name") or "tool"
                response_payload: dict[str, Any]
                try:
                    parsed = json.loads(content) if isinstance(content, str) else content
                    response_payload = parsed if isinstance(parsed, dict) else {"result": str(parsed)}
                except Exception:
                    response_payload = {"result": str(content)}

                contents.append(
                    types.Content(
                        role="tool",
                        parts=[
                            types.Part.from_function_response(
                                name=tool_name,
                                response=response_payload,
                            )
                        ],
                    )
                )
                continue

            if content:
                contents.append(
                    types.Content(role="user", parts=[types.Part(text=str(content))])
                )

        if not contents:
            contents.append(types.Content(role="user", parts=[types.Part(text="Continue.")]))

        system_instruction = "\n\n".join(system_chunks).strip() if system_chunks else ""
        return system_instruction, contents
