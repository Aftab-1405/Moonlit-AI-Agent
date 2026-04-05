"""
Moonlit LangGraph agent package (no FastAPI dependency).

Consumed by ``services/conversation_service``. Checkpointing is initialized from
``main.lifespan`` via ``agent.checkpointing.init_checkpointer``.

Optional CLI graph: ``moonlit_langgraph.py`` + ``langgraph.json`` at the backend root.
"""

from .agent import stream_conversation
from .prompt_builder import PromptBuilder
from .tool_executor import ToolExecutor
from .model_factory import get_supported_providers, get_provider_models, get_default_model

__all__ = [
    "stream_conversation",
    "PromptBuilder",
    "ToolExecutor",
    "get_supported_providers",
    "get_provider_models",
    "get_default_model",
]
