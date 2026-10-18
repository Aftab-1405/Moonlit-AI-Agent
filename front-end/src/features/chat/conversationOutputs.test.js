import assert from 'node:assert/strict';
import { collectConversationOutputs, normalizeExecutionResult } from './conversationOutputs.js';

const outputs = collectConversationOutputs(
  [
    { id: 'u', role: 'user', text: '```sql\nselect secret\n```' },
    {
      id: 'a',
      role: 'assistant',
      text: '```sql\nselect 1\n```\n```diagram-flow\ngraph\n```\n```sql\nunfinished',
      steps: [
        {
          name: 'execute_query',
          status: 'done',
          args: { query: 'select 1' },
          result: { data: { execution_id: 'e1' } },
        },
        { name: 'execute_query', status: 'error', result: { execution_id: 'failed' } },
        { name: 'execute_query', status: 'running', result: { execution_id: 'pending' } },
      ],
    },
  ],
  'c1',
);
assert.deepEqual(
  outputs.map((o) => o.type),
  ['sql-editor', 'react-flow', 'query-result'],
);
assert.equal(outputs[0].props.initialQuery, 'select 1');
assert.equal(outputs[2].props.executionId, 'e1');
assert.equal(outputs[2].props.conversationId, 'c1');
assert.equal(outputs[2].props.sourceQuery, 'select 1');
assert.equal(outputs[2].source, null, 'unknown historical source must stay unknown');
assert.equal(
  collectConversationOutputs(
    [
      {
        role: 'assistant',
        steps: [{ name: 'execute_query', status: 'done', result: { execution_id: 'e' } }],
      },
    ],
    null,
  ).length,
  0,
);
assert.deepEqual(normalizeExecutionResult({ data: [{ city: 'Pune', total: 0 }], row_count: 1 }), {
  columns: ['city', 'total'],
  rows: [['Pune', 0]],
  column_types: [],
  row_count: 1,
});
assert.deepEqual(
  normalizeExecutionResult({ columns: ['total'], result: [], row_count: 0 }).rows,
  [],
);
