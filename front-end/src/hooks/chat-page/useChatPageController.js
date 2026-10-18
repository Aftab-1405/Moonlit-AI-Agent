// useChatPageController — thin composer that wires the chat page together.
//
// Previously a 750-line god hook, this controller now composes six focused
// sub-hooks and merges their outputs into the single return value consumed by
// ChatWorkspacePage. Each sub-hook owns one cohesive slice of state:
//
//   useChatPageSidebar          — sidebar open/collapse, mobile drawer, profile menu
//   useChatPageOverlays         — modal/snackbar state + mindmap + delete confirmation
//   useChatPageGuidedConfirm    — agent interrupt / step-limit / navigate-new-chat banner
//   useChatPageCanvas           — workspace canvas + SQL-editor streaming injection
//   useChatPageStreaming        — message streaming + interrupt handlers + usage metrics
//   useChatPageLlmSelection     — LLM provider/model selection (already a separate hook)
//
// The controller is intentionally not a one-liner: the slices share state
// (e.g. streaming needs the guided-confirm setter; the UI action dispatcher
// needs canvas + overlay + guided-confirm handlers). The controller is the
// single place where those wires cross.

import { useTheme as useMuiTheme } from '@mui/material/styles';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useDatabaseConnection } from '@/contexts/DatabaseContext';
import { useTheme as useAppTheme } from '@/contexts/ThemeContext';
import {
  getActiveConversationId,
  getActiveConversationTitle,
} from '@/features/chat/chatHeaderModel';
import { requestDashboardNavigation } from '@/features/dashboard/dashboardModel';
import { useMindmapSchema } from '@/hooks';
import {
  planOverlayLaunch,
  resolveOverlayFocusTarget,
} from '@/hooks/chat-page/overlayCoordination';
import useAutoScroll from '@/hooks/chat-page/useAutoScroll';
import { useChatPageCanvas } from '@/hooks/chat-page/useChatPageCanvas';
import { useChatPageGuidedConfirm } from '@/hooks/chat-page/useChatPageGuidedConfirm';
import { useChatPageLlmSelection } from '@/hooks/chat-page/useChatPageLlmSelection';
import { useChatPageSessionLifecycle } from '@/hooks/chat-page/useChatPageSessionLifecycle';
import { useChatPageSidebar } from '@/hooks/chat-page/useChatPageSidebar';
import { useChatPageStreaming } from '@/hooks/chat-page/useChatPageStreaming';
import { useConversationDialogs } from '@/hooks/chat-page/useConversationDialogs';
import { useConversations } from '@/hooks/chat-page/useConversations';
import { useOverlayState } from '@/hooks/chat-page/useOverlayState';
import { useQueryExecution } from '@/hooks/chat-page/useQueryExecution';
import { useResponsive } from '@/hooks/chat-page/useResponsive';
import { useUiActionDispatcher } from '@/hooks/chat-page/useUiActionDispatcher';

