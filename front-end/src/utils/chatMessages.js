/**
 * Chat message utilities: assistant content parsing and message factories.
 *
 * Every message in React state has this shape:
 *   { id, role, text, steps, timeline, status }
 *
 * Streamed messages are built with textOverride/stepsOverride/timelineOverride.
 * Firestore-loaded messages are built with rawContent/thinking/tools, which
 * are parsed into the same text/steps fields.
 */

export const MESSAGE_STATUS = Object.freeze({
  WAITING: 'waiting',
  STREAMING: 'streaming',
  DONE: 'done',
  STOPPED: 'stopped',
  ERROR: 'error',
  /** Agent hit its step budget; task is paused and can be continued. */
  PAUSED: 'paused',
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
  timelineOverride = null,
  usage = null,
} = {}) {
  const parsed =
    textOverride !== null || Array.isArray(stepsOverride)
      ? {
          text: textOverride ?? '',
          steps: Array.isArray(stepsOverride) ? stepsOverride : [],
          timeline: Array.isArray(timelineOverride) ? timelineOverride : [],
        }
      : parseAssistantContent(rawContent, thinking, tools, timelineOverride);

  return {
    id,
    role: 'assistant',
    text: parsed.text,
    steps: parsed.steps,
    timeline: parsed.timeline ?? [],
    status,
    usage,
  };
}

export function normalizeConversationMessage(message, index = 0) {
  const sender = message?.sender === 'user' ? 'user' : 'ai';
  const timestamp = message?.timestamp;
  const timestampPart =
    typeof timestamp === 'string' || typeof timestamp === 'number'
      ? String(timestamp)
      : timestamp?.seconds
        ? String(timestamp.seconds)
        : String(index);
  const id = message?.id || `${sender}-${timestampPart}-${index}`;

  if (sender === 'user') {
    return createUserMessage(message?.content || '', { id });
  }

  // If the backend persisted an ordered timeline, use it directly.
  // Otherwise fall back to reconstructing from flat tools/thinking fields.
  const rawTimeline =
    Array.isArray(message?.timeline) && message.timeline.length > 0 ? message.timeline : null;
  // Normalize Python snake_case keys (is_complete) → camelCase (isComplete)
  const storedTimeline = rawTimeline ? rawTimeline.map(normalizeTimelineItem) : null;

  return createAssistantMessage({
    id,
    rawContent: message?.content || '',
    thinking: message?.thinking || null,
    tools: Array.isArray(message?.tools) ? message.tools : null,
    status: MESSAGE_STATUS.DONE,
    timelineOverride: storedTimeline,
    usage: message?.usage || null,
  });
}

/**
 * Convert a raw Firestore-stored timeline item to the camelCase shape
 * expected by StepsAccordion / normalizeSteps.
 * Handles the Python snake_case → JS camelCase mismatch (is_complete → isComplete).
 */
function normalizeTimelineItem(item) {
  if (!item || typeof item !== 'object') return item;
  const out = { ...item };
  if ('is_complete' in out) {
    out.isComplete = Boolean(out.is_complete);
    delete out.is_complete;
  }
  return out;
}

/**
 * Build text + steps + timeline from stored assistant message fields.
 * Used for legacy messages that predate timeline persistence.
 */
function parseAssistantContent(
  text,
  thinkingField = null,
  toolsField = null,
  timelineOverride = null,
) {
  const parsedText = String(text || '').trim();

  // If a stored timeline was passed through, use it as-is and derive steps from it.
  if (Array.isArray(timelineOverride) && timelineOverride.length > 0) {
    const steps = timelineOverride
      .filter((item) => item.type === 'tool' || item.type === 'thinking')
      .map((item, idx) => ({
        ...item,
        id: item.id || `${item.type}-legacy-${idx}`,
      }));
    return { text: parsedText, steps, timeline: timelineOverride };
  }

  // Legacy path: reconstruct flat steps from separate fields.
  // Also build a synthetic timeline so the inline renderer works for older messages.
  const steps = [];
  const syntheticTimeline = [];

  const currentThinking = thinkingField ? String(thinkingField).trim() : '';

  if (currentThinking) {
    const thinkingStep = { type: 'thinking', content: currentThinking, isComplete: true };
    steps.push(thinkingStep);
    syntheticTimeline.push({ type: 'thinking', content: currentThinking, isComplete: true });
  }

  if (Array.isArray(toolsField) && toolsField.length > 0) {
    toolsField.forEach((tool, index) => {
      const toolStep = {
        id: `tool-${tool.name}-${index}`,
        type: 'tool',
        name: tool.name,
        status: tool.status || 'done',
        args: tool.args,
        result: tool.result,
      };
      steps.push(toolStep);
      syntheticTimeline.push({ ...toolStep });
    });
  }

  // For legacy messages the text always came after any tool steps.
  // Add a text entry at the end so the inline renderer shows it correctly.
  if (parsedText) {
    syntheticTimeline.push({ type: 'text', content: parsedText });
  }

  // Only use the synthetic timeline when there are non-text items to interleave.
  // Pure-text messages don't need it (the legacy text block path handles them fine).
  const timeline = steps.length > 0 && syntheticTimeline.length > 0 ? syntheticTimeline : [];

  return { text: parsedText, steps, timeline };
}
