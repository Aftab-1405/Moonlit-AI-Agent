"""
LLM Service Package - Refactored from monolithic llm_service.py

Exports:
- LLMService: Backward-compatible facade (use this for existing code)
- LLMClient: Connection and config management
- PromptBuilder: System prompt and message construction
- ToolExecutor: Tool execution and result processing
- ChatOrchestrator: Conversation flow and agentic loop
- Provider factory helpers
"""

from .service import LLMService
from .client import LLMClient
from .prompt_builder import PromptBuilder
from .tool_executor import ToolExecutor
from .orchestrator import ChatOrchestrator
from .providers import get_provider, get_supported_provider_names

__all__ = [
    'LLMService',
    'LLMClient',
    'PromptBuilder',
    'ToolExecutor',
    'ChatOrchestrator',
    'get_provider',
    'get_supported_provider_names',
]
