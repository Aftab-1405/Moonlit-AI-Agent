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

export function normalizeExecutionResult(result) {
  const data = Array.isArray(result.data)
    ? result.data
    : Array.isArray(result.result)
      ? result.result
      : [];
  const columns = result.columns?.length
    ? result.columns
    : data[0] && !Array.isArray(data[0])
      ? Object.keys(data[0])
      : [];
  return {
    columns,
    rows: data.map((row) => (Array.isArray(row) ? row : columns.map((column) => row[column]))),
    column_types: result.column_types || [],
    row_count: result.row_count ?? data.length,
    ...(Number.isFinite(result.execution_time_ms)
      ? { execution_time: result.execution_time_ms / 1000 }
      : {}),
    ...(result.truncated != null ? { truncated: result.truncated } : {}),
  };
}
