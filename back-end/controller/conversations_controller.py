"""
Conversation/chat API routes.

Streaming workflow
------------------
1. ``chat`` / ``resume_agent`` validate the request body and delegate to
   :func:`_handle_agent_stream`.
2. ``_handle_agent_stream`` authorizes the configured provider/model selection,
   verifies conversation ownership
   (using a user_id-only projection so the full message array isn't
   downloaded — see FIX [L7]), debits the user quota via
   :class:`UserQuotaService`, then acquires the per-user-per-provider LLM
   rate-limiter slot (FIX [M18]/[M19]).
3. If the rate-limiter rejects the request, the just-debited quota is
   refunded (FIX [C4]) because the LLM call never produced user-visible
   output. The same refund is applied if the streaming generator fails
   before yielding its first SSE event.
4. SSE events are produced by :func:`_stream_with_heartbeats`, which wraps
   the underlying generator with a producer task and emits ``: heartbeat``
   comments every ``interval_seconds`` to keep proxy/LB idle timeouts at
   bay during long LLM/DB operations.
5. The rate-limiter slot is released exactly once via a ``finally`` block
   guarded by the ``rate_limiter_released`` flag.
"""

import asyncio
import contextlib
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from google.api_core.exceptions import (
    DeadlineExceeded,
    ResourceExhausted,
    ServiceUnavailable,
    TooManyRequests,
)

from config import get_config

Config = get_config()
from api_contract.conversations import (
    AgentResumeRequest,
    ChatRequest,
    ConversationId,
    RenameConversationRequest,
)
from api_contract.streaming import STREAMING_RESPONSES
from core.errors import log_safe_exception, public_tool_error
from dependencies import get_authenticated_db_config, get_current_user
from service.conversations.conversation_service import ConversationService
from service.llm import LLMOptionsService, ModelSelectionError, ModelSelectionReason

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Moonlit Conversation End Points"])

# ENH [RL-HTTP]: Import the shared HTTP rate limiter for IP-level protection.
# This is Layer 1 of the 4-layer rate-limiting stack:
#   Layer 1: HTTP (slowapi, per-IP) ← THIS
#   Layer 2: User Quota (Redis, per-user per-min/hour/day)
#   Layer 3: LLM Rate Limiter (Redis, per-user-per-provider RPM + concurrent)
#   Layer 4: Task Lease (Firestore, per-conversation 1-concurrent)
from controller.rate_limiter import limiter

_TRANSIENT_FIRESTORE_ERRORS = (
    DeadlineExceeded,
    ResourceExhausted,
    ServiceUnavailable,
    TooManyRequests,
)


def _firestore_unavailable_response(exc: Exception) -> HTTPException:
    """
    Log and build a 503 service unavailable response when Firestore operations fail.

    Args:
        exc: The underlying exception from Firestore/Google API client.

    Returns:
        A FastAPI HTTPException indicating temporary database unavailability with retry headers.
    """
    public = public_tool_error(
        "CONVERSATION_STORAGE_UNAVAILABLE",
        "Conversation storage is temporarily unavailable.",
    )
    log_safe_exception(logger, "conversation_storage", exc, public)
    return HTTPException(
        status_code=503,
        detail={
            "error": public.code,
            "message": public.message,
        },
        headers={"Retry-After": "2"},
    )


def _build_provider_options() -> tuple[list[dict], str]:
    """
    Fetch LLM provider options and the default provider configured for the server.

    Returns:
        A tuple containing:
            - list[dict]: A list of provider configurations (supported models, details).
            - str: The default provider name (e.g., 'gemini', 'openai').
    """
    return LLMOptionsService.build_provider_options()


