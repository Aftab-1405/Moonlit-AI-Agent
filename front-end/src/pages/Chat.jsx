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
 * - Chat state: Local useState for messages and conversations
 * - Settings: Accessed via ThemeContext (useTheme hook)
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - All handlers wrapped in useCallback
 * - Derived state uses useMemo
 * - Style objects memoized to prevent recreation
 * - Stable close handlers for modals/dialogs
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
} from '@mui/material';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';
import { useTheme as useAppTheme } from '../contexts/ThemeContext';
import { useDatabaseConnection } from '../contexts/DatabaseContext';
import { useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import MenuOutlinedIcon from '@mui/icons-material/MenuOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import { useAuth } from '../contexts/AuthContext';
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
import useIdleDetection from '../hooks/useIdleDetection';

// Centralized API layer
import {
  getConversations,
  getConversation,
  createConversation,
  deleteConversation,
  sendMessage,
  runQuery,
} from '../api';
import { getMoonlitGradient } from '../theme';

// ============================================================================
// CONSTANTS - Static values outside component
// ============================================================================
const DRAWER_WIDTH = 260;
const COLLAPSED_WIDTH = 56;
const MIN_EDITOR_WIDTH = 320;
const MAX_EDITOR_WIDTH_PERCENT = 0.6;
const UPDATE_THROTTLE_MS = 16; // ~60fps for smooth streaming updates

function Chat() {
  // ===========================================================================
  // HOOKS - External State & Navigation
  // ===========================================================================

  const theme = useMuiTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const { settings } = useAppTheme();
  const { conversationId } = useParams();
  const navigate = useNavigate();
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
  // LOCAL STATE - UI Controls
  // ===========================================================================

  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  // ===========================================================================
  // LOCAL STATE - Chat & Conversations
  // ===========================================================================

  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);

  // ===========================================================================
  // LOCAL STATE - Query & Results
  // ===========================================================================

  const [queryResults, setQueryResults] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, sql: '', onConfirm: null });

  // ===========================================================================
  // LOCAL STATE - SQL Editor Canvas
  // ===========================================================================

  const [sqlEditorOpen, setSqlEditorOpen] = useState(false);
  const [sqlEditorQuery, setSqlEditorQuery] = useState('');
  const [sqlEditorResults, setSqlEditorResults] = useState(null);
  const [sqlEditorWidth, setSqlEditorWidth] = useState(450);

  // ===========================================================================
  // REFS
  // ===========================================================================

  const messagesContainerRef = useRef(null);
  const queryResolverRef = useRef(null);
  const abortControllerRef = useRef(null);
  const prevConversationIdRef = useRef(null);
  const newlyCreatedConvIdRef = useRef(null); // Track IDs we just created to skip fetch

  // ===========================================================================
  // IDLE DETECTION
  // ===========================================================================

  const isIdle = useIdleDetection();
  const idleAnimationEnabled = settings.idleAnimation ?? true;

  // ===========================================================================
  // MEMOIZED DERIVED STATE
  // ===========================================================================

  const isCurrentlyStreaming = useMemo(() =>
    messages.length > 0 &&
    messages[messages.length - 1]?.sender === 'ai' &&
    messages[messages.length - 1]?.isStreaming,
    [messages]
  );



  const currentSidebarWidth = useMemo(() =>
    sidebarCollapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH,
    [sidebarCollapsed]
  );

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
  // STABLE CLOSE HANDLERS - Prevent inline function recreation
  // ===========================================================================

  const handleCloseDbModal = useCallback(() => setDbModalOpen(false), []);
  const handleCloseSqlEditor = useCallback(() => setSqlEditorOpen(false), []);
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), []);
  const handleCloseQueryResults = useCallback(() => setQueryResults(null), []);
  const handleCloseSnackbar = useCallback(() => setSnackbar(s => ({ ...s, open: false })), []);

  // ===========================================================================
  // MEMOIZED CORE FUNCTIONS
  // ===========================================================================



  const fetchConversations = useCallback(async () => {
    try {
      const data = await getConversations();
      if (data.status === 'success') {
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    }
  }, []);

  const resetChatState = useCallback(() => {
    setMessages([]);
    setCurrentConversationId(null);
    setQueryResults(null);
    setMobileOpen(false);
  }, []);

  const handleSelectConversation = useCallback(async (convId) => {
    try {
      const data = await getConversation(convId);
      if (data.status === 'success' && data.conversation) {
        setCurrentConversationId(convId);
        const formattedMessages = (data.conversation.messages || []).map((msg) => ({
          sender: msg.sender,
          content: msg.content,
          thinking: msg.thinking || undefined,
          tools: msg.tools || undefined,
        }));
        setMessages(formattedMessages);
        setQueryResults(null);
        setMobileOpen(false);
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  }, []);

  // ===========================================================================
  // EFFECTS
  // ===========================================================================

  // Auto-scroll using ResizeObserver (industry standard)
  // Watches for content height changes and scrolls to bottom
  // Respects user intent: stops scrolling if user scrolls up
  const userScrolledUpRef = useRef(false);
  const resizeObserverRef = useRef(null);
  
  // Track user scroll intent
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      // User has scrolled up if more than 100px from bottom
      userScrolledUpRef.current = distanceFromBottom > 100;
    };
    
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);
  
  // ResizeObserver for content growth detection
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    
    // Cleanup previous observer
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
    }
    
    const scrollToBottomIfNeeded = () => {
      if (!userScrolledUpRef.current && container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'instant' });
      }
    };
    
    // Create ResizeObserver to watch for content changes
    resizeObserverRef.current = new ResizeObserver(() => {
      scrollToBottomIfNeeded();
    });
    
    // Observe the first child (MessageList content) for size changes
    const messageListContent = container.firstElementChild;
    if (messageListContent) {
      resizeObserverRef.current.observe(messageListContent);
    }
    
    // Also scroll when streaming starts
    if (isCurrentlyStreaming) {
      userScrolledUpRef.current = false; // Reset on new message
      scrollToBottomIfNeeded();
    }
    
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, [isCurrentlyStreaming]);

  // Initial conversation fetch
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Handle URL changes - using ref to track previous ID
  // Skip fetching for conversations we just created (they're empty)
  useEffect(() => {
    if (conversationId) {
      if (conversationId !== prevConversationIdRef.current) {
        // Skip fetch if we just created this conversation
        if (conversationId === newlyCreatedConvIdRef.current) {
          // Already set state in handleNewChat, just update refs
          newlyCreatedConvIdRef.current = null;
        } else {
          handleSelectConversation(conversationId);
        }
      }
    } else if (prevConversationIdRef.current) {
      resetChatState();
    }
    prevConversationIdRef.current = conversationId;
  }, [conversationId, handleSelectConversation, resetChatState]);

  // Set document title
  useEffect(() => {
    document.title = 'Moonlit - Chat';
  }, []);

  // Tab/Browser close detection
  useEffect(() => {
    const handleTabClose = () => {
      const connectionPersistence = settings.connectionPersistence ?? 0;
      if (connectionPersistence === 0 && isDbConnected) {
        const blob = new Blob([JSON.stringify({})], { type: 'application/json' });
        navigator.sendBeacon('/disconnect_db', blob);
      }
    };

    window.addEventListener('beforeunload', handleTabClose);
    window.addEventListener('pagehide', handleTabClose);

    return () => {
      window.removeEventListener('beforeunload', handleTabClose);
      window.removeEventListener('pagehide', handleTabClose);
    };
  }, [isDbConnected, settings.connectionPersistence]);

  // ===========================================================================
  // MEMOIZED UI HANDLERS
  // ===========================================================================

  const handleDrawerToggle = useCallback(() => {
    setMobileOpen(prev => !prev);
  }, []);

  const handleSidebarToggle = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
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
  // CONVERSATION HANDLERS
  // ===========================================================================

  const handleNewChat = useCallback(async () => {
    navigate('/chat');
    try {
      const data = await createConversation();
      if (data.status === 'success') {
        const newId = data.conversation_id;
        // Track that we created this ID (so useEffect skips fetching it)
        newlyCreatedConvIdRef.current = newId;
        // Set state BEFORE navigation to prevent useEffect from fetching
        setCurrentConversationId(newId);
        setMessages([]);
        prevConversationIdRef.current = newId;
        navigate(`/chat/${newId}`, { replace: true });
        fetchConversations();
      }
    } catch (error) {
      console.error('Failed to create new conversation:', error);
    }
  }, [navigate, fetchConversations]);

  const handleDeleteConversation = useCallback(async (convId) => {
    try {
      await deleteConversation(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (currentConversationId === convId) {
        navigate('/chat');
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  }, [currentConversationId, navigate]);

  // ===========================================================================
  // DATABASE HANDLERS
  // ===========================================================================

  const handleDbConnect = useCallback((data) => {
    if (data) {
      connectDb(data);
      setSnackbar({ open: true, message: 'Connected to database!', severity: 'success' });
    } else {
      resetConnectionState();
      setSnackbar({ open: true, message: 'Disconnected from database', severity: 'info' });
    }
  }, [connectDb, resetConnectionState]);

  const handleDatabaseSwitch = useCallback(async (dbName) => {
    const result = await switchDatabase(dbName);
    if (result.success) {
      setSnackbar({ open: true, message: `Switched to ${dbName}`, severity: 'success' });
    } else {
      setSnackbar({ open: true, message: result.error || 'Failed to switch', severity: 'error' });
    }
  }, [switchDatabase]);

  // ===========================================================================
  // QUERY EXECUTION
  // ===========================================================================

  const executeQuery = useCallback(async (sql, maxRows, queryTimeout) => {
    try {
      const data = await runQuery({ sql, maxRows, timeout: queryTimeout });
      if (data.status === 'success') {
        const columns = data.result?.fields || [];
        const rows = data.result?.rows || [];

        const transformedResult = rows.map(row => {
          const obj = {};
          columns.forEach((col, idx) => {
            obj[col] = row[idx];
          });
          return obj;
        });

        setQueryResults({
          columns,
          result: transformedResult,
          row_count: data.row_count,
          total_rows: data.total_rows,
          truncated: data.truncated,
          execution_time: data.execution_time_ms ? data.execution_time_ms / 1000 : null,
        });
        setSnackbar({ open: true, message: `Query returned ${data.row_count} rows`, severity: 'success' });
      } else {
        setSnackbar({ open: true, message: data.message || 'Query failed', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to execute query', severity: 'error' });
    }
  }, []);

  const handleRunQuery = useCallback((sql) => {
    if (!isDbConnected) {
      setSnackbar({ open: true, message: 'Please connect to a database first', severity: 'warning' });
      setDbModalOpen(true);
      return Promise.resolve();
    }

    const confirmBeforeRun = settings.confirmBeforeRun ?? false;
    const maxRows = settings.maxRows ?? 1000;
    const queryTimeout = settings.queryTimeout ?? 30;

    if (confirmBeforeRun) {
      return new Promise((resolve) => {
        queryResolverRef.current = resolve;
        setConfirmDialog({
          open: true,
          sql: sql,
          onConfirm: async () => {
            await executeQuery(sql, maxRows, queryTimeout);
            setConfirmDialog({ open: false, sql: '', onConfirm: null, onCancel: null });
            queryResolverRef.current?.();
          },
          onCancel: () => {
            setConfirmDialog({ open: false, sql: '', onConfirm: null, onCancel: null });
            queryResolverRef.current?.();
          },
        });
      });
    }

    return executeQuery(sql, maxRows, queryTimeout);
  }, [isDbConnected, settings.confirmBeforeRun, settings.maxRows, settings.queryTimeout, executeQuery]);

  // ===========================================================================
  // MESSAGE HANDLING
  // ===========================================================================

  const handleSendMessage = useCallback(async (message) => {
    if (!message.trim()) return;

    setMessages((prev) => [...prev, { sender: 'user', content: message }]);
    setMessages((prev) => [...prev, { sender: 'ai', content: '', isWaiting: true }]);

    const enableReasoning = settings.enableReasoning ?? true;
    const reasoningEffort = settings.reasoningEffort ?? 'medium';
    const responseStyle = settings.responseStyle ?? 'balanced';
    const maxRows = settings.maxRows ?? 1000;

    abortControllerRef.current = new AbortController();

    try {
      const response = await sendMessage({
        prompt: message,
        conversationId: currentConversationId,
        enableReasoning,
        reasoningEffort,
        responseStyle,
        maxRows,
      }, abortControllerRef.current.signal);

      const newConversationId = response.headers.get('X-Conversation-Id');
      if (newConversationId && !currentConversationId) {
        setCurrentConversationId(newConversationId);
        navigate(`/chat/${newConversationId}`, { replace: true });

        const tempTitle = message.substring(0, 50) + (message.length > 50 ? '...' : '');
        setConversations((prev) => [
          { id: newConversationId, title: tempTitle, created_at: new Date().toISOString() },
          ...prev,
        ]);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiResponse = '';
      let lastUpdateTime = 0;

      const updateMessage = () => {
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[updated.length - 1]?.sender === 'ai') {
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              content: aiResponse,
              isStreaming: true,
              isWaiting: false
            };
          } else {
            updated.push({ sender: 'ai', content: aiResponse, isStreaming: true });
          }
          return updated;
        });
      };

      while (true) {
        const { done, value } = await reader.read();

        if (!done) {
          const chunk = decoder.decode(value, { stream: true });
          aiResponse += chunk;
        }

        const now = Date.now();
        if (done || now - lastUpdateTime >= UPDATE_THROTTLE_MS) {
          if (aiResponse) {
            updateMessage();
          }
          lastUpdateTime = now;
          if (done) break;
        }
      }

      setMessages((prev) => {
        const updated = [...prev];
        if (updated[updated.length - 1]?.sender === 'ai') {
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            isStreaming: false
          };
        }
        return updated;
      });

      fetchConversations();
    } catch (error) {
      if (error.name === 'AbortError') {
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[updated.length - 1]?.sender === 'ai') {
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              isStreaming: false,
              wasStopped: true
            };
          }
          return updated;
        });
        return;
      }
      setMessages((prev) => {
        const updated = [...prev];
        if (updated[updated.length - 1]?.sender === 'ai' && updated[updated.length - 1]?.isWaiting) {
          updated[updated.length - 1] = { sender: 'ai', content: 'Sorry, I encountered an error. Please try again.' };
        } else {
          updated.push({ sender: 'ai', content: 'Sorry, I encountered an error. Please try again.' });
        }
        return updated;
      });
    } finally {
      abortControllerRef.current = null;
    }
  }, [currentConversationId, settings, navigate, fetchConversations]);

  const handleStopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // ===========================================================================
  // PANEL RESIZE
  // ===========================================================================

  const handlePanelResize = useCallback((deltaX) => {
    setSqlEditorWidth((prev) => {
      const newWidth = prev - deltaX;
      const availableWidth = window.innerWidth - currentSidebarWidth;
      const maxWidth = availableWidth * MAX_EDITOR_WIDTH_PERCENT;
      return Math.max(MIN_EDITOR_WIDTH, Math.min(maxWidth, newWidth));
    });
  }, [currentSidebarWidth]);

  const handleOpenSqlEditor = useCallback((query = '', results = null) => {
    setSqlEditorQuery(query);
    setSqlEditorResults(results);
    setSqlEditorOpen(true);
  }, []);

  // ===========================================================================
  // MEMOIZED SIDEBAR PROPS
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

  // Stable sidebar action handlers
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
  // MEMOIZED CONFIRM DIALOG CLOSE
  // ===========================================================================

  const handleConfirmDialogClose = useCallback(() => {
    confirmDialog.onCancel?.();
    setConfirmDialog({ open: false, sql: '', onConfirm: null, onCancel: null });
  }, [confirmDialog]);

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
        PaperProps={{ sx: { minWidth: 180, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' } }}
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
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={handleSidebarToggle}
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
          mt: { xs: '56px', md: 0 },
          height: { xs: 'calc(100svh - 56px)', md: '100vh' },
          '@supports not (height: 100svh)': {
            height: { xs: 'calc(100vh - 56px)', md: '100vh' },
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
            <Box sx={{ textAlign: 'center', mb: 2 }}>
              <Typography
                variant="h3"
                sx={{
                  fontWeight: 500,
                  fontSize: { xs: '2rem', sm: '2.5rem' },
                  color: 'text.primary',
                  letterSpacing: '-0.02em',
                }}
              >
                {user?.displayName ? (
                  <>
                    Moonlit welcomes,{' '}
                    <Box
                      component="span"
                      sx={{
                        background: theme.custom?.getNaturalMoonlitEffects?.()?.textGradient || getMoonlitGradient(theme),
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
            <Box ref={messagesContainerRef} sx={{ flex: 1, overflow: 'auto' }}>
              <MessageList
                messages={messages}
                user={user}
                onRunQuery={handleRunQuery}
                onOpenSqlEditor={handleOpenSqlEditor}
              />
            </Box>

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
        </Fade>
      </Box>

      {/* SQL Editor Panel - Desktop */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
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

      {/* SQL Editor Mobile */}
      <Slide direction="up" in={sqlEditorOpen} mountOnEnter unmountOnExit>
        <Box
          sx={{
            display: { xs: 'flex', md: 'none' },
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1300,
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
            fullscreen
          />
        </Box>
      </Slide>

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
            height: { xs: '100%', sm: 'auto' },
            maxHeight: { xs: '100%', sm: '85vh' },
            borderRadius: { xs: 0, sm: 2 },
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
