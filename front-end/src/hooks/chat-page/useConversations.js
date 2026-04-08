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
  deleteConversation,
} from '../../api';
import logger from '../../utils/logger';
import { normalizeConversationMessage } from '../../utils/chatMessages';

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
  const [isConversationsLoading, setIsConversationsLoading] = useState(false);
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const prevConversationIdRef = useRef(null);
  const lastLoadedConversationIdRef = useRef(null);
  const newlyCreatedConvIdRef = useRef(null);
  const abortControllerRef = useRef(null);
  const conversationLoadSeqRef = useRef(0);
  const conversationsLoadSeqRef = useRef(0);
  const getAbortSignal = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    return abortControllerRef.current.signal;
  }, []);
  const fetchConversations = useCallback(async (signal, options = {}) => {
    const showLoading = options.showLoading ?? true;
    const requestSeq = conversationsLoadSeqRef.current + 1;
    conversationsLoadSeqRef.current = requestSeq;
    if (showLoading) {
      setIsConversationsLoading(true);
    }
    try {
      const data = await getConversations(signal);
      if (data.status === 'success') {
        const nextConversations = data.conversations || [];
        setConversations((prev) => {
          if (prev.length !== nextConversations.length) return nextConversations;
          for (let i = 0; i < prev.length; i += 1) {
            if (prev[i]?.id !== nextConversations[i]?.id) return nextConversations;
            if (prev[i]?.title !== nextConversations[i]?.title) return nextConversations;
            if (prev[i]?.created_at !== nextConversations[i]?.created_at) return nextConversations;
          }
          return prev;
        });
      }
    } catch (error) {
      if (error.name === 'AbortError') return; // Ignore abort errors
      logger.error('Failed to fetch conversations:', error);
    } finally {
      if (showLoading && conversationsLoadSeqRef.current === requestSeq) {
        setIsConversationsLoading(false);
      }
    }
  }, []);
  const registerStreamingConversation = useCallback((convId) => {
    newlyCreatedConvIdRef.current = convId;
    lastLoadedConversationIdRef.current = convId;
    prevConversationIdRef.current = convId;
    setCurrentConversationId(convId);
    setIsConversationLoading(false);
  }, []);
  const resetChatState = useCallback(() => {
    setMessages([]);
    setCurrentConversationId(null);
    setIsConversationLoading(false);
  }, []);
  const handleSelectConversation = useCallback(async (convId) => {
    const signal = getAbortSignal();
    const requestSeq = conversationLoadSeqRef.current + 1;
    conversationLoadSeqRef.current = requestSeq;
    setIsConversationLoading(true);
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
    } finally {
      if (conversationLoadSeqRef.current === requestSeq) {
        setIsConversationLoading(false);
      }
    }
  }, [getAbortSignal]);
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
    isConversationsLoading,
    isConversationLoading,
    conversations,
    setConversations,
    currentConversationId,
    setCurrentConversationId,
    fetchConversations,
    registerStreamingConversation,
    handleDeleteConversation,
    navigate,
  };
}

