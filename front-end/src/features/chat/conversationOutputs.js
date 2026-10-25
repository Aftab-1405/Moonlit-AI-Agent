import { normalizeQueryResult } from '../../utils/queryResult.js';

// Output records are derived from completed transcript blocks; result rows remain
// lazy-loaded. Historical records never inherit the current connection's identity.
export function getQueryExecutionMeta(step, fallbackConversationId = null) {
  if (step?.name !== 'execute_query' || step.status !== 'done' || !step.result) return null;
  const result = step.result;
  const nested = result.data || {};
  const executionId =
    result.execution_id || result.executionId || nested.execution_id || nested.executionId;
  if (!executionId) return null;
  return {
    executionId,
    conversationId:
      result.conversation_id ||
      result.conversationId ||
      nested.conversation_id ||
      nested.conversationId ||
      fallbackConversationId,
  };
}

export function collectConversationOutputs(messages = [], conversationId) {
  const outputs = new Map();
  messages.forEach((message, index) => {
    if (message.role !== 'assistant') return;
    const messageId = message.id || index;
    const pattern = /```([A-Za-z0-9_-]+)[^\n]*\n([\s\S]*?)```/g;
    for (const match of String(message.text || '').matchAll(pattern)) {
      const language = match[1].toLowerCase();
      const code = match[2].trim();
      if (!code || !['sql', 'diagram-flow'].includes(language)) continue;
      const id = `${messageId}:${match.index}`;
      outputs.set(id, {
        id,
        type: language === 'sql' ? 'sql-editor' : 'react-flow',
        title: language === 'sql' ? 'SQL query' : 'Diagram',
        source: null,
        props: language === 'sql' ? { initialQuery: code } : { code },
      });
    }
    for (const step of message.steps || []) {
      const meta = getQueryExecutionMeta(step, conversationId);
      if (!meta?.conversationId) continue;
      const id = `execution:${meta.conversationId}:${meta.executionId}`;
      outputs.set(id, {
        id,
        type: 'query-result',
        title: 'Query results',
        source: null,
        props: {
          ...meta,
          sourceQuery: step.args?.query || '',
          executionTime: Number.isFinite(step.result.execution_time_ms)
            ? step.result.execution_time_ms / 1000
            : null,
        },
      });
    }
  });
  return [...outputs.values()];
}

// Cache by immutable message identity so streaming only reparses changed turns.
// The collector belongs to one conversation; WeakMap entries do not retain old turns.
export function createConversationOutputCollector(conversationId) {
  const cache = new WeakMap();
  let previous = [];
  return (messages = []) => {
    const outputs = new Map();
    messages.forEach((message, index) => {
      let cached = cache.get(message);
      if (!cached || cached.index !== index) {
        cached = {
          index,
          outputs: collectConversationOutputs(
            [{ ...message, id: message.id || index }],
            conversationId,
          ),
        };
        cache.set(message, cached);
      }
      cached.outputs.forEach((output) => {
        outputs.set(output.id, output);
      });
    });
    const next = [...outputs.values()];
    if (
      next.length !== previous.length ||
      next.some((output, index) => output !== previous[index])
    ) {
      previous = next;
    }
    return previous;
  };
}

export function normalizeExecutionResult(result) {
  return normalizeQueryResult(result);
}