async def _stream_with_heartbeats(source, *, interval_seconds: float = 15.0):
    """
    Forward an SSE source while sending periodic heartbeats to prevent idle connection closures.

    Model calls, database queries, embeddings, and checkpoint compaction can be
    silent for longer than common proxy idle limits (e.g., Load Balancers, Cloudflare).
    A separate producer task consumes the source generator, putting events onto a queue
    so we can yield `: heartbeat\\n\\n` comments without interrupting or cancelling
    the underlying agent execution.

    Args:
        source: The asynchronous generator yielding SSE lines.
        interval_seconds: Max seconds to wait before yielding a heartbeat comment.

    Yields:
        SSE events from the source generator, or heartbeat comments.
    """
    queue: asyncio.Queue = asyncio.Queue()
    finished = object()

    async def produce():
        try:
            async for item in source:
                await queue.put(("item", item))
        except BaseException as exc:
            await queue.put(("error", exc))
        finally:
            await queue.put(("finished", finished))

    producer = asyncio.create_task(produce())
    try:
        while True:
            try:
                kind, value = await asyncio.wait_for(queue.get(), timeout=interval_seconds)
            except asyncio.TimeoutError:
                yield ": heartbeat\n\n"
                continue

            if kind == "item":
                yield value
            elif kind == "error":
                raise value
            else:
                break
    finally:
        if not producer.done():
            producer.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await producer


