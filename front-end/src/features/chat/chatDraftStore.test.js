import assert from 'node:assert/strict';
import test from 'node:test';

const chatDraftStore = await import('./chatDraftStore.js').catch(() => ({}));

test('composer drafts remain isolated when the active chat changes', () => {
  assert.equal(typeof chatDraftStore.createChatDraftStore, 'function');
  const drafts = chatDraftStore.createChatDraftStore();

  drafts.set('session-a', 'First draft');
  drafts.set('session-b', 'Second draft');

  assert.equal(drafts.get('session-a'), 'First draft');
  assert.equal(drafts.get('session-b'), 'Second draft');
});

test('sending clears only the owning session draft', () => {
  assert.equal(typeof chatDraftStore.createChatDraftStore, 'function');
  const drafts = chatDraftStore.createChatDraftStore();
  drafts.set('session-a', 'Send me');
  drafts.set('session-b', 'Keep me');

  drafts.clear('session-a');

  assert.equal(drafts.get('session-a'), '');
  assert.equal(drafts.get('session-b'), 'Keep me');
});
