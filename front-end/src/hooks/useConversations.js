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
  const lastLoadedConversationIdRef = useRef(null);
  const newlyCreatedConvIdRef = useRef(null);
  
  // AbortController ref for cancelling in-flight requests
  const abortControllerRef = useRef(null);

  // Helper to get a fresh AbortController and cancel any previous request
  const getAbortSignal = useCallback(() => {
    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    return abortControllerRef.current.signal;
  }, []);

  // Fetch all conversations
  const fetchConversations = useCallback(async (signal) => {
    try {
      const data = await getConversations(signal);
      if (data.status === 'success') {
        setConversations(data.conversations || []);
      }
    } catch (error) {
      if (error.name === 'AbortError') return; // Ignore abort errors
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
    const signal = getAbortSignal();
    try {
      const data = await getConversation(convId, signal);
      if (data.status === 'success' && data.conversation) {
        setCurrentConversationId(convId);
        const formattedMessages = (data.conversation.messages || []).map((msg) => ({
          sender: msg.sender,
          content: msg.content,
          thinking: msg.thinking || undefined,
          tools: msg.tools || undefined,
        }));
        setMessages(formattedMessages);
        lastLoadedConversationIdRef.current = convId;
      }
    } catch (error) {
      if (error.name === 'AbortError') return; // Ignore abort errors
      logger.error('Failed to load conversation:', error);
    }
  }, [getAbortSignal]);

  // Create new conversation
  const handleNewChat = useCallback(async () => {
    navigate('/chat');
    const signal = getAbortSignal();
    try {
      const data = await createConversation(signal);
      if (data.status === 'success') {
        const newId = data.conversation_id;
        newlyCreatedConvIdRef.current = newId;
        setCurrentConversationId(newId);
        setMessages([]);
        prevConversationIdRef.current = newId;
        lastLoadedConversationIdRef.current = newId;
        navigate(`/chat/${newId}`, { replace: true });
        fetchConversations(signal);
      }
    } catch (error) {
      if (error.name === 'AbortError') return; // Ignore abort errors
      logger.error('Failed to create new conversation:', error);
    }
  }, [navigate, fetchConversations, getAbortSignal]);

  // Delete a conversation
  const handleDeleteConversation = useCallback(async (convId) => {
    try {
      await deleteConversation(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (currentConversationId === convId) {
        navigate('/chat');
      }
    } catch (error) {
      if (error.name === 'AbortError') return; // Ignore abort errors
      logger.error('Failed to delete conversation:', error);
    }
  }, [currentConversationId, navigate]);

  // Initial fetch with cleanup
  useEffect(() => {
    const abortController = new AbortController();
    fetchConversations(abortController.signal);
    
    return () => {
      abortController.abort();
    };
  }, [fetchConversations]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // URL sync effect
  useEffect(() => {
    if (conversationId) {
      if (conversationId !== prevConversationIdRef.current || conversationId !== lastLoadedConversationIdRef.current) {
        if (conversationId === newlyCreatedConvIdRef.current) {
          newlyCreatedConvIdRef.current = null;
          lastLoadedConversationIdRef.current = conversationId;
        } else {
          handleSelectConversation(conversationId);
        }
      }
    } else if (prevConversationIdRef.current) {
      resetChatState();
      lastLoadedConversationIdRef.current = null;
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

