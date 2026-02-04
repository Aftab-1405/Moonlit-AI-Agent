"""
Conversation Service - Pure FastAPI Version

Handles conversation management, AI streaming responses, and Firestore persistence.
No Flask dependencies.
"""

import uuid
import logging
import re
from typing import Optional, Generator

logger = logging.getLogger(__name__)


class ConversationService:
    """Service for managing conversations and AI interactions."""
    
    @staticmethod
    def create_or_get_conversation_id(provided_id: Optional[str] = None) -> str:
        """
        Generate new conversation ID or return provided one.
        
        Args:
            provided_id: Optional conversation ID from client
            
        Returns:
            A valid conversation ID
        """
        if provided_id:
            return provided_id
        return str(uuid.uuid4())
    
    @staticmethod
    def initialize_conversation(conversation_id: str, history: list = None) -> None:
        """Initialize conversation (no-op for stateless API)."""
        pass
    
    @staticmethod
    def get_conversation_data(conversation_id: str, user_id: str) -> Optional[dict]:
        """Fetch conversation from Firestore (verifies user ownership)."""
        from repositories import ConversationRepository
        return ConversationRepository.get_for_user(conversation_id, user_id)
    
    @staticmethod
    def delete_user_conversation(conversation_id: str, user_id: str) -> None:
        """Delete conversation from Firestore."""
        from repositories import ConversationRepository
        ConversationRepository.delete(conversation_id, user_id)
    
    @staticmethod
    def get_user_conversations(user_id: str) -> list:
        """Get all conversations for a user."""
        from repositories import ConversationRepository
        return ConversationRepository.get_by_user(user_id)
    
    @staticmethod
    def create_streaming_generator(
        conversation_id: str, 
        prompt: str, 
        user_id: str, 
        db_config: dict = None,
        enable_reasoning: bool = True,
        reasoning_effort: str = 'medium',
        response_style: str = 'balanced',
        max_rows: int = None,
        api_key: str = None
    ) -> Generator:
        """
        Create a generator for streaming AI responses WITH tool support.
        
        Args:
            conversation_id: The conversation ID
            prompt: User's prompt
            user_id: The user ID for Firestore
            db_config: Database connection config for tool execution
            enable_reasoning: Whether to use reasoning
            reasoning_effort: 'low', 'medium', or 'high'
            response_style: 'concise', 'balanced', or 'detailed'
            max_rows: Max rows to return from queries
            api_key: Optional API key for LLM calls (from rate limiter)
            
        Yields:
            Text chunks from AI response, tool status markers, or error messages
        """
        from repositories import ConversationRepository
        from services.llm import LLMService
        
        prompt_stored = False
        response_stored = False
        full_response_content = []
        tools_used = []
        was_aborted = False
        has_error = False  # Track if an error occurred
        
        try:
            # Fetch existing conversation history for context
            conv_data = ConversationRepository.get(conversation_id)
            history = None
            if conv_data and conv_data.get('messages'):
                messages = conv_data.get('messages', [])
                recent_messages = messages[-20:] if len(messages) > 20 else messages
                history = [
                    {"role": "user" if msg["sender"] == "user" else "model", "parts": [msg["content"]]}
                    for msg in recent_messages
                ]
                logger.debug(f"Loaded {len(history)} messages for context")
            
            # Use LLM Service with tool support
            responses = LLMService.send_message_with_tools(
                conversation_id, prompt, user_id, 
                history=history, 
                db_config=db_config,
                enable_reasoning=enable_reasoning,
                reasoning_effort=reasoning_effort,
                response_style=response_style,
                max_rows=max_rows,
                api_key=api_key
            )
            
            for chunk in responses:
                # Detect error messages from orchestrator - don't store these
                if chunk.startswith('\n[ERROR]') or chunk.startswith('[ERROR]'):
                    has_error = True
                    yield chunk
                    continue  # Don't append to full_response_content
                
                # Tool status markers - extract full data for persistence
                if chunk.startswith('[[TOOL:'):
                    # Full pattern: [[TOOL:name:status:args:result]]
                    # Args and result are JSON objects or 'null'
                    full_match = re.match(
                        r'\[\[TOOL:(\w+):(running|done):((?:\{.*?\}|null)):((?:\{.*?\}|null))\]\]',
                        chunk,
                        re.DOTALL
                    )
                    if full_match:
                        tool_name, status, args_str, result_str = full_match.groups()
                        
                        if status == 'running':
                            # Track running tool with placeholder for args (result comes later)
                            tools_used.append({
                                'name': tool_name,
                                'status': 'running',
                                'args': args_str,
                                'result': result_str
                            })
                            if not prompt_stored:
                                ConversationRepository.store_message(conversation_id, 'user', prompt, user_id)
                                prompt_stored = True
                        elif status == 'done':
                            # Update existing tool entry with 'done' status and full result
                            updated = False
                            for tool in tools_used:
                                if tool['name'] == tool_name and tool['status'] == 'running':
                                    tool['status'] = 'done'
                                    tool['args'] = args_str  # May have more complete args now
                                    tool['result'] = result_str
                                    updated = True
                                    break
                            # If no running entry found, add as new (edge case)
                            if not updated:
                                tools_used.append({
                                    'name': tool_name,
                                    'status': 'done',
                                    'args': args_str,
                                    'result': result_str
                                })
                    
                    full_response_content.append(chunk)
                    yield chunk
                    continue
                
                # Thinking markers
                if chunk.startswith('[[THINKING:'):
                    full_response_content.append(chunk)
                    yield chunk
                    continue
                
                # Store user prompt on first text chunk
                if not prompt_stored and not chunk.startswith('['):
                    ConversationRepository.store_message(conversation_id, 'user', prompt, user_id)
                    prompt_stored = True
                
                full_response_content.append(chunk)
                yield chunk

        except GeneratorExit:
            was_aborted = True
            logger.info(f"Stream aborted for conversation {conversation_id}")
            
        except Exception as err:
            has_error = True  # Mark as error - don't store
            error_str = str(err).lower()
            
            if 'rate_limit' in error_str or 'quota' in error_str or '429' in error_str:
                logger.warning(f'Rate limit exceeded: {err}')
                error_msg = "⚠️ **API Rate Limit Exceeded**\n\nPlease wait a moment and try again."
            elif 'authentication' in error_str or '401' in error_str:
                logger.error(f'Authentication error: {err}')
                error_msg = "⚠️ **Authentication Error**\n\nPlease check API keys."
            else:
                logger.error(f'API error: {err}')
                error_msg = "⚠️ **AI Service Error**\n\nPlease try again."
            
            yield error_msg
            
        finally:
            # Only store if we have actual content AND no errors occurred
            if prompt_stored and not response_stored and not has_error:
                response_text = "".join(full_response_content).strip()
                if response_text or tools_used:
                    if not response_text and tools_used:
                        response_text = "(Used tools to gather information)"
                    
                    if was_aborted and response_text:
                        response_text += "\n\n_(Response stopped by user)_"
                    
                    ConversationRepository.store_message(
                        conversation_id, 'ai', response_text, user_id,
                        tools=tools_used if tools_used else None
                    )
                    response_stored = True
                    status = "partial (aborted)" if was_aborted else "complete"
                    logger.info(f"Stored AI response ({status}): {len(response_text)} chars")
            elif has_error:
                logger.info(f"Skipped storing error response for conversation {conversation_id}")
    
    @staticmethod
    def get_streaming_headers(conversation_id: str) -> dict:
        """Get HTTP headers for streaming responses."""
        return {
            'X-Conversation-Id': conversation_id,
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no'
        }
    
    @staticmethod
    def check_quota_error(error_message: str) -> bool:
        """Check if an error message indicates quota exceeded."""
        error_lower = error_message.lower()
        return 'quota' in error_lower or '429' in error_lower or 'rate' in error_lower
