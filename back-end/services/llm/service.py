"""
LLMService - Backward-compatible facade for LLM operations.

Maintains the original API surface for existing consumers while delegating
to the new focused classes.
"""


from .client import LLMClient
from .prompt_builder import PromptBuilder
from .tool_executor import ToolExecutor
from .orchestrator import ChatOrchestrator


class LLMService:
    """
    Backward-compatible facade for LLM APIs.
    
    Delegates to focused classes:
    - LLMClient: Connection management
    - PromptBuilder: Prompt construction
    - ToolExecutor: Tool handling
    - ChatOrchestrator: Conversation flow
    """
    
    # Client operations
    # Legacy alias retained for backward compatibility.
    _get_cerebras_client = staticmethod(LLMClient.get_client)
    _get_provider_client = staticmethod(LLMClient.get_client)
    get_provider_name = staticmethod(LLMClient.get_provider_name)
    get_supported_providers = staticmethod(LLMClient.get_supported_providers)
    get_model_name = staticmethod(LLMClient.get_model_name)
    is_reasoning_model = staticmethod(LLMClient.is_reasoning_model)
    get_max_tokens = staticmethod(LLMClient.get_max_tokens)
    get_max_completion_tokens = staticmethod(LLMClient.get_max_completion_tokens)
    
    # Prompt operations
    get_system_prompt = staticmethod(PromptBuilder.get_system_prompt)
    
    # Tool operations
    get_tool_definitions = staticmethod(ToolExecutor.get_tool_definitions)
    execute_tool = staticmethod(ToolExecutor.execute)
    _summarize_result = staticmethod(ToolExecutor.summarize_for_ui)
    _summarize_for_llm = staticmethod(ToolExecutor.summarize_for_llm)
    
    # Chat operations
    send_message = staticmethod(ChatOrchestrator.send_message)
    send_message_with_tools = staticmethod(ChatOrchestrator.stream_with_tools)
