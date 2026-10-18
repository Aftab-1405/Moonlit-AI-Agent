import assert from 'node:assert/strict';
import test from 'node:test';

const chatSessionModel = await import('./chatSessionModel.js').catch(() => ({}));

test('a draft keeps its client identity when the backend assigns a conversation id', () => {
  assert.equal(typeof chatSessionModel.createChatSession, 'function');
  assert.equal(typeof chatSessionModel.bindChatSessionConversation, 'function');

  const draft = chatSessionModel.createChatSession({
    sessionKey: 'draft-1',
    messages: [{ id: 'user-1', role: 'user', text: 'Hello' }],
  });
  const persisted = chatSessionModel.bindChatSessionConversation(draft, 'conversation-1', 'Hello');

  assert.equal(persisted.sessionKey, 'draft-1');
  assert.equal(persisted.conversationId, 'conversation-1');
  assert.equal(persisted.optimisticTitle, 'Hello');
  assert.deepEqual(persisted.messages, [{ id: 'user-1', role: 'user', text: 'Hello' }]);
});

test('stream completion is unread activity only for a background session', () => {
  assert.equal(typeof chatSessionModel.completeChatSessionStream, 'function');

  const streaming = chatSessionModel.createChatSession({
    sessionKey: 'conversation-1',
    conversationId: 'conversation-1',
    streamStatus: 'streaming',
  });

  const active = chatSessionModel.completeChatSessionStream(streaming, {
    outcome: 'done',
    isActive: true,
  });
  const background = chatSessionModel.completeChatSessionStream(streaming, {
    outcome: 'done',
    isActive: false,
  });

  assert.equal(active.streamStatus, 'done');
  assert.equal(active.unreadActivity, null);
  assert.equal(background.streamStatus, 'done');
  assert.equal(background.unreadActivity, 'done');
});

test('a background interaction is retained for its owner without opening active-chat UI', () => {
  assert.equal(typeof chatSessionModel.queueChatSessionInteraction, 'function');

  const session = chatSessionModel.createChatSession({
    sessionKey: 'conversation-2',
    conversationId: 'conversation-2',
  });
  const interaction = { type: 'agent_interrupt', payload: { action: 'execute_query' } };
  const background = chatSessionModel.queueChatSessionInteraction(session, interaction, false);
  const active = chatSessionModel.queueChatSessionInteraction(session, interaction, true);

  assert.deepEqual(background.pendingInteraction, interaction);
  assert.equal(background.unreadActivity, 'attention');
  assert.deepEqual(active.pendingInteraction, interaction);
  assert.equal(active.unreadActivity, null);
});

test('selecting a session clears only its unread activity', () => {
  assert.equal(typeof chatSessionModel.activateChatSession, 'function');

  const session = chatSessionModel.createChatSession({
    sessionKey: 'conversation-3',
    conversationId: 'conversation-3',
    streamStatus: 'error',
    unreadActivity: 'error',
    pendingInteraction: { type: 'agent_interrupt' },
  });
  const activated = chatSessionModel.activateChatSession(session);

  assert.equal(activated.unreadActivity, null);
  assert.deepEqual(activated.pendingInteraction, { type: 'agent_interrupt' });
  assert.equal(activated.streamStatus, 'error');
});

test('route identity rejects stale history state owned by another conversation', () => {
  assert.equal(typeof chatSessionModel.resolveRouteChatSessionKey, 'function');

  assert.equal(
    chatSessionModel.resolveRouteChatSessionKey({
      routeConversationId: 'conversation-b',
      locationSessionKey: 'session-a',
      locationSession: { conversationId: 'conversation-a' },
      knownConversationSessionKey: null,
      initialDraftSessionKey: 'draft-initial',
    }),
    'conversation:conversation-b',
  );
  assert.equal(
    chatSessionModel.resolveRouteChatSessionKey({
      routeConversationId: null,
      locationSessionKey: 'draft-current',
      locationSession: { conversationId: null },
      knownConversationSessionKey: null,
      initialDraftSessionKey: 'draft-initial',
    }),
    'draft-current',
  );
});

test('a new-chat draft remains selected while its first conversation URL is updating', () => {
  const boundDraft = chatSessionModel.bindChatSessionConversation(
    chatSessionModel.createChatSession({
      sessionKey: 'draft-new-chat',
      messages: [{ id: 'user-1', role: 'user', text: 'Hello' }],
    }),
    'conversation-1',
  );

  for (const routeConversationId of [null, 'conversation-1']) {
    assert.equal(
      chatSessionModel.resolveRouteChatSessionKey({
        routeConversationId,
        locationSessionKey: 'draft-new-chat',
        locationSession: boundDraft,
        knownConversationSessionKey: 'draft-new-chat',
        initialDraftSessionKey: 'draft-initial',
      }),
      'draft-new-chat',
    );
  }
});
