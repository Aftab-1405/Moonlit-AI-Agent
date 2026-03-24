# File: api/routes/conversation.py
"""Conversation/chat related API routes."""

import logging
import os
from typing import Optional

from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool

from config import Config
from dependencies import get_current_user, get_db_config
from services.conversation_service import ConversationService
from services.llm.client import LLMClient
from api.request_schemas import ChatRequest

logger = logging.getLogger(__name__)
router = APIRouter(tags=["conversation"])


def _split_csv(raw: str) -> list[str]:
    return [item.strip() for item in (raw or "").split(",") if item.strip()]


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            ordered.append(value)
    return ordered


def _provider_has_dedicated_key(provider_name: str) -> bool:
    provider = provider_name.strip().lower()
    if provider == "cerebras":
        return bool(_split_csv(os.getenv("CEREBRAS_API_KEYS", "")) or os.getenv("CEREBRAS_API_KEY", "").strip())
    if provider == "gemini":
        return bool(
            _split_csv(os.getenv("GEMINI_API_KEYS", ""))
            or os.getenv("GEMINI_API_KEY", "").strip()
            or os.getenv("GOOGLE_API_KEY", "").strip()
        )
    return False


def _get_provider_models(provider_name: str) -> list[str]:
    provider = provider_name.strip().lower()
    env_models = _split_csv(os.getenv(f"{provider.upper()}_MODELS", ""))
    provider_model = os.getenv(f"{provider.upper()}_MODEL", "").strip()

    if provider_model:
        return _dedupe([provider_model, *env_models])

    if env_models:
        return _dedupe(env_models)

    default_model = LLMClient.get_provider(provider).get_default_model()
    return _dedupe([default_model])


def _build_provider_options() -> tuple[list[dict], str]:
    supported = LLMClient.get_supported_providers()
    options = []
    for provider_name in supported:
        models = _get_provider_models(provider_name)
        options.append({
            "name": provider_name,
            "label": provider_name.capitalize(),
            "models": models,
            "default_model": models[0] if models else None,
            "has_api_key": _provider_has_dedicated_key(provider_name),
        })

    selected_options = [
        opt for opt in options
        if opt["has_api_key"] or opt["name"] == Config.LLM_PROVIDER
    ] or options
    default_provider = Config.LLM_PROVIDER if any(opt["name"] == Config.LLM_PROVIDER for opt in selected_options) else selected_options[0]["name"]
    return selected_options, default_provider


@router.get('/index')
async def index(user: dict = Depends(get_current_user)):
    """Authenticated health check."""
    return {'status': 'success', 'message': 'Authenticated'}


