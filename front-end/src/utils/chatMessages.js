/**
 * Chat message utilities: assistant content parsing and message factories.
 *
 * Stored and streamed messages use structured fields (content, thinking, tools);
 * no legacy [[THINKING:...]] / [[TOOL:...]] markers in text.
 */

export const MESSAGE_STATUS = Object.freeze({
  WAITING: 'waiting',
  STREAMING: 'streaming',
  DONE: 'done',
  STOPPED: 'stopped',
  ERROR: 'error',
});

let messageCounter = 0;

function getNowTimestamp() {
  return Date.now().toString(36);
}

export function createMessageId(prefix = 'msg') {
  messageCounter += 1;
  const suffix = messageCounter.toString(36);
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${getNowTimestamp()}-${suffix}`;
}

function getStatusFlags(status) {
  return {
    isWaiting: status === MESSAGE_STATUS.WAITING,
    isStreaming: status === MESSAGE_STATUS.STREAMING,
    isError: status === MESSAGE_STATUS.ERROR,
    wasStopped: status === MESSAGE_STATUS.STOPPED,
  };
}

function normalizeToolSteps(steps) {
  return steps
    .filter((step) => step.type === 'tool')
    .map(({ name, status, args, result }) => ({ name, status, args, result }));
}

function normalizeThinkingText(steps) {
  const thinking = steps
    .filter((step) => step.type === 'thinking' && step.content)
    .map((step) => step.content)
    .join('\n')
    .trim();
  return thinking || undefined;
}

export function createUserMessage(text, options = {}) {
  const id = options.id || createMessageId('user');
  const normalizedText = String(text || '');

  return {
    id,
    role: 'user',
    sender: 'user',
    text: normalizedText,
    content: normalizedText,
    status: MESSAGE_STATUS.DONE,
    steps: [],
    ...getStatusFlags(MESSAGE_STATUS.DONE),
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

  const toolSteps = normalizeToolSteps(parsed.steps);
  const thinkingText = normalizeThinkingText(parsed.steps);

  return {
    id,
    role: 'assistant',
    sender: 'ai',
    text: parsed.text,
    content: parsed.text,
    rawContent,
    steps: parsed.steps,
    status,
    thinking: thinkingText,
    tools: toolSteps.length > 0 ? toolSteps : undefined,
    ...getStatusFlags(status),
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
  if (message.status) {
    return message.status === MESSAGE_STATUS.WAITING || message.status === MESSAGE_STATUS.STREAMING;
  }
  return Boolean(message.isWaiting || message.isStreaming);
}

/**
 * Build display segments from plain assistant text plus optional thinking/tools fields.
 */
export function parseAssistantContent(text, thinkingField = null, toolsField = null) {
  const segments = parseMessageSegments(String(text || ''), thinkingField, toolsField);
  const parsedSteps = segments
    .filter((segment) => segment.type === 'thinking' || segment.type === 'tool')
    .map((segment, index) => {
      if (segment.type === 'tool') {
        return {
          ...segment,
          id: `tool-${segment.name}-${index}`,
        };
      }
      return {
        ...segment,
        id: `thinking-${index}`,
      };
    });

  const parsedText = segments
    .filter((segment) => segment.type === 'text' && segment.content.trim())
    .map((segment) => segment.content)
    .join('\n\n')
    .trim();

  return {
    text: parsedText,
    steps: parsedSteps,
  };
}

function parseMessageSegments(text, thinkingField = null, toolsField = null) {
  const segments = [];

  if (thinkingField && thinkingField.trim()) {
    segments.push({ type: 'thinking', content: thinkingField.trim(), isComplete: true });
  }

  if (Array.isArray(toolsField) && toolsField.length > 0) {
    toolsField.forEach((tool) => {
      segments.push({
        type: 'tool',
        name: tool.name,
        status: tool.status || 'done',
        args: tool.args,
        result: tool.result,
      });
    });
  }

  const cleanText = text.trim();
  if (cleanText) {
    segments.push({ type: 'text', content: cleanText });
  }

  return segments;
}