export function useChatPageController({ mobileSidebarTriggerRef } = {}) {
  // ── Infrastructure ────────────────────────────────────────────────────────
  const theme = useMuiTheme();
  const { isDesktop } = useResponsive();
  const isNarrowLayout = !isDesktop;
  const { settings, updateSetting, updateSettings } = useAppTheme();
  const {
    isConnected: isDbConnected,
    currentDatabase,
    dbType,
    availableDatabases,
    availableSchemas,
    currentSchema,
    connect: connectDb,
    resetConnectionState,
    switchDatabase,
    selectSchema,
    refreshStatus,
  } = useDatabaseConnection();

  // ── Conversations ─────────────────────────────────────────────────────────
  const {
    activeSession,
    activeSessionKey,
    messages,
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
    conversationListError,
    conversationListFailureRevision,
    isConversationLoading,
    conversations,
    currentConversationId,
    routeConversationId,
    routeConversationLoadState,
    fetchConversations,
    retryConversations,
    handleDeleteConversation,
    handleRenameConversation,
    navigate,
  } = useConversations();
  const stopSessionRef = useRef(null);
  const handleDeleteConversationWithSession = useCallback(
    (conversationId) => {
      stopSessionRef.current?.(getSessionKeyForConversation(conversationId));
      return handleDeleteConversation(conversationId);
    },
    [getSessionKeyForConversation, handleDeleteConversation],
  );

  // ── Overlay state (modals + snackbar) ─────────────────────────────────────
  const {
    dbModalOpen,
    setDbModalOpen,
    dbModalInitialType,
    setDbModalInitialType,
    settingsOpen,
    setSettingsOpen,
    settingsInitialSection,
    setSettingsInitialSection,
    notifications,
    showSnackbar,
    handleCloseDbModal: closeDbModal,
    handleCloseSettings: closeSettings,
    removeToast,
  } = useOverlayState();

  const pendingPreferenceOverlayRef = useRef(null);
  const preferenceReturnFocusRef = useRef(null);

  const lastReportedConversationListFailureRef = useRef(0);
  useEffect(() => {
    if (
      conversationListFailureRevision === 0 ||
      conversationListFailureRevision === lastReportedConversationListFailureRef.current
    ) {
      return;
    }

    lastReportedConversationListFailureRef.current = conversationListFailureRevision;
    if (conversations.length > 0) {
      showSnackbar('Couldn’t refresh conversations', 'error');
    }
  }, [conversationListFailureRevision, conversations.length, showSnackbar]);

  // ── Conversation delete confirmation ─────────────────────────────────────
  const {
    deleteConversationDialog,
    handleDeleteConversationRequest,
    handleDeleteConversationDialogClose,
    handleDeleteConversationConfirm,
  } = useConversationDialogs({
    handleDeleteConversation: handleDeleteConversationWithSession,
    showSnackbar,
  });

  const handleSidebarRenameConversation = useCallback(
    async (conversationId, title) => {
      try {
        return await handleRenameConversation(conversationId, title);
      } catch (error) {
        showSnackbar(error?.message || 'Failed to rename conversation', 'error');
        throw error;
      }
    },
    [handleRenameConversation, showSnackbar],
  );

  // ── Sidebar + profile menu ────────────────────────────────────────────────
  // The sidebar hook coordinates with the existing Settings overlay owner.
  // Every Settings entry point closes conflicting overlays before opening it.
  const sidebar = useChatPageSidebar({ isDesktop });

  // Extract stable methods from the sidebar hook so they can be used in
  // useCallback deps WITHOUT putting the entire `sidebar` object (which is a
  // new object literal every render) in the deps array. This keeps the
  // sidebar-driven callbacks stable, which is critical for the Sidebar's
  // arePropsEqual memoization to work.
  const {
    user: sidebarUser,
    setMobileOpen: setSidebarMobileOpen,
    handleMenuOpen: openProfileMenu,
    handleMenuClose: closeProfileMenu,
  } = sidebar;

  const openPreferenceOverlay = useCallback(
    (overlay) => {
      if (overlay === 'settings') {
        setDbModalOpen(false);
        setSettingsOpen(true);
        return;
      }
      setSettingsOpen(false);
      setDbModalOpen(true);
    },
    [setDbModalOpen, setSettingsOpen],
  );

  const requestPreferenceOverlay = useCallback(
    (overlay, event) => {
      const activeElement = typeof document === 'undefined' ? null : document.activeElement;
      preferenceReturnFocusRef.current = event?.currentTarget || activeElement;

      const launch = planOverlayLaunch({ drawerOpen: sidebar.mobileOpen, overlay });
      pendingPreferenceOverlayRef.current = launch.pendingOverlay;
      if (launch.closeDrawer) setSidebarMobileOpen(false);
      if (launch.openOverlay) openPreferenceOverlay(launch.openOverlay);
    },
    [openPreferenceOverlay, setSidebarMobileOpen, sidebar.mobileOpen],
  );

  const handleMobileDrawerExited = useCallback(() => {
    const pendingOverlay = pendingPreferenceOverlayRef.current;
    if (!pendingOverlay) return;
    pendingPreferenceOverlayRef.current = null;
    openPreferenceOverlay(pendingOverlay);
  }, [openPreferenceOverlay]);

  const restorePreferenceFocus = useCallback(() => {
    const returnTarget = resolveOverlayFocusTarget(
      preferenceReturnFocusRef.current,
      mobileSidebarTriggerRef?.current,
    );
    preferenceReturnFocusRef.current = null;
    if (!returnTarget) return;
    requestAnimationFrame(() => returnTarget.focus());
  }, [mobileSidebarTriggerRef]);

  const handleCloseDbModal = useCallback(
    (event, reason) => {
      closeDbModal(event, reason);
      restorePreferenceFocus();
    },
    [closeDbModal, restorePreferenceFocus],
  );

  const handleCloseSettings = useCallback(
    (event, reason) => {
      closeSettings(event, reason);
      restorePreferenceFocus();
    },
    [closeSettings, restorePreferenceFocus],
  );

  const handleProfileOpenSettings = useCallback(
    (event) => {
      closeProfileMenu();
      requestPreferenceOverlay('settings', event);
    },
    [closeProfileMenu, requestPreferenceOverlay],
  );

  // ── Schema mindmap (global overlay) ───────────────────────────────────────
  // The mindmap dialog is mounted at the shell level (GlobalOverlays). The
  // controller owns the open/close + schema-fetch state because it already
  // has access to the database connection context.
  const { mindmapOpen, schemaData, schemaLoading, handleOpenMindmap, handleCloseMindmap } =
    useMindmapSchema({ isConnected: isDbConnected, currentDatabase });

  // ── LLM selection ─────────────────────────────────────────────────────────
  const llmSelection = useChatPageLlmSelection({ settings, updateSetting, updateSettings });
  const {
    providerOptions,
    selectedProvider,
    selectedModel,
    llmOptionsLoading,
    llmOptionsError,
    retryLlmOptions,
    supportsReasoning,
    reasoningEffort,
    handleReasoningEffortChange,
    handleLlmSelection,
  } = llmSelection;

  // ── Guided confirm dialog (agent interrupts / step limits) ────────────────
  const { guidedConfirmDialog, setGuidedConfirmDialog, handleGuidedCancel, handleGuidedConfirm } =
    useChatPageGuidedConfirm();

  // ── Sidebar-driven handlers ───────────────────────────────────────────────
  // These callbacks use the extracted stable methods (setSidebarMobileOpen,
  // openProfileMenu) instead of the `sidebar` object, so they remain stable
  // across renders. This is critical: if these callbacks change identity on
  // every render, the Sidebar's arePropsEqual memoization fails and the
  // Sidebar re-renders unnecessarily.
  const handleSidebarNewChat = useCallback(() => {
    setSidebarMobileOpen(false);
    setSettingsOpen(false);
    setDbModalOpen(false);
    startNewChat();
  }, [setDbModalOpen, setSettingsOpen, setSidebarMobileOpen, startNewChat]);

  const handleSidebarSelectConversation = useCallback(
    (id) => {
      setSidebarMobileOpen(false);
      setSettingsOpen(false);
      setDbModalOpen(false);
      selectConversation(id);
    },
    [selectConversation, setDbModalOpen, setSettingsOpen, setSidebarMobileOpen],
  );

  const handleSidebarOpenDbModal = useCallback(
    (event) => requestPreferenceOverlay('database', event),
    [requestPreferenceOverlay],
  );

  const handleSidebarMenuOpen = useCallback(
    (e) => {
      openProfileMenu(e);
    },
    [openProfileMenu],
  );

  const handleSidebarOpenSettings = useCallback(
    (event) => requestPreferenceOverlay('settings', event),
    [requestPreferenceOverlay],
  );

  // ── Canvas (artifact panel) + SQL editor streaming ────────────────────────
  // The canvas hook needs `isCurrentlyStreaming` from the streaming slice,
  // and the streaming slice needs `handleOpenSqlEditor` from the canvas slice
  // (transitively, via the UI action dispatcher). We break the cycle with two
  // refs that the controller keeps up-to-date on every render:
  //   - dispatchUiActionRef       — updated after the dispatcher is built
  //   - handleOpenSqlEditorRef    — updated after the canvas hook returns
  // The streaming hook reads from these refs inside its closures so they
  // remain stable without needing to be in any deps array.
  const dispatchUiActionRef = useRef(null);
  const handleOpenSqlEditorRef = useRef(null);

  // Streaming must be created BEFORE canvas because canvas needs
  // `isCurrentlyStreaming`. The streaming hook receives the refs (which are
  // still empty at this point) — they'll be populated below before any
  // event handler actually fires.
  const streaming = useChatPageStreaming({
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
  });
  useEffect(() => {
    stopSessionRef.current = streaming.stopSession;
  }, [streaming.stopSession]);

  const { hasActiveStreams, stopAllStreams } = streaming;
  const handleOpenDashboard = useCallback(() => {
    closeProfileMenu();
    requestDashboardNavigation({
      isStreaming: hasActiveStreams(),
      navigate,
      stopStreaming: stopAllStreams,
      openConfirmation: setGuidedConfirmDialog,
    });
  }, [closeProfileMenu, navigate, setGuidedConfirmDialog, hasActiveStreams, stopAllStreams]);

  const canvas = useChatPageCanvas({
    sessionKey: activeSessionKey,
    conversationId: currentConversationId,
    currentDatabase,
    currentSchema,
    sidebarWidth: sidebar.currentSidebarWidth,
    isDbConnected,
    isCurrentlyStreaming: streaming.isCurrentlyStreaming,
    messages,
    setSettingsOpen,
    setDbModalOpen,
    showSnackbar,
  });

  // ── UI action dispatcher ──────────────────────────────────────────────────
  // Wires agent-driven UI actions (open SQL editor, open DB modal, navigate
  // to a new chat, report usage metrics) to the controller's handlers.
  const dispatchUiAction = useUiActionDispatcher({
    open_sql_editor: (payload) => canvas.handleOpenSqlEditor(payload?.query || ''),
    write_sql_editor_query: (payload) => {
      if (!payload?.query) return;
      canvas.handleOpenSqlEditor(payload.query);
    },
    open_database_modal: (payload) => {
      setSettingsOpen(false);
      setDbModalOpen(true);
      if (payload?.db_type) setDbModalInitialType(payload.db_type);
    },
    open_settings_modal: (payload) => {
      setDbModalOpen(false);
      setSettingsOpen(true);
      if (payload?.section) setSettingsInitialSection(payload.section);
    },
    navigate_new_chat: (payload) => streaming.onNavigateNewChatGuided(payload),
    complete_navigate_new_chat: (payload) => streaming.onCompleteNavigateNewChat(payload),
    usage_metrics: (payload) => streaming.onUsageMetricsEvent(payload),
    onInvalidAction: ({ reason }) => {
      if (reason) showSnackbar(reason, 'warning');
    },
  });

  // Sync the cycle-breaking refs on every render so the streaming hook's
  // closures always read the latest dispatcher + SQL editor handler.
  useEffect(() => {
    dispatchUiActionRef.current = dispatchUiAction;
    handleOpenSqlEditorRef.current = canvas.handleOpenSqlEditor;
  }, [canvas.handleOpenSqlEditor, dispatchUiAction]);

  // ── Query execution ───────────────────────────────────────────────────────
  const { handleOpenCanvasArtifact } = canvas;
  const handleQueryResults = useCallback(
    (data, sourceQuery) => {
      handleOpenCanvasArtifact({
        type: 'visualization',
        title: 'Query results',
        props: { data, sourceQuery, sourceType: 'chat-code-block' },
      });
    },
    [handleOpenCanvasArtifact],
  );

  const { confirmDialog, handleRunQuery, handleConfirmDialogClose } = useQueryExecution({
    isDbConnected,
    settings,
    setDbModalOpen,
    showSnackbar,
    onQueryResults: handleQueryResults,
  });

  // ── Session lifecycle ─────────────────────────────────────────────────────
  // `refreshStatus` is passed so the lifecycle hook can re-sync the
  // connection state when the tab becomes visible again (after being
  // backgrounded). This prevents the "auto-disconnect while tab is open"
  // bug where browser timer throttling caused the backend to think the
  // tab was closed.
  useChatPageSessionLifecycle({
    isDbConnected,
    connectionPersistenceMinutes: settings.connectionPersistence ?? 0,
    onVisibilityRestored: refreshStatus,
  });

  // ── DB connection handlers ────────────────────────────────────────────────
  const handleDbConnect = useCallback(
    (data) => {
      if (data) {
        connectDb(data);
        showSnackbar('Connected to database!', 'success');
      } else {
        resetConnectionState();
        showSnackbar('Disconnected from database', 'info');
      }
    },
    [connectDb, resetConnectionState, showSnackbar],
  );

  const handleDatabaseSwitch = useCallback(
    async (dbName) => {
      const result = await switchDatabase(dbName);
      if (result.success) {
        showSnackbar(`Switched to ${dbName}`, 'success');
      } else {
        showSnackbar(result.error || 'Failed to switch', 'error');
      }
    },
    [switchDatabase, showSnackbar],
  );

  const handleDbModalSelectDatabase = useCallback(
    async (dbName) => {
      const result = await switchDatabase(dbName);
      if (result.success) {
        showSnackbar(`Switched to ${dbName}`, 'success');
        return { success: true };
      }
      const errorMsg = result.error || 'Failed to switch database';
      showSnackbar(errorMsg, 'error');
      return { success: false, error: errorMsg };
    },
    [switchDatabase, showSnackbar],
  );

  // ── Derived view state ────────────────────────────────────────────────────
  const isRouteConversationHydrating = routeConversationLoadState === 'loading';
  const isConversationViewLoading = isConversationLoading || isRouteConversationHydrating;
  const showWelcomeState =
    !routeConversationId && messages.length === 0 && !isConversationViewLoading;
  const showConversationPanel =
    Boolean(routeConversationId) || messages.length > 0 || isConversationViewLoading;
  const activeConversationId = getActiveConversationId(routeConversationId, currentConversationId);
  const activeConversationTitle = useMemo(
    () => getActiveConversationTitle(conversations, activeConversationId),
    [activeConversationId, conversations],
  );
  const streamActivityKey = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return 'empty';
    const textLen = (lastMessage.text || '').length;
    const stepsLen = (lastMessage.steps || []).length;
    return `${lastMessage.id}|${lastMessage.status}|${textLen}|${stepsLen}|${messages.length}`;
  }, [messages]);

  const { setScrollContainerRef, isPinnedToBottom, scrollToBottom } = useAutoScroll({
    messageCount: messages.length,
    isStreaming: streaming.isCurrentlyStreaming,
    isConversationLoading,
    activityKey: streamActivityKey,
  });

  // ── Aggregated props for chat input + sidebar ─────────────────────────────
  // Destructure `streaming` and `canvas` into their individual values for the
  // useMemo deps. Both `streaming` and `canvas` are new object literals on
  // every render (they're hook return values); putting the whole object in
  // deps would recompute this useMemo every render, causing ChatColumn to
  // re-render unnecessarily. By depending on the individual primitive/stable
  // values instead, the memo only recomputes when something actually changes.
  const {
    handleSendMessage,
    handleStopStreaming,
    isCurrentlyStreaming,
    usageMetrics,
    effectiveTaskMode,
  } = streaming;
  const { handleToggleSqlEditor, isSqlEditorOpen } = canvas;
  const handleOpenDatabaseContext = useCallback(
    (event) => {
      setSettingsInitialSection('database');
      requestPreferenceOverlay('settings', event);
    },
    [requestPreferenceOverlay, setSettingsInitialSection],
  );
  const chatInputSharedProps = useMemo(
    () => ({
      sessionKey: activeSessionKey,
      onSend: handleSendMessage,
      onStop: handleStopStreaming,
      isStreaming: isCurrentlyStreaming,
      isConnected: isDbConnected,
      dbType,
      currentDatabase,
      availableDatabases,
      availableSchemas,
      currentSchema,
      onSchemaChange: selectSchema,
      onDatabaseSwitch: handleDatabaseSwitch,
      onOpenDatabase: handleSidebarOpenDbModal,
      onOpenContext: handleOpenDatabaseContext,
      selectedProvider,
      selectedModel,
      providerOptions,
      llmOptionsLoading,
      onSelectLlm: handleLlmSelection,
      llmOptionsError,
      onRetryLlmOptions: retryLlmOptions,
      supportsReasoning,
      reasoningEffort,
      onReasoningEffortChange: handleReasoningEffortChange,
      usageMetrics,
      taskMode: settings.taskMode ?? 'auto',
      onTaskModeChange: (value) => updateSetting('taskMode', value),
      effectiveTaskMode,
      onToggleSqlEditor: handleToggleSqlEditor,
      sqlEditorOpen: isSqlEditorOpen,
    }),
    [
      activeSessionKey,
      handleSendMessage,
      handleStopStreaming,
      isCurrentlyStreaming,
      isDbConnected,
      dbType,
      currentDatabase,
      availableDatabases,
      availableSchemas,
      currentSchema,
      selectSchema,
      handleDatabaseSwitch,
      handleSidebarOpenDbModal,
      handleOpenDatabaseContext,
      selectedProvider,
      selectedModel,
      providerOptions,
      llmOptionsLoading,
      handleLlmSelection,
      llmOptionsError,
      retryLlmOptions,
      supportsReasoning,
      reasoningEffort,
      handleReasoningEffortChange,
      usageMetrics,
      settings.taskMode,
      updateSetting,
      effectiveTaskMode,
      handleToggleSqlEditor,
      isSqlEditorOpen,
    ],
  );

  const commonSidebarProps = useMemo(
    () => ({
      conversations,
      conversationActivity,
      isConversationsLoading,
      conversationListError,
      onRetryConversations: retryConversations,
      currentConversationId,
      onDeleteConversation: handleDeleteConversationRequest,
      onRenameConversation: handleSidebarRenameConversation,
      isConnected: isDbConnected,
      currentDatabase,
      dbType,
      availableDatabases,
      onDatabaseSwitch: handleDatabaseSwitch,
      user: sidebarUser,
    }),
    [
      conversations,
      conversationActivity,
      isConversationsLoading,
      conversationListError,
      retryConversations,
      currentConversationId,
      handleDeleteConversationRequest,
      handleSidebarRenameConversation,
      isDbConnected,
      currentDatabase,
      dbType,
      availableDatabases,
      handleDatabaseSwitch,
      sidebarUser,
    ],
  );

  // ── Return ────────────────────────────────────────────────────────────────
  return {
    theme,
    isNarrowLayout,
    anchorEl: sidebar.anchorEl,
    user: sidebarUser,
    handleMenuClose: closeProfileMenu,
    handleOpenDashboard,
    handleOpenSettings: handleProfileOpenSettings,
    handleLogout: sidebar.handleLogout,
    commonSidebarProps,
    handleSidebarNewChat,
    handleSidebarSelectConversation,
    handleSidebarOpenDbModal,
    sidebarOpen: sidebar.sidebarOpen,
    handleSidebarToggle: sidebar.handleSidebarToggle,
    handleSidebarMenuOpen,
    handleSidebarOpenSettings,
    mobileOpen: sidebar.mobileOpen,
    handleMobileDrawerOpen: sidebar.handleMobileDrawerOpen,
    handleMobileDrawerClose: sidebar.handleMobileDrawerClose,
    handleMobileDrawerExited,
    showWelcomeState,
    setScrollContainerRef,
    isPinnedToBottom,
    scrollToBottom,
    showConversationPanel,
    currentConversationId: activeConversationId,
    activeConversationTitle,
    handleConversationHeaderRename: handleSidebarRenameConversation,
    messages,
    isConversationLoading: isConversationViewLoading,
    conversationLoadState: routeConversationLoadState,
    handleRunQuery,
    handleOpenCanvasArtifact: canvas.handleOpenCanvasArtifact,
    chatInputSharedProps,
    workspaceCanvasOpen: canvas.workspaceCanvasOpen,
    workspaceCanvasArtifact: canvas.workspaceCanvasArtifact,
    conversationOutputs: canvas.conversationOutputs,
    onNotify: showSnackbar,
    workspaceCanvasWidth: canvas.workspaceCanvasWidth,
    workspaceCanvasMinWidth: canvas.workspaceCanvasMinWidth,
    workspaceCanvasMaxWidth: canvas.workspaceCanvasMaxWidth,
    handleCanvasResize: canvas.handleCanvasResize,
    handleCloseWorkspaceCanvas: canvas.handleCloseWorkspaceCanvas,
    isDbConnected,
    currentDatabase,
    dbModalOpen,
    handleCloseDbModal,
    handleDbConnect,
    handleDbModalSelectDatabase,
    notifications,
    removeToast,
    settingsOpen,
    handleCloseSettings,
    confirmDialog,
    handleConfirmDialogClose,
    deleteConversationDialog,
    handleDeleteConversationDialogClose,
    handleDeleteConversationConfirm,
    guidedConfirmDialog,
    handleGuidedCancel,
    handleGuidedConfirm,
    dbModalInitialType,
    settingsInitialSection,
    // Schema mindmap (global overlay)
    mindmapOpen,
    handleCloseMindmap,
    handleOpenMindmap,
    schemaLoading,
    schemaData,
  };
}
