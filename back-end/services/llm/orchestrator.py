"""
ChatOrchestrator - Conversation flow and agentic loop management.

Handles the multi-turn tool calling loop and final streaming response generation.
"""

import json
import logging
from typing import Generator, Dict, Any, Optional

from config import Config
from .client import LLMClient
from .prompt_builder import PromptBuilder
from .tool_executor import ToolExecutor

logger = logging.getLogger(__name__)

# Safety limit to prevent infinite loops
MAX_TOOL_ROUNDS = 10

# Tools whose results can be cached within a conversation
CACHEABLE_TOOLS = {
    'get_connection_status',
    'get_database_list', 
    'get_database_schema',
    'get_table_columns',
    'get_table_indexes',
    'get_table_constraints',
    'get_foreign_keys',
}


class ChatOrchestrator:
    """Conversation flow and agentic loop management."""
    
    @staticmethod
    def send_message(
        conversation_id: str,
        message: str,
        history: list = None
    ) -> str:
        """
        Simple message without tools - used for basic chat.
        Returns a non-streaming response.
        """
        client = LLMClient.get_client()
        messages = PromptBuilder.build_messages(history, message)
        
        response = client.chat.completions.create(
            model=LLMClient.get_model_name(),
            messages=messages
        )
        
        return response.choices[0].message.content
    
    @staticmethod
    def stream_with_tools(
        conversation_id: str,
        message: str,
        user_id: str,
        history: list = None,
        db_config: dict = None,
        enable_reasoning: bool = True,
        reasoning_effort: str = 'medium',
        response_style: str = 'balanced',
        max_rows: int = None,
        api_key: str = None,
        tool_cache: Optional[Dict[str, Any]] = None
    ) -> Generator[str, None, None]:
        """
        Sends a message to the LLM and handles tool calls in a streaming response.
        This orchestration loop runs on the backend to handle the multi-turn interaction.
        
        Args:
            conversation_id: Unique conversation identifier
            message: User's message
            user_id: User ID for tool execution context
            history: Previous conversation messages
            db_config: Database connection config for tool execution
            enable_reasoning: Whether to use reasoning (from user settings)
            reasoning_effort: 'low', 'medium', or 'high' (from user settings)
            response_style: 'concise', 'balanced', or 'detailed' (from user settings)
            max_rows: Max rows to return from queries (None = use server config)
            api_key: Optional API key for LLM calls (from rate limiter)
            tool_cache: Optional cache dict for storing tool results within conversation
            
        Yields:
            Text chunks from AI response, tool status markers, or error messages
        """
        # Initialize tool cache if not provided
        if tool_cache is None:
            tool_cache = {}
        client = LLMClient.get_client(api_key)
        model_name = LLMClient.get_model_name()
        
        # Build messages with history and style
        messages = PromptBuilder.build_messages(history, message, response_style)
        
        # Get tool definitions
        tools = ToolExecutor.get_tool_definitions()
        
        try:
            # Agentic loop: Keep calling the model until it stops making tool calls
            tool_round = 0
            
            while tool_round < MAX_TOOL_ROUNDS:
                tool_round += 1
                logger.info(f"Tool round {tool_round}: Sending request to LLM ({model_name}) with {len(tools)} tools")
                
                response = client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    tools=tools,
                    tool_choice="auto",
                    parallel_tool_calls=False,  # Sequential tool execution for reliability
                    temperature=0.1,  # Low temp for accurate tool usage
                    top_p=0.1
                )
                
                response_message = response.choices[0].message
                tool_calls = response_message.tool_calls
                
                # If no tool calls, we're done with the loop
                if not tool_calls:
                    logger.info(f"No more tool calls after {tool_round} rounds")
                    break
                
                # Add assistant response to messages
                messages.append(response_message)
                
                # Execute each tool call in this round
                for tool_call in tool_calls:
                    function_name = tool_call.function.name
                    
                    # Parse and validate arguments using Pydantic schemas
                    try:
                        raw_args = json.loads(tool_call.function.arguments) if tool_call.function.arguments else {}
                        function_args = ToolExecutor.validate_and_parse_args(function_name, raw_args)
                    except json.JSONDecodeError as e:
                        logger.error(f"JSON parse error for {function_name}: {e}")
                        function_args = {}
                        # Yield error and continue to next tool
                        yield f'[[TOOL:{function_name}:done:{{}}:{{"success":false,"error":"Invalid JSON arguments"}}]]\n\n'
                        continue
                    except ValueError as e:
                        logger.error(f"Validation error for {function_name}: {e}")
                        # Yield validation error
                        error_msg = json.dumps({"success": False, "error": str(e)})
                        yield f'[[TOOL:{function_name}:done:{{}}:{error_msg}]]\n\n'
                        continue
                    
                    # NOTE: Rationale is NOT yielded as separate text to prevent visual jumping
                    # during streaming. It's preserved in tool args for the accordion details.
                    
                    # Prepare arguments for display (rationale included for tool details)
                    display_args = dict(function_args)
                    
                    # For execute_query, show the ACTUAL max_rows being used (user setting)
                    if function_name == "execute_query":
                        if max_rows is not None:
                            display_args['max_rows'] = max_rows
                        else:
                            # No Limit selected - show what the server will actually use
                            display_args['max_rows'] = f"No Limit (server max: {Config.MAX_QUERY_RESULTS})"
                    
                    args_json = json.dumps(display_args, default=str)
                    
                    # Yield "running" status BEFORE tool execution
                    yield f"[[TOOL:{function_name}:running:{args_json}:null]]\n\n"
                    
                    # Generate cache key for cacheable tools
                    cache_key = None
                    if function_name in CACHEABLE_TOOLS:
                        # Create cache key from tool name + sorted args (excluding rationale)
                        cache_args = {k: v for k, v in function_args.items() if k != 'rationale'}
                        cache_key = f"{function_name}:{json.dumps(cache_args, sort_keys=True)}"
                    
                    # Check cache first for cacheable tools
                    if cache_key and cache_key in tool_cache:
                        logger.info(f"Cache hit for {function_name}")
                        parsed_response = tool_cache[cache_key]
                    else:
                        # Execute the tool
                        function_response = ToolExecutor.execute(
                            function_name, function_args, user_id,
                            db_config=db_config, max_rows=max_rows
                        )
                        # Parse once, reuse for both summaries
                        parsed_response = json.loads(function_response)
                        
                        # Cache the result if cacheable
                        if cache_key:
                            tool_cache[cache_key] = parsed_response
                            logger.info(f"Cached result for {function_name}")
                    
                    # Yield "done" status with STRUCTURED result (includes full data for frontend)
                    result_summary = ToolExecutor.summarize_for_ui(
                        function_name,
                        parsed_response  # Reuse parsed response
                    )
                    yield f"[[TOOL:{function_name}:done:{args_json}:{result_summary}]]\n\n"
                    
                    # Create token-efficient summary for LLM context (excludes full data)
                    llm_summary = ToolExecutor.summarize_for_llm(
                        function_name,
                        parsed_response  # Reuse parsed response
                    )
                    
                    # Add tool response to messages for LLM context
                    messages.append({
                        "tool_call_id": tool_call.id,
                        "role": "tool",
                        "name": function_name,
                        "content": llm_summary
                    })
            
            # After tool loop, get final streaming response
            logger.info("Getting final response after all tool executions (streaming)")
            
            # Determine if we should use reasoning for this request
            use_reasoning = enable_reasoning and LLMClient.is_reasoning_model()
            
            if use_reasoning:
                # Use Cerebras SDK for reasoning models
                stream = client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    stream=True,
                    reasoning_effort=reasoning_effort,
                    max_completion_tokens=LLMClient.get_max_completion_tokens(),
                    temperature=0.2,
                    top_p=0.2
                )
            else:
                # Final call without tools to get text response (non-reasoning)
                stream = client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    stream=True,
                    max_tokens=LLMClient.get_max_tokens(),
                    temperature=0.2,
                    top_p=0.2
                )
            
            # Yield chunks as they arrive, handling reasoning tokens
            reasoning_started = False
            has_content = False
            
            for chunk in stream:
                delta = chunk.choices[0].delta
                
                # Handle reasoning tokens (thinking)
                reasoning_content = getattr(delta, 'reasoning', None)
                if use_reasoning and reasoning_content:
                    if not reasoning_started:
                        yield "[[THINKING:start]]"
                        reasoning_started = True
                    yield f"[[THINKING:chunk:{reasoning_content}]]"
                
                # Handle content tokens
                content = getattr(delta, 'content', None)
                if content:
                    has_content = True
                    if reasoning_started:
                        yield "[[THINKING:end]]"
                        reasoning_started = False
                    yield content
            
            # Close thinking if stream ended during reasoning
            if reasoning_started:
                yield "[[THINKING:end]]"
            
            # If no content was yielded and no tools were called, provide fallback
            if not has_content and tool_round == 1:
                yield "I'm not sure how to handle that request using my available tools."

        except Exception as e:
            logger.error(f"Error in stream_with_tools: {e}")
            error_str = str(e).lower()
            
            # Parse error and return user-friendly message
            if '429' in error_str or 'rate_limit' in error_str or 'too_many_requests' in error_str or 'queue exceeded' in error_str:
                yield "\n[ERROR] ⚠️ **Rate Limit Exceeded**\n\nThe AI service is experiencing high traffic. Please wait a moment and try again."
            elif '401' in error_str or 'authentication' in error_str or 'unauthorized' in error_str:
                yield "\n[ERROR] ⚠️ **Authentication Error**\n\nUnable to authenticate with AI service. Please contact support."
            elif '503' in error_str or 'service unavailable' in error_str:
                yield "\n[ERROR] ⚠️ **Service Unavailable**\n\nThe AI service is temporarily unavailable. Please try again later."
            elif 'timeout' in error_str or 'timed out' in error_str:
                yield "\n[ERROR] ⚠️ **Request Timeout**\n\nThe request took too long. Please try a simpler query."
            elif 'connection' in error_str:
                yield "\n[ERROR] ⚠️ **Connection Error**\n\nUnable to connect to AI service. Please check your internet connection."
            else:
                yield "\n[ERROR] ⚠️ **AI Service Error**\n\nSomething went wrong. Please try again."
