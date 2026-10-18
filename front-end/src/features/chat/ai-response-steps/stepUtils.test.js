import assert from 'node:assert/strict';
import test from 'node:test';
import * as toolActionConfig from '../../../config/toolActions.js';
import * as stepUtils from './stepUtils.js';
import {
  buildStepsSummary,
  getDetailedResult,
  getTableRowCountItems,
  normalizeSteps,
} from './stepUtils.js';

const REGISTERED_AGENT_TOOLS = new Set([
  'read_skill',
  'get_connection_status',
  'get_database_list',
  'execute_query',
  'analyze_query_result',
  'get_table_indexes',
  'get_schema_overview',
  'explain_query',
  'get_table_details',
  'get_table_row_counts',
  'get_foreign_keys',
  'list_views',
  'web_search',
  'get_query_history',
  'open_sql_editor',
  'open_database_modal',
  'open_settings_modal',
  'navigate_new_chat',
  'retrieve_memory',
]);

const batchResult = {
  success: true,
  table_count: 2,
  row_counts: [
    { table: 'orders', row_count: 1250, is_estimate: false },
    { table: 'customers', row_count: 320, is_estimate: false },
  ],
};

test('batched row counts produce one plural timeline step', () => {
  const steps = normalizeSteps([
    {
      type: 'tool',
      name: 'get_table_row_counts',
      status: 'complete',
      args: { table_names: ['orders', 'customers'] },
      result: batchResult,
    },
  ]);

  assert.equal(steps.length, 1);
  assert.equal(steps[0].actionText, 'Counted table rows');
  assert.equal(buildStepsSummary(steps), 'Counted table rows');
});

test('batched row count details preserve ordered table values', () => {
  assert.deepEqual(getTableRowCountItems(batchResult), [
    { table: 'orders', rowCount: 1250, isEstimate: false },
    { table: 'customers', rowCount: 320, isEstimate: false },
  ]);
  assert.equal(
    getDetailedResult('get_table_row_counts', batchResult),
    'Counted 2 tables: orders (1,250 rows), customers (320 rows)',
  );
});

test('registered agent tools have an exact presentation catalog', () => {
  assert.ok(toolActionConfig.AGENT_TOOL_ACTIONS, 'agent tool catalog is missing');
  assert.deepEqual(
    new Set(Object.keys(toolActionConfig.AGENT_TOOL_ACTIONS)),
    REGISTERED_AGENT_TOOLS,
  );

  for (const [name, config] of Object.entries(toolActionConfig.AGENT_TOOL_ACTIONS)) {
    assert.equal(typeof config.running, 'string', `${name} is missing a running label`);
    assert.equal(typeof config.done, 'string', `${name} is missing a completed label`);
    assert.equal(typeof config.presentation, 'string', `${name} is missing a presentation kind`);
  }
});

test('frontend-only lifecycle actions remain outside the agent tool catalog', () => {
  assert.ok(toolActionConfig.TOOL_ACTIONS.write_sql_editor_query);
  assert.ok(toolActionConfig.TOOL_ACTIONS.complete_navigate_new_chat);
  assert.ok(toolActionConfig.TOOL_ACTIONS.usage_metrics);
  assert.equal(toolActionConfig.AGENT_TOOL_ACTIONS?.write_sql_editor_query, undefined);
});

test('every registered agent tool has a deterministic successful summary', () => {
  const results = {
    read_skill: { success: true, skill_name: 'database-querying', already_loaded: false },
    get_connection_status: {
      success: true,
      connected: true,
      database: 'analytics',
      db_type: 'postgresql',
    },
    get_database_list: { success: true, count: 1, databases: ['analytics'] },
    execute_query: { success: true, row_count: 3, total_rows: 3, truncated: false },
    analyze_query_result: {
      success: true,
      operation: 'correlation',
      analyzed_rows: 10,
      columns: ['revenue', 'cost'],
      pearson_correlation: 0.75,
    },
    get_table_indexes: { success: true, count: 1, table: 'orders', indexes: [{}] },
    get_schema_overview: { success: true, table_count: 2, database: 'analytics' },
    explain_query: { success: true, plan_format: 'text', row_count: 2, truncated: false },
    get_table_details: { success: true, table: 'orders', column_count: 3, columns: [{}, {}, {}] },
    get_table_row_counts: batchResult,
    get_foreign_keys: { success: true, count: 1, table: 'orders', foreign_keys: [{}] },
    list_views: {
      success: true,
      count: 2,
      views: ['active_orders'],
      materialized_views: ['sales'],
    },
    web_search: { success: true, query: 'PostgreSQL', count: 1, results: [{}] },
    get_query_history: { success: true, count: 1, queries: [{}] },
    open_sql_editor: { success: true, action: 'open_sql_editor' },
    open_database_modal: { success: true, action: 'open_database_modal' },
    open_settings_modal: { success: true, action: 'open_settings_modal' },
    navigate_new_chat: {
      success: true,
      action: 'navigate_new_chat',
      requiresConfirmation: true,
      approved: false,
    },
    retrieve_memory: { success: true, query: 'revenue targets', found: true },
  };

  for (const name of REGISTERED_AGENT_TOOLS) {
    const summary = getDetailedResult(name, results[name]);
    assert.notEqual(summary, 'Completed successfully', `${name} used the generic success summary`);
    assert.ok(summary.length > 0, `${name} returned an empty summary`);
  }

  assert.equal(
    getDetailedResult('analyze_query_result', results.analyze_query_result),
    'Correlation over 10 rows: revenue vs cost (r = 0.750)',
  );
  assert.equal(
    getDetailedResult('get_query_history', results.get_query_history),
    'Retrieved 1 recent query',
  );
  assert.equal(
    getDetailedResult('retrieve_memory', results.retrieve_memory),
    'Found conversation memory for "revenue targets"',
  );
});

