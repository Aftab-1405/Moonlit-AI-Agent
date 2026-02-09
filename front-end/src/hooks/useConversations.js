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
import { normalizeConversationMessage } from '../utils/chatMessages';

/**
 * Hook for managing conversations and messages
 * @returns {Object} Conversation state and handlers
 */
export function useConversations() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const prevConversationIdRef = useRef(null);
  const lastLoadedConversationIdRef = useRef(null);
  const newlyCreatedConvIdRef = useRef(null);
  const abortControllerRef = useRef(null);
  const getAbortSignal = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    return abortControllerRef.current.signal;
  }, []);
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
  const resetChatState = useCallback(() => {
    setMessages([]);
    setCurrentConversationId(null);
  }, []);
  const handleSelectConversation = useCallback(async (convId) => {
    const signal = getAbortSignal();
    try {
      const data = await getConversation(convId, signal);
      if (data.status === 'success' && data.conversation) {
        setCurrentConversationId(convId);
        const formattedMessages = (data.conversation.messages || []).map((msg, index) =>
          normalizeConversationMessage(msg, index)
        );
        setMessages(formattedMessages);
        lastLoadedConversationIdRef.current = convId;
      }
    } catch (error) {
      if (error.name === 'AbortError') return; // Ignore abort errors
      logger.error('Failed to load conversation:', error);
    }
  }, [getAbortSignal]);
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
  useEffect(() => {
    const abortController = new AbortController();
    fetchConversations(abortController.signal);
    
    return () => {
      abortController.abort();
    };
  }, [fetchConversations]);
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);
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
    messages,
    setMessages,
    conversations,
    setConversations,
    currentConversationId,
    setCurrentConversationId,
    fetchConversations,
    handleSelectConversation,
    handleNewChat,
    handleDeleteConversation,
    resetChatState,
    navigate,
  };
}

export default useConversations;

