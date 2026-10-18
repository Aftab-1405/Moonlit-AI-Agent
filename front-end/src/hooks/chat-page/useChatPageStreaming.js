import { useCallback, useEffect, useRef } from 'react';
import {
  isChatSessionStreaming,
  queueChatSessionInteraction,
} from '@/hooks/chat-page/chatSessionModel';
import { useMessageStreaming } from '@/hooks/chat-page/useMessageStreaming';

export function useChatPageStreaming({
  activeSession,
  activeSessionKey,
  getSession,
  updateSession,
  updateSessionMessages,
  isSessionActive,
  navigate,
  fetchConversations,
  bindStreamingConversation,
  settings,
  selectedProvider,
  selectedModel,
  dispatchUiActionRef,
  handleOpenSqlEditorRef,
  setGuidedConfirmDialog,
  showSnackbar,
  handleSidebarNewChat,
}) {
  const resumeAgentRef = useRef(null);
  const continueTaskRef = useRef(null);
  const presentedInteractionRef = useRef(null);

  const clearPendingInteraction = useCallback(
    (interaction) => {
      const key = interaction.context.sessionKey;
      if (getSession(key)?.pendingInteraction !== interaction) return false;
      if (presentedInteractionRef.current === interaction) presentedInteractionRef.current = null;
      updateSession(key, (session) => ({
        ...session,
        pendingInteraction: null,
        unreadActivity: null,
      }));
      return true;
    },
    [getSession, updateSession],
  );

  const presentStepLimit = useCallback(
    (interaction) => {
      const { event, assistantMessageId, context } = interaction;
      const stepsUsed = event?.steps_used ?? '?';
      const taskMode = event?.task_mode || 'normal';
      presentedInteractionRef.current = interaction;
      setGuidedConfirmDialog({
        open: true,
        title: '⏸ Task Paused',
        message: `Step limit reached · ${stepsUsed} steps used`,
        stepsUsed,
        confirmText: 'Continue Task',
        cancelText: 'Stop',
        onCancel: () => clearPendingInteraction(interaction),
        onConfirm: () => {
          if (!clearPendingInteraction(interaction)) return false;
          return continueTaskRef.current?.(event, assistantMessageId, {
            sessionKey: context.sessionKey,
            provider: selectedProvider || null,
            model: selectedModel || null,
            taskMode,
          });
        },
      });
    },
    [clearPendingInteraction, selectedModel, selectedProvider, setGuidedConfirmDialog],
  );

  const handleAgentStepLimitReached = useCallback(
    (event, assistantMessageId = null, context) => {
      updateSession(context.sessionKey, (session) =>
        queueChatSessionInteraction(
          session,
          { type: 'step_limit', event, assistantMessageId, context },
          isSessionActive(context.sessionKey),
        ),
      );
    },
    [isSessionActive, updateSession],
  );

  const handleTaskModeResolved = useCallback(
    (event, _assistantMessageId, context) => {
      updateSession(context.sessionKey, (session) => ({
        ...session,
        effectiveTaskMode: {
          task_mode: event?.task_mode || 'normal',
          label: event?.label || event?.task_mode || 'Standard',
          recursion_limit: event?.recursion_limit ?? null,
          source: event?.source || 'user',
        },
      }));
    },
    [updateSession],
  );

  const presentAgentInterrupt = useCallback(
    (interaction) => {
      const { event, assistantMessageId, context } = interaction;
      const payload = event?.payload || {};
      const action = payload.action || payload.sourceTool;
      const resumeWith = (approved) => {
        if (!clearPendingInteraction(interaction)) return false;
        return resumeAgentRef.current?.(
          {
            approved,
            action,
            interrupt_id: event?.id || null,
          },
          {
            sessionKey: context.sessionKey,
            provider: selectedProvider || null,
            model: selectedModel || null,
            assistantMessageId,
          },
        );
      };

      if (action === 'execute_query' && payload.query) {
        handleOpenSqlEditorRef.current?.(payload.query);
      }

      presentedInteractionRef.current = interaction;
      setGuidedConfirmDialog({
        open: true,
        title: payload.title || 'Confirm action',
        message: payload.message || 'Please confirm before I continue.',
        confirmText: payload.confirmText || 'Confirm',
        cancelText: payload.cancelText || 'Not now',
        onCancel: () => resumeWith(false),
        onConfirm: () => resumeWith(true),
      });
    },
    [
      clearPendingInteraction,
      handleOpenSqlEditorRef,
      selectedModel,
      selectedProvider,
      setGuidedConfirmDialog,
    ],
  );

  const handleAgentInterrupt = useCallback(
    (event, assistantMessageId = null, context) => {
      updateSession(context.sessionKey, (session) =>
        queueChatSessionInteraction(
          session,
          { type: 'agent_interrupt', event, assistantMessageId, context },
          isSessionActive(context.sessionKey),
        ),
      );
    },
    [isSessionActive, updateSession],
  );

  const dispatchUiActionStable = useCallback(
    (event, context) => {
      if (event?.action === 'usage_metrics') {
        updateSession(context.sessionKey, (session) => ({
          ...session,
          usageMetrics: event.payload || null,
        }));
        return;
      }

      if (!isSessionActive(context.sessionKey)) {
        updateSession(context.sessionKey, (session) =>
          queueChatSessionInteraction(session, { type: 'ui_action', event, context }, false),
        );
        return;
      }
      dispatchUiActionRef.current?.(event);
    },
    [dispatchUiActionRef, isSessionActive, updateSession],
  );

  const {
    handleSendMessage,
    handleResumeAgent,
    handleStopStreaming,
    handleContinueTask,
    stopSession,
    stopAllStreams,
    hasActiveStreams,
  } = useMessageStreaming({
    activeSessionKey,
    getSession,
    updateSession,
    updateSessionMessages,
    isSessionActive,
    navigate,
    fetchConversations,
    bindStreamingConversation,
    settings,
    dispatchUiAction: dispatchUiActionStable,
    onAgentInterrupt: handleAgentInterrupt,
    onAgentStepLimitReached: handleAgentStepLimitReached,
    onTaskModeResolved: handleTaskModeResolved,
  });

  useEffect(() => {
    resumeAgentRef.current = handleResumeAgent;
    continueTaskRef.current = handleContinueTask;
  }, [handleContinueTask, handleResumeAgent]);

  useEffect(() => {
    const presented = presentedInteractionRef.current;
    if (!presented || presented.context.sessionKey === activeSessionKey) return;

    // The session already owns the approval; never restore one that was cleared.
    if (getSession(presented.context.sessionKey)?.pendingInteraction === presented) {
      updateSession(presented.context.sessionKey, (session) => ({
        ...session,
        unreadActivity: 'attention',
      }));
    }
    presentedInteractionRef.current = null;
    setGuidedConfirmDialog((current) => ({
      ...current,
      open: false,
      onCancel: null,
      onConfirm: null,
    }));
  }, [activeSessionKey, getSession, setGuidedConfirmDialog, updateSession]);

  useEffect(() => {
    const pending = activeSession?.pendingInteraction;
    if (!pending || pending === presentedInteractionRef.current) return;

    if (pending.type === 'agent_interrupt') {
      presentAgentInterrupt(pending);
    } else if (pending.type === 'step_limit') {
      presentStepLimit(pending);
    } else if (pending.type === 'ui_action') {
      updateSession(activeSessionKey, (session) => ({
        ...session,
        pendingInteraction: null,
        unreadActivity: null,
      }));
      dispatchUiActionRef.current?.(pending.event);
    }
  }, [
    activeSession?.pendingInteraction,
    activeSessionKey,
    dispatchUiActionRef,
    presentAgentInterrupt,
    presentStepLimit,
    updateSession,
  ]);

  const handleSendMessageWithModel = useCallback(
    (message) =>
      handleSendMessage(message, {
        provider: selectedProvider || null,
        model: selectedModel || null,
      }),
    [handleSendMessage, selectedModel, selectedProvider],
  );

  const setUsageMetrics = useCallback(
    (usageMetrics) => {
      updateSession(activeSessionKey, (session) => ({ ...session, usageMetrics }));
    },
    [activeSessionKey, updateSession],
  );

  return {
    isCurrentlyStreaming: isChatSessionStreaming(activeSession),
    handleSendMessage: handleSendMessageWithModel,
    handleStopStreaming,
    stopSession,
    stopAllStreams,
    hasActiveStreams,
    effectiveTaskMode: activeSession?.effectiveTaskMode || null,
    usageMetrics: activeSession?.usageMetrics || null,
    setUsageMetrics,
    onNavigateNewChatGuided: useCallback(
      (payload) => {
        setGuidedConfirmDialog({
          open: true,
          title: payload?.title || 'Start a new chat?',
          message: payload?.message || 'This will leave the current conversation.',
          confirmText: payload?.confirmText || 'New Chat',
          cancelText: payload?.cancelText || 'Not now',
          onCancel: () => showSnackbar('Action cancelled.', 'info'),
          onConfirm: () => showSnackbar('Please wait for the agent to resume.', 'info'),
        });
      },
      [setGuidedConfirmDialog, showSnackbar],
    ),
    onCompleteNavigateNewChat: useCallback(
      (payload) => {
        window.setTimeout(() => handleSidebarNewChat(), Number(payload?.delayMs) || 900);
      },
      [handleSidebarNewChat],
    ),
    onUsageMetricsEvent: useCallback(
      (payload) => {
        if (payload) setUsageMetrics(payload);
      },
      [setUsageMetrics],
    ),
  };
}
