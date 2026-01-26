/**
 * useConversations Hook
 * 
 * Manages conversation state, CRUD operations, and URL synchronization.
 * Extracted from Chat.jsx for better separation of concerns.
 * 
 * @module hooks/useConversations
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getConversations,
  getConversation,
  createConversation,
  deleteConversation,
} from '../api';
import logger from '../utils/logger';

/**
 * Hook for managing conversations and messages
 * @returns {Object} Conversation state and handlers
 */
export function useConversations() {
  const { conversationId } = useParams();
  const navigate = useNavigate();

  // State
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);

  // Refs
  const prevConversationIdRef = useRef(null);
  const newlyCreatedConvIdRef = useRef(null);

  // Fetch all conversations
  const fetchConversations = useCallback(async () => {
    try {
      const data = await getConversations();
      if (data.status === 'success') {
        setConversations(data.conversations || []);
      }
    } catch (error) {
      logger.error('Failed to fetch conversations:', error);
    }
  }, []);

  // Reset chat state
  const resetChatState = useCallback(() => {
    setMessages([]);
    setCurrentConversationId(null);
  }, []);

  // Select and load a conversation
  const handleSelectConversation = useCallback(async (convId) => {
    try {
      const data = await getConversation(convId);
      if (data.status === 'success' && data.conversation) {
        setCurrentConversationId(convId);
        const formattedMessages = (data.conversation.messages || []).map((msg) => ({
          sender: msg.sender,
          content: msg.content,
          thinking: msg.thinking || undefined,
          tools: msg.tools || undefined,
        }));
        setMessages(formattedMessages);
      }
    } catch (error) {
      logger.error('Failed to load conversation:', error);
    }
  }, []);

  // Create new conversation
  const handleNewChat = useCallback(async () => {
    navigate('/chat');
    try {
      const data = await createConversation();
      if (data.status === 'success') {
        const newId = data.conversation_id;
        newlyCreatedConvIdRef.current = newId;
        setCurrentConversationId(newId);
        setMessages([]);
        prevConversationIdRef.current = newId;
        navigate(`/chat/${newId}`, { replace: true });
        fetchConversations();
      }
    } catch (error) {
      logger.error('Failed to create new conversation:', error);
    }
  }, [navigate, fetchConversations]);

  // Delete a conversation
  const handleDeleteConversation = useCallback(async (convId) => {
    try {
      await deleteConversation(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (currentConversationId === convId) {
        navigate('/chat');
      }
    } catch (error) {
      logger.error('Failed to delete conversation:', error);
    }
  }, [currentConversationId, navigate]);

  // Initial fetch
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // URL sync effect
  useEffect(() => {
    if (conversationId) {
      if (conversationId !== prevConversationIdRef.current) {
        if (conversationId === newlyCreatedConvIdRef.current) {
          newlyCreatedConvIdRef.current = null;
        } else {
          handleSelectConversation(conversationId);
        }
      }
    } else if (prevConversationIdRef.current) {
      resetChatState();
    }
    prevConversationIdRef.current = conversationId;
  }, [conversationId, handleSelectConversation, resetChatState]);

  return {
    // State
    messages,
    setMessages,
    conversations,
    setConversations,
    currentConversationId,
    setCurrentConversationId,
    
    // Handlers
    fetchConversations,
    handleSelectConversation,
    handleNewChat,
    handleDeleteConversation,
    resetChatState,
    
    // Navigation
    navigate,
  };
}

export default useConversations;