async def _handle_agent_stream(
    request: Request,
    user_id: str,
    conversation_id: str,
    provider: str,
    model: Optional[str],
    stream_generator_kwargs: dict,
    require_existing_conversation: bool = True,
):
    """
    Authorize model selection, acquire quota + rate-limiter locks, and return a streaming SSE response.

    Authorization occurs before every resource-affecting operation. For a
    continuation or resume, existing ownership is required before quota. The
    remaining admission order is intentionally quota-first, rate-limiter-second:

    1. **Verify ownership** for client-supplied conversation IDs. A missing
       conversation returns 404 and an unowned conversation returns 403.
    2. **Debit quota** via :meth:`UserQuotaService.check_and_increment`.
       If the user is over quota we short-circuit with a 429 and do NOT
       touch the rate limiter.
    3. **Acquire the per-user-per-provider LLM rate-limiter slot**
       (:meth:`ProviderRateLimiter.acquire`). If it rejects, the request
       never produced LLM output, so we :meth:`refund` the quota debit
       (FIX [C4]).
    4. **Build the SSE response.** If the underlying streaming generator
       raises before yielding its first event, the quota debit is also
       refunded (FIX [C4]). The rate-limiter slot is released exactly once
       via a ``finally`` block guarded by ``rate_limiter_released``.

    Args:
        request: The active FastAPI Request.
        user_id: Unique identifier for the current user.
        conversation_id: Unique ID of the conversation.
        provider: LLM Provider name (e.g., 'gemini', 'openai').
        model: Optional specific LLM model ID.
        stream_generator_kwargs: Additional parameters passed to the streaming generator.
        require_existing_conversation: Whether ownership of an existing conversation is required.

    Returns:
        A StreamingResponse yielding Server-Sent Events (SSE).

    Raises:
        HTTPException: For invalid provider/model (400), database permission
            errors (403), missing continuations (404), user rate-limits (429),
            or internal errors (500).
    """
    try:
        provider, model = LLMOptionsService.resolve_selection(provider, model)
    except ModelSelectionError as exc:
        if exc.reason is ModelSelectionReason.INVALID_PROVIDER:
            detail = {
                "error": "invalid_provider",
                "message": "Unsupported model provider.",
            }
        else:
            detail = {
                "error": "invalid_model",
                "message": "Model is not enabled for this provider.",
            }
        raise HTTPException(
            status_code=400,
            detail=detail,
        ) from exc

    if require_existing_conversation:
        try:
            # FIX [L7]: Previously this called get_conversation_data, which
            # downloaded the ENTIRE conversation document (all messages,
            # potentially megabytes) purely to verify ownership. Use the
            # user_id-only projection variant instead — same security check,
            # ~1 field of Firestore read traffic.
            conversation_exists = await run_in_threadpool(
                ConversationService.verify_conversation_owner,
                conversation_id,
                user_id,
            )
            if not conversation_exists:
                raise HTTPException(status_code=404, detail="Conversation not found")
        except PermissionError as e:
            public = public_tool_error(
                "CONVERSATION_ACCESS_DENIED",
                "Conversation access denied.",
            )
            log_safe_exception(logger, "verify_conversation_owner", e, public)
            raise HTTPException(
                status_code=403,
                detail={"error": public.code, "message": public.message},
            ) from e

    user_quota = request.app.state.user_quota
    quota_allowed, usage = await user_quota.check_and_increment(user_id)

    if not quota_allowed:
        logger.warning("User %s quota exceeded", user_id)
        raise HTTPException(
            status_code=429,
            detail={
                "error": "quota_exceeded",
                "message": "You have exceeded your rate limit. Please wait.",
                "usage": usage.to_dict(),
            },
        )

    # Track whether the debited quota has been refunded. Once the stream has
    # emitted any user-visible output we MUST NOT refund, because the user
    # consumed real LLM tokens for that turn (FIX [C4]).
    quota_refunded = False

    llm_rate_limiter = request.app.state.llm_rate_limiter
    # FIX [M18]: Rate limiter is keyed per-user-per-provider so one user
    # cannot exhaust the global RPM budget for everyone else on the same
    # provider.
    success, api_key = await llm_rate_limiter.acquire(provider, user_id)

    if not success:
        # FIX [C4]: Rate-limiter rejection produces no user-visible output,
        # so refund the quota debit we just made.
        await user_quota.refund(user_id)
        quota_refunded = True
        logger.warning(
            "LLM rate limit timeout for user %s on provider %s",
            user_id,
            provider,
        )
        raise HTTPException(
            status_code=429,
            detail={
                "error": "server_busy",
                "message": "Server is busy. Please try again in a moment.",
            },
        )

    rate_limiter_released = False
    stream_started = False  # FIX [C4]: tracks whether the user has seen any SSE output
    try:

        async def sse_generator():
            # FIX [C4-UNBOUND]: quota_refunded must be declared nonlocal so the
            # generator reads/writes the outer variable. Without this, Python
            # treats it as a local of sse_generator (because of the assignment
            # at line 288), causing UnboundLocalError when the except block
            # reads it before any assignment — which happens when the stream
            # is cancelled before producing any output.
            nonlocal rate_limiter_released, stream_started, quota_refunded
            try:
                source = ConversationService.create_streaming_generator(
                    conversation_id=conversation_id,
                    user_id=user_id,
                    api_key=api_key,
                    provider=provider,
                    model=model,
                    **stream_generator_kwargs,
                )
                async for sse_line in _stream_with_heartbeats(source):
                    stream_started = True
                    yield sse_line
            except BaseException:
                # FIX [C4]: If the streaming generator raised before emitting
                # ANY user-visible output, the user did not consume LLM
                # tokens for this turn — refund the debit. If partial content
                # was already yielded, do NOT refund.
                if not stream_started and not quota_refunded:
                    try:
                        await user_quota.refund(user_id)
                    except Exception as refund_err:
                        public = public_tool_error(
                            "QUOTA_REFUND_FAILED",
                            "Quota refund failed.",
                        )
                        log_safe_exception(logger, "refund_stream_quota", refund_err, public)
                    quota_refunded = True
                raise
            finally:
                if not rate_limiter_released:
                    # FIX [M18]: release keyed on the same per-user-per-provider
                    # tuple used during acquire.
                    # FIX [AWAIT]: release() is async — must be awaited.
                    # Without await, the coroutine was created but never
                    # executed, silently leaking concurrency slots.
                    await llm_rate_limiter.release(provider, user_id)
                    rate_limiter_released = True

        headers = ConversationService.get_streaming_headers(conversation_id)
        return StreamingResponse(
            sse_generator(),
            media_type="text/event-stream",
            headers=headers,
        )
    except Exception as e:
        if not rate_limiter_released:
            # FIX [AWAIT]: release() is async — must be awaited.
            await llm_rate_limiter.release(provider, user_id)
            rate_limiter_released = True
        # FIX [C4]: Outer-path failure (e.g. StreamingResponse construction
        # error) — refund only if no SSE bytes were ever yielded.
        if not stream_started and not quota_refunded:
            try:
                await user_quota.refund(user_id)
            except Exception as refund_err:
                public = public_tool_error(
                    "QUOTA_REFUND_FAILED",
                    "Quota refund failed.",
                )
                log_safe_exception(logger, "refund_agent_quota", refund_err, public)
            quota_refunded = True
        public = public_tool_error(
            "AGENT_STREAM_FAILED",
            "Agent streaming failed.",
        )
        log_safe_exception(logger, "stream_agent", e, public)
        if ConversationService.check_quota_error(str(e)):
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
        raise HTTPException(status_code=500, detail="An internal server error occurred.")


