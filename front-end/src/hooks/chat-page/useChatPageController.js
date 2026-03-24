import { useState, useCallback, useMemo } from 'react';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';
import { useTheme as useAppTheme } from '../../contexts/ThemeContext';
import { useDatabaseConnection } from '../../contexts/DatabaseContext';
import { useAuth } from '../../contexts/AuthContext';
import useAutoScroll from './useAutoScroll';
import { useIdleDetection } from './useIdleDetection';
import { useConversations } from './useConversations';
import { useMessageStreaming } from './useMessageStreaming';
import { useQueryExecution } from './useQueryExecution';
import { useSqlEditorPanel } from './useSqlEditorPanel';
import { useResponsive } from './useResponsive';
import { useChatPageLlmSelection } from './useChatPageLlmSelection';
import { useChatPageSessionLifecycle } from './useChatPageSessionLifecycle';
import { isMessageActive } from '../../utils/chatMessages';
import { UI_LAYOUT } from '../../styles/shared';

const DRAWER_WIDTH = UI_LAYOUT.sidebarExpandedWidth;
const COLLAPSED_WIDTH = UI_LAYOUT.sidebarCollapsedWidth;

export function useChatPageController() {
  const theme = useMuiTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const { isDesktop } = useResponsive();
  const isNarrowLayout = !isDesktop;
  const { settings, updateSetting } = useAppTheme();
  const { user, logout } = useAuth();
  const {
    isConnected: isDbConnected,
    currentDatabase,
    dbType,
    availableDatabases,
    connect: connectDb,
    resetConnectionState,
    switchDatabase,
  } = useDatabaseConnection();
  const {
    messages,
    setMessages,
    isConversationsLoading,
    isConversationLoading,
    conversations,
    setConversations,
    currentConversationId,
    setCurrentConversationId,
    fetchConversations,
    registerStreamingConversation,
    handleDeleteConversation,
    navigate,
  } = useConversations();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const currentSidebarWidth = useMemo(() =>
    sidebarOpen ? DRAWER_WIDTH : COLLAPSED_WIDTH,
  [sidebarOpen]);
  const {
    sqlEditorOpen,
    sqlEditorQuery,
    sqlEditorResults,
    sqlEditorWidth,
    handleOpenSqlEditor,
    handleCloseSqlEditor,
    handlePanelResize,
  } = useSqlEditorPanel({ sidebarWidth: currentSidebarWidth });

  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  const llmSelection = useChatPageLlmSelection({ settings, updateSetting });
  const {
    providerOptions,
    selectedProvider,
    selectedModel,
    llmOptionsLoading,
    handleLlmSelection,
  } = llmSelection;

  const showSnackbar = useCallback((message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  }, []);
  const {
    queryResults,
    confirmDialog,
    handleRunQuery,
    handleCloseQueryResults,
    handleConfirmDialogClose,
  } = useQueryExecution({
    isDbConnected,
    settings,
    setDbModalOpen,
    showSnackbar,
  });
  const {
    handleSendMessage,
    handleStopStreaming,
  } = useMessageStreaming({
    currentConversationId,
    setCurrentConversationId,
    setMessages,
    setConversations,
    navigate,
    fetchConversations,
    registerStreamingConversation,
    settings,
  });

  useChatPageSessionLifecycle({
    isDbConnected,
    connectionPersistenceMinutes: settings.connectionPersistence ?? 0,
  });

  const isIdle = useIdleDetection(8000);
  const idleAnimationEnabled = settings.idleAnimation ?? true;
  const idleAnimationIntensity = settings.idleAnimationIntensity ?? 'medium';
  const starfieldActive = isDarkMode && idleAnimationEnabled && isIdle;

  const isCurrentlyStreaming = useMemo(() => {
    if (messages.length === 0) return false;
    const lastMessage = messages[messages.length - 1];
    const isAssistant = lastMessage?.role === 'assistant' || lastMessage?.sender === 'ai';
    return isAssistant && isMessageActive(lastMessage);
  }, [messages]);
  const showWelcomeState = messages.length === 0 && !isConversationLoading;
  const showConversationPanel = messages.length > 0 || isConversationLoading;

  const streamActivityKey = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return 'empty';

    const messageId = lastMessage.id || 'no-id';
    const status = lastMessage.status || (
      lastMessage.isWaiting ? 'waiting' :
        lastMessage.isStreaming ? 'streaming' :
          lastMessage.isError ? 'error' :
            lastMessage.wasStopped ? 'stopped' : 'done'
    );
    const rawLen = (lastMessage.rawContent || '').length;
    const textLen = (lastMessage.text || lastMessage.content || '').length;
    const stepsLen = Array.isArray(lastMessage.steps)
      ? lastMessage.steps.length
      : Array.isArray(lastMessage.tools)
        ? lastMessage.tools.length
        : 0;

    return `${messageId}|${status}|${rawLen}|${textLen}|${stepsLen}|${messages.length}`;
  }, [messages]);
  const snackbarContentProps = useMemo(() => {
    const severityColor = snackbar.severity === 'success' ? theme.palette.success.main :
      snackbar.severity === 'error' ? theme.palette.error.main :
        snackbar.severity === 'warning' ? theme.palette.warning.main :
          theme.palette.info.main;

    return {
      sx: {
        backgroundColor: alpha(theme.palette.background.elevated, isDarkMode ? 0.95 : 0.98),
        color: severityColor,
        fontWeight: 500,
        borderRadius: '6px',
        border: `1.5px solid ${severityColor}`,
        boxShadow: isDarkMode
          ? `0 4px 12px ${alpha(theme.palette.text.primary, 0.25)}`
          : `0 4px 12px ${alpha(severityColor, 0.15)}`,
        padding: theme.spacing(1.25, 2),
        minWidth: 'auto !important',
        '& .MuiSnackbarContent-message': { padding: 0 },
      },
    };
  }, [isDarkMode, theme, snackbar.severity]);
  const snackbarAnchorOrigin = useMemo(() => ({
    vertical: 'top',
    horizontal: isNarrowLayout ? 'center' : 'right',
  }), [isNarrowLayout]);

  const handleSendMessageWithModel = useCallback((message) => {
    return handleSendMessage(message, {
      provider: selectedProvider || null,
      model: selectedModel || null,
    });
  }, [handleSendMessage, selectedProvider, selectedModel]);

  const handleCloseDbModal = useCallback(() => setDbModalOpen(false), []);
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), []);
  const handleCloseSnackbar = useCallback(() => setSnackbar((s) => ({ ...s, open: false })), []);
  const { setScrollContainerRef } = useAutoScroll({
    messageCount: messages.length,
    isStreaming: isCurrentlyStreaming,
    activityKey: streamActivityKey,
  });

  const handleMobileDrawerOpen = useCallback(() => {
    setMobileOpen(true);
  }, []);
  const handleMobileDrawerClose = useCallback(() => {
    setMobileOpen(false);
  }, []);
  const effectiveMobileOpen = isDesktop ? false : mobileOpen;

  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);
  const handleMenuOpen = useCallback((e) => {
    setAnchorEl(e.currentTarget);
  }, []);
  const handleMenuClose = useCallback(() => {
    setAnchorEl(null);
  }, []);
  const handleLogout = useCallback(async () => {
    setAnchorEl(null);
    await logout();
  }, [logout]);
  const handleOpenSettings = useCallback(() => {
    handleMenuClose();
    setSettingsOpen(true);
  }, [handleMenuClose]);
  const handleDbConnect = useCallback((data) => {
    if (data) {
      connectDb(data);
      showSnackbar('Connected to database!', 'success');
    } else {
      resetConnectionState();
      showSnackbar('Disconnected from database', 'info');
    }
  }, [connectDb, resetConnectionState, showSnackbar]);
  const handleDatabaseSwitch = useCallback(async (dbName) => {
    const result = await switchDatabase(dbName);
    if (result.success) {
      showSnackbar(`Switched to ${dbName}`, 'success');
    } else {
      showSnackbar(result.error || 'Failed to switch', 'error');
    }
  }, [switchDatabase, showSnackbar]);
  const chatInputSharedProps = useMemo(() => ({
    onSend: handleSendMessageWithModel,
    onStop: handleStopStreaming,
    isStreaming: isCurrentlyStreaming,
    isConnected: isDbConnected,
    dbType,
    currentDatabase,
    availableDatabases,
    onDatabaseSwitch: handleDatabaseSwitch,
    onOpenSqlEditor: handleOpenSqlEditor,
    selectedProvider,
    selectedModel,
    providerOptions,
    llmOptionsLoading,
    onSelectLlm: handleLlmSelection,
  }), [
    handleSendMessageWithModel,
    handleStopStreaming,
    isCurrentlyStreaming,
    isDbConnected,
    dbType,
    currentDatabase,
    availableDatabases,
    handleDatabaseSwitch,
    handleOpenSqlEditor,
    selectedProvider,
    selectedModel,
    providerOptions,
    llmOptionsLoading,
    handleLlmSelection,
  ]);
  const commonSidebarProps = useMemo(() => ({
    conversations,
    isConversationsLoading,
    currentConversationId,
    onDeleteConversation: handleDeleteConversation,
    isConnected: isDbConnected,
    currentDatabase,
    dbType,
    availableDatabases,
    onDatabaseSwitch: handleDatabaseSwitch,
    user,
  }), [
    conversations,
    isConversationsLoading,
    currentConversationId,
    handleDeleteConversation,
    isDbConnected,
    currentDatabase,
    dbType,
    availableDatabases,
    handleDatabaseSwitch,
    user,
  ]);
  const handleSidebarNewChat = useCallback(() => {
    setMobileOpen(false);
    navigate('/chat');
  }, [navigate]);
  const handleSidebarSelectConversation = useCallback((id) => {
    setMobileOpen(false);
    navigate(`/chat/${id}`);
  }, [navigate]);
  const handleSidebarOpenDbModal = useCallback(() => {
    setMobileOpen(false);
    setDbModalOpen(true);
  }, []);
  const handleSidebarMenuOpen = useCallback((e) => {
    setMobileOpen(false);
    handleMenuOpen(e);
  }, [handleMenuOpen]);

  return {
    theme,
    isDarkMode,
    isNarrowLayout,
    starfieldActive,
    idleAnimationIntensity,
    anchorEl,
    user,
    handleMenuClose,
    handleOpenSettings,
    handleLogout,
    commonSidebarProps,
    handleSidebarNewChat,
    handleSidebarSelectConversation,
    handleSidebarOpenDbModal,
    sidebarOpen,
    handleSidebarToggle,
    handleSidebarMenuOpen,
    mobileOpen: effectiveMobileOpen,
    handleMobileDrawerOpen,
    handleMobileDrawerClose,
    showWelcomeState,
    setScrollContainerRef,
    showConversationPanel,
    messages,
    isConversationLoading,
    handleRunQuery,
    handleOpenSqlEditor,
    chatInputSharedProps,
    sqlEditorOpen,
    handlePanelResize,
    handleCloseSqlEditor,
    sqlEditorQuery,
    sqlEditorResults,
    sqlEditorWidth,
    isDbConnected,
    currentDatabase,
    dbModalOpen,
    handleCloseDbModal,
    handleDbConnect,
    snackbar,
    handleCloseSnackbar,
    snackbarAnchorOrigin,
    snackbarContentProps,
    queryResults,
    handleCloseQueryResults,
    settingsOpen,
    handleCloseSettings,
    confirmDialog,
    handleConfirmDialogClose,
  };
}

export default useChatPageController;
