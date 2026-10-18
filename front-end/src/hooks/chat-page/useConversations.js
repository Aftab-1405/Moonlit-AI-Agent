import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  deleteConversation,
  getAllUserConversations,
  getConversation,
  renameConversation,
} from '@/api';
import { queryClient, queryKeys } from '@/api/queryClient';
import {
  conversationListLoadReducer,
  initialConversationListLoadState,
} from '@/features/sidebar-left/conversationListModel';
import {
  activateChatSession,
  bindChatSessionConversation,
  CHAT_LOAD_STATUS,
  createChatSession,
  resolveRouteChatSessionKey,
} from '@/hooks/chat-page/chatSessionModel';
import { normalizeConversationMessage } from '@/utils/chatMessages';
import { recoverLegacyConversationTitle } from '@/utils/conversationTitles';
import logger from '@/utils/logger';

let draftSequence = 0;

function createDraftSessionKey() {
  if (globalThis.crypto?.randomUUID) return `draft:${globalThis.crypto.randomUUID()}`;
  draftSequence += 1;
  return `draft:${Date.now()}:${draftSequence}`;
}

function getPersistedSessionKey(conversationId) {
  return `conversation:${conversationId}`;
}

function findLatestUsage(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant' && messages[index]?.usage) {
      return messages[index].usage;
    }
  }
  return null;
}