@router.post(
    "/pass_user_prompt_to_llm",
    response_class=StreamingResponse,
    responses=STREAMING_RESPONSES,
)
# ENH [RL-HTTP]: Layer 1 IP-level guard. 30/min per IP — the user quota
# (Layer 2) handles per-user fairness; this prevents IP-level abuse.
@limiter.limit("30 per minute")
async def chat(
    request: Request,
    data: ChatRequest,
    user: dict = Depends(get_current_user),
    db_config: Optional[dict] = Depends(get_authenticated_db_config),
):
    """
    Handle incoming user prompts and stream the agentic/LLM response as SSE.

    This endpoint starts or continues a chat conversation. It sets up agent execution kwargs,
    checks rate limits/quotas, and delegates to the internal stream handler.

    Args:
        request: The active FastAPI Request object.
        data: The ChatRequest payload containing the prompt, model config, and options.
        user: The authenticated user dict containing claims (e.g. UID).
        db_config: Optional target database connection configs.

    Returns:
        A StreamingResponse yielding SSE tokens/events.
    """
    provider = data.provider or Config.LLM_PROVIDER
    require_existing_conversation = data.conversation_id is not None
    conversation_id = data.conversation_id or ConversationService.create_conversation_id()
    user_id = user.get("uid") if isinstance(user, dict) else user

    logger.info(
        "LLM selection requested: provider=%s, model=%s, conversation_id=%s",
        provider,
        data.model or "(default)",
        conversation_id,
    )

    kwargs = {
        "prompt": data.prompt,
        "db_config": db_config,
        "enable_reasoning": data.enable_reasoning,
        "reasoning_effort": data.reasoning_effort,
        "response_style": data.response_style,
        "max_rows": data.max_rows,
        "task_mode": getattr(data, "task_mode", "normal") or "normal",
    }

    return await _handle_agent_stream(
        request=request,
        user_id=user_id,
        conversation_id=conversation_id,
        provider=provider,
        model=data.model,
        stream_generator_kwargs=kwargs,
        require_existing_conversation=require_existing_conversation,
    )


@router.post(
    "/resume_agent",
    response_class=StreamingResponse,
    responses=STREAMING_RESPONSES,
)
# ENH [RL-HTTP]: Layer 1 IP-level guard for agent resume (same as chat).
@limiter.limit("30 per minute")
async def resume_agent(
    request: Request,
    data: AgentResumeRequest,
    user: dict = Depends(get_current_user),
    db_config: Optional[dict] = Depends(get_authenticated_db_config),
):
    """
    Resume an active LangGraph conversation paused by a human-in-the-loop interrupt.

    Used to signal approval/feedback to the agent's workflow when execution pauses
    and requires verification.

    Args:
        request: The active FastAPI Request object.
        data: The AgentResumeRequest containing conversation ID and resume parameters.
        user: The authenticated user dict.
        db_config: Optional database connection configs.

    Returns:
        A StreamingResponse resuming the agent execution.
    """
    user_id = user.get("uid") if isinstance(user, dict) else user
    provider = data.provider or Config.LLM_PROVIDER

    kwargs = {
        "prompt": None,
        "db_config": db_config,
        "enable_reasoning": data.enable_reasoning,
        "reasoning_effort": data.reasoning_effort,
        "response_style": data.response_style,
        "max_rows": data.max_rows,
        "resume": data.resume,
        "task_mode": getattr(data, "task_mode", "normal") or "normal",
    }

    return await _handle_agent_stream(
        request=request,
        user_id=user_id,
        conversation_id=data.conversation_id,
        provider=provider,
        model=data.model,
        stream_generator_kwargs=kwargs,
        require_existing_conversation=True,
    )


