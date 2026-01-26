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

// Throttle for streaming updates (~60fps)
const UPDATE_THROTTLE_MS = 16;

/**
 * Get user-friendly error message based on error type
 * @param {Error} error - The error object
 * @returns {string} User-friendly error message
 */
function getErrorMessage(error) {
  // Network/connectivity errors
  if (!navigator.onLine) {
    return "You appear to be offline. Please check your internet connection and try again.";
  }
  
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return "Unable to connect to the server. Please check your connection and try again.";
  }
  
  // API errors with status codes
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
  
  // Timeout errors
  if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
    return "The request took too long. Please try again with a simpler query.";
  }
  
  // Generic fallback
  return "Something went wrong. Please try again.";
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
    if (!message.trim()) return;

    // Add user message and placeholder AI message
    setMessages((prev) => [...prev, { sender: 'user', content: message }]);
    setMessages((prev) => [...prev, { sender: 'ai', content: '', isWaiting: true }]);

    // Get settings with defaults
    const enableReasoning = settings.enableReasoning ?? true;
    const reasoningEffort = settings.reasoningEffort ?? 'medium';
    const responseStyle = settings.responseStyle ?? 'balanced';
    const maxRows = settings.maxRows ?? 1000;

    abortControllerRef.current = new AbortController();

    try {
      const response = await sendMessage({
        prompt: message,
        conversationId: currentConversationId,
        enableReasoning,
        reasoningEffort,
        responseStyle,
        maxRows,
      }, abortControllerRef.current.signal);

      // Handle new conversation creation
      const newConversationId = response.headers.get('X-Conversation-Id');
      if (newConversationId && !currentConversationId) {
        setCurrentConversationId(newConversationId);
        navigate(`/chat/${newConversationId}`, { replace: true });

        const tempTitle = message.substring(0, 50) + (message.length > 50 ? '...' : '');
        setConversations((prev) => [
          { id: newConversationId, title: tempTitle, created_at: new Date().toISOString() },
          ...prev,
        ]);
      }

      // Stream response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiResponse = '';
      let lastUpdateTime = 0;

      const updateMessage = () => {
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[updated.length - 1]?.sender === 'ai') {
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              content: aiResponse,
              isStreaming: true,
              isWaiting: false
            };
          } else {
            updated.push({ sender: 'ai', content: aiResponse, isStreaming: true });
          }
          return updated;
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
          if (aiResponse) {
            updateMessage();
          }
          lastUpdateTime = now;
          if (done) break;
        }
      }

      // Mark streaming complete
      setMessages((prev) => {
        const updated = [...prev];
        if (updated[updated.length - 1]?.sender === 'ai') {
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            isStreaming: false
          };
        }
        return updated;
      });

      fetchConversations();
    } catch (error) {
      if (error.name === 'AbortError') {
        // User stopped the stream
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[updated.length - 1]?.sender === 'ai') {
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              isStreaming: false,
              wasStopped: true
            };
          }
          return updated;
        });
        return;
      }
      
      // Log error for debugging (development only)
      logger.error('Message streaming error:', error);
      
      // Get user-friendly error message
      const errorMessage = getErrorMessage(error);
      
      // Handle error with specific message
      setMessages((prev) => {
        const updated = [...prev];
        if (updated[updated.length - 1]?.sender === 'ai' && updated[updated.length - 1]?.isWaiting) {
          updated[updated.length - 1] = { 
            sender: 'ai', 
            content: errorMessage,
            isError: true 
          };
        } else {
          updated.push({ 
            sender: 'ai', 
            content: errorMessage,
            isError: true 
          });
        }
        return updated;
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
