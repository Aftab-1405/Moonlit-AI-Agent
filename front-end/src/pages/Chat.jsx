/**
 * Chat Page - Main Application Interface
 * 
 * This is the primary interface where users interact with the AI assistant
 * and manage database connections. It orchestrates several components:
 * - Sidebar: Navigation and conversation history
 * - MessageList: Display of chat messages
 * - ChatInput: User input field
 * - SQLEditorCanvas: SQL query editor panel
 * 
 * STATE ORGANIZATION:
 * - Database state: Managed via DatabaseContext (no prop drilling)
 * - UI state: Local useState for modals, sidebar, snackbar
 * - Chat state: Managed via useConversations hook
 * - Query execution: Managed via useQueryExecution hook
 * - SQL Editor: Managed via useSqlEditorPanel hook
 * - Message streaming: Managed via useMessageStreaming hook
 * - Settings: Accessed via ThemeContext (useTheme hook)
 * 
 * @module Chat
 */

import {
  Box,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
  FormControl,
  Input,
  Select,
  Snackbar,
  Dialog,
  Grow,
  Slide,
  Fade,
} from '@mui/material';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';
import { useTheme as useAppTheme } from '../contexts/ThemeContext';
import { sessionActive, getLlmOptions } from '../api';
import { useDatabaseConnection } from '../contexts/DatabaseContext';
import { useState, useEffect, useCallback, useMemo } from 'react';
import MenuOutlinedIcon from '@mui/icons-material/MenuOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { useAuth } from '../contexts/AuthContext';
import { USER } from '../api';
import Sidebar from '../components/Sidebar';
import ChatInput from '../components/ChatInput';
import MessageList from '../components/MessageList';
import DatabaseModal from '../components/DatabaseModal';
import SQLResultsTable from '../components/SQLResultsTable';
import SettingsModal from '../components/SettingsModal';
import ConfirmDialog from '../components/ConfirmDialog';
import StarfieldCanvas from '../components/StarfieldCanvas';
import SQLEditorCanvas from '../components/SQLEditorCanvas';
import ResizeHandle from '../components/ResizeHandle';
import QuotaDisplay from '../components/QuotaDisplay';
import {
  useAutoScroll,
  useIdleDetection,
  useConversations,
  useMessageStreaming,
  useQueryExecution,
  useSqlEditorPanel,
  useResponsive,
} from '../hooks';

import { getMoonlitGradient } from '../theme';
import { getMenuPaperStyles } from '../styles/shared';
import { isMessageActive } from '../utils/chatMessages';
import logger from '../utils/logger';
const DRAWER_WIDTH = 260;
const COLLAPSED_WIDTH = 56;