@router.get("/llm/options")
async def get_llm_options(user: dict = Depends(get_current_user)):
    """
    Retrieve available provider/model options and defaults for the current deployment.

    Args:
        user: The authenticated user dict.

    Returns:
        A dict containing default provider, default model, and the list of all supported providers.
    """
    _ = user  # keep route authenticated and avoid unused arg linting

    provider_options, default_provider = _build_provider_options()
    default_option = next(
        (option for option in provider_options if option["name"] == default_provider),
        None,
    )
    default_model = (
        default_option["default_model"]
        if default_option and default_option.get("default_model")
        else LLMOptionsService.default_model(default_provider)
    )

    # This logic is used to determine if the reasoning is supported for the specfic model or not
    # using the model_capability function from the llm_provider.model_capabilities module.
    from llm_provider.model_capabilities import model_capability

    capabilities = {}
    for provider in provider_options:
        for model in provider.get("models", []):
            reasoning_type = model_capability(model, "reasoning_type", "none")
            capabilities[model] = {"supports_reasoning": reasoning_type == "openai_effort"}

    return {
        "status": "success",
        "default_provider": default_provider,
        "default_model": default_model,
        "providers": provider_options,
        "capabilities": capabilities,
    }


def _sanitize_messages(messages: list) -> list:
    """
    Process and sanitize the message history list for a conversation.

    This function performs two main tasks:
    1. Deserializes the stringified 'args' and 'result' fields of timeline
       items (which are stored as JSON strings in Firestore) back into native
       Python dictionaries/lists. This prevents double-serialization backslashes
       in the final API response.
    2. Strips massive, redundant result datasets ('data' and 'preview' arrays)
       from 'execute_query' tool steps. The frontend doesn't need these in the
       timeline payload since it fetches them asynchronously from the
       get_execution_result endpoint.

    Args:
        messages: A list of raw message dictionaries from database storage.

    Returns:
        A list of sanitized message dictionaries with unescaped nested objects.
    """
    import json

    sanitized = []
    for msg in messages:
        if not isinstance(msg, dict):
            sanitized.append(msg)
            continue
        msg_copy = dict(msg)
        timeline = msg_copy.get("timeline")
        if timeline and isinstance(timeline, list):
            new_timeline = []
            for item in timeline:
                if not isinstance(item, dict):
                    new_timeline.append(item)
                    continue
                item_copy = dict(item)

                # Parse args to dict if they are stored as JSON string
                args_val = item_copy.get("args")
                if isinstance(args_val, str):
                    try:
                        item_copy["args"] = json.loads(args_val)
                    except Exception:
                        pass

                # Parse result to dict if stored as JSON string
                res_val = item_copy.get("result")
                if isinstance(res_val, str):
                    try:
                        res_val = json.loads(res_val)
                    except Exception:
                        pass

                # Strip large query arrays from execute_query results
                if item_copy.get("type") == "tool" and item_copy.get("name") == "execute_query":
                    if isinstance(res_val, dict):
                        res_val = dict(res_val)
                        res_val.pop("data", None)
                        res_val.pop("preview", None)

                item_copy["result"] = res_val
                new_timeline.append(item_copy)
            msg_copy["timeline"] = new_timeline
        sanitized.append(msg_copy)
    return sanitized


