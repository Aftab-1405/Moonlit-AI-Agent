export function createChatDraftStore() {
  const drafts = new Map();
  return {
    get(sessionKey) {
      return drafts.get(sessionKey) || '';
    },
    set(sessionKey, value) {
      drafts.set(sessionKey, value);
    },
    clear(sessionKey) {
      drafts.delete(sessionKey);
    },
  };
}
