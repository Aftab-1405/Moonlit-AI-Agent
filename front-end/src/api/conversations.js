/**
 * Conversations API Module
 *
 * Handles conversation-related API calls:
 * - List conversations
 * - Get single conversation
 * - Rename conversation
 * - Delete conversation
 * - Send message to LLM (streaming)
 *
 * @module api/conversations
 */

import { del, get, patch, postRaw } from '@/api/client';
import { buildChatRequestPayload } from '@/api/conversationRequestModel';
import { CONVERSATIONS } from '@/api/endpoints';

const MAX_CONCURRENT_EXECUTION_READS = 4;
const MAX_CACHED_EXECUTION_READS = 200;
const executionResultRequests = new Map();
const executionResultQueue = [];
let activeExecutionReads = 0;

function drainExecutionResultQueue() {
  while (activeExecutionReads < MAX_CONCURRENT_EXECUTION_READS && executionResultQueue.length > 0) {
    const { task, resolve, reject } = executionResultQueue.shift();
    activeExecutionReads += 1;
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        activeExecutionReads -= 1;
        drainExecutionResultQueue();
      });
  }
}

function scheduleExecutionResultRead(task) {
  return new Promise((resolve, reject) => {
    executionResultQueue.push({ task, resolve, reject });
    drainExecutionResultQueue();
  });
}

/**
 * Get all conversations for current user.
 *
 * @param {AbortSignal} [signal] - Optional abort signal for cancellation
 * @returns {Promise<{status: string, conversations: Array}>}
 */
export async function getAllUserConversations(signal) {
  return get(CONVERSATIONS.LIST, { signal });
}

/**
 * Get a single conversation by ID.
 *
 * @param {string} id - Conversation ID
 * @param {AbortSignal} [signal] - Optional abort signal for cancellation
 * @returns {Promise<{status: string, conversation: Object}>}
 */
export async function getConversation(id, signal) {
  return get(CONVERSATIONS.GET(id), { signal });
}

/**
 * Get a specific execution result.
 *
 * @param {string} conversationId - Conversation ID
 * @param {string} executionId - Execution ID
 * @returns {Promise<{status: string, data: Object}>}
 */
export function getExecutionResult(conversationId, executionId) {
  const cacheKey = `${conversationId}:${executionId}`;
  const cached = executionResultRequests.get(cacheKey);
  if (cached) return cached;

  if (executionResultRequests.size >= MAX_CACHED_EXECUTION_READS) {
    executionResultRequests.delete(executionResultRequests.keys().next().value);
  }

  const request = scheduleExecutionResultRead(() =>
    get(CONVERSATIONS.GET_EXECUTION_RESULT(conversationId, executionId)),
  ).catch((error) => {
    executionResultRequests.delete(cacheKey);
    throw error;
  });
  executionResultRequests.set(cacheKey, request);
  return request;
}

/**
 * Delete a conversation by ID.
 *
 * @param {string} id - Conversation ID
 * @returns {Promise<{status: string}>}
 */
export async function deleteConversation(id) {
  return del(CONVERSATIONS.DELETE(id));
}

/**
 * Rename a conversation by ID.
 *
 * @param {string} id - Conversation ID
 * @param {string} title - New conversation title
 * @returns {Promise<{status: string, title: string}>}
 */
export async function renameConversation(id, title) {
  return patch(CONVERSATIONS.RENAME(id), { title });
}

/**
 * Send a message to the LLM and receive streaming response.
 *
 * @param {Object} params - Message parameters
 * @param {string} params.prompt - User message
 * @param {string|null} params.conversationId - Current conversation ID
 * @param {boolean} params.enableReasoning - Enable AI reasoning
 * @param {string} params.reasoningEffort - Reasoning effort level
 * @param {string} params.responseStyle - Response style preference
 * @param {number|null} params.maxRows - Max rows for query results
 * @param {string|null} params.provider - LLM provider override
 * @param {string|null} params.model - LLM model override
 * @param {AbortSignal} [signal] - Optional abort signal for cancellation
 * @returns {Promise<Response>} Raw response for streaming
 */
export async function sendMessage(
  {
    prompt,
    conversationId = null,
    enableReasoning = true,
    reasoningEffort = 'medium',
    responseStyle = 'balanced',
    maxRows = 1000,
    provider = null,
    model = null,
    taskMode = 'normal',
  },
  signal,
) {
  return postRaw(
    CONVERSATIONS.SEND_MESSAGE,
    buildChatRequestPayload({
      prompt,
      conversationId,
      enableReasoning,
      reasoningEffort,
      responseStyle,
      maxRows,
      provider,
      model,
      taskMode,
    }),
    {
      signal,
      // Opt out of content-encoding negotiation. If the Vite dev proxy (or any
      // upstream proxy) negotiates gzip with the backend, it buffers the entire
      // compressed SSE stream before forwarding it — making all tokens arrive
      // simultaneously and killing the streaming effect.
      headers: { 'Accept-Encoding': 'identity' },
    },
  );
}

/**
 * Resume a LangGraph conversation that paused for human input.
 *
 * @param {Object} params - Resume parameters
 * @param {string} params.conversationId - Conversation ID/thread ID to resume
 * @param {Object} params.resume - JSON-serializable resume payload
 * @param {AbortSignal} [signal] - Optional abort signal for cancellation
 * @returns {Promise<Response>} Raw response for streaming
 */
export async function resumeAgent(
  {
    conversationId,
    resume,
    enableReasoning = true,
    reasoningEffort = 'medium',
    responseStyle = 'balanced',
    maxRows = 1000,
    provider = null,
    model = null,
    taskMode = 'normal',
  },
  signal,
) {
  return postRaw(
    CONVERSATIONS.RESUME_AGENT,
    {
      conversation_id: conversationId,
      resume,
      enable_reasoning: enableReasoning,
      reasoning_effort: reasoningEffort,
      response_style: responseStyle,
      max_rows: maxRows === 0 ? null : maxRows,
      provider,
      model,
      task_mode: taskMode,
    },
    {
      signal,
      // Same reason as sendMessage — prevent proxy compression buffering.
      headers: { 'Accept-Encoding': 'identity' },
    },
  );
}
