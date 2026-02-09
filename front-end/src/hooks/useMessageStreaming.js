/**
 * useMessageStreaming Hook
 * 
 * Handles sending messages and streaming AI responses.
 * Manages abort controller for cancellation support.
 * 
 * @module hooks/useMessageStreaming
 */

import { useCallback, useRef } from 'react';
import { sendMessage } from '../api';
import logger from '../utils/logger';
import {
  createAssistantMessage,
  createMessageId,
  createUserMessage,
  MESSAGE_STATUS,
} from '../utils/chatMessages';
const UPDATE_THROTTLE_MS = 16;

/**
 * Get user-friendly error message based on error type
 * @param {Error} error - The error object
 * @returns {string} User-friendly error message
 */
function getErrorMessage(error) {
  if (!navigator.onLine) {
    return "You appear to be offline. Please check your internet connection and try again.";
  }
  
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return "Unable to connect to the server. Please check your connection and try again.";
  }
  if (error.status) {
    switch (error.status) {
      case 401:
        return "Your session has expired. Please sign in again.";
      case 403:
        return "You don't have permission to perform this action.";
      case 429:
        return "You've made too many requests. Please wait a moment and try again.";
      case 500:
      case 502:
      case 503:
        return "The server is experiencing issues. Please try again in a few moments.";
      case 504:
        return "The request timed out. Please try again with a simpler query.";
      default:
        if (error.status >= 400 && error.status < 500) {
          return error.message || "There was a problem with your request. Please try again.";
        }
        if (error.status >= 500) {
          return "Server error. Our team has been notified. Please try again later.";
        }
    }
  }
  if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
    return "The request took too long. Please try again with a simpler query.";
  }
  return "Something went wrong. Please try again.";
}

function upsertAssistantMessage(prevMessages, assistantId, rawContent, status) {
  const nextAssistant = createAssistantMessage({
    id: assistantId,
    rawContent,
    status,
  });
  const messageIndex = prevMessages.findIndex((message) => message.id === assistantId);

  if (messageIndex === -1) {
    return [...prevMessages, nextAssistant];
  }

  const updated = [...prevMessages];
  updated[messageIndex] = {
    ...updated[messageIndex],
    ...nextAssistant,
  };
  return updated;
}

/**
 * Hook for message streaming functionality
 * @param {Object} params - Hook parameters
 * @param {string|null} params.currentConversationId - Current conversation ID
 * @param {Function} params.setCurrentConversationId - Setter for conversation ID
 * @param {Function} params.setMessages - Setter for messages array
 * @param {Function} params.setConversations - Setter for conversations list
 * @param {Function} params.navigate - React Router navigate function
 * @param {Function} params.fetchConversations - Function to refresh conversations
 * @param {Object} params.settings - User settings object
 * @returns {Object} Streaming handlers and state
 */
export function useMessageStreaming({
  currentConversationId,
  setCurrentConversationId,
  setMessages,
  setConversations,
  navigate,
  fetchConversations,
  settings,
}) {
  const abortControllerRef = useRef(null);

  const handleSendMessage = useCallback(async (message) => {
    const prompt = message.trim();
    if (!prompt) return;

    const assistantMessageId = createMessageId('assistant');
    setMessages((prev) => [
      ...prev,
      createUserMessage(prompt),
      createAssistantMessage({
        id: assistantMessageId,
        rawContent: '',
        status: MESSAGE_STATUS.WAITING,
      }),
    ]);
    const enableReasoning = settings.enableReasoning ?? true;
    const reasoningEffort = settings.reasoningEffort ?? 'medium';
    const responseStyle = settings.responseStyle ?? 'balanced';
    const maxRows = settings.maxRows ?? 1000;

    abortControllerRef.current = new AbortController();

    try {
      const response = await sendMessage({
        prompt,
        conversationId: currentConversationId,
        enableReasoning,
        reasoningEffort,
        responseStyle,
        maxRows,
      }, abortControllerRef.current.signal);
      const newConversationId = response.headers.get('X-Conversation-Id');
      if (newConversationId && !currentConversationId) {
        setCurrentConversationId(newConversationId);
        navigate(`/chat/${newConversationId}`, { replace: true });

        const tempTitle = prompt.substring(0, 50) + (prompt.length > 50 ? '...' : '');
        setConversations((prev) => [
          { id: newConversationId, title: tempTitle, created_at: new Date().toISOString() },
          ...prev,
        ]);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiResponse = '';
      let lastUpdateTime = 0;

      const updateMessage = (status) => {
        setMessages((prev) => {
          return upsertAssistantMessage(prev, assistantMessageId, aiResponse, status);
        });
      };

      while (true) {
        const { done, value } = await reader.read();

        if (!done) {
          const chunk = decoder.decode(value, { stream: true });
          aiResponse += chunk;
        }

        const now = Date.now();
        if (done || now - lastUpdateTime >= UPDATE_THROTTLE_MS) {
          if (aiResponse || done) {
            updateMessage(done ? MESSAGE_STATUS.DONE : MESSAGE_STATUS.STREAMING);
          }
          lastUpdateTime = now;
          if (done) break;
        }
      }

      fetchConversations();
    } catch (error) {
      if (error.name === 'AbortError') {
        setMessages((prev) => {
          const existingAssistant = prev.find((msg) => msg.id === assistantMessageId);
          const rawContent = existingAssistant?.rawContent || '';
          return upsertAssistantMessage(prev, assistantMessageId, rawContent, MESSAGE_STATUS.STOPPED);
        });
        return;
      }
      logger.error('Message streaming error:', error);
      const errorMessage = getErrorMessage(error);

      setMessages((prev) => {
        const existingAssistant = prev.find((msg) => msg.id === assistantMessageId);
        const rawContent = existingAssistant?.rawContent
          ? `${existingAssistant.rawContent}\n\n${errorMessage}`
          : errorMessage;
        return upsertAssistantMessage(prev, assistantMessageId, rawContent, MESSAGE_STATUS.ERROR);
      });
    } finally {
      abortControllerRef.current = null;
    }
  }, [currentConversationId, settings, navigate, fetchConversations, setMessages, setConversations, setCurrentConversationId]);

  const handleStopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    handleSendMessage,
    handleStopStreaming,
  };
}

export default useMessageStreaming;