@router.post('/pass_user_prompt_to_llm')
async def pass_user_prompt_to_llm(
    request: Request,
    data: ChatRequest,
    user: dict = Depends(get_current_user),
    db_config: Optional[dict] = Depends(get_db_config)
):
    """Handle user input and stream AI response."""
    prompt = data.prompt
    enable_reasoning = data.enable_reasoning
    reasoning_effort = data.reasoning_effort
    response_style = data.response_style
    max_rows = data.max_rows
    provider = data.provider or Config.LLM_PROVIDER
    model = data.model

    conversation_id = ConversationService.create_or_get_conversation_id(data.conversation_id)
    user_id = user.get('uid') or user

    supported_providers = set(LLMClient.get_supported_providers())
    if provider not in supported_providers:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_provider",
                "message": f"Unsupported provider '{provider}'. Supported values: {sorted(supported_providers)}",
            },
        )
    
    logger.info(
        "LLM selection requested: provider=%s, model=%s, conversation_id=%s",
        provider,
        model or "(default)",
        conversation_id,
    )

    logger.debug(f'Received prompt for conversation: {conversation_id}')

    # Ownership check for existing conversation IDs
    if data.conversation_id:
        try:
            _ = ConversationService.get_conversation_data(conversation_id, user_id)
        except PermissionError as e:
            raise HTTPException(status_code=403, detail=str(e))
    
    # 1. Check user quota (fast, Redis-based)
    user_quota = request.app.state.user_quota
    quota_allowed, usage = await user_quota.check_and_increment(user_id)
    
    if not quota_allowed:
        logger.warning(f'User {user_id} quota exceeded')
        raise HTTPException(
            status_code=429,
            detail={
                'error': 'quota_exceeded',
                'message': 'You have exceeded your rate limit. Please wait.',
                'usage': usage.to_dict()
            }
        )
    
    # 2. Acquire global LLM rate limiter slot and get API key
    llm_rate_limiter = request.app.state.llm_rate_limiter
    success, api_key = await llm_rate_limiter.acquire()
    
    if not success:
        logger.warning(f'Global rate limit timeout for user {user_id}')
        raise HTTPException(
            status_code=429, 
            detail={
                'error': 'server_busy',
                'message': 'Server is busy. Please try again in a moment.'
            }
        )
    
    try:
        async def async_generator():
            try:
                generator = await run_in_threadpool(
                    ConversationService.create_streaming_generator,
                    conversation_id, prompt, user_id,
                    db_config=db_config,
                    enable_reasoning=enable_reasoning,
                    reasoning_effort=reasoning_effort,
                    response_style=response_style,
                    max_rows=max_rows,
                    api_key=api_key if provider == Config.LLM_PROVIDER else None,
                    provider=provider,
                    model=model,
                )
                for chunk in generator:
                    yield chunk
            finally:
                # Release rate limiter when streaming completes
                llm_rate_limiter.release()
        
        headers = ConversationService.get_streaming_headers(
            conversation_id,
            provider=provider,
            model=model,
        )
        return StreamingResponse(
            async_generator(),
            media_type='text/plain',
            headers=headers
        )
    except Exception as e:
        # Release rate limiter on error
        llm_rate_limiter.release()
        logger.error(f'Error initializing chat: {e}')
        if ConversationService.check_quota_error(str(e)):
            raise HTTPException(status_code=429, detail='Rate limit exceeded')
        raise HTTPException(status_code=500, detail=str(e))


@router.get('/llm/options')
async def get_llm_options(user: dict = Depends(get_current_user)):
    """Return available provider/model options for the current deployment."""
    _ = user  # keep route authenticated and avoid unused arg linting

    provider_options, default_provider = _build_provider_options()
    default_option = next(
        (option for option in provider_options if option["name"] == default_provider),
        None,
    )
    default_model = (
        default_option["default_model"]
        if default_option and default_option.get("default_model")
        else LLMClient.get_model_name(provider_name=default_provider)
    )

    return {
        "status": "success",
        "default_provider": default_provider,
        "default_model": default_model,
        "providers": provider_options,
    }


@router.get('/get_conversation/{conversation_id}')
async def get_conversation(
    conversation_id: str,
    user: dict = Depends(get_current_user)
):
    """Get messages for a conversation (user must own it)."""
    try:
        user_id = user.get('uid') or user
        conv_data = await run_in_threadpool(
            ConversationService.get_conversation_data,
            conversation_id, user_id
        )
        if conv_data:
            return {'status': 'success', 'conversation': conv_data}
        raise HTTPException(status_code=404, detail='Conversation not found')
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception('Error fetching conversation')
        raise HTTPException(status_code=500, detail=str(e))


@router.get('/get_conversations')
async def get_conversations(user: dict = Depends(get_current_user)):
    """Get all conversations for logged-in user."""
    user_id = user.get('uid') or user
    conversations = await run_in_threadpool(
        ConversationService.get_user_conversations,
        user_id
    )
    return {'status': 'success', 'conversations': conversations}


@router.post('/new_conversation')
async def new_conversation(user: dict = Depends(get_current_user)):
    """Create a new conversation."""
    conversation_id = ConversationService.create_or_get_conversation_id()
    return {'status': 'success', 'conversation_id': conversation_id}


@router.delete('/delete_conversation/{conversation_id}')
async def delete_conversation(
    conversation_id: str,
    user: dict = Depends(get_current_user)
):
    """Delete a conversation."""
    try:
        user_id = user.get('uid') or user
        await run_in_threadpool(
            ConversationService.delete_user_conversation,
            conversation_id, user_id
        )
        return {'status': 'success'}
    except Exception as e:
        logger.error(f'Error deleting conversation: {e}')
        raise HTTPException(status_code=500, detail=str(e))

