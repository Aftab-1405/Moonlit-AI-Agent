import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPerspectiveData,
  describeResultScope,
  normalizeQueryResult,
  resultExportMetadata,
  resultToCsv,
} from './queryResult.js';

test('editor and persisted AI canonical contracts preserve all metadata and duplicate labels', () => {
  const result = {
    columns: ['__column_1', '__column_2'],
    rows: [[1, 2]],
    column_metadata: [
      { key: '__column_1', label: 'id', perspective_type: 'integer' },
      { key: '__column_2', label: 'id', perspective_type: 'integer' },
    ],
    result_metadata: {
      version: 1,
      execution_id: 'e1',
      returned_rows: 1,
      effective_limit: 1000,
      completeness: 'complete',
    },
  };
  assert.deepEqual(
    normalizeQueryResult({ result }),
    normalizeQueryResult({ tabular_result: result }),
  );
  const built = buildPerspectiveData(normalizeQueryResult({ result }));
  assert.equal(Object.keys(built.columnar).length, 2);
  assert.deepEqual(Object.values(built.columnar), [[1], [2]]);
  assert.equal(resultToCsv(result), 'id,id\r\n1,2');
});
test('exact values survive and approximate measures are explicitly separate columns', () => {
  const data = {
    columns: ['id', 'price'],
    rows: [['9007199254740993', '1.00000000000000000001']],
    column_metadata: [
      { key: 'id', label: 'id', encoding: 'integer-string', perspective_type: 'string' },
      { key: 'price', label: 'price', encoding: 'decimal-string', perspective_type: 'string' },
    ],
  };
  const built = buildPerspectiveData(data);
  assert.equal(built.columnar.id[0], '9007199254740993');
  assert.equal(built.columnar.price[0], '1.00000000000000000001');
  assert.equal(built.schema['price (approximate)'], 'float');
  assert.equal(built.columnar['price (approximate)'][0], 1);
  assert.ok(built.notices.some((x) => x.includes('approximate')));
  assert.ok(resultToCsv(data).includes('9007199254740993,1.00000000000000000001'));
});
test('legacy integer columns use complete-column bounds and never silently accept unsafe numbers', () => {
  const built = buildPerspectiveData({
    columns: ['n'],
    column_types: { n: 'integer' },
    rows: [[1], [2147483648]],
  });
  assert.equal(built.schema.n, 'float');
  assert.equal(built.columnar.n[1], 2147483648);
  assert.throws(
    () => buildPerspectiveData({ columns: ['n'], rows: [[9007199254740992]] }),
    /unsafe integer/i,
  );
});
test('date-only is UTC calendar date; naive timestamps remain source text; typed null-only preserved', () => {
  const data = {
    columns: ['day', 'stamp', 'empty'],
    rows: [['2026-10-23', '2026-10-23T12:34:56', null]],
    column_metadata: [
      { key: 'day', label: 'day', perspective_type: 'date', encoding: 'iso8601' },
      {
        key: 'stamp',
        label: 'stamp',
        perspective_type: 'string',
        encoding: 'iso8601',
        timezone: 'naive',
      },
      { key: 'empty', label: 'empty', perspective_type: 'boolean' },
    ],
  };
  const b = buildPerspectiveData(data);
  assert.equal(b.columnar.day[0], Date.UTC(2026, 9, 23));
  assert.equal(b.columnar.stamp[0], '2026-10-23T12:34:56');
  assert.equal(b.schema.empty, 'boolean');
  assert.equal(b.columnar.empty[0], null);
});
test('scope distinguishes complete query output, truncated subset, and unknown legacy result', () => {
  assert.match(
    describeResultScope({
      rows: [],
      result_metadata: { completeness: 'complete', effective_limit: 1000, returned_rows: 0 },
    }),
    /Complete query result.*0 rows.*1,000/,
  );
  assert.match(
    describeResultScope({
      rows: [[1]],
      result_metadata: { completeness: 'truncated', effective_limit: 1, returned_rows: 1 },
    }),
    /Truncated query result/,
  );
  assert.match(describeResultScope({ rows: [[1]] }), /Completeness unknown/);
});
test('display label disambiguation cannot overwrite a source column', () => {
  const b = buildPerspectiveData({
    columns: ['a', 'b', 'c'],
    rows: [[1, 2, 3]],
    column_metadata: [
      { key: 'a', label: 'id' },
      { key: 'b', label: 'id' },
      { key: 'c', label: 'id [2]' },
    ],
  });
  assert.equal(Object.keys(b.columnar).length, 3);
  assert.deepEqual(Object.values(b.columnar), [[1], [2], [3]]);
});

test('export provenance carries result scope and view settings without ephemeral table handles', () => {
  const input = {
    columns: ['amount'],
    rows: [['1.00000000000000001']],
    column_metadata: [{ key: 'amount', label: 'amount', encoding: 'decimal-string' }],
    result_metadata: {
      execution_id: 'e',
      source_id: 's',
      query_id: 'q',
      completeness: 'truncated',
      effective_limit: 1,
      returned_rows: 1,
    },
  };
  const metadata = resultExportMetadata(input, {
    filter: [['amount', '==', '1.00000000000000001']],
    table: 'ephemeral',
  });
  assert.deepEqual(metadata.result_metadata, input.result_metadata);
  assert.deepEqual(metadata.column_metadata, input.column_metadata);
  assert.match(metadata.scope, /Truncated.*1 rows loaded/);
  assert.deepEqual(metadata.view_config, { filter: [['amount', '==', '1.00000000000000001']] });
  assert.match(metadata.calculation_semantics, /approximate/i);
  assert.equal(resultExportMetadata({ columns: [], rows: [] }).result_metadata, null);
});

test('source CSV distinguishes null from an empty string using documented quoted-empty convention', () => {
  assert.equal(
    resultToCsv({ columns: ['value'], rows: [[null], [''], ['a']] }),
    'value\r\n\r\n""\r\na',
  );
  assert.match(
    resultExportMetadata({ columns: [], rows: [] }).source_csv_null_encoding,
    /unquoted/i,
  );
});

test('driver-limited timestamps are visibly labelled without inventing an offset', () => {
  const input = {
    columns: ['stamp'],
    rows: [['2026-10-23T12:30:00']],
    column_metadata: [
      {
        key: 'stamp',
        label: 'stamp',
        perspective_type: 'string',
        encoding: 'driver-timestamp',
        timezone: 'unavailable',
        analysis_semantics: 'Driver does not preserve the timezone.',
      },
    ],
  };
  const built = buildPerspectiveData(input);
  assert.equal(built.columnar['stamp (timezone unavailable)'][0], '2026-10-23T12:30:00');
  assert.ok(built.notices.includes('Driver does not preserve the timezone.'));
});
