import assert from 'node:assert/strict';
import test from 'node:test';

const conversationRequestModel = await import('./conversationRequestModel.js').catch(() => ({}));

const requestOptions = {
  prompt: 'Show monthly revenue',
  enableReasoning: true,
  reasoningEffort: 'medium',
  responseStyle: 'balanced',
  maxRows: 1000,
  provider: null,
  model: null,
  taskMode: 'normal',
};

test('new-chat payload omits conversation_id entirely', () => {
  assert.equal(typeof conversationRequestModel.buildChatRequestPayload, 'function');

  const payload = conversationRequestModel.buildChatRequestPayload({
    ...requestOptions,
    conversationId: null,
  });

  assert.equal(Object.hasOwn(payload, 'conversation_id'), false);
});

test('continuation payload includes the canonical conversation_id unchanged', () => {
  assert.equal(typeof conversationRequestModel.buildChatRequestPayload, 'function');
  const conversationId = '123e4567-e89b-42d3-a456-426614174000';

  const payload = conversationRequestModel.buildChatRequestPayload({
    ...requestOptions,
    conversationId,
  });

  assert.equal(payload.conversation_id, conversationId);
});
