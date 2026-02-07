/**
 * Chat message utilities:
 * - Shared marker parser for assistant streaming payloads
 * - Unified message factory helpers used by hooks and UI
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

function stripJsonFromText(text) {
  if (!text || typeof text !== 'string') return text;
  let result = text;
  let changed = true;
  while (changed && result.length > 0) {
    changed = false;
    const trimmed = result.trim();
    if (trimmed.startsWith('{')) {
      const endIdx = findJsonObjectEnd(trimmed, 0);
      if (endIdx !== -1) {
        try {
          JSON.parse(trimmed.slice(0, endIdx + 1));
          result = trimmed.slice(endIdx + 1).trim();
          changed = true;
          continue;
        } catch {
          // no-op
        }
      }
    }
    const lastBrace = trimmed.lastIndexOf('}');
    if (lastBrace !== -1) {
      const startIdx = findJsonObjectStart(trimmed, lastBrace);
      if (startIdx !== -1 && startIdx > 0) {
        try {
          JSON.parse(trimmed.slice(startIdx, lastBrace + 1));
          result = trimmed.slice(0, startIdx).trim();
          changed = true;
        } catch {
          // no-op
        }
      }
    }
  }
  return result;
}

function findJsonObjectEnd(text, startIdx) {
  if (text[startIdx] !== '{') return -1;
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (let i = startIdx; i < text.length; i += 1) {
    const char = text[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

function findJsonObjectStart(text, endIdx) {
  let depth = 0;
  let inString = false;
  for (let i = endIdx; i >= 0; i -= 1) {
    const char = text[i];
    if (char === '"') {
      let backslashes = 0;
      for (let j = i - 1; j >= 0 && text[j] === '\\'; j -= 1) backslashes += 1;
      if (backslashes % 2 === 0) inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '}') depth += 1;
      else if (char === '{') {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

function stripThinkingMarkers(text) {
  if (!text) return text;
  return text
    .replace(/\[\[THINKING:start\]\]/g, '')
    .replace(/\[\[THINKING:chunk:.*?\]\]/g, '')
    .replace(/\[\[THINKING:end\]\]/g, '');
}

function extractInlineThinking(text) {
  if (!text) return { content: '', isComplete: false };
  const chunks = Array.from(text.matchAll(/\[\[THINKING:chunk:(.*?)\]\]/gs)).map((match) => match[1]);
  const content = chunks.join('');
  const isComplete = text.includes('[[THINKING:end]]');
  return { content, isComplete };
}

function parseMessageSegments(text, thinkingField = null, toolsField = null) {
  const segments = [];

  if (thinkingField && thinkingField.trim()) {
    segments.push({ type: 'thinking', content: thinkingField, isComplete: true });
  }

  const hasToolMarkers = text.includes('[[TOOL:');
  const hasThinkingMarkers = text.includes('[[THINKING:');

  if (hasToolMarkers) {
    parseMarkersInline(text, segments, thinkingField);
  } else {
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

    if (hasThinkingMarkers) {
      if (!thinkingField) {
        const { content, isComplete } = extractInlineThinking(text);
        if (content || isComplete) {
          segments.push({ type: 'thinking', content, isComplete });
        }
      }

      const cleanText = stripThinkingMarkers(text).trim();
      if (cleanText) segments.push({ type: 'text', content: cleanText });
    } else {
      const cleanText = text.trim();
      if (cleanText) segments.push({ type: 'text', content: cleanText });
    }
  }

  return segments;
}

function parseMarkersInline(text, segments, thinkingField) {
  let currentIndex = 0;

  while (currentIndex < text.length) {
    const toolStart = text.indexOf('[[TOOL:', currentIndex);
    const thinkingStart = text.indexOf('[[THINKING:start]]', currentIndex);
    let nextMarkerStart = -1;
    let markerType = null;

    if (toolStart !== -1 && thinkingStart !== -1) {
      nextMarkerStart = toolStart < thinkingStart ? toolStart : thinkingStart;
      markerType = toolStart < thinkingStart ? 'tool' : 'thinking';
    } else if (toolStart !== -1) {
      nextMarkerStart = toolStart;
      markerType = 'tool';
    } else if (thinkingStart !== -1) {
      nextMarkerStart = thinkingStart;
      markerType = 'thinking';
    }

    if (nextMarkerStart === -1) {
      const remainingText = text.slice(currentIndex);
      const cleanedText = stripThinkingMarkers(stripJsonFromText(remainingText));
      if (cleanedText && cleanedText.trim()) {
        segments.push({ type: 'text', content: cleanedText });
      }
      break;
    }

    if (nextMarkerStart > currentIndex) {
      const textContent = text.slice(currentIndex, nextMarkerStart);
      const cleanedText = stripThinkingMarkers(stripJsonFromText(textContent));
      if (cleanedText && cleanedText.trim()) {
        segments.push({ type: 'text', content: cleanedText });
      }
    }

    if (markerType === 'thinking') {
      currentIndex = nextMarkerStart + '[[THINKING:start]]'.length;
      let thinkingContent = '';
      let isThinkingComplete = false;
      while (currentIndex < text.length) {
        const chunkStart = text.indexOf('[[THINKING:chunk:', currentIndex);
        const endStart = text.indexOf('[[THINKING:end]]', currentIndex);
        if (endStart !== -1 && (chunkStart === -1 || endStart < chunkStart)) {
          isThinkingComplete = true;
          currentIndex = endStart + '[[THINKING:end]]'.length;
          break;
        }
        if (chunkStart !== -1) {
          const chunkEnd = text.indexOf(']]', chunkStart);
          if (chunkEnd === -1) break;
          thinkingContent += text.slice(chunkStart + 17, chunkEnd);
          currentIndex = chunkEnd + 2;
          continue;
        }
        break;
      }
      if (!isThinkingComplete && thinkingContent === '') {
        const nextEnd = text.indexOf('[[THINKING:end]]', currentIndex);
        currentIndex = nextEnd !== -1 ? nextEnd + '[[THINKING:end]]'.length : text.length;
      }
      if (!thinkingField || thinkingField.trim() === '') {
        segments.push({ type: 'thinking', content: thinkingContent, isComplete: isThinkingComplete });
      }
    } else if (markerType === 'tool') {
      const parsed = parseToolMarker(text, nextMarkerStart);
      if (parsed) {
        const newSegment = parsed.segment;
        if (newSegment.status === 'done') {
          const runningIdx = segments.findIndex(
            (segment) => segment.type === 'tool' && segment.name === newSegment.name && segment.status === 'running'
          );
          if (runningIdx !== -1) segments[runningIdx] = newSegment;
          else segments.push(newSegment);
        } else {
          segments.push(newSegment);
        }
        currentIndex = parsed.endIndex;
      } else {
        const failEnd = text.indexOf(']]', nextMarkerStart);
        currentIndex = failEnd !== -1 ? failEnd + 2 : text.length;
      }
    }
  }
}

function parseToolMarker(text, markerStart) {
  const afterPrefix = markerStart + 7;
  const nameEnd = text.indexOf(':', afterPrefix);
  if (nameEnd === -1) return null;
  const toolName = text.slice(afterPrefix, nameEnd);

  const statusEnd = text.indexOf(':', nameEnd + 1);
  if (statusEnd === -1) return null;
  const status = text.slice(nameEnd + 1, statusEnd);

  const argsStart = statusEnd + 1;
  let argsEnd;

  if (text.slice(argsStart, argsStart + 4) === 'null') {
    argsEnd = argsStart + 3;
  } else if (text[argsStart] === '{') {
    argsEnd = findJsonObjectEnd(text, argsStart);
    if (argsEnd === -1) return null;
  } else {
    return null;
  }

  if (text[argsEnd + 1] !== ':') return null;

  const resultStart = argsEnd + 2;
  let resultEnd;
  let resultValue;

  if (text.slice(resultStart, resultStart + 2) === ']]') {
    resultEnd = resultStart - 1;
    resultValue = null;
  } else if (text.slice(resultStart, resultStart + 4) === 'null') {
    resultEnd = resultStart + 3;
    resultValue = 'null';
  } else if (text[resultStart] === '{') {
    resultEnd = findJsonObjectEnd(text, resultStart);
    if (resultEnd === -1) return null;
    resultValue = text.slice(resultStart, resultEnd + 1);
  } else {
    return null;
  }

  const markerEnd = resultValue === null ? resultStart + 2 : resultEnd + 3;

  return {
    segment: {
      type: 'tool',
      name: toolName,
      status,
      args: text.slice(argsStart, argsEnd + 1),
      result: resultValue,
    },
    endIndex: markerEnd,
  };
}
