import assert from 'node:assert/strict';
import test from 'node:test';

const activityModel = await import('./conversationActivityModel.js').catch(() => ({}));

test('an in-flight conversation reports generating activity', () => {
  assert.equal(typeof activityModel.getConversationActivityPresentation, 'function');
  assert.deepEqual(
    activityModel.getConversationActivityPresentation({
      streamStatus: 'streaming',
      unreadActivity: null,
    }),
    { kind: 'generating', label: 'Generating response' },
  );
});

test('an active in-flight conversation does not duplicate generating activity in the sidebar', () => {
  assert.equal(typeof activityModel.getConversationActivityPresentation, 'function');
  assert.equal(
    activityModel.getConversationActivityPresentation(
      { streamStatus: 'streaming', unreadActivity: null },
      { isActive: true },
    ),
    null,
  );
});

test('background completion, error, and attention use distinct feedback', () => {
  assert.equal(typeof activityModel.getConversationActivityPresentation, 'function');

  assert.deepEqual(activityModel.getConversationActivityPresentation({ unreadActivity: 'done' }), {
    kind: 'done',
    label: 'Response ready',
  });
  assert.deepEqual(activityModel.getConversationActivityPresentation({ unreadActivity: 'error' }), {
    kind: 'error',
    label: 'Generation failed',
  });
  assert.deepEqual(
    activityModel.getConversationActivityPresentation({ unreadActivity: 'attention' }),
    { kind: 'attention', label: 'Needs your attention' },
  );
});

test('a completed active conversation has no residual status', () => {
  assert.equal(typeof activityModel.getConversationActivityPresentation, 'function');
  assert.equal(
    activityModel.getConversationActivityPresentation(
      {
        streamStatus: 'done',
        unreadActivity: null,
      },
      { isActive: true },
    ),
    null,
  );
});
