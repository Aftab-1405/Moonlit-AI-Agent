import assert from 'node:assert/strict';
import test from 'node:test';
import { getChatMotionVariants, getNewMessageEntryIds } from './chatMotion.js';

test('chat motion uses restrained transform and opacity transitions', () => {
  const variants = getChatMotionVariants(false);

  assert.deepEqual(variants.turn.initial, { opacity: 0, y: 6 });
  assert.equal(variants.turn.animate.opacity, 1);
  assert.equal(variants.turn.animate.y, 0);
  assert.equal(variants.turn.animate.transition.duration, 0.18);
  assert.deepEqual(variants.turn.animate.transition.ease, [0.22, 1, 0.36, 1]);
  assert.equal(variants.status.exit.transition.duration, 0.1);
  assert.equal(variants.structured.animate.transition.duration, 0.18);
});

test('reduced motion keeps content visible without movement or duration', () => {
  const variants = getChatMotionVariants(true);

  for (const variant of Object.values(variants)) {
    assert.equal(variant.initial.opacity, 1);
    assert.equal(variant.initial.y, 0);
    assert.equal(variant.animate.transition.duration, 0);
  }
  assert.equal(variants.status.exit.transition.duration, 0);
});

test('only messages appended to the same ready session receive entry motion', () => {
  const seenIds = new Set(['user-1', 'assistant-1']);

  assert.deepEqual(
    getNewMessageEntryIds({
      previousSessionKey: 'session-a',
      sessionKey: 'session-a',
      wasLoading: false,
      isLoading: false,
      seenIds,
      messageIds: ['user-1', 'assistant-1', 'user-2', 'assistant-2'],
    }),
    new Set(['user-2', 'assistant-2']),
  );

  assert.deepEqual(
    getNewMessageEntryIds({
      previousSessionKey: 'session-a',
      sessionKey: 'session-b',
      wasLoading: false,
      isLoading: false,
      seenIds: new Set(),
      messageIds: ['stored-user', 'stored-assistant'],
    }),
    new Set(),
  );

  assert.deepEqual(
    getNewMessageEntryIds({
      previousSessionKey: 'session-b',
      sessionKey: 'session-b',
      wasLoading: true,
      isLoading: false,
      seenIds: new Set(),
      messageIds: ['loaded-user', 'loaded-assistant'],
    }),
    new Set(),
  );
});
