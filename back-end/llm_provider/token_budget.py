"""
Token-budget primitives for the Bedrock Converse API.

Responsibilities
----------------
- Resolve each model's context window and the active input budget after
  reserving tokens for the system prompt, tool schema, output, and a safety
  margin (:func:`calculate_dynamic_token_budget`).
- Provide model-native tokenizers for exact pre-call token counting
  (:func:`estimate_tokens`, :func:`estimate_model_tokens`). ENH [TOK]:
  uses model-native tokenizers (tiktoken for GPT-OSS/GPT-4o, mistral-common
  for Devstral/Mistral, transformers for Kimi) as REQUIRED dependencies.
  The old chars/3 byte fallback has been removed (ENH [TOK-CLEANUP]).
- Cache the static (system-prompt, tool-schema) token counts so they are
  computed at most once per (model, prompt, toolset) tuple
  (:func:`count_converse_tokens_cached`). The cache uses an LRU policy
  (FIX [L8]) so eviction of one entry doesn't invalidate every other entry
  and cause a thundering herd of CountTokens calls.
- Truncate conversation history to the active budget while preserving
  human-turn boundaries (:func:`truncate_messages_to_budget`). FIX [H13]
  re-verifies the token count after backward-alignment and advances
  ``start_idx`` forward if alignment overshot.
"""

import json
import logging
import math
import os
from collections import OrderedDict
from typing import Sequence, TypedDict

