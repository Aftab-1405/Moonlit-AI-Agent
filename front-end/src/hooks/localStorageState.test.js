import assert from 'node:assert/strict';
import test from 'node:test';

const localStorageState = await import('./localStorageState.js').catch(() => ({}));

test('resolving an update does not commit it before persistence succeeds', () => {
  assert.equal(typeof localStorageState.resolveStoredValue, 'function');

  const currentValue = {
    responseStyle: 'concise',
    rememberConnection: true,
  };

  const resolved = localStorageState.resolveStoredValue(currentValue, (previous) => ({
    ...previous,
    responseStyle: 'balanced',
  }));

  assert.deepEqual(resolved, {
    responseStyle: 'balanced',
    rememberConnection: true,
  });
  assert.deepEqual(currentValue, {
    responseStyle: 'concise',
    rememberConnection: true,
  });
});

test('a functional update uses the value from the immediately committed update', () => {
  let latestValue = {
    responseStyle: 'concise',
    rememberConnection: true,
    connectionPersistence: 15,
    llmProvider: 'moonshotai',
    llmModel: 'kimi-k2.5',
  };

  latestValue = localStorageState.resolveStoredValue(latestValue, {
    responseStyle: 'balanced',
    rememberConnection: false,
    connectionPersistence: 0,
    llmProvider: null,
    llmModel: null,
  });

  const normalized = localStorageState.resolveStoredValue(latestValue, (previous) => ({
    ...previous,
    llmProvider: 'mistral',
    llmModel: 'devstral',
  }));

  assert.deepEqual(normalized, {
    responseStyle: 'balanced',
    rememberConnection: false,
    connectionPersistence: 0,
    llmProvider: 'mistral',
    llmModel: 'devstral',
  });
});
