/**
 * Chat message utilities: assistant content parsing and message factories.
 *
 * Every message in React state has exactly this shape:
 *   { id, role, text, steps, status }
 *
 * Streamed messages are built with textOverride/stepsOverride.
 * Firestore-loaded messages are built with rawContent/thinking/tools, which
 * are parsed into the same text/steps fields.
 */

export const MESSAGE_STATUS = Object.freeze({
  WAITING: 'waiting',
  STREAMING: 'streaming',
  DONE: 'done',
  STOPPED: 'stopped',
  ERROR: 'error',
});

let messageCounter = 0;

export function createMessageId(prefix = 'msg') {
  messageCounter += 1;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${messageCounter.toString(36)}`;
}

export function createUserMessage(text, options = {}) {
  return {
    id: options.id || createMessageId('user'),
    role: 'user',
    text: String(text || ''),
    steps: [],
    status: MESSAGE_STATUS.DONE,
  };
}

export function createAssistantMessage({
  id = createMessageId('assistant'),
  rawContent = '',
  thinking = null,
  tools = null,
  status = MESSAGE_STATUS.DONE,
  textOverride = null,
  stepsOverride = null,
} = {}) {
  const parsed = (textOverride !== null || Array.isArray(stepsOverride))
    ? {
      text: textOverride ?? '',
      steps: Array.isArray(stepsOverride) ? stepsOverride : [],
    }
    : parseAssistantContent(rawContent, thinking, tools);

  return {
    id,
    role: 'assistant',
    text: parsed.text,
    steps: parsed.steps,
    status,
  };
}

export function normalizeConversationMessage(message, index = 0) {
  const sender = message?.sender === 'user' ? 'user' : 'ai';
  const timestamp = message?.timestamp;
  const timestampPart = (
    typeof timestamp === 'string' || typeof timestamp === 'number'
      ? String(timestamp)
      : timestamp?.seconds
        ? String(timestamp.seconds)
        : String(index)
  );
  const id = `${sender}-${timestampPart}-${index}`;

  if (sender === 'user') {
    return createUserMessage(message?.content || '', { id });
  }

  return createAssistantMessage({
    id,
    rawContent: message?.content || '',
    thinking: message?.thinking || null,
    tools: Array.isArray(message?.tools) ? message.tools : null,
    status: MESSAGE_STATUS.DONE,
  });
}

export function isMessageActive(message) {
  if (!message) return false;
  return message.status === MESSAGE_STATUS.WAITING || message.status === MESSAGE_STATUS.STREAMING;
}

/**
 * Build text + steps from stored assistant message fields.
 * Used when loading conversations from Firestore.
 */
export function parseAssistantContent(text, thinkingField = null, toolsField = null) {
  const steps = [];

  if (thinkingField && thinkingField.trim()) {
    steps.push({ type: 'thinking', content: thinkingField.trim(), isComplete: true });
  }

  if (Array.isArray(toolsField) && toolsField.length > 0) {
    toolsField.forEach((tool, index) => {
      steps.push({
        id: `tool-${tool.name}-${index}`,
        type: 'tool',
        name: tool.name,
        status: tool.status || 'done',
        args: tool.args,
        result: tool.result,
      });
    });
  }

  const parsedText = String(text || '').trim();

  return { text: parsedText, steps };
}