test('generic structured result view is bounded and marks truncation', () => {
  assert.equal(typeof stepUtils.getGenericResultView, 'function');
  const result = Object.fromEntries(
    Array.from({ length: 25 }, (_, index) => [
      `field_${index}`,
      index === 0 ? Array.from({ length: 60 }, (_item, itemIndex) => itemIndex) : `value_${index}`,
    ]),
  );

  const view = stepUtils.getGenericResultView(result);

  assert.ok(view.metadata.length <= 20);
  assert.ok(view.structuredText.length <= 4000);
  assert.equal(view.truncated, true);
  assert.match(view.structuredText, /truncated/i);
});

test('generic structured result view prioritizes canonical errors', () => {
  assert.equal(typeof stepUtils.getGenericResultView, 'function');

  assert.deepEqual(
    stepUtils.getGenericResultView({
      success: false,
      error_code: 'TOOL_RESULT_INVALID',
      error: 'Tool result could not be structured.',
      data: { private: 'must not render' },
    }),
    {
      error: 'Tool result could not be structured.',
      metadata: [],
      structuredText: '',
      truncated: false,
    },
  );
});

test('query execution timeline metadata excludes rows already shown in the interactive table', () => {
  assert.equal(typeof stepUtils.getTimelineResult, 'function');
  const visible = stepUtils.getTimelineResult('execute_query', {
    success: true,
    data: [{ id: 1 }],
    preview: [{ id: 1 }],
    columns: ['id'],
    row_count: 1,
    total_rows: 1,
    truncated: false,
    execution_id: 'execution-1',
  });

  assert.deepEqual(visible, {
    success: true,
    columns: ['id'],
    row_count: 1,
    total_rows: 1,
    truncated: false,
    execution_id: 'execution-1',
  });
});

test('legacy memory text is removed before generic timeline rendering', () => {
  const visible = stepUtils.getTimelineResult('retrieve_memory', {
    success: true,
    found: true,
    memories: 'private historical memory',
  });

  assert.deepEqual(visible, {
    success: true,
    found: true,
  });
  assert.doesNotMatch(
    JSON.stringify(stepUtils.getGenericResultView(visible)),
    /private historical memory/,
  );
});

test('table detail column metadata uses the backend field contract', () => {
  assert.equal(typeof stepUtils.getColumnDisplayMeta, 'function');

  assert.deepEqual(
    stepUtils.getColumnDisplayMeta({
      name: 'email',
      data_type: 'varchar',
      is_nullable: false,
      default: 'unknown@example.com',
      is_primary_key: false,
      is_unique: true,
      max_length: 255,
    }),
    ['varchar', 'NOT NULL', 'UNIQUE', 'MAX 255', 'DEFAULT unknown@example.com'],
  );
});

test('query history presentation preserves bounded valid SQL entries', () => {
  assert.equal(typeof stepUtils.getQueryHistoryItems, 'function');
  const items = stepUtils.getQueryHistoryItems({
    queries: [
      {
        query: 'SELECT id FROM orders',
        database: 'analytics',
        row_count: 4,
        status: 'success',
        executed_at: '2026-08-30T10:00:00+00:00',
      },
      { database: 'missing-query' },
    ],
  });

  assert.deepEqual(items, [
    {
      query: 'SELECT id FROM orders',
      database: 'analytics',
      rowCount: 4,
      status: 'success',
      executedAt: '2026-08-30T10:00:00+00:00',
    },
  ]);
});

test('web search presentation rejects unsafe persisted link schemes', () => {
  assert.equal(typeof stepUtils.getWebSearchItems, 'function');

  assert.deepEqual(
    stepUtils.getWebSearchItems({
      results: [
        { title: 'Unsafe', url: 'javascript:alert(1)', content: 'do not render' },
        { title: 'Safe', url: 'https://www.postgresql.org/docs/', content: 'Documentation' },
      ],
    }),
    [
      {
        title: 'Safe',
        url: 'https://www.postgresql.org/docs/',
        content: 'Documentation',
      },
    ],
  );
});
