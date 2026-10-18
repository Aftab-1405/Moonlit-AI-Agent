export const CHAT_LOAD_STATUS = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
});

export const CHAT_STREAM_STATUS = Object.freeze({
  IDLE: 'idle',
  STARTING: 'starting',
  STREAMING: 'streaming',
  WAITING: 'waiting',
  PAUSED: 'paused',
  DONE: 'done',
  STOPPED: 'stopped',
  ERROR: 'error',
});

export function createChatSession({
  sessionKey,
  conversationId = null,
  optimisticTitle = null,
  messages = [],
  loadStatus = conversationId ? CHAT_LOAD_STATUS.LOADING : CHAT_LOAD_STATUS.IDLE,
  streamStatus = CHAT_STREAM_STATUS.IDLE,
  unreadActivity = null,
  pendingInteraction = null,
  usageMetrics = null,
  effectiveTaskMode = null,
} = {}) {
  if (!sessionKey) throw new Error('A chat session requires a sessionKey.');

  return {
    sessionKey,
    conversationId,
    optimisticTitle,
    messages,
    loadStatus,
    streamStatus,
    unreadActivity,
    pendingInteraction,
    usageMetrics,
    effectiveTaskMode,
  };
}

export function bindChatSessionConversation(session, conversationId, optimisticTitle = null) {
  return {
    ...session,
    conversationId,
    optimisticTitle: optimisticTitle || session.optimisticTitle,
    loadStatus: CHAT_LOAD_STATUS.READY,
  };
}

export function completeChatSessionStream(session, { outcome, isActive }) {
  const streamStatus = outcome || CHAT_STREAM_STATUS.DONE;
  const unreadActivity = isActive
    ? null
    : streamStatus === CHAT_STREAM_STATUS.ERROR
      ? 'error'
      : streamStatus === CHAT_STREAM_STATUS.DONE
        ? 'done'
        : session.unreadActivity;

  return { ...session, streamStatus, unreadActivity };
}

export function queueChatSessionInteraction(session, interaction, isActive) {
  return {
    ...session,
    pendingInteraction: interaction,
    unreadActivity: isActive ? null : 'attention',
  };
}

export function activateChatSession(session) {
  return { ...session, unreadActivity: null };
}

export function isChatSessionStreaming(session) {
  return (
    session?.streamStatus === CHAT_STREAM_STATUS.STARTING ||
    session?.streamStatus === CHAT_STREAM_STATUS.STREAMING
  );
}

export function resolveRouteChatSessionKey({
  routeConversationId,
  locationSessionKey,
  locationSession,
  knownConversationSessionKey,
  initialDraftSessionKey,
}) {
  // Binding the first response updates the draft before navigation commits.
  // Keep its explicit route-state identity while the URL is still /chat.
  const locationMatchesRoute =
    !routeConversationId ||
    !locationSession?.conversationId ||
    locationSession.conversationId === routeConversationId;

  if (locationSessionKey && locationMatchesRoute) return locationSessionKey;
  if (routeConversationId) {
    return knownConversationSessionKey || `conversation:${routeConversationId}`;
  }
  return initialDraftSessionKey;
}
