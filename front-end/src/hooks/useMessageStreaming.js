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

// Throttle for streaming updates (~60fps)
const UPDATE_THROTTLE_MS = 16;

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
      
      // Handle error
      setMessages((prev) => {
        const updated = [...prev];
        if (updated[updated.length - 1]?.sender === 'ai' && updated[updated.length - 1]?.isWaiting) {
          updated[updated.length - 1] = { sender: 'ai', content: 'Sorry, I encountered an error. Please try again.' };
        } else {
          updated.push({ sender: 'ai', content: 'Sorry, I encountered an error. Please try again.' });
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