function Chat() {

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
    conversations,
    setConversations,
    currentConversationId,
    setCurrentConversationId,
    fetchConversations,
    handleNewChat,
    handleDeleteConversation,
    navigate,
  } = useConversations();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const currentSidebarWidth = useMemo(() =>
    sidebarOpen ? DRAWER_WIDTH : COLLAPSED_WIDTH,
    [sidebarOpen]
  );
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
  const [llmOptions, setLlmOptions] = useState({
    providers: [],
    default_provider: null,
    default_model: null,
  });
  const [llmOptionsLoading, setLlmOptionsLoading] = useState(true);

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
    settings,
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
        padding: '10px 16px',
        minWidth: 'auto !important',
        '& .MuiSnackbarContent-message': { padding: 0 },
      }
    };
  }, [isDarkMode, theme, snackbar.severity]);

  const providerOptions = useMemo(() => llmOptions.providers ?? [], [llmOptions.providers]);
  const selectedProvider = useMemo(() => {
    if (!providerOptions.length) return settings.llmProvider ?? '';
    if (settings.llmProvider && providerOptions.some((provider) => provider.name === settings.llmProvider)) {
      return settings.llmProvider;
    }
    return llmOptions.default_provider || providerOptions[0].name;
  }, [providerOptions, settings.llmProvider, llmOptions.default_provider]);

  const selectedProviderOption = useMemo(() => {
    return providerOptions.find((provider) => provider.name === selectedProvider) || null;
  }, [providerOptions, selectedProvider]);

  const modelOptions = useMemo(() => selectedProviderOption?.models || [], [selectedProviderOption]);
  const selectedModel = useMemo(() => {
    if (!modelOptions.length) return settings.llmModel ?? '';
    if (settings.llmModel && modelOptions.includes(settings.llmModel)) {
      return settings.llmModel;
    }
    return selectedProviderOption?.default_model || llmOptions.default_model || modelOptions[0];
  }, [modelOptions, settings.llmModel, selectedProviderOption, llmOptions.default_model]);

  const providerSelectValue = selectedProvider || '';
  const modelSelectValue = selectedModel || '';

  const handleProviderChange = useCallback((event) => {
    const nextProvider = event.target.value;
    updateSetting('llmProvider', nextProvider);

    const providerOption = providerOptions.find((provider) => provider.name === nextProvider);
    const nextModels = providerOption?.models || [];
    const nextModel = nextModels.includes(settings.llmModel)
      ? settings.llmModel
      : (providerOption?.default_model || nextModels[0] || null);
    updateSetting('llmModel', nextModel);
  }, [providerOptions, settings.llmModel, updateSetting]);

  const handleModelChange = useCallback((event) => {
    updateSetting('llmModel', event.target.value);
  }, [updateSetting]);

  const handleSendMessageWithModel = useCallback((message) => {
    return handleSendMessage(message, {
      provider: selectedProvider || null,
      model: selectedModel || null,
    });
  }, [handleSendMessage, selectedProvider, selectedModel]);

  const selectMenuProps = useMemo(() => ({
    PaperProps: {
      sx: {
        ...getMenuPaperStyles(theme),
        mt: 0.8,
        '& .MuiMenuItem-root': {
          fontSize: 13,
          fontWeight: 500,
          borderRadius: 1.2,
          mx: 0.6,
          my: 0.2,
          minHeight: 32,
        },
      },
    },
  }), [theme]);

  const handleCloseDbModal = useCallback(() => setDbModalOpen(false), []);
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), []);
  const handleCloseSnackbar = useCallback(() => setSnackbar(s => ({ ...s, open: false })), []);
  const { setScrollContainerRef } = useAutoScroll({
    messageCount: messages.length,
    isStreaming: isCurrentlyStreaming,
    activityKey: streamActivityKey,
  });
  useEffect(() => {
    document.title = 'Moonlit - Chat';
  }, []);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const loadLlmOptions = async () => {
      try {
        const response = await getLlmOptions(controller.signal);
        if (!isMounted || response?.status !== 'success') return;

        const providers = response.providers || [];
        setLlmOptions({
          providers,
          default_provider: response.default_provider || null,
          default_model: response.default_model || null,
        });

        if (!providers.length) return;

        const providerFromSettings = settings.llmProvider;
        const validProvider = providerFromSettings && providers.some((provider) => provider.name === providerFromSettings)
          ? providerFromSettings
          : (response.default_provider || providers[0].name);

        if (validProvider !== settings.llmProvider) {
          updateSetting('llmProvider', validProvider);
        }

        const providerConfig = providers.find((provider) => provider.name === validProvider) || providers[0];
        const candidateModels = providerConfig?.models || [];
        const modelFromSettings = settings.llmModel;
        const validModel = modelFromSettings && candidateModels.includes(modelFromSettings)
          ? modelFromSettings
          : (providerConfig?.default_model || response.default_model || candidateModels[0] || null);

        if (validModel && validModel !== settings.llmModel) {
          updateSetting('llmModel', validModel);
        }
      } catch (error) {
        logger.warn('Failed to fetch LLM options:', error);
      } finally {
        if (isMounted) {
          setLlmOptionsLoading(false);
        }
      }
    };

    loadLlmOptions();
    return () => {
      isMounted = false;
      controller.abort();
    };
  // Only initialize from backend once on first load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateSetting]);
  useEffect(() => {
    const handleTabClose = () => {
      if (!isDbConnected) return;
      const connectionPersistence = settings.connectionPersistence ?? 0;
      let sessionInstanceId = null;
      try {
        sessionInstanceId = sessionStorage.getItem('moonlit-session-instance-id');
      } catch {
        sessionInstanceId = null;
      }
      const payload = { connectionPersistenceMinutes: connectionPersistence, sessionInstanceId };
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      // Use absolute URL for sendBeacon to ensure it works in all environments
      const closeUrl = `${window.location.origin}${USER.SESSION_CLOSE}`;
      navigator.sendBeacon(closeUrl, blob);
    };

    window.addEventListener('beforeunload', handleTabClose);
    window.addEventListener('pagehide', handleTabClose);

    return () => {
      window.removeEventListener('beforeunload', handleTabClose);
      window.removeEventListener('pagehide', handleTabClose);
    };
  }, [isDbConnected, settings.connectionPersistence]);
  useEffect(() => {
    if (!isDbConnected) return;

    let timerId = null;

    const ping = () => {
      let sessionInstanceId = null;
      try {
        sessionInstanceId = sessionStorage.getItem('moonlit-session-instance-id');
      } catch {
        sessionInstanceId = null;
      }
      sessionActive(sessionInstanceId).catch(() => { });
    };
    ping();

    timerId = setInterval(ping, 5000);

    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [isDbConnected]);

  const handleDrawerToggle = useCallback(() => {
    setMobileOpen(prev => !prev);
  }, []);

  useEffect(() => {
    if (isDesktop) {
      setMobileOpen(false);
    }
  }, [isDesktop]);

  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen(prev => !prev);
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

  const commonSidebarProps = useMemo(() => ({
    conversations,
    currentConversationId,
    onDeleteConversation: handleDeleteConversation,
    isConnected: isDbConnected,
    currentDatabase,
    dbType,
    availableDatabases,
    onDatabaseSwitch: handleDatabaseSwitch,
    user,
  }), [
    conversations, currentConversationId, handleDeleteConversation,
    isDbConnected, currentDatabase, dbType, availableDatabases,
    handleDatabaseSwitch, user
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

  return (
    <Box sx={{
      display: 'flex',
      height: '100dvh',
      '@supports not (height: 100dvh)': {
        height: '100vh',
      },
      bgcolor: 'background.default',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <StarfieldCanvas active={starfieldActive} intensity={idleAnimationIntensity} />
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background: `radial-gradient(ellipse at top right, ${alpha(theme.palette.info.main, 0.04)} 0%, transparent 50%)`,
        }}
      />
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        PaperProps={{ sx: { ...getMenuPaperStyles(theme), minWidth: 180 } }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2">{user?.displayName}</Typography>
          <Typography variant="caption" color="text.secondary">{user?.email}</Typography>
        </Box>
        <Divider sx={{ borderColor: alpha(theme.palette.divider, 0.5) }} />
        <MenuItem onClick={handleOpenSettings}>
          <ListItemIcon><SettingsOutlinedIcon fontSize="small" /></ListItemIcon>
          Settings
        </MenuItem>
        <MenuItem onClick={handleLogout}>
          <ListItemIcon><LogoutOutlinedIcon fontSize="small" /></ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>
      <Sidebar
        {...commonSidebarProps}
        onNewChat={handleSidebarNewChat}
        onSelectConversation={handleSidebarSelectConversation}
        onOpenDbModal={handleSidebarOpenDbModal}
        open={sidebarOpen}
        onToggleOpen={handleSidebarToggle}
        onMenuOpen={handleSidebarMenuOpen}
        mobileOpen={mobileOpen}
        onMobileClose={handleDrawerToggle}
      />
      <Box
        component="main"
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          mt: 0,
          height: { xs: '100svh', md: '100vh' },
          '@supports not (height: 100svh)': {
            height: { xs: '100vh', md: '100vh' },
          },
          overflow: 'hidden',
          backgroundColor: starfieldActive
            ? alpha(theme.palette.background.default, 0.58)
            : theme.palette.glassmorphism.background,
          position: 'relative',
          zIndex: 1,
          minWidth: 0,
          transition: `${theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          })}, background-color 420ms ${theme.transitions.easing.easeInOut}`,
        }}
      >
        <Box
          sx={{
            px: { xs: 1, sm: 2, md: 2.5 },
            pt: { xs: 0.75, md: 1.5 },
            pb: { xs: 0.5, md: 0.8 },
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '32px minmax(0, 1fr) 32px', sm: 'auto' },
              alignItems: 'center',
              columnGap: { xs: 0.75, sm: 0 },
              width: { xs: '100%', sm: 'fit-content' },
              maxWidth: '100%',
              border: '1px solid',
              borderColor: alpha(theme.palette.divider, isDarkMode ? 0.2 : 0.4),
              borderRadius: '18px',
              background: isDarkMode
                ? `linear-gradient(155deg, ${alpha(theme.palette.background.paper, 0.62)} 0%, ${alpha(theme.palette.background.elevated, 0.44)} 100%)`
                : `linear-gradient(155deg, ${alpha(theme.palette.background.default, 0.985)} 0%, ${alpha(theme.palette.background.default, 0.96)} 100%)`,
              backdropFilter: isDarkMode ? 'blur(14px)' : 'none',
              WebkitBackdropFilter: isDarkMode ? 'blur(14px)' : 'none',
              boxShadow: 'none',
              px: { xs: 0.5, sm: 0.75 },
              py: { xs: 0.5, sm: 0.75 },
              '&::-webkit-scrollbar': {
                display: 'none',
              },
            }}
          >
            {isNarrowLayout && (
              <IconButton
                size="small"
                onClick={handleDrawerToggle}
                aria-label="Open sidebar"
                sx={{
                  width: 44,
                  height: 44,
                  color: 'text.secondary',
                  justifySelf: 'start',
                }}
              >
                <MenuOutlinedIcon sx={{ fontSize: 20 }} />
              </IconButton>
            )}
            <Box
              sx={{
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: { xs: 0.65, sm: 0.85 },
                flexWrap: 'nowrap',
                overflowX: { xs: 'auto', sm: 'visible' },
                WebkitOverflowScrolling: 'touch',
                '&::-webkit-scrollbar': {
                  display: 'none',
                },
              }}
            >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: { xs: 0.55, sm: 0.8 },
                px: { xs: 0.9, sm: 1 },
                py: 0.45,
                borderRadius: '14px',
                border: '1px solid',
                borderColor: alpha(theme.palette.divider, isDarkMode ? 0.2 : 0.38),
                backgroundColor: isDarkMode
                  ? alpha(theme.palette.background.default, 0.42)
                  : alpha(theme.palette.background.default, 0.96),
                flexShrink: 0,
              }}
            >
              <HubOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <FormControl size="small" variant="standard" sx={{ minWidth: { xs: 94, sm: 122 } }}>
                <Select
                  value={providerSelectValue}
                  onChange={handleProviderChange}
                  disabled={llmOptionsLoading || providerOptions.length === 0}
                  input={<Input disableUnderline />}
                  displayEmpty
                  MenuProps={selectMenuProps}
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'text.primary',
                    '& .MuiSelect-select': {
                      py: 0,
                      pr: 2.5,
                      minHeight: 'unset',
                    },
                  }}
                >
                  {providerOptions.map((provider) => (
                    <MenuItem key={provider.name} value={provider.name}>
                      {provider.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: { xs: 0.55, sm: 0.8 },
                px: { xs: 0.9, sm: 1 },
                py: 0.45,
                borderRadius: '14px',
                border: '1px solid',
                borderColor: alpha(theme.palette.divider, isDarkMode ? 0.2 : 0.38),
                backgroundColor: isDarkMode
                  ? alpha(theme.palette.background.default, 0.42)
                  : alpha(theme.palette.background.default, 0.96),
                minWidth: { xs: 142, sm: 225 },
                maxWidth: { xs: '100%', sm: 320 },
                flex: { xs: '0 0 auto', sm: '0 1 auto' },
                flexShrink: 0,
              }}
            >
              <SmartToyOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <FormControl size="small" variant="standard" sx={{ flex: 1, minWidth: 0 }}>
                <Select
                  value={modelSelectValue}
                  onChange={handleModelChange}
                  disabled={llmOptionsLoading || modelOptions.length === 0}
                  input={<Input disableUnderline />}
                  displayEmpty
                  MenuProps={selectMenuProps}
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'text.primary',
                    '& .MuiSelect-select': {
                      py: 0,
                      pr: 2.5,
                      minHeight: 'unset',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                    },
                  }}
                >
                  {modelOptions.map((model) => (
                    <MenuItem key={model} value={model}>
                      {model}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Box
              sx={{
                display: { xs: 'none', sm: 'flex' },
                alignItems: 'center',
                px: 0.25,
                ml: { xs: 0, sm: 0.2 },
              }}
            >
              <QuotaDisplay embedded />
            </Box>
            </Box>
            {isNarrowLayout && (
              <IconButton
                size="small"
                onClick={handleNewChat}
                aria-label="Start new chat"
                sx={{
                  width: 44,
                  height: 44,
                  color: 'text.primary',
                  justifySelf: 'end',
                }}
              >
                <EditNoteOutlinedIcon sx={{ fontSize: 20 }} />
              </IconButton>
            )}
          </Box>
        </Box>

        <Box sx={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Fade in={messages.length === 0} timeout={300} unmountOnExit>
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                px: 3,
                position: 'absolute',
                inset: 0,
              }}
            >
              <Box
                sx={{
                  textAlign: 'center',
                  mb: 3,
                  animation: 'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                  '@keyframes slideUp': {
                    from: {
                      opacity: 0,
                      transform: 'translateY(20px)'
                    },
                    to: {
                      opacity: 1,
                      transform: 'translateY(0)'
                    },
                  },
                }}
              >
                <Typography
                  variant="h3"
                  sx={{
                    fontWeight: 500,
                    fontSize: { xs: '2rem', sm: '2.5rem' },
                    color: 'text.primary',
                    letterSpacing: '-0.02em',
                    mb: 1,
                  }}
                >
                  {user?.displayName ? (
                    <>
                      Moonlit welcomes,{' '}
                      <Box
                        component="span"
                        sx={{
                          background: getMoonlitGradient(theme),
                          backgroundClip: 'text',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          fontWeight: 600,
                        }}
                      >
                        {user.displayName.split(' ')[0]}
                      </Box>
                    </>
                  ) : 'Moonlit'}
                </Typography>
              </Box>

              <Box sx={{ width: '100%', maxWidth: 760 }}>
                <ChatInput
                  onSend={handleSendMessageWithModel}
                  onStop={handleStopStreaming}
                  isStreaming={isCurrentlyStreaming}
                  isConnected={isDbConnected}
                  dbType={dbType}
                  currentDatabase={currentDatabase}
                  availableDatabases={availableDatabases}
                  onDatabaseSwitch={handleDatabaseSwitch}
                  onOpenSqlEditor={handleOpenSqlEditor}
                />
              </Box>
            </Box>
          </Fade>

          <Fade in={messages.length > 0} timeout={300} unmountOnExit style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <Box ref={setScrollContainerRef} sx={{ flex: 1, overflow: 'auto' }}>
                <MessageList
                  messages={messages}
                  user={user}
                  onRunQuery={handleRunQuery}
                  onOpenSqlEditor={handleOpenSqlEditor}
                />
              </Box>

              <Box
                sx={{
                  flexShrink: 0,
                  position: 'sticky',
                  bottom: 0,
                  zIndex: 2,
                  pb: 'max(env(safe-area-inset-bottom), 0px)',
                  background: `linear-gradient(to top, ${alpha(theme.palette.background.default, 0.94)} 70%, transparent)`,
                  backdropFilter: 'blur(6px)',
                }}
              >
                <ChatInput
                  onSend={handleSendMessageWithModel}
                  onStop={handleStopStreaming}
                  isStreaming={isCurrentlyStreaming}
                  isConnected={isDbConnected}
                  dbType={dbType}
                  currentDatabase={currentDatabase}
                  availableDatabases={availableDatabases}
                  onDatabaseSwitch={handleDatabaseSwitch}
                  showSuggestions={false}
                  onOpenSqlEditor={handleOpenSqlEditor}
                />
              </Box>
            </Box>
          </Fade>
        </Box>
      </Box>
      {!isNarrowLayout && (
        <Box
          sx={{
            display: 'flex',
            flexShrink: 0,
            height: '100vh',
          }}
        >
          <ResizeHandle onResize={handlePanelResize} disabled={!sqlEditorOpen} />
          <SQLEditorCanvas
            onClose={handleCloseSqlEditor}
            initialQuery={sqlEditorQuery}
            initialResults={sqlEditorResults}
            isConnected={isDbConnected}
            currentDatabase={currentDatabase}
            isOpen={sqlEditorOpen}
            panelWidth={sqlEditorWidth}
          />
        </Box>
      )}
      {isNarrowLayout && (
        <Slide direction="up" in={sqlEditorOpen} mountOnEnter unmountOnExit>
          <Box
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1300,
              display: 'flex',
              flexDirection: 'column',
              bgcolor: 'background.default',
            }}
          >
            <SQLEditorCanvas
              onClose={handleCloseSqlEditor}
              initialQuery={sqlEditorQuery}
              initialResults={sqlEditorResults}
              isConnected={isDbConnected}
              currentDatabase={currentDatabase}
              isOpen={sqlEditorOpen}
              fullscreen
            />
          </Box>
        </Slide>
      )}
      <DatabaseModal
        open={dbModalOpen}
        onClose={handleCloseDbModal}
        onConnect={handleDbConnect}
        isConnected={isDbConnected}
        currentDatabase={currentDatabase}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        message={snackbar.message}
        ContentProps={snackbarContentProps}
      />
      <Dialog
        open={Boolean(queryResults)}
        onClose={handleCloseQueryResults}
        maxWidth="xl"
        fullWidth
        fullScreen={false}
        TransitionComponent={Grow}
        sx={{
          '& .MuiDialog-paper': {
            margin: { xs: 0, sm: 2 },
            width: { xs: '100%', sm: 'calc(100% - 32px)' },
            height: { xs: '100%', sm: '85vh' },
            maxHeight: { xs: '100%', sm: '85vh' },
            borderRadius: { xs: 0, sm: 2 },
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          },
        }}
        PaperProps={{
          sx: {
            bgcolor: 'background.paper',
            backgroundImage: 'none',
          }
        }}
      >
        {queryResults && <SQLResultsTable data={queryResults} onClose={handleCloseQueryResults} />}
      </Dialog>
      <SettingsModal open={settingsOpen} onClose={handleCloseSettings} />
      <ConfirmDialog
        open={confirmDialog.open}
        onClose={handleConfirmDialogClose}
        onConfirm={confirmDialog.onConfirm}
        title="Execute Query?"
        message="You are about to execute the following SQL query:"
        sqlQuery={confirmDialog.sql}
        confirmText="Execute"
        confirmColor="success"
      />
    </Box>
  );
}

export default Chat;