@router.get("/get_conversation/{conversation_id}")
async def get_conversation(conversation_id: ConversationId, user: dict = Depends(get_current_user)):
    """
    Get message history and status for a specific conversation.

    Verifies user ownership before returning metadata, settings, and the list
    of messages (which are sanitized to remove massive SQL arrays and clean up backslashes).

    Args:
        conversation_id: The unique ID of the conversation.
        user: The authenticated user dict containing the UID.

    Returns:
        A dict containing a success status and the conversation details.

    Raises:
        HTTPException: 404 if conversation is not found, 403 for permission errors,
                     503 if Firestore is temporarily unavailable, or 500 for general failures.
    """
    try:
        user_id = user.get("uid") if isinstance(user, dict) else user
        conv_data = await run_in_threadpool(ConversationService.get_conversation_data, conversation_id, user_id)
        if conv_data:
            # Keep this flat response shape; frontend conversation loaders read `conversation` directly.
            raw_messages = conv_data.get("messages") or []
            sanitized_conv = {
                "id": conversation_id,
                "title": conv_data.get("title") or "Conversation",
                "timestamp": conv_data.get("timestamp"),
                "messages": _sanitize_messages(raw_messages),
                "task_mode": conv_data.get("task_mode") or "normal",
                "task_status": conv_data.get("task_status") or "",
            }
            return {"status": "success", "conversation": sanitized_conv}
        raise HTTPException(status_code=404, detail="Conversation not found")
    except PermissionError as e:
        public = public_tool_error(
            "CONVERSATION_ACCESS_DENIED",
            "Conversation access denied.",
        )
        log_safe_exception(logger, "get_conversation_access", e, public)
        raise HTTPException(
            status_code=403,
            detail={"error": public.code, "message": public.message},
        ) from e
    except _TRANSIENT_FIRESTORE_ERRORS as e:
        raise _firestore_unavailable_response(e)
    except HTTPException:
        raise
    except Exception as exc:
        public = public_tool_error(
            "CONVERSATION_FETCH_FAILED",
            "Conversation retrieval failed.",
        )
        log_safe_exception(logger, "get_conversation", exc, public)
        raise HTTPException(
            status_code=500,
            detail="An internal error occurred while fetching conversation.",
        ) from exc


@router.get("/get_execution_result/{conversation_id}/{execution_id}")
async def fetch_execution_result(
    conversation_id: ConversationId,
    execution_id: str,
    user: dict = Depends(get_current_user),
):
    """
    Get full query execution results (columns and rows) for an inline table.

    Verifies conversation ownership and retrieves cached query outputs from
    the execution_results subcollection.

    Args:
        conversation_id: The unique ID of the conversation.
        execution_id: The ID of the query execution.
        user: The authenticated user dict containing the UID.

    Returns:
        A dict with a success status and the execution details containing column header and row data.

    Raises:
        HTTPException: 404 if conversation or result is not found, 403 if permission is denied,
                     503 if Firestore is unavailable, or 500 for general failures.
    """
    try:
        user_id = user.get("uid") if isinstance(user, dict) else user

        # Verify ownership using a user_id-only projection. Downloading the
        # full message array once per artifact causes severe N+1 amplification.
        conversation_exists = await run_in_threadpool(
            ConversationService.verify_conversation_owner,
            conversation_id,
            user_id,
        )
        if not conversation_exists:
            raise HTTPException(status_code=404, detail="Conversation not found")

        from service.firestore.firestore_service import get_execution_result

        result_data = await run_in_threadpool(get_execution_result, conversation_id, execution_id)

        if not result_data:
            raise HTTPException(status_code=404, detail="Execution result not found")

        sanitized_result = {
            "columns": result_data.get("columns") or [],
            "data": result_data.get("data") or [],
            "row_count": result_data.get("row_count") or 0,
            "total_rows": result_data.get("total_rows") or 0,
            "truncated": result_data.get("truncated") or False,
        }
        return {"status": "success", "data": sanitized_result}
    except PermissionError as e:
        public = public_tool_error(
            "CONVERSATION_ACCESS_DENIED",
            "Conversation access denied.",
        )
        log_safe_exception(logger, "get_execution_result_access", e, public)
        raise HTTPException(
            status_code=403,
            detail={"error": public.code, "message": public.message},
        ) from e
    except _TRANSIENT_FIRESTORE_ERRORS as e:
        raise _firestore_unavailable_response(e)
    except HTTPException:
        raise
    except Exception as exc:
        public = public_tool_error(
            "EXECUTION_RESULT_FETCH_FAILED",
            "Execution result retrieval failed.",
        )
        log_safe_exception(logger, "get_execution_result", exc, public)
        raise HTTPException(status_code=500, detail="An internal error occurred.") from exc