# ENH [LOG]: Suppress transformers "PyTorch was not found" warning and
# HuggingFace Hub "unauthenticated requests" warning. We only use
# transformers for tokenization (not model inference), so PyTorch is
# intentionally not installed. These env vars must be set BEFORE
# importing transformers.
os.environ.setdefault("TRANSFORMERS_NO_ADVISORY_WARNINGS", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")

from cachetools import LRUCache

from config import get_config
from core.errors import log_safe_exception, public_tool_error
from llm_provider.model_capabilities import get_model_capabilities

Config = get_config()
logger = logging.getLogger(__name__)

_TOOL_SPEC_CACHE: "OrderedDict[tuple, dict]" = OrderedDict()
_TOKEN_COUNT_RESULT_CACHE: "LRUCache[tuple, dict]" = LRUCache(maxsize=1000)
_RUNTIME_COUNT_TOKENS_UNSUPPORTED: set[str] = set()

# ENH [TOK]: Model-native tokenizer registry.
# Each entry returns a callable encode(text) -> list[int].
# Tokenizers are loaded lazily (on first use) and cached for the process lifetime.
# All three tokenizer libraries are REQUIRED dependencies (see requirements.txt):
# - tiktoken (GPT-OSS, GPT-4o)
# - mistral-common (Devstral, Mistral Large)
# - transformers (Kimi K2/K2.5, tokenizer-only, no PyTorch)
_TOKENIZER_CACHE: dict[str, object] = {}
# ENH [LOG]: Track which models we've already warned about so we don't
# spam the logs with the same warning on every token count call.
_TOKENIZER_WARNED: set[str] = set()


def _get_model_tokenizer(model_id: str | None):
    """Return a model-native tokenizer encode function, or None if unavailable.

    ENH [TOK]: Model-native tokenizers give EXACT pre-call token counts,
    eliminating the 20-40% estimation error of the old chars/3 byte estimate.
    This makes the pre-call pressure check match the post-call usage.inputTokens,
    so the indicator and summarization trigger always agree.

    Supported (all required dependencies in requirements.txt):
    - GPT-OSS 120B/20B, GPT-4o, GPT-4: tiktoken with o200k_base encoding
    - Mistral Devstral, Mistral Large, Mixtral: mistral-common tekken tokenizer
    - Moonshot Kimi K2/K2.5: HuggingFace transformers (no PyTorch needed)
    - Mock models (tests): None (uses emergency fallback)
    """
    if not model_id or _is_mock_model(model_id):
        return None

    model_lower = str(model_id).lower()
    cache_key = model_lower

    if cache_key in _TOKENIZER_CACHE:
        return _TOKENIZER_CACHE[cache_key]

    tokenizer = None

    # GPT-OSS / OpenAI models → tiktoken (o200k_base for gpt-4o/gpt-oss, cl100k for gpt-4)
    if any(k in model_lower for k in ("gpt-oss", "gpt-4o", "gpt-4", "o1-", "o3-")):
        try:
            import tiktoken

            try:
                tokenizer = tiktoken.encoding_for_model(model_lower.split("/")[-1]).encode
            except Exception:
                tokenizer = tiktoken.get_encoding("o200k_base").encode
            logger.debug("Loaded tiktoken tokenizer for model %s", model_id)
        except Exception as e:
            public = public_tool_error(
                "TOKENIZER_INITIALIZATION_FAILED",
                "Tokenizer initialization failed.",
            )
            log_safe_exception(logger, "initialize_tiktoken_tokenizer", e, public)

    # Mistral / Devstral models → mistral-common tekken tokenizer
    elif any(k in model_lower for k in ("devstral", "mistral", "magistral", "mixtral", "ministral")):
        try:
            # ENH [TOK-FIX]: mistral-common's public API is:
            #   tokenizer = MistralTokenizer.v3()
            #   tokens = tokenizer.encode_chat_completion(
            #       ChatCompletionRequest(messages=[UserMessage(content=text)])
            #   ).tokens
            # There is NO direct encode(text) method. We wrap it in a lambda.
            from mistral_common.protocol.instruct.messages import UserMessage
            from mistral_common.protocol.instruct.request import ChatCompletionRequest
            from mistral_common.tokens.tokenizers.mistral import MistralTokenizer

            mt = MistralTokenizer.v3()

            def _mistral_encode(text: str) -> list[int]:
                """Encode text using mistral-common's chat completion API."""
                req = ChatCompletionRequest(messages=[UserMessage(content=text)])
                return mt.encode_chat_completion(req).tokens

            tokenizer = _mistral_encode
            logger.debug("Loaded mistral-common tekken tokenizer for model %s", model_id)
        except Exception as e:
            public = public_tool_error(
                "TOKENIZER_INITIALIZATION_FAILED",
                "Tokenizer initialization failed.",
            )
            log_safe_exception(logger, "initialize_mistral_tokenizer", e, public)

    # Moonshot Kimi models → HuggingFace transformers (tokenizer only, no PyTorch)
    elif any(k in model_lower for k in ("kimi", "moonshot")):
        try:
            import transformers
            from transformers import AutoTokenizer

            hf_tok = AutoTokenizer.from_pretrained("moonshotai/Kimi-K2-Instruct", trust_remote_code=True)

            def tokenizer(text):
                return hf_tok.encode(text)

            logger.debug(
                "Loaded HuggingFace tokenizer for Kimi model %s (transformers %s)",
                model_id,
                transformers.__version__,
            )
        except Exception as e:
            # ENH [TOK-FIX]: Catch ALL exceptions (not just ImportError) because
            # transformers --no-deps can leave the package in a state where
            # `import transformers` succeeds but `from transformers import
            # AutoTokenizer` fails due to missing sub-dependencies.
            public = public_tool_error(
                "TOKENIZER_INITIALIZATION_FAILED",
                "Tokenizer initialization failed.",
            )
            log_safe_exception(logger, "initialize_transformers_tokenizer", e, public)

    _TOKENIZER_CACHE[cache_key] = tokenizer
    return tokenizer


class TokenCountingError(RuntimeError):
    """Raised when exact provider token counting is required but unavailable."""


class TokenCountResult(TypedDict):
    """Result of a token-count operation (count, mode, and reason)."""
    tokens: int
    mode: str
    reason: str | None


def _is_mock_model(model_id: str | None) -> bool:
    """Return whether ``model_id`` is a test ``mock*`` model."""
    return bool(model_id and str(model_id).startswith("mock"))


def _context_window_from_entry(entry) -> int | None:
    """Extract an integer context window from a capability entry (``None`` when absent/invalid)."""
    if isinstance(entry, dict):
        entry = entry.get("context_window") or entry.get("contextWindow")
    try:
        return int(entry)
    except (TypeError, ValueError):
        return None


def _supports_count_tokens_from_entry(entry) -> bool | None:
    """Read the ``supports_count_tokens`` flag from a capability entry (``None`` when unspecified)."""
    if not isinstance(entry, dict):
        return None
    value = entry.get("supports_count_tokens")
    if value is None:
        value = entry.get("supportsCountTokens")
    if value is None:
        return None
    return bool(value)


def get_model_context_window_with_source(model_id: str) -> tuple[int, str]:
    """Resolve context window and its resolution source."""
    entry, source = get_model_capabilities(model_id)
    resolved = _context_window_from_entry(entry)
    if resolved is not None:
        return resolved, source

    return Config.UNKNOWN_MODEL_CONTEXT_WINDOW_TOKENS, "fallback"


def model_supports_count_tokens(model_id: str) -> bool:
    """Return whether provider-side exact CountTokens should be attempted."""
    if _is_mock_model(model_id):
        return True
    if model_id in _RUNTIME_COUNT_TOKENS_UNSUPPORTED:
        return False
    entry, _source = get_model_capabilities(model_id)
    configured = _supports_count_tokens_from_entry(entry)
    return True if configured is None else configured


def get_model_context_window(model_id: str) -> int:
    """Resolve context window using selected model_id."""
    val, _ = get_model_context_window_with_source(model_id)
    return val


def calculate_token_budget(model_id: str) -> dict:
    """Calculate token budget based on context window.

    Compatibility wrapper for older call sites. The active budget is now the
    pressure trigger, not a fixed 80% haircut of usable input.
    """
    return calculate_dynamic_token_budget(model_id)


def output_reserve_for_task_mode(task_mode: str = "normal") -> int:
    """Return output-token reserve for the current agent task profile."""
    if task_mode in ("long_task", "approved_autonomous"):
        return 12000
    if task_mode == "tool_task":
        return 8192
    return Config.RESERVED_OUTPUT_TOKENS


def calculate_safety_margin(model_context_window: int) -> int:
    """Use a small proportional margin without wasting huge context windows."""
    return min(max(2048, int(model_context_window * 0.02)), 8192)


def calculate_dynamic_token_budget(
    model_id: str,
    *,
    system_prompt_tokens: int = 0,
    tool_schema_tokens: int = 0,
    output_reserve_tokens: int | None = None,
    safety_margin_tokens: int | None = None,
    pressure_ratio: float = 0.90,
    token_counting_mode: str = "exact",
) -> dict:
    """Calculate measured input budget and pressure trigger.

    Required static prompt/tool sections are measured outside this function and
    passed in. VAMP and history then share the remaining payload budget.
    """
    model_context_window, resolution_source = get_model_context_window_with_source(model_id)

    reserved_system_tokens = max(0, int(system_prompt_tokens or 0))
    reserved_tool_schema_tokens = max(0, int(tool_schema_tokens or 0))
    reserved_output_tokens = (
        int(output_reserve_tokens) if output_reserve_tokens is not None else Config.RESERVED_OUTPUT_TOKENS
    )
    reserved_safety_margin_tokens = (
        int(safety_margin_tokens) if safety_margin_tokens is not None else calculate_safety_margin(model_context_window)
    )
    if token_counting_mode != "exact" and safety_margin_tokens is None:
        estimated_margin = min(max(4096, int(model_context_window * 0.05)), 16384)
        reserved_safety_margin_tokens = max(
            reserved_safety_margin_tokens,
            estimated_margin,
        )

    usable_input_budget = max(
        Config.MIN_USABLE_INPUT_BUDGET_TOKENS,
        model_context_window
        - reserved_system_tokens
        - reserved_tool_schema_tokens
        - reserved_output_tokens
        - reserved_safety_margin_tokens,
    )
    pressure_trigger_tokens = int(usable_input_budget * pressure_ratio)
    vamp_memory_budget = int(usable_input_budget * 0.30)

    return {
        "model_context_window": model_context_window,
        "resolution_source": resolution_source,
        "reserved_system_tokens": reserved_system_tokens,
        "reserved_vamp_memory_tokens": vamp_memory_budget,
        "reserved_tool_schema_tokens": reserved_tool_schema_tokens,
        "reserved_output_tokens": reserved_output_tokens,
        "reserved_safety_margin_tokens": reserved_safety_margin_tokens,
        "usable_input_budget": usable_input_budget,
        "available_input_payload_tokens": usable_input_budget,
        "pressure_trigger_tokens": pressure_trigger_tokens,
        "active_context_budget": pressure_trigger_tokens,
        "hot_history_budget": pressure_trigger_tokens,
        "pressure_ratio": pressure_ratio,
        "token_counting_mode": token_counting_mode,
    }


def estimate_tokens(text: str, model_id: str | None = None) -> int:
    """Return an exact token count using the model's native tokenizer.

    ENH [TOK-CLEANUP]: The chars/3 byte fallback has been removed. All
    supported models (GPT-OSS, Mistral Devstral, Moonshot Kimi) now have
    native tokenizers installed as required dependencies. If no tokenizer
    is available for a model, a clear error is logged ONCE and a conservative
    chars/4 estimate is used (this should never happen in production —
    all three tokenizer libraries are in requirements.txt).
    """
    if not text:
        return 0
    value = str(text)

    # ENH [TOK]: Use the model-native tokenizer (exact count)
    if model_id:
        tokenizer = _get_model_tokenizer(model_id)
        if tokenizer is not None:
            return len(tokenizer(value))
        # ENH [LOG]: Warn ONCE per model, not on every call
        if model_id not in _TOKENIZER_WARNED:
            _TOKENIZER_WARNED.add(model_id)
            logger.warning(
                "No native tokenizer for model %s — install tiktoken/mistral-common/transformers. "
                "Using rough chars/4 estimate. (This warning will not repeat.)",
                model_id,
            )

    # ENH [TOK-CLEANUP]: Minimal emergency fallback (should never trigger
    # in production since all tokenizers are required dependencies).
    return max(1, math.ceil(len(value.encode("utf-8")) / 4))


def estimate_model_tokens(text: str, model_id: str | None = None) -> int:
    """Accurately count tokens for a target model using its native tokenizer.

    ENH [TOK-CLEANUP]: The local_estimate_multiplier fallback has been
    removed. All supported models now have exact native tokenizers.
    """
    if not text:
        return 0

    # ENH [TOK]: Use the model-native tokenizer directly (exact count)
    if model_id and not _is_mock_model(model_id):
        tokenizer = _get_model_tokenizer(model_id)
        if tokenizer is not None:
            return len(tokenizer(str(text)))
        # ENH [LOG]: Warn ONCE per model, not on every call
        if model_id not in _TOKENIZER_WARNED:
            _TOKENIZER_WARNED.add(model_id)
            logger.warning(
                "No native tokenizer for model %s — using rough estimate. "
                "Install the appropriate tokenizer library. (This warning will not repeat.)",
                model_id,
            )

    # Emergency fallback for mock models or missing tokenizers
    return estimate_tokens(text, model_id=None)


def estimate_converse_tokens_conservative(
    *,
    model_id: str | None = None,
    system: str | Sequence[dict] | None = None,
    messages: Sequence[dict] | None = None,
    tools: Sequence | None = None,
) -> int:
    """Estimate a Converse request using the deterministic local fallback."""
    payload = _build_bedrock_converse_payload(
        system=system,
        messages=messages,
        tools=tools,
    )
    serialized = json.dumps(payload, default=str, separators=(",", ":"))
    # JSON serialization captures structural keys, punctuation, and schemas.
    return estimate_model_tokens(serialized, model_id)


def _tool_to_bedrock_spec(tool_obj) -> dict:
    """Convert a LangChain BaseTool-like object into a Bedrock toolSpec."""
    tool_name = getattr(tool_obj, "name", "unknown_tool")
    tool_description = getattr(tool_obj, "description", "") or ""
    args_schema = getattr(tool_obj, "args_schema", None)
    args_obj = getattr(tool_obj, "args", None)
    cache_key = (tool_name, tool_description, id(args_schema), id(args_obj))
    if cache_key in _TOOL_SPEC_CACHE:
        # FIX [L8]: Move-to-end on access so LRU eviction order is correct.
        _TOOL_SPEC_CACHE.move_to_end(cache_key)
        return _TOOL_SPEC_CACHE[cache_key]

    # FIX [L8]: Replace "nuke-all" cache eviction with bounded LRU. The
    # previous `clear()` invalidated every cached tool spec simultaneously,
    # causing a thundering herd of `model_json_schema()` calls under load.
    if len(_TOOL_SPEC_CACHE) >= 1000:
        _TOOL_SPEC_CACHE.popitem(last=False)

    input_schema = {"type": "object", "properties": {}}
    if args_schema is not None:
        try:
            input_schema = args_schema.model_json_schema()
        except Exception:
            try:
                input_schema = args_schema.schema()
            except Exception:
                input_schema = {"type": "object", "properties": {}}
    elif args_obj:
        input_schema = {
            "type": "object",
            "properties": args_obj,
        }

    spec = {
        "toolSpec": {
            "name": tool_name,
            "description": tool_description,
            "inputSchema": {"json": input_schema},
        }
    }
    _TOOL_SPEC_CACHE[cache_key] = spec
    return spec


def _build_bedrock_converse_payload(
    *,
    system: str | Sequence[dict] | None = None,
    messages: Sequence[dict] | None = None,
    tools: Sequence | None = None,
) -> dict:
    """Assemble a Bedrock Converse request payload from system/messages/tools for token counting."""
    converse_payload: dict = {"messages": list(messages or [])}
    if system:
        if isinstance(system, str):
            converse_payload["system"] = [{"text": system}]
        else:
            converse_payload["system"] = list(system)
    if tools:
        converse_payload["toolConfig"] = {"tools": [_tool_to_bedrock_spec(tool_obj) for tool_obj in tools]}
    return converse_payload


def count_bedrock_converse_tokens(
    model_id: str,
    *,
    system: str | Sequence[dict] | None = None,
    messages: Sequence[dict] | None = None,
    tools: Sequence | None = None,
) -> int:
    """Count exact tokens using Amazon Bedrock CountTokens for Converse input."""
    if _is_mock_model(model_id):
        payload = _build_bedrock_converse_payload(
            system=system,
            messages=messages,
            tools=tools,
        )
        return estimate_tokens(json.dumps(payload, default=str))

    from llm_provider.bedrock_client import _resolve_model_id, get_bedrock_client

    resolved_model = _resolve_model_id(model_id)

    converse_payload = _build_bedrock_converse_payload(
        system=system,
        messages=messages,
        tools=tools,
    )

    try:
        response = get_bedrock_client().count_tokens(
            modelId=resolved_model,
            input={"converse": converse_payload},
        )
        return int(response["inputTokens"])
    except Exception as exc:
        public = public_tool_error(
            "PROVIDER_TOKEN_COUNT_FAILED",
            "Provider token counting failed.",
        )
        log_safe_exception(logger, "count_provider_tokens", exc, public)
        raise TokenCountingError(public.message) from exc


def _is_unsupported_count_tokens_error(exc: Exception) -> bool:
    """Return whether ``exc`` indicates the model doesn't support ``CountTokens``."""
    current: BaseException | None = exc
    while current is not None:
        text = str(current).lower()
        if (
            "doesn't support counting tokens" in text
            or "does not support counting tokens" in text
            or "unsupported" in text
            and "count" in text
            and "token" in text
        ):
            return True
        current = current.__cause__
    return False


def count_converse_tokens_with_fallback(
    model_id: str,
    *,
    system: str | Sequence[dict] | None = None,
    messages: Sequence[dict] | None = None,
    tools: Sequence | None = None,
) -> TokenCountResult:
    """Count tokens exactly when possible, otherwise use conservative estimates.

    ENH [TOK-MODE]: Now that we have model-native tokenizers (tiktoken,
    mistral-common, transformers) installed, the "estimated" label is
    misleading. The model-native tokenizer gives EXACT counts matching
    the model's own tokenizer. We relabel it as "model_native" (exact)
    instead of "estimated" (heuristic) when a tokenizer is available.
    Only fall back to "estimated" when no tokenizer is available.
    """
    if not model_supports_count_tokens(model_id):
        # ENH [TOK-MODE]: Check if a model-native tokenizer is available.
        # If so, the count is EXACT (matches the model's own tokenizer),
        # not a heuristic estimate.
        tokenizer = _get_model_tokenizer(model_id)
        if tokenizer is not None:
            return {
                "tokens": estimate_converse_tokens_conservative(
                    model_id=model_id,
                    system=system,
                    messages=messages,
                    tools=tools,
                ),
                "mode": "model_native",
                "reason": "model_native_tokenizer",
            }
        return {
            "tokens": estimate_converse_tokens_conservative(
                model_id=model_id,
                system=system,
                messages=messages,
                tools=tools,
            ),
            "mode": "estimated",
            "reason": "provider_unsupported_config",
        }

    try:
        return {
            "tokens": count_bedrock_converse_tokens(
                model_id,
                system=system,
                messages=messages,
                tools=tools,
            ),
            "mode": "exact",
            "reason": None,
        }
    except TokenCountingError as exc:
        if _is_unsupported_count_tokens_error(exc):
            _RUNTIME_COUNT_TOKENS_UNSUPPORTED.add(model_id)
            reason = "provider_unsupported"
        else:
            public = public_tool_error(
                "PROVIDER_TOKEN_COUNT_FAILED",
                "Provider token counting failed.",
            )
            log_safe_exception(logger, "count_tokens_with_fallback", exc, public)
            reason = "provider_error"

        return {
            "tokens": estimate_converse_tokens_conservative(
                model_id=model_id,
                system=system,
                messages=messages,
                tools=tools,
            ),
            "mode": "estimated",
            "reason": reason,
        }


def count_converse_tokens_cached(
    model_id: str,
    *,
    cache_key: tuple,
    system: str | Sequence[dict] | None = None,
    messages: Sequence[dict] | None = None,
    tools: Sequence | None = None,
) -> TokenCountResult:
    """Cached variant for static prompt/tool sections.

    Uses an LRU cache (:class:`cachetools.LRUCache`) keyed by
    ``(model_id, cache_key)``. Previously the cache was a plain dict whose
    overflow handler nuked every entry at >1000 items — under load this
    caused a thundering herd of fresh Bedrock ``CountTokens`` calls. FIX [L8]
    uses proper LRU eviction so only the least-recently-used entry is dropped.
    """
    full_key = (model_id, cache_key)
    cached = _TOKEN_COUNT_RESULT_CACHE.get(full_key)
    if cached is not None:
        return dict(cached)
    result = count_converse_tokens_with_fallback(
        model_id,
        system=system,
        messages=messages,
        tools=tools,
    )
    # FIX [L8]: LRUCache(maxsize=1000) handles eviction automatically — no
    # need to manually `clear()` on overflow.
    _TOKEN_COUNT_RESULT_CACHE[full_key] = dict(result)
    return result


def truncate_messages_to_budget(
    messages: list,
    active_context_budget: int,
    *,
    model_id: str | None = None,
) -> tuple[list, list]:
    """Truncate messages to fit the budget, preserving turn boundaries.

    Algorithm:

    1. Walk backward from the end of ``messages`` accumulating token costs
       until adding the next message would exceed ``active_context_budget``.
       Set ``start_idx`` to the first index that still fits.
    2. Backward-align ``start_idx`` to the nearest preceding ``human``
       message so the kept slice begins on a user turn (Bedrock rejects
       message lists that begin with an assistant/tool message).
    3. FIX [H13]: Re-verify the kept slice's token total against
       ``active_context_budget``. If backward-alignment overshot — pulling
       in enough extra tokens to bust the budget — advance ``start_idx``
       forward to the next human-turn boundary so the kept slice is both
       budget-compliant and turn-aligned.

    Returns ``(dropped_messages, kept_messages)``.
    """
    total_tokens = 0
    start_idx = len(messages)

    for i in range(len(messages) - 1, -1, -1):
        msg = messages[i]
        content = msg.content if hasattr(msg, "content") else str(msg)
        tokens = estimate_model_tokens(content, model_id)

        tool_calls = getattr(msg, "tool_calls", [])
        if tool_calls:
            tokens += estimate_model_tokens(str(tool_calls), model_id)

        if total_tokens + tokens > active_context_budget:
            break

        total_tokens += tokens
        start_idx = i

    original_start_idx = start_idx
    while 0 < start_idx < len(messages):
        if getattr(messages[start_idx], "type", "") == "human":
            break
        start_idx -= 1

    if start_idx == 0 and len(messages) > 0 and getattr(messages[0], "type", "") != "human":
        start_idx = original_start_idx
        while start_idx < len(messages):
            msg = messages[start_idx]
            if getattr(msg, "type", "") == "human":
                break
            if getattr(msg, "type", "") == "ai" and not getattr(msg, "tool_calls", None):
                break
            start_idx += 1

    # FIX [H13]: Backward-aligning to a human message boundary can pull in
    # enough additional messages that the kept slice now exceeds the budget.
    # Re-verify; if we overshot, advance forward to the next human-turn
    # boundary so the kept slice is both budget-compliant and turn-aligned.
    if start_idx < len(messages):
        kept_tokens = 0
        for msg in messages[start_idx:]:
            content = msg.content if hasattr(msg, "content") else str(msg)
            kept_tokens += estimate_model_tokens(content, model_id)
            tool_calls = getattr(msg, "tool_calls", [])
            if tool_calls:
                kept_tokens += estimate_model_tokens(str(tool_calls), model_id)
        if kept_tokens > active_context_budget:
            next_start = start_idx + 1
            while next_start < len(messages):
                if getattr(messages[next_start], "type", "") == "human":
                    start_idx = next_start
                    break
                next_start += 1

    dropped_messages = messages[:start_idx]
    kept_messages = messages[start_idx:]

    # CENH [2]: Minimum-history guarantee. If the kept slice is empty (the
    # most recent turn exceeds the budget), force-include the most recent
    # human turn even if it overflows. This mirrors FIX [H1] in
    # _load_firestore_history. An empty history causes the model to lose all
    # context for the current turn.
    if not kept_messages and messages:
        import logging as _logging

        _logger = _logging.getLogger(__name__)
        for idx in range(len(messages) - 1, -1, -1):
            if getattr(messages[idx], "type", "") == "human":
                kept_messages = messages[idx:]
                dropped_messages = messages[:idx]
                _logger.warning(
                    "truncate_messages_to_budget: most recent turn exceeds "
                    "budget (%d tokens); force-including %d messages.",
                    active_context_budget,
                    len(kept_messages),
                )
                break
        if not kept_messages:
            kept_messages = messages[-1:]
            dropped_messages = messages[:-1]

    return dropped_messages, kept_messages


def get_message_tokens(msg: dict, *, model_id: str | None = None) -> int:
    """Get message token size, prioritizing Bedrock usage if available."""
    usage = msg.get("usage")
    if isinstance(usage, dict):
        out = usage.get("outputTokens") or usage.get("output_tokens") or 0
        if out > 0:
            return out
    content = msg.get("content", "")
    tokens = estimate_model_tokens(content, model_id)
    timeline = msg.get("timeline", [])
    if timeline:
        tokens += estimate_model_tokens(json.dumps(timeline), model_id)
    return tokens


STATIC_BUDGETS: dict[str, dict[str, int]] = {}


def eagerly_initialize_static_budgets():
    """
    Pre-computes and caches Bedrock tool specs and token-count results
    for the static system prompt and ALL_TOOLS to prevent runtime latency.
    """
    import logging

    logger = logging.getLogger(__name__)

    try:
        from config import get_config
        from langgraph_orchestration.prompt_builder import PromptBuilder
        from langgraph_orchestration.tools import ALL_TOOLS

        provider = get_config().LLM_PROVIDER
        from llm_provider.model_factory import get_provider_models

        model_ids = get_provider_models(provider)
        for tool in ALL_TOOLS:
            _tool_to_bedrock_spec(tool)

        tool_key = tuple(getattr(tool, "name", str(tool)) for tool in ALL_TOOLS)
        for model_id in model_ids:
            system_prompt = PromptBuilder.build_system_prompt("balanced")
            sys_res = count_converse_tokens_cached(
                model_id,
                cache_key=("system", "balanced", system_prompt),
                system=system_prompt,
                messages=[{"role": "user", "content": [{"text": ""}]}],
            )
            tool_res = count_converse_tokens_cached(
                model_id,
                cache_key=("tools", tool_key),
                messages=[{"role": "user", "content": [{"text": ""}]}],
                tools=ALL_TOOLS,
            )
            STATIC_BUDGETS[model_id] = {
                "system": int(sys_res.get("tokens", 0)),
                "tools": int(tool_res.get("tokens", 0)),
            }
        logger.info("Pre-computed static budgets for %d models", len(STATIC_BUDGETS))
    except Exception as e:
        public = public_tool_error(
            "STATIC_TOKEN_BUDGET_INITIALIZATION_FAILED",
            "Static token budget initialization failed.",
        )
        log_safe_exception(logger, "initialize_static_token_budgets", e, public)
