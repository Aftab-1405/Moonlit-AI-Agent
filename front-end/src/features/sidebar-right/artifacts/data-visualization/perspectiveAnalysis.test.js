import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAnalysisStorageKey,
  loadAnalysisConfig,
  saveAnalysisConfig,
} from './perspectiveAnalysis.js';

const identity = {
  userId: 'u',
  sourceId: 's',
  queryId: 'q',
  columnMetadata: [{ key: 'x', perspective_type: 'integer' }],
};
test('analysis identity requires authenticated source and includes schema types', () => {
  assert.equal(createAnalysisStorageKey({}), null);
  const key = createAnalysisStorageKey(identity);
  assert.notEqual(key, createAnalysisStorageKey({ ...identity, sourceId: 'other' }));
  assert.notEqual(
    key,
    createAnalysisStorageKey({
      ...identity,
      columnMetadata: [{ key: 'x', perspective_type: 'string' }],
    }),
  );
});
test('save failure returns false and legacy/corrupt configurations are rejected', () => {
  const storage = new Map();
  globalThis.window = {
    localStorage: { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v) },
  };
  const key = createAnalysisStorageKey(identity);
  storage.set(key, '{"filter":[["x",">",2]]}');
  assert.equal(loadAnalysisConfig(key), null);
  assert.equal(saveAnalysisConfig(key, { plugin: 'Datagrid', table: 'ephemeral' }), true);
  assert.deepEqual(loadAnalysisConfig(key), { plugin: 'Datagrid' });
  window.localStorage.setItem = () => {
    throw Error('quota');
  };
  assert.equal(saveAnalysisConfig(key, {}), false);
  delete globalThis.window;
});
