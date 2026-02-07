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
  AppBar,
  Toolbar,
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
  Snackbar,
  Dialog,
  Grow,
  Slide,
  Fade,
  useMediaQuery,
} from '@mui/material';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';
import { useTheme as useAppTheme } from '../contexts/ThemeContext';
import { sessionActive } from '../api';
import { useDatabaseConnection } from '../contexts/DatabaseContext';
import { useState, useEffect, useCallback, useMemo } from 'react';
import MenuOutlinedIcon from '@mui/icons-material/MenuOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
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

// Custom hooks
import {
  useAutoScroll,
  useIdleDetection,
  useConversations,
  useMessageStreaming,
  useQueryExecution,
  useSqlEditorPanel,
} from '../hooks';

import { getMoonlitGradient } from '../theme';
import { isMessageActive } from '../utils/chatMessages';

// ============================================================================
// CONSTANTS
// ============================================================================
const DRAWER_WIDTH = 260;
const COLLAPSED_WIDTH = 56;
const MOBILE_APPBAR_HEIGHT = 56;

function Chat() {
  // ===========================================================================
  // HOOKS - External State & Navigation
  // ===========================================================================

  const theme = useMuiTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { settings } = useAppTheme();
  const { user, logout } = useAuth();

  // Database connection state from context
  const {
    isConnected: isDbConnected,
    currentDatabase,
    dbType,
    availableDatabases,
    connect: connectDb,
    resetConnectionState,
    switchDatabase,
  } = useDatabaseConnection();

  // ===========================================================================
  // CUSTOM HOOKS - Extracted Logic
  // ===========================================================================

  // Conversation management
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

  // Sidebar width for SQL editor resize calculations
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const currentSidebarWidth = useMemo(() =>
    sidebarOpen ? DRAWER_WIDTH : COLLAPSED_WIDTH,
    [sidebarOpen]
  );

  // SQL Editor panel
  const {
    sqlEditorOpen,
    sqlEditorQuery,
    sqlEditorResults,
    sqlEditorWidth,
    handleOpenSqlEditor,
    handleCloseSqlEditor,
    handlePanelResize,
  } = useSqlEditorPanel({ sidebarWidth: currentSidebarWidth });

  // ===========================================================================
  // LOCAL STATE - UI Controls
  // ===========================================================================

  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  // ===========================================================================
  // SNACKBAR HELPER
  // ===========================================================================

  const showSnackbar = useCallback((message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  }, []);

  // ===========================================================================
  // QUERY EXECUTION HOOK
  // ===========================================================================

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

  // ===========================================================================
  // MESSAGE STREAMING HOOK
  // ===========================================================================

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

  // ===========================================================================
  // IDLE DETECTION
  // ===========================================================================

  const isIdle = useIdleDetection();
  const idleAnimationEnabled = settings.idleAnimation ?? true;

  // ===========================================================================
  // MEMOIZED DERIVED STATE
  // ===========================================================================

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

  // ===========================================================================
  // MEMOIZED STYLE OBJECTS
  // ===========================================================================

  const glassmorphismStyles = useMemo(() => ({
    background: isDarkMode
      ? alpha(theme.palette.background.paper, 0.05)
      : alpha(theme.palette.background.paper, 0.8),
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderColor: alpha(theme.palette.divider, isDarkMode ? 0.1 : 0.15),
  }), [isDarkMode, theme]);

  const snackbarContentProps = useMemo(() => {
    const severityColor = snackbar.severity === 'success' ? theme.palette.success.main :
      snackbar.severity === 'error' ? theme.palette.error.main :
        snackbar.severity === 'warning' ? theme.palette.warning.main :
          theme.palette.info.main;

    return {
      sx: {
        backgroundColor: isDarkMode ? alpha(theme.palette.background.paper, 0.95) : theme.palette.background.paper,
        color: severityColor,
        fontWeight: 500,
        borderRadius: '6px',
        border: `1.5px solid ${severityColor}`,
        boxShadow: isDarkMode
          ? `0 4px 12px ${alpha(theme.palette.common.black, 0.4)}`
          : `0 4px 12px ${alpha(severityColor, 0.15)}`,
        padding: '10px 16px',
        minWidth: 'auto !important',
        '& .MuiSnackbarContent-message': { padding: 0 },
      }
    };
  }, [isDarkMode, theme, snackbar.severity]);

  // ===========================================================================
  // STABLE CLOSE HANDLERS
  // ===========================================================================

  const handleCloseDbModal = useCallback(() => setDbModalOpen(false), []);
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), []);
  const handleCloseSnackbar = useCallback(() => setSnackbar(s => ({ ...s, open: false })), []);

  // ===========================================================================
  // AUTO-SCROLL - Pinned-bottom stream follow
  // ===========================================================================
  const { setScrollContainerRef } = useAutoScroll({
    messageCount: messages.length,
    isStreaming: isCurrentlyStreaming,
    activityKey: streamActivityKey,
  });

  // Set document title
  useEffect(() => {
    document.title = 'Moonlit - Chat';
  }, []);

  // Tab/Browser close detection
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

  // Session heartbeat to detect unexpected browser closes
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

    // Initial ping
    ping();

    timerId = setInterval(ping, 5000);

    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [isDbConnected]);

  // ===========================================================================
  // UI HANDLERS
  // ===========================================================================

  const handleDrawerToggle = useCallback(() => {
    setMobileOpen(prev => !prev);
  }, []);

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

  // ===========================================================================
  // DATABASE HANDLERS
  // ===========================================================================

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

  // ===========================================================================
  // SIDEBAR PROPS & HANDLERS
  // ===========================================================================

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

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <Box sx={{
      display: 'flex',
      height: '100vh',
      bgcolor: 'background.default',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Animated Starfield Background */}
      <StarfieldCanvas active={isIdle && idleAnimationEnabled} />

      {/* Immersive gradient overlay */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background: `radial-gradient(ellipse at top right, ${alpha(theme.palette.info.main, 0.04)} 0%, transparent 50%)`,
        }}
      />

      {/* Mobile AppBar */}
      <AppBar
        position="fixed"
        sx={{
          display: { md: 'none' },
          backgroundColor: glassmorphismStyles.background,
          backdropFilter: glassmorphismStyles.backdropFilter,
          WebkitBackdropFilter: glassmorphismStyles.WebkitBackdropFilter,
          borderBottom: '1px solid',
          borderColor: glassmorphismStyles.borderColor,
          zIndex: 2,
        }}
        elevation={0}
      >
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <IconButton color="inherit" edge="start" onClick={handleDrawerToggle}>
            <MenuOutlinedIcon sx={{ color: 'text.secondary' }} />
          </IconButton>
          <QuotaDisplay />
          <IconButton onClick={handleNewChat} sx={{ color: 'text.primary' }}>
            <EditNoteOutlinedIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* User Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        PaperProps={{ sx: { minWidth: 180 } }}
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

      {/* Unified Sidebar */}
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

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          mt: { xs: `${MOBILE_APPBAR_HEIGHT}px`, md: 0 },
          height: { xs: `calc(100svh - ${MOBILE_APPBAR_HEIGHT}px)`, md: '100vh' },
          '@supports not (height: 100svh)': {
            height: { xs: `calc(100vh - ${MOBILE_APPBAR_HEIGHT}px)`, md: '100vh' },
          },
          overflow: 'hidden',
          backgroundColor: 'transparent',
          position: 'relative',
          zIndex: 1,
          minWidth: 0,
          // Synced with Sidebar's MUI mini variant drawer transition
          transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen, // 225ms
          }),
        }}
      >
        {/* Quota Display - Desktop only */}
        <Box
          sx={{
            position: 'absolute',
            top: 12,
            right: 16,
            zIndex: 10,
            display: { xs: 'none', md: 'block' },
          }}
        >
          <QuotaDisplay />
        </Box>

        {/* Empty state */}
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
                onSend={handleSendMessage}
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

        {/* Messages state */}
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

            <Box sx={{ flexShrink: 0 }}>
              <ChatInput
                onSend={handleSendMessage}
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

      {/* SQL Editor Panel - Desktop only */}
      {!isMobile && (
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

      {/* SQL Editor Mobile - Fullscreen slide-up */}
      {isMobile && (
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

      {/* Modals */}
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

      {/* SQL Results Modal */}
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

      {/* Settings Modal */}
      <SettingsModal open={settingsOpen} onClose={handleCloseSettings} />

      {/* Query Confirmation Dialog */}
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
