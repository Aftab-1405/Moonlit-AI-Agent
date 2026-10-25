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
  column_types: {},
  column_metadata: [],
  result_metadata: null,
  client_metrics: null,
  expired: false,
  total_rows: null,
  truncated: false,
  execution_time: null,
  row_count: 1,
});
assert.deepEqual(
  normalizeExecutionResult({ columns: ['total'], result: [], row_count: 0 }).rows,
  [],
);

const { createConversationOutputCollector } = await import('./conversationOutputs.js');
const collect = createConversationOutputCollector('chat-a');
let reads = 0;
const completed = {
  id: 'completed',
  role: 'assistant',
  get text() {
    reads += 1;
    return '```sql\nselect 1\n```';
  },
};
const first = collect([completed, { id: 'live', role: 'assistant', text: 'Starting' }]);
const readsAfterFirst = reads;
const second = collect([completed, { id: 'live', role: 'assistant', text: 'Starting now' }]);
assert.equal(
  reads,
  readsAfterFirst,
  'completed turns must not be parsed again for streaming updates',
);
assert.equal(second, first, 'unchanged outputs keep their array identity');
const third = collect([
  completed,
  { id: 'live', role: 'assistant', text: '```sql\nselect 2\n```' },
]);
assert.equal(third[0], first[0]);
assert.equal(third[1].props.initialQuery, 'select 2');
assert.equal(collect([]).length, 0, 'deleted outputs must disappear');
const withoutIds = [
  { role: 'user', text: 'hello' },
  { role: 'assistant', text: '```sql\nselect 3\n```' },
];
assert.deepEqual(collect(withoutIds), collectConversationOutputs(withoutIds, 'chat-a'));
