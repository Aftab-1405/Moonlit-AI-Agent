import assert from 'node:assert/strict';
import test from 'node:test';

const chatStreamRegistry = await import('./chatStreamRegistry.js').catch(() => ({}));

test('different chat sessions can stream concurrently while a session has at most one stream', () => {
  assert.equal(typeof chatStreamRegistry.createChatStreamRegistry, 'function');
  const registry = chatStreamRegistry.createChatStreamRegistry();

  const first = registry.start('session-a');
  const second = registry.start('session-b');

  assert.ok(first);
  assert.ok(second);
  assert.equal(registry.start('session-a'), null);
  assert.equal(registry.isActive('session-a'), true);
  assert.equal(registry.isActive('session-b'), true);
});

test('stopping one session does not abort another session', () => {
  assert.equal(typeof chatStreamRegistry.createChatStreamRegistry, 'function');
  const registry = chatStreamRegistry.createChatStreamRegistry();
  const first = registry.start('session-a');
  const second = registry.start('session-b');

  registry.stop('session-a');

  assert.equal(first.controller.signal.aborted, true);
  assert.equal(second.controller.signal.aborted, false);
  assert.equal(registry.isActive('session-a'), false);
  assert.equal(registry.isActive('session-b'), true);
});

test('finishing an old generation cannot clear a newer stream owner', () => {
  assert.equal(typeof chatStreamRegistry.createChatStreamRegistry, 'function');
  const registry = chatStreamRegistry.createChatStreamRegistry();
  const first = registry.start('session-a');

  registry.stop('session-a');
  const second = registry.start('session-a');

  assert.equal(registry.finish('session-a', first.generation), false);
  assert.equal(registry.isActive('session-a'), true);
  assert.equal(registry.finish('session-a', second.generation), true);
  assert.equal(registry.isActive('session-a'), false);
});

test('stopping all sessions aborts every in-flight request', () => {
  assert.equal(typeof chatStreamRegistry.createChatStreamRegistry, 'function');
  const registry = chatStreamRegistry.createChatStreamRegistry();
  const first = registry.start('session-a');
  const second = registry.start('session-b');

  registry.stopAll();

  assert.equal(first.controller.signal.aborted, true);
  assert.equal(second.controller.signal.aborted, true);
  assert.equal(registry.size, 0);
});

test('stopping all sessions finalizes each owner before clearing the registry', () => {
  assert.equal(typeof chatStreamRegistry.createChatStreamRegistry, 'function');
  const registry = chatStreamRegistry.createChatStreamRegistry();
  const first = registry.start('session-a');
  const second = registry.start('session-b');
  const finalized = [];

  registry.stopAll((sessionKey, entry) => {
    assert.equal(registry.get(sessionKey), entry);
    assert.equal(entry.controller.signal.aborted, false);
    finalized.push(sessionKey);
  });

  assert.deepEqual(finalized, ['session-a', 'session-b']);
  assert.equal(first.controller.signal.aborted, true);
  assert.equal(second.controller.signal.aborted, true);
  assert.equal(registry.size, 0);
});