export function useConversations() {
  const { conversationId: routeConversationIdParam } = useParams();
  const routeConversationId = routeConversationIdParam || null;
  const location = useLocation();
  const navigate = useNavigate();
  const initialDraftSessionKeyRef = useRef(createDraftSessionKey());
  const sessionKeysByConversationRef = useRef(null);
  if (sessionKeysByConversationRef.current === null) {
    // Dashboard links carry the persisted URL, not the draft's route state.
    // Recover stable identities from the account-scoped in-memory session cache.
    sessionKeysByConversationRef.current = new Map(
      queryClient
        .getQueriesData({ queryKey: ['chatSessions'] })
        .map(([, session]) => session)
        .filter((session) => session?.conversationId && session?.sessionKey)
        .map((session) => [session.conversationId, session.sessionKey]),
    );
  }
  const conversationLoadGenerationRef = useRef(new Map());
  const conversationsLoadSeqRef = useRef(0);
  const legacyTitleSourceRef = useRef(new Map());
  const activeSessionKeyRef = useRef(null);
  const [sessionMetadataRevision, bumpSessionMetadataRevision] = useReducer(
    (revision) => revision + 1,
    0,
  );

  const locationSessionKey = location.state?.chatSessionKey;
  const activeSessionKey = resolveRouteChatSessionKey({
    routeConversationId,
    locationSessionKey,
    locationSession: locationSessionKey
      ? queryClient.getQueryData(queryKeys.chatSession(locationSessionKey))
      : null,
    knownConversationSessionKey: routeConversationId
      ? sessionKeysByConversationRef.current.get(routeConversationId)
      : null,
    initialDraftSessionKey: initialDraftSessionKeyRef.current,
  });
  activeSessionKeyRef.current = activeSessionKey;
  if (routeConversationId) {
    sessionKeysByConversationRef.current.set(routeConversationId, activeSessionKey);
  }

  const [conversations, setConversations] = useState([]);
  const [isConversationsLoading, setIsConversationsLoading] = useState(false);
  const [conversationListLoadState, dispatchConversationListLoad] = useReducer(
    conversationListLoadReducer,
    initialConversationListLoadState,
  );

  const { data: activeSession } = useQuery({
    queryKey: queryKeys.chatSession(activeSessionKey),
    queryFn: () =>
      createChatSession({
        sessionKey: activeSessionKey,
        conversationId: routeConversationId,
        loadStatus: routeConversationId ? CHAT_LOAD_STATUS.LOADING : CHAT_LOAD_STATUS.IDLE,
      }),
    initialData: () =>
      createChatSession({
        sessionKey: activeSessionKey,
        conversationId: routeConversationId,
        loadStatus: routeConversationId ? CHAT_LOAD_STATUS.LOADING : CHAT_LOAD_STATUS.IDLE,
      }),
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const getSession = useCallback(
    (sessionKey) => queryClient.getQueryData(queryKeys.chatSession(sessionKey)) || null,
    [],
  );

  const updateSession = useCallback((sessionKey, updater, { notifyMetadata = true } = {}) => {
    queryClient.setQueryData(queryKeys.chatSession(sessionKey), (current) => {
      const base =
        current ||
        createChatSession({
          sessionKey,
          loadStatus: CHAT_LOAD_STATUS.IDLE,
        });
      return typeof updater === 'function' ? updater(base) : { ...base, ...updater };
    });
    if (notifyMetadata) bumpSessionMetadataRevision();
  }, []);

  const updateSessionMessages = useCallback(
    (sessionKey, updater) => {
      let conversationId = null;
      let nextMessages = [];
      updateSession(
        sessionKey,
        (session) => {
          conversationId = session.conversationId;
          nextMessages =
            typeof updater === 'function' ? updater(session.messages || []) : updater || [];
          return { ...session, messages: nextMessages };
        },
        { notifyMetadata: false },
      );

      if (conversationId) {
        queryClient.setQueryData(queryKeys.conversation(conversationId), (current) => ({
          ...(current || { status: 'success' }),
          messages: nextMessages,
        }));
      }
    },
    [updateSession],
  );

  const isSessionActive = useCallback(
    (sessionKey) => activeSessionKeyRef.current === sessionKey,
    [],
  );

  const fetchConversations = useCallback(async (signal, options = {}) => {
    const showLoading = options.showLoading ?? true;
    const requestSeq = conversationsLoadSeqRef.current + 1;
    conversationsLoadSeqRef.current = requestSeq;
    dispatchConversationListLoad({ type: 'started', visible: showLoading });
    if (showLoading) setIsConversationsLoading(true);

    try {
      if (options.force) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      }
      const data = await queryClient.fetchQuery({
        queryKey: queryKeys.conversations,
        queryFn: ({ signal: querySignal }) => getAllUserConversations(signal ?? querySignal),
        staleTime: 15 * 1000,
      });
      if (conversationsLoadSeqRef.current !== requestSeq) return;
      if (data.status === 'success') {
        const nextConversations = (data.conversations || []).map((conversation) => {
          const firstUserMessage = legacyTitleSourceRef.current.get(conversation.id);
          if (!firstUserMessage) return conversation;
          const recoveredTitle = recoverLegacyConversationTitle(
            conversation.title,
            firstUserMessage,
          );
          return recoveredTitle && recoveredTitle !== conversation.title
            ? { ...conversation, title: recoveredTitle }
            : conversation;
        });
        setConversations((previous) => {
          if (previous.length !== nextConversations.length) return nextConversations;
          const changed = previous.some(
            (conversation, index) =>
              conversation.id !== nextConversations[index]?.id ||
              conversation.title !== nextConversations[index]?.title ||
              conversation.timestamp !== nextConversations[index]?.timestamp,
          );
          return changed ? nextConversations : previous;
        });
      }
      dispatchConversationListLoad({ type: 'succeeded' });
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (conversationsLoadSeqRef.current !== requestSeq) return;
      dispatchConversationListLoad({ type: 'failed' });
      logger.error('Failed to fetch conversations:', error);
    } finally {
      if (conversationsLoadSeqRef.current === requestSeq) setIsConversationsLoading(false);
    }
  }, []);

  const retryConversations = useCallback(
    () => fetchConversations(undefined, { force: true, showLoading: true }),
    [fetchConversations],
  );

  const recoverGeneratedTitle = useCallback((conversationId, conversationMessages) => {
    const firstUserMessage = conversationMessages.find((message) => message?.role === 'user')?.text;
    if (!firstUserMessage) return;
    legacyTitleSourceRef.current.set(conversationId, firstUserMessage);
    setConversations((previous) =>
      previous.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        const recoveredTitle = recoverLegacyConversationTitle(conversation.title, firstUserMessage);
        return recoveredTitle && recoveredTitle !== conversation.title
          ? { ...conversation, title: recoveredTitle }
          : conversation;
      }),
    );
  }, []);

  const loadConversation = useCallback(
    async (sessionKey, conversationId) => {
      const session = getSession(sessionKey);
      if (session?.conversationId === conversationId && session.messages?.length > 0) {
        updateSession(sessionKey, activateChatSession);
        return true;
      }

      const cachedConversation = queryClient.getQueryData(queryKeys.conversation(conversationId));
      if (cachedConversation?.messages) {
        const messages = cachedConversation.messages;
        updateSession(sessionKey, (current) => ({
          ...current,
          conversationId,
          messages,
          loadStatus: CHAT_LOAD_STATUS.READY,
          usageMetrics: findLatestUsage(messages),
          unreadActivity: null,
        }));
        recoverGeneratedTitle(conversationId, messages);
        return true;
      }

      const generation = (conversationLoadGenerationRef.current.get(sessionKey) || 0) + 1;
      conversationLoadGenerationRef.current.set(sessionKey, generation);
      updateSession(sessionKey, (current) => ({
        ...current,
        conversationId,
        loadStatus: CHAT_LOAD_STATUS.LOADING,
      }));

      try {
        const data = await queryClient.fetchQuery({
          queryKey: queryKeys.conversation(conversationId),
          queryFn: ({ signal }) => getConversation(conversationId, signal),
          staleTime: 5 * 60 * 1000,
        });
        if (conversationLoadGenerationRef.current.get(sessionKey) !== generation) return false;
        if (data.status !== 'success' || !data.conversation) {
          updateSession(sessionKey, (current) => ({
            ...current,
            loadStatus: CHAT_LOAD_STATUS.ERROR,
          }));
          return false;
        }

        const messages = (data.conversation.messages || []).map((message, index) =>
          normalizeConversationMessage(message, index),
        );
        queryClient.setQueryData(queryKeys.conversation(conversationId), { ...data, messages });
        updateSession(sessionKey, (current) => ({
          ...current,
          conversationId,
          messages,
          loadStatus: CHAT_LOAD_STATUS.READY,
          usageMetrics: findLatestUsage(messages),
          unreadActivity: null,
        }));
        recoverGeneratedTitle(conversationId, messages);
        return true;
      } catch (error) {
        if (error.name === 'AbortError') return false;
        logger.error('Failed to load conversation:', error);
        updateSession(sessionKey, (current) => ({
          ...current,
          loadStatus: CHAT_LOAD_STATUS.ERROR,
        }));
        return false;
      }
    },
    [getSession, recoverGeneratedTitle, updateSession],
  );

  const startNewChat = useCallback(() => {
    const sessionKey = createDraftSessionKey();
    queryClient.setQueryData(
      queryKeys.chatSession(sessionKey),
      createChatSession({ sessionKey, loadStatus: CHAT_LOAD_STATUS.IDLE }),
    );
    navigate('/chat', { state: { chatSessionKey: sessionKey } });
    return sessionKey;
  }, [navigate]);

  const selectConversation = useCallback(
    (conversationId) => {
      const sessionKey =
        sessionKeysByConversationRef.current.get(conversationId) ||
        getPersistedSessionKey(conversationId);
      sessionKeysByConversationRef.current.set(conversationId, sessionKey);
      const existing = getSession(sessionKey);
      queryClient.setQueryData(
        queryKeys.chatSession(sessionKey),
        activateChatSession(
          existing ||
            createChatSession({
              sessionKey,
              conversationId,
              loadStatus: CHAT_LOAD_STATUS.LOADING,
            }),
        ),
      );
      bumpSessionMetadataRevision();
      navigate(`/chat/${conversationId}`, { state: { chatSessionKey: sessionKey } });
      return sessionKey;
    },
    [getSession, navigate],
  );

  const bindStreamingConversation = useCallback(
    (sessionKey, conversationId, optimisticTitle) => {
      sessionKeysByConversationRef.current.set(conversationId, sessionKey);
      updateSession(sessionKey, (session) =>
        bindChatSessionConversation(session, conversationId, optimisticTitle),
      );
      setConversations((previous) => {
        const existing = previous.find((conversation) => conversation.id === conversationId);
        if (existing) {
          return previous.map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, title: conversation.title || optimisticTitle }
              : conversation,
          );
        }
        return [
          {
            id: conversationId,
            title: optimisticTitle,
            created_at: new Date().toISOString(),
          },
          ...previous,
        ];
      });
    },
    [updateSession],
  );

  const getSessionKeyForConversation = useCallback(
    (conversationId) =>
      sessionKeysByConversationRef.current.get(conversationId) ||
      getPersistedSessionKey(conversationId),
    [],
  );

  const handleDeleteConversation = useCallback(
    async (conversationId) => {
      try {
        await deleteConversation(conversationId);
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
        queryClient.removeQueries({ queryKey: queryKeys.conversation(conversationId) });
        const sessionKey = getSessionKeyForConversation(conversationId);
        queryClient.removeQueries({ queryKey: queryKeys.chatSession(sessionKey) });
        sessionKeysByConversationRef.current.delete(conversationId);
        setConversations((previous) =>
          previous.filter((conversation) => conversation.id !== conversationId),
        );
        if (activeSessionKeyRef.current === sessionKey) startNewChat();
      } catch (error) {
        if (error.name === 'AbortError') return;
        logger.error('Failed to delete conversation:', error);
        throw error;
      }
    },
    [getSessionKeyForConversation, startNewChat],
  );

  const handleRenameConversation = useCallback(async (conversationId, title) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return false;
    try {
      const data = await renameConversation(conversationId, trimmedTitle);
      const savedTitle = data.title || trimmedTitle;
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, title: savedTitle }
            : conversation,
        ),
      );
      return true;
    } catch (error) {
      if (error.name === 'AbortError') return false;
      logger.error('Failed to rename conversation:', error);
      throw error;
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (!routeConversationId) return;
    loadConversation(activeSessionKey, routeConversationId);
  }, [activeSessionKey, loadConversation, routeConversationId]);

  const conversationActivity = useMemo(() => {
    void sessionMetadataRevision;
    const activity = {};
    for (const conversation of conversations) {
      const sessionKey = sessionKeysByConversationRef.current.get(conversation.id);
      if (!sessionKey) continue;
      const session = getSession(sessionKey);
      if (!session) continue;
      activity[conversation.id] = {
        streamStatus: session.streamStatus,
        unreadActivity: session.unreadActivity,
      };
    }
    return activity;
  }, [conversations, getSession, sessionMetadataRevision]);

  return {
    activeSession,
    activeSessionKey,
    messages: activeSession?.messages || [],
    updateSession,
    updateSessionMessages,
    getSession,
    isSessionActive,
    startNewChat,
    selectConversation,
    bindStreamingConversation,
    getSessionKeyForConversation,
    conversationActivity,
    isConversationsLoading,
    conversationListError: conversationListLoadState.error,
    conversationListFailureRevision: conversationListLoadState.failureRevision,
    isConversationLoading: activeSession?.loadStatus === CHAT_LOAD_STATUS.LOADING,
    conversations,
    currentConversationId: activeSession?.conversationId || routeConversationId,
    routeConversationId,
    routeConversationLoadState: activeSession?.loadStatus || CHAT_LOAD_STATUS.IDLE,
    fetchConversations,
    retryConversations,
    handleDeleteConversation,
    handleRenameConversation,
    navigate,
  };
}