@router.get("/get_all_user_conversations")
async def get_all_user_conversations(user: dict = Depends(get_current_user)):
    """
    Retrieve all conversation metadata (id, title, timestamp) for the authenticated user.

    Args:
        user: The authenticated user dict.

    Returns:
        A dict containing success status and list of conversations.
    """
    user_id = user.get("uid") if isinstance(user, dict) else user
    conversations = await run_in_threadpool(ConversationService.get_user_conversations, user_id)
    # Keep this flat response shape; frontend conversation loaders read `conversations` directly.
    return {"status": "success", "conversations": conversations}


@router.delete("/delete_conversation/{conversation_id}")
async def delete_conversation(conversation_id: ConversationId, user: dict = Depends(get_current_user)):
    """
    Delete a conversation and all its associated messages.

    Args:
        conversation_id: The unique ID of the conversation to delete.
        user: The authenticated user dict.

    Returns:
        A success status dict.

    Raises:
        HTTPException: 403 if permission is denied, 404 if conversation is missing,
                     or 500 for general failures.
    """
    try:
        user_id = user.get("uid") if isinstance(user, dict) else user
        await run_in_threadpool(ConversationService.delete_user_conversation, conversation_id, user_id)
        return {"status": "success"}
    except PermissionError as e:
        public = public_tool_error(
            "CONVERSATION_ACCESS_DENIED",
            "Conversation access denied.",
        )
        log_safe_exception(logger, "delete_conversation_access", e, public)
        raise HTTPException(
            status_code=403,
            detail={"error": public.code, "message": public.message},
        ) from e
    except ValueError as e:
        public = public_tool_error(
            "CONVERSATION_NOT_FOUND",
            "Conversation not found.",
        )
        log_safe_exception(logger, "delete_conversation_missing", e, public)
        raise HTTPException(
            status_code=404,
            detail={"error": public.code, "message": public.message},
        ) from e
    except Exception as e:
        public = public_tool_error(
            "CONVERSATION_DELETE_FAILED",
            "Conversation deletion failed.",
        )
        log_safe_exception(logger, "delete_conversation", e, public)
        raise HTTPException(
            status_code=500,
            detail="An internal error occurred while deleting conversation.",
        ) from e


@router.patch("/rename_conversation/{conversation_id}")
async def rename_conversation(
    conversation_id: ConversationId,
    data: RenameConversationRequest,
    user: dict = Depends(get_current_user),
):
    """
    Rename a conversation with a new custom title.

    Args:
        conversation_id: The unique ID of the conversation to rename.
        data: The RenameConversationRequest containing the new title.
        user: The authenticated user dict.

    Returns:
        A dict containing the success status and the updated title.

    Raises:
        HTTPException: 403 if permission is denied, 404 if conversation is missing,
                     or 500 for general failures.
    """
    try:
        user_id = user.get("uid") if isinstance(user, dict) else user
        title = await run_in_threadpool(
            ConversationService.rename_user_conversation,
            conversation_id,
            user_id,
            data.title,
        )
        return {"status": "success", "title": title}
    except PermissionError as e:
        public = public_tool_error(
            "CONVERSATION_ACCESS_DENIED",
            "Conversation access denied.",
        )
        log_safe_exception(logger, "rename_conversation_access", e, public)
        raise HTTPException(
            status_code=403,
            detail={"error": public.code, "message": public.message},
        ) from e
    except ValueError as e:
        public = public_tool_error(
            "CONVERSATION_NOT_FOUND",
            "Conversation not found.",
        )
        log_safe_exception(logger, "rename_conversation_missing", e, public)
        raise HTTPException(
            status_code=404,
            detail={"error": public.code, "message": public.message},
        ) from e
    except Exception as e:
        public = public_tool_error(
            "CONVERSATION_RENAME_FAILED",
            "Conversation rename failed.",
        )
        log_safe_exception(logger, "rename_conversation", e, public)
        raise HTTPException(
            status_code=500,
            detail="An internal error occurred while renaming conversation.",
        ) from e
