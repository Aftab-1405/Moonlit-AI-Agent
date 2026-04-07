/**
 * useMessageStreaming Hook
 *
 * Handles sending messages and streaming AI responses via SSE events.
 * Manages abort controller for cancellation support.
 *
 * @module hooks/useMessageStreaming
 */

import { useCallback, useRef } from 'react';
import { sendMessage } from '../../api';
import logger from '../../utils/logger';
import { parseSSEStream } from '../../utils/streamParser';
import {
  createAssistantMessage,
  createMessageId,
  createUserMessage,
  MESSAGE_STATUS,
} from '../../utils/chatMessages';

const UPDATE_THROTTLE_MS = 16;

/**
 * Get user-friendly error message based on error type
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

function upsertAssistantMessage(prevMessages, assistantId, messageData, status) {
  const nextAssistant = createAssistantMessage({
    id: assistantId,
    textOverride: messageData.text,
    stepsOverride: messageData.steps,
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
 */
export function useMessageStreaming({
  currentConversationId,
  setCurrentConversationId,
  setMessages,
  setConversations,
  navigate,
  fetchConversations,
  registerStreamingConversation,
  settings,
}) {
  const abortControllerRef = useRef(null);

  const handleSendMessage = useCallback(async (message, overrides = null) => {
    const prompt = message.trim();
    if (!prompt) return;

    const assistantMessageId = createMessageId('assistant');
    setMessages((prev) => [
      ...prev,
      createUserMessage(prompt),
      createAssistantMessage({
        id: assistantMessageId,
        textOverride: '',
        stepsOverride: [],
        status: MESSAGE_STATUS.WAITING,
      }),
    ]);

    const enableReasoning = settings.enableReasoning ?? true;
    const reasoningEffort = settings.reasoningEffort ?? 'medium';
    const responseStyle = settings.responseStyle ?? 'balanced';
    const maxRows = settings.maxRows ?? 1000;
    const provider = overrides?.provider ?? settings.llmProvider ?? null;
    const model = overrides?.model ?? settings.llmModel ?? null;

    abortControllerRef.current = new AbortController();

    try {
      const response = await sendMessage({
        prompt,
        conversationId: currentConversationId,
        enableReasoning,
        reasoningEffort,
        responseStyle,
        maxRows,
        provider,
        model,
      }, abortControllerRef.current.signal);

      const newConversationId = response.headers.get('X-Conversation-Id');
      if (newConversationId && !currentConversationId) {
        registerStreamingConversation?.(newConversationId);
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

      // Accumulate structured data from SSE events
      const contentParts = [];
      const toolSteps = [];
      let thinkingContent = '';
      let lastUpdateTime = 0;

      const buildMessageData = (isDone = false) => {
        const steps = [];
        // Add thinking step if present
        if (thinkingContent) {
          steps.push({ type: 'thinking', content: thinkingContent, isComplete: isDone });
        }
        // Add tool steps
        toolSteps.forEach((tool, index) => {
          steps.push({
            type: 'tool',
            id: `tool-${tool.name}-${index}`,
            name: tool.name,
            status: tool.status,
            args: typeof tool.args === 'string' ? tool.args : JSON.stringify(tool.args || {}),
            result: typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result || null),
          });
        });
        return {
          text: contentParts.join(''),
          steps,
        };
      };

      const throttledUpdate = (status) => {
        const now = Date.now();
        if (now - lastUpdateTime >= UPDATE_THROTTLE_MS) {
          setMessages((prev) =>
            upsertAssistantMessage(prev, assistantMessageId, buildMessageData(), status)
          );
          lastUpdateTime = now;
        }
      };

      await parseSSEStream(reader, decoder, (event) => {
        switch (event.type) {
          case 'token':
            contentParts.push(event.content);
            throttledUpdate(MESSAGE_STATUS.STREAMING);
            break;

          case 'tool_start':
            toolSteps.push({
              name: event.name,
              status: 'running',
              args: event.args,
              result: null,
            });
            throttledUpdate(MESSAGE_STATUS.STREAMING);
            break;

          case 'tool_end': {
            const step = toolSteps.find(
              (s) => s.name === event.name && s.status === 'running'
            );
            if (step) {
              step.status = 'done';
              step.args = event.args;
              step.result = event.result;
            }
            throttledUpdate(MESSAGE_STATUS.STREAMING);
            break;
          }

          case 'thinking_token':
            thinkingContent += event.content;
            throttledUpdate(MESSAGE_STATUS.STREAMING);
            break;

          case 'error':
            contentParts.push(`\n\n⚠️ **Error**: ${event.message}`);
            throttledUpdate(MESSAGE_STATUS.ERROR);
            break;

          case 'done':
            // Mark thinking as complete
            // Final update handled below
            break;

          default:
            break;
        }
      });

      // Final update — ensure the last state is flushed with thinking marked complete
      setMessages((prev) =>
        upsertAssistantMessage(prev, assistantMessageId, buildMessageData(true), MESSAGE_STATUS.DONE)
      );

      fetchConversations(undefined, { showLoading: false });
    } catch (error) {
      if (error.name === 'AbortError') {
        setMessages((prev) => {
          const existingAssistant = prev.find((msg) => msg.id === assistantMessageId);
          const currentText = existingAssistant?.text || '';
          return upsertAssistantMessage(
            prev,
            assistantMessageId,
            { text: currentText, steps: existingAssistant?.steps || [] },
            MESSAGE_STATUS.STOPPED,
          );
        });
        return;
      }
      logger.error('Message streaming error:', error);
      const errorMessage = getErrorMessage(error);

      setMessages((prev) => {
        const existingAssistant = prev.find((msg) => msg.id === assistantMessageId);
        const currentText = existingAssistant?.text
          ? `${existingAssistant.text}\n\n${errorMessage}`
          : errorMessage;
        return upsertAssistantMessage(
          prev,
          assistantMessageId,
          { text: currentText, steps: existingAssistant?.steps || [] },
          MESSAGE_STATUS.ERROR,
        );
      });
    } finally {
      abortControllerRef.current = null;
    }
  }, [
    currentConversationId,
    settings,
    navigate,
    fetchConversations,
    registerStreamingConversation,
    setMessages,
    setConversations,
    setCurrentConversationId,
  ]);

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
