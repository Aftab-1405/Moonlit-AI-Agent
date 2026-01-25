import { useState, memo, useRef, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Divider,
  Popover,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Avatar,
  Drawer as MuiDrawer,
  SwipeableDrawer,
  Dialog,
  DialogTitle,
  DialogContent,
  Chip,
  CircularProgress,
  useMediaQuery,
} from '@mui/material';
import { styled, useTheme, alpha } from '@mui/material/styles';

// Icons - Using outlined/transparent versions for Grok-style look
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import QuestionAnswerOutlinedIcon from '@mui/icons-material/QuestionAnswerOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import KeyboardDoubleArrowLeftRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowLeftRounded';
import KeyboardDoubleArrowRightRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowRightRounded';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import CloseIcon from '@mui/icons-material/Close';
import SchemaFlowDiagram from './SchemaFlowDiagram';

// Centralized API layer
import { getUserContext } from '../api';

// ============================================================================
// CONSTANTS - Moved outside component to prevent recreation
// ============================================================================
const EXPANDED_WIDTH = 260;
const COLLAPSED_WIDTH = 56;

// Static styles that don't depend on theme
const CONTENT_CONTAINER_STYLES = {
  position: 'relative',
  height: '100%',
  minHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
};

// ============================================================================
// MUI Mini Variant Drawer Pattern - Industry Standard
// ============================================================================
const getGlassmorphismStyles = (theme, isDarkMode) => ({
  background: isDarkMode
    ? theme.palette.background.default  // Same as main content area
    : theme.palette.background.default,
  borderRight: '1px solid',
  borderColor: theme.palette.divider,
});

const openedMixin = (theme, isDarkMode) => ({
  width: EXPANDED_WIDTH,
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  overflowX: 'hidden',
  ...getGlassmorphismStyles(theme, isDarkMode),
});

const closedMixin = (theme, isDarkMode) => ({
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  overflowX: 'hidden',
  width: COLLAPSED_WIDTH,
  ...getGlassmorphismStyles(theme, isDarkMode),
});

const StyledDrawer = styled(MuiDrawer, {
  shouldForwardProp: (prop) => prop !== 'open' && prop !== 'isDarkMode',
})(({ theme, open, isDarkMode }) => ({
  width: EXPANDED_WIDTH,
  height: '100%',
  flexShrink: 0,
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
  ...(open && {
    ...openedMixin(theme, isDarkMode),
    '& .MuiDrawer-paper': {
      ...openedMixin(theme, isDarkMode),
      borderRadius: 0,  // No rounded corners for sidebar
    },
  }),
  ...(!open && {
    ...closedMixin(theme, isDarkMode),
    '& .MuiDrawer-paper': {
      ...closedMixin(theme, isDarkMode),
      borderRadius: 0,  // No rounded corners for sidebar
    },
  }),
}));

// ============================================================================
// MEMOIZED SUB-COMPONENTS - Extracted for performance
// ============================================================================

/**
 * Memoized conversation list item - prevents re-render when other conversations change
 */
const ConversationItem = memo(function ConversationItem({
  conv,
  isActive,
  isCollapsed,
  onSelect,
  onDelete,
  theme,
  getCollapseTransition,
}) {
  const handleClick = useCallback(() => {
    onSelect(conv.id);
  }, [onSelect, conv.id]);

  const handleDelete = useCallback((e) => {
    e.stopPropagation();
    onDelete(conv.id);
  }, [onDelete, conv.id]);

  return (
    <Tooltip title={isCollapsed ? (conv.title || 'Conversation') : ''} placement="right" arrow>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          p: isCollapsed ? 1 : 1.25,
          mb: 0.25,
          borderRadius: 1.5,
          cursor: 'pointer',
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          backgroundColor: isActive ? theme.palette.action.selected : 'transparent',
          transition: 'transform 0.2s ease',
          '&:hover .delete-btn': { opacity: 1 },
        }}
        onClick={handleClick}
      >
        <QuestionAnswerOutlinedIcon
          sx={{
            fontSize: 16,
            color: isActive ? theme.palette.text.primary : theme.palette.text.secondary,
            mr: isCollapsed ? 0 : 1.5,
            flexShrink: 0,
            transition: theme.transitions.create('margin', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
          }}
        />
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            opacity: isCollapsed ? 0 : 1,
            width: isCollapsed ? 0 : 'auto',
            overflow: 'hidden',
            ...getCollapseTransition(['opacity', 'width']),
          }}
        >
          <Typography
            variant="body2"
            noWrap
            sx={{
              color: isActive ? theme.palette.text.primary : theme.palette.text.secondary,
              fontWeight: isActive ? 500 : 400,
            }}
          >
            {conv.title || 'New Conversation'}
          </Typography>
        </Box>
        <IconButton
          className="delete-btn"
          size="small"
          onClick={handleDelete}
          sx={{
            opacity: 0,
            ml: 0.5,
            padding: 0.5,
            color: theme.palette.text.secondary,
            transition: 'opacity 0.15s ease',
            '&:hover': {
              color: theme.palette.error.main,
              backgroundColor: alpha(theme.palette.error.main, 0.1),
            },
          }}
        >
          <DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>
    </Tooltip>
  );
});

/**
 * Memoized history popover item
 */
const HistoryPopoverItem = memo(function HistoryPopoverItem({
  conv,
  isActive,
  onSelect,
  onDelete,
  onClosePopover,
  theme,
}) {
  const handleClick = useCallback(() => {
    onClosePopover();
    onSelect(conv.id);
  }, [onClosePopover, onSelect, conv.id]);

  const handleDelete = useCallback((e) => {
    e.stopPropagation();
    onDelete(conv.id);
  }, [onDelete, conv.id]);

  return (
    <ListItemButton
      selected={isActive}
      onClick={handleClick}
      sx={{ borderRadius: 1, py: 0.75 }}
    >
      <ListItemIcon sx={{ minWidth: 28 }}>
        {isActive ? (
          <CheckCircleOutlineRoundedIcon sx={{ fontSize: 16, color: theme.palette.primary.main }} />
        ) : (
          <QuestionAnswerOutlinedIcon sx={{ fontSize: 14, color: theme.palette.text.secondary }} />
        )}
      </ListItemIcon>
      <ListItemText
        primary={conv.title || 'New Conversation'}
        primaryTypographyProps={{
          variant: 'body2',
          noWrap: true,
          sx: { fontWeight: isActive ? 500 : 400 },
        }}
      />
      <IconButton
        size="small"
        onClick={handleDelete}
        sx={{
          opacity: 0.5,
          '&:hover': { opacity: 1 },
          padding: 0.5,
          color: theme.palette.text.secondary,
          transition: 'opacity 0.15s ease',
        }}
      >
        <DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} />
      </IconButton>
    </ListItemButton>
  );
});

// ============================================================================
// MAIN SIDEBAR COMPONENT
// ============================================================================
function Sidebar({
  conversations = [],
  currentConversationId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  isConnected,
  currentDatabase,
  availableDatabases = [],
  onOpenDbModal,
  onDatabaseSwitch,
  isCollapsed = false,
  onToggleCollapse,
  user = null,
  onMenuOpen,
  mobileOpen = false,
  onMobileClose,
}) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Local state
  const [dbPopoverAnchor, setDbPopoverAnchor] = useState(null);
  const [historyPopoverAnchor, setHistoryPopoverAnchor] = useState(null);
  const [mindmapOpen, setMindmapOpen] = useState(false);
  const [schemaData, setSchemaData] = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  // Refs
  const profileButtonRef = useRef(null);
  const historyButtonRef = useRef(null);

  // Derived state
  const isPopoverOpen = Boolean(dbPopoverAnchor);
  const isHistoryPopoverOpen = Boolean(historyPopoverAnchor);

  // ============================================================================
  // MEMOIZED STYLE HELPERS
  // ============================================================================
  const getCollapseTransition = useCallback((properties) => ({
    transition: theme.transitions.create(properties, {
      easing: theme.transitions.easing.sharp,
      duration: isCollapsed
        ? theme.transitions.duration.leavingScreen
        : theme.transitions.duration.enteringScreen,
    }),
  }), [theme, isCollapsed]);

  const collapsedHiddenStyles = useMemo(() => ({
    opacity: isCollapsed ? 0 : 1,
    visibility: isCollapsed ? 'hidden' : 'visible',
    width: isCollapsed ? 0 : 'auto',
    overflow: 'hidden',
    transition: theme.transitions.create(['opacity', 'visibility', 'width'], {
      easing: theme.transitions.easing.sharp,
      duration: isCollapsed
        ? theme.transitions.duration.leavingScreen
        : theme.transitions.duration.enteringScreen,
    }),
  }), [isCollapsed, theme]);

  const scrollbarStyles = useMemo(() => ({
    '&::-webkit-scrollbar': { width: 4 },
    '&::-webkit-scrollbar-track': { background: 'transparent' },
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: alpha(theme.palette.text.secondary, 0.15),
      borderRadius: 2,
      '&:hover': {
        backgroundColor: alpha(theme.palette.text.secondary, 0.25),
      },
    },
  }), [theme]);

  // ============================================================================
  // MEMOIZED EVENT HANDLERS
  // ============================================================================
  const handleDatabaseSelect = useCallback((dbName) => {
    setDbPopoverAnchor(null);
    if (dbName !== currentDatabase) {
      onDatabaseSwitch?.(dbName);
    }
  }, [currentDatabase, onDatabaseSwitch]);

  const handleHistoryClick = useCallback(() => {
    if (isCollapsed && conversations.length > 0 && historyButtonRef.current) {
      setHistoryPopoverAnchor(historyButtonRef.current);
    }
  }, [isCollapsed, conversations.length]);

  const handleOpenMindmap = useCallback(async () => {
    if (!isConnected || !currentDatabase) return;

    setMindmapOpen(true);
    setSchemaLoading(true);

    try {
      const data = await getUserContext();
      if (data.status === 'success') {
        const currentSchema = data.schemas?.find(s => s.database === currentDatabase);
        setSchemaData(currentSchema || null);
      }
    } catch (err) {
      console.error('Failed to fetch schema:', err);
    } finally {
      setSchemaLoading(false);
    }
  }, [isConnected, currentDatabase]);

  const handleCloseMindmap = useCallback(() => setMindmapOpen(false), []);
  const handleCloseDbPopover = useCallback(() => setDbPopoverAnchor(null), []);
  const handleCloseHistoryPopover = useCallback(() => setHistoryPopoverAnchor(null), []);

  const handleProfileClick = useCallback(() => {
    onMenuOpen({ currentTarget: profileButtonRef.current });
  }, [onMenuOpen]);

  const handleOpenNewConnection = useCallback(() => {
    setDbPopoverAnchor(null);
    onOpenDbModal?.();
  }, [onOpenDbModal]);

  // ============================================================================
  // MEMOIZED NAV ITEMS - Only recreate when dependencies change
  // ============================================================================
  const navItems = useMemo(() => [
    {
      icon: <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 20 }} />,
      label: 'New Chat',
      tooltip: 'New Chat',
      action: onNewChat,
    },
    {
      icon: <StorageOutlinedIcon sx={{ fontSize: 20 }} />,
      label: 'Database',
      tooltip: isConnected ? currentDatabase : 'Connect Database',
      action: onOpenDbModal,
    },
    ...(isConnected ? [{
      icon: <AccountTreeOutlinedIcon sx={{ fontSize: 20 }} />,
      label: 'Mindmap',
      tooltip: 'View Database Mindmap',
      action: handleOpenMindmap,
    }] : []),
    {
      icon: <HistoryOutlinedIcon sx={{ fontSize: 20 }} />,
      label: 'History',
      tooltip: 'History',
      isSection: !isCollapsed,
      action: isCollapsed ? handleHistoryClick : undefined,
    },
  ], [onNewChat, onOpenDbModal, isConnected, currentDatabase, isCollapsed, handleOpenMindmap, handleHistoryClick]);

  // ============================================================================
  // MEMOIZED GLASSMORPHISM STYLES FOR MOBILE
  // ============================================================================
  const mobileDrawerStyles = useMemo(() => ({
    '& .MuiDrawer-paper': {
      width: EXPANDED_WIDTH,
      height: '100%',
      borderRadius: 0,  // No rounded corners for sidebar
      ...getGlassmorphismStyles(theme, isDarkMode),
      borderRight: '1px solid',
      borderColor: theme.palette.divider,
    },
  }), [theme, isDarkMode]);

  // ============================================================================
  // SIDEBAR CONTENT - Memoized to prevent unnecessary re-renders
  // ============================================================================
  const sidebarContent = useMemo(() => (
    <>
      {/* ===== TOP: Logo Area ===== */}
      <Box
        sx={{
          p: isCollapsed ? 0 : 2,
          py: isCollapsed ? 1.5 : 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          gap: isCollapsed ? 0 : 1.5,
          minHeight: 56,
          transition: theme.transitions.create(['padding', 'justify-content'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }}
      >
        <Box
          component="img"
          src="/product-logo.png"
          alt="Moonlit"
          sx={{ height: 24, width: 24, opacity: 0.95 }}
        />
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 600,
            color: theme.palette.text.primary,
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
            ...collapsedHiddenStyles,
          }}
        >
          Moonlit
        </Typography>
      </Box>

      {/* ===== NAVIGATION ITEMS ===== */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: isCollapsed ? 'center' : 'stretch',
          px: isCollapsed ? 0 : 1.5,
          py: 1,
          transition: theme.transitions.create('padding', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }}
      >
        {navItems.map((item, index) => (
          item.isSection ? (
            !isCollapsed && (
              <Typography
                key={index}
                variant="caption"
                color={theme.palette.text.secondary}
                sx={{ display: 'block', px: 1, pt: 2, pb: 0.5 }}
              >
                {item.label}
              </Typography>
            )
          ) : (
            <Tooltip key={index} title={isCollapsed ? item.tooltip : ''} placement="right" arrow>
              {isCollapsed ? (
                <IconButton
                  ref={item.label === 'History' ? historyButtonRef : undefined}
                  onClick={item.action}
                  size="small"
                  sx={{
                    mb: 0.5,
                    ...(item.label === 'Database' && isConnected && {
                      position: 'relative',
                      '&::after': {
                        content: '""',
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: theme.palette.success.main,
                      },
                    }),
                  }}
                >
                  {item.icon}
                </IconButton>
              ) : (
                <Box
                  ref={item.label === 'History' ? historyButtonRef : undefined}
                  onClick={item.action}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    width: '100%',
                    p: 1.25,
                    mb: 0.25,
                    borderRadius: 1.5,
                    cursor: 'pointer',
                    color: theme.palette.text.secondary,
                    transition: 'transform 0.2s ease',
                    '&:hover': {
                      backgroundColor: theme.palette.action.hover,
                      color: theme.palette.text.primary,
                    },
                    ...(item.label === 'Database' && isConnected && {
                      position: 'relative',
                      '&::after': {
                        content: '""',
                        position: 'absolute',
                        top: 10,
                        left: 28,
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: theme.palette.success.main,
                      },
                    }),
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20 }}>
                    {item.icon}
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 450, whiteSpace: 'nowrap' }}>
                    {item.label}
                  </Typography>
                </Box>
              )}
            </Tooltip>
          )
        ))}
      </Box>

      {/* ===== CONVERSATIONS LIST ===== */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            px: isCollapsed ? 0 : 1,
            py: 0.5,
            transition: theme.transitions.create('padding', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
            ...scrollbarStyles,
          }}
        >
          <Box
            sx={{
              opacity: isCollapsed ? 0 : 1,
              visibility: isCollapsed ? 'hidden' : 'visible',
              ...getCollapseTransition(['opacity', 'visibility']),
            }}
          >
            {conversations.length === 0 ? (
              <Box sx={{ p: 2, textAlign: 'center', opacity: 0.4 }}>
                <Typography variant="caption" color={theme.palette.text.secondary}>
                  No conversations yet
                </Typography>
              </Box>
            ) : (
              conversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  isActive={conv.id === currentConversationId}
                  isCollapsed={isCollapsed}
                  onSelect={onSelectConversation}
                  onDelete={onDeleteConversation}
                  theme={theme}
                  getCollapseTransition={getCollapseTransition}
                />
              ))
            )}
          </Box>
        </Box>
      </Box>

      {/* ===== BOTTOM: Profile + Collapse Toggle ===== */}
      <Box
        sx={{
          borderTop: '1px solid',
          borderColor: 'divider',
          p: isCollapsed ? 0.75 : 1,
          display: 'flex',
          flexDirection: isCollapsed ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          gap: isCollapsed ? 1 : 0,
          transition: theme.transitions.create(['padding', 'flex-direction', 'gap', 'justify-content'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }}
      >
        <Tooltip title={isCollapsed ? (user?.displayName || 'Profile') : ''} placement="right" arrow>
          <IconButton ref={profileButtonRef} onClick={handleProfileClick} size="small">
            {user?.photoURL ? (
              <Avatar src={user.photoURL} sx={{ width: 24, height: 24 }} />
            ) : (
              <AccountCircleOutlinedIcon sx={{ fontSize: 24 }} />
            )}
          </IconButton>
        </Tooltip>

        <Tooltip title={isMobile ? 'Close sidebar' : (isCollapsed ? 'Expand sidebar' : '')} placement="right" arrow>
          <IconButton onClick={isMobile ? onMobileClose : onToggleCollapse} size="small">
            {isMobile ? (
              <KeyboardDoubleArrowLeftRoundedIcon sx={{ fontSize: 20 }} />
            ) : isCollapsed ? (
              <KeyboardDoubleArrowRightRoundedIcon sx={{ fontSize: 20 }} />
            ) : (
              <KeyboardDoubleArrowLeftRoundedIcon sx={{ fontSize: 20 }} />
            )}
          </IconButton>
        </Tooltip>
      </Box>
    </>
  ), [
    isCollapsed, theme, collapsedHiddenStyles, navItems, isConnected,
    scrollbarStyles, getCollapseTransition, conversations, currentConversationId,
    onSelectConversation, onDeleteConversation, user, handleProfileClick,
    isMobile, onMobileClose, onToggleCollapse,
  ]);

  // ============================================================================
  // POPOVERS - Rendered outside sidebarContent to avoid memoization issues
  // ============================================================================
  const popovers = (
    <>
      {/* Database Switcher Popover */}
      <Popover
        open={isPopoverOpen}
        anchorEl={dbPopoverAnchor}
        onClose={handleCloseDbPopover}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { mt: 1, minWidth: 200, maxHeight: 300, overflow: 'auto' } }}
      >
        <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="overline" color={theme.palette.text.secondary}>
            Switch Database
          </Typography>
        </Box>
        <List dense sx={{ p: 0.5 }}>
          {availableDatabases.map((db) => (
            <ListItemButton
              key={db}
              selected={db === currentDatabase}
              onClick={() => handleDatabaseSelect(db)}
              sx={{ borderRadius: 1, py: 0.75 }}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>
                {db === currentDatabase ? (
                  <CheckCircleOutlineRoundedIcon sx={{ fontSize: 16, color: theme.palette.success.main }} />
                ) : (
                  <StorageOutlinedIcon sx={{ fontSize: 14, color: theme.palette.text.secondary }} />
                )}
              </ListItemIcon>
              <ListItemText primary={db} primaryTypographyProps={{ variant: 'body2' }} />
            </ListItemButton>
          ))}
          <Divider sx={{ my: 0.5 }} />
          <ListItemButton onClick={handleOpenNewConnection} sx={{ borderRadius: 1, py: 0.75 }}>
            <ListItemIcon sx={{ minWidth: 28 }}>
              <AddCircleOutlineRoundedIcon sx={{ fontSize: 16, color: theme.palette.primary.main }} />
            </ListItemIcon>
            <ListItemText
              primary="New Connection"
              primaryTypographyProps={{ variant: 'body2', color: theme.palette.primary.main }}
            />
          </ListItemButton>
        </List>
      </Popover>

      {/* History Popover */}
      <Popover
        open={isHistoryPopoverOpen}
        anchorEl={historyPopoverAnchor}
        onClose={handleCloseHistoryPopover}
        anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
        transformOrigin={{ vertical: 'center', horizontal: 'left' }}
        PaperProps={{ sx: { ml: 1, minWidth: 240, maxWidth: 320, maxHeight: 400, overflow: 'auto' } }}
      >
        <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="overline" color="text.secondary">
            Conversation History
          </Typography>
        </Box>
        <List dense sx={{ p: 0.5 }}>
          {conversations.length === 0 ? (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                No conversations yet
              </Typography>
            </Box>
          ) : (
            conversations.map((conv) => (
              <HistoryPopoverItem
                key={conv.id}
                conv={conv}
                isActive={conv.id === currentConversationId}
                onSelect={onSelectConversation}
                onDelete={onDeleteConversation}
                onClosePopover={handleCloseHistoryPopover}
                theme={theme}
              />
            ))
          )}
        </List>
      </Popover>

      {/* Schema Mindmap Dialog */}
      <Dialog
        open={mindmapOpen}
        onClose={handleCloseMindmap}
        maxWidth="lg"
        fullWidth
        sx={{
          '& .MuiDialog-paper': {
            margin: { xs: 0, sm: 2 },
            width: { xs: '100%', sm: 'calc(100% - 32px)' },
            height: { xs: '100%', sm: '80vh' },
            maxHeight: { xs: '100%', sm: 700 },
            borderRadius: { xs: 0, sm: 2 },
          },
        }}
        PaperProps={{ sx: { bgcolor: 'background.paper', backgroundImage: 'none' } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <AccountTreeOutlinedIcon color="primary" />
            <Typography variant="h6" fontWeight={600}>
              Schema Mindmap
            </Typography>
            {currentDatabase && (
              <Chip
                size="small"
                icon={<StorageOutlinedIcon sx={{ fontSize: 14 }} />}
                label={currentDatabase}
                sx={{ ml: 1, display: { xs: 'none', sm: 'flex' } }}
              />
            )}
          </Box>
          <IconButton size="small" onClick={handleCloseMindmap} sx={{ color: theme.palette.text.secondary }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent
          sx={{
            p: { xs: 1, sm: 2 },
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            overflow: 'hidden',
            minHeight: 0, // Critical for flex children to shrink
          }}
        >
          {schemaLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
              <CircularProgress />
            </Box>
          ) : schemaData ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, mb: 1.5, flexShrink: 0 }}>
                Click on table nodes to expand/collapse columns. Use mouse to pan and scroll to zoom.
              </Typography>
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <SchemaFlowDiagram
                  database={schemaData.database}
                  tables={schemaData.tables || []}
                  columns={schemaData.columns || {}}
                />
              </Box>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
              <Typography color={theme.palette.text.secondary}>
                No schema data available. Connect to a database first.
              </Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </>
  );

  // ============================================================================
  // RENDER
  // ============================================================================
  if (isMobile) {
    return (
      <>
        <SwipeableDrawer
          variant="temporary"
          open={mobileOpen}
          onClose={onMobileClose}
          onOpen={() => { }}
          disableSwipeToOpen
          ModalProps={{ keepMounted: true }}
          sx={mobileDrawerStyles}
        >
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {sidebarContent}
          </Box>
        </SwipeableDrawer>
        {popovers}
      </>
    );
  }

  return (
    <>
      <StyledDrawer
        variant="permanent"
        open={!isCollapsed}
        isDarkMode={isDarkMode}
        PaperProps={{ sx: CONTENT_CONTAINER_STYLES }}
      >
        {sidebarContent}
      </StyledDrawer>
      {popovers}
    </>
  );
}

// ============================================================================
// CUSTOM MEMO COMPARISON - Prevents unnecessary re-renders
// ============================================================================
function arePropsEqual(prevProps, nextProps) {
  // Fast path: check primitives first
  if (prevProps.currentConversationId !== nextProps.currentConversationId) return false;
  if (prevProps.isConnected !== nextProps.isConnected) return false;
  if (prevProps.currentDatabase !== nextProps.currentDatabase) return false;
  if (prevProps.isCollapsed !== nextProps.isCollapsed) return false;
  if (prevProps.mobileOpen !== nextProps.mobileOpen) return false;

  // Check array lengths (shallow comparison for performance)
  if (prevProps.conversations?.length !== nextProps.conversations?.length) return false;
  if (prevProps.availableDatabases?.length !== nextProps.availableDatabases?.length) return false;

  // Check user object (only care about display-relevant fields)
  if (prevProps.user?.photoURL !== nextProps.user?.photoURL) return false;
  if (prevProps.user?.displayName !== nextProps.user?.displayName) return false;

  // Check conversation IDs changed (detect reordering or ID changes)
  const prevIds = prevProps.conversations?.map(c => c.id).join(',') ?? '';
  const nextIds = nextProps.conversations?.map(c => c.id).join(',') ?? '';
  if (prevIds !== nextIds) return false;

  // Check conversation titles changed
  const prevTitles = prevProps.conversations?.map(c => c.title).join(',') ?? '';
  const nextTitles = nextProps.conversations?.map(c => c.title).join(',') ?? '';
  if (prevTitles !== nextTitles) return false;

  // Check database list changed
  const prevDbs = prevProps.availableDatabases?.join(',') ?? '';
  const nextDbs = nextProps.availableDatabases?.join(',') ?? '';
  if (prevDbs !== nextDbs) return false;

  return true;
}

export default memo(Sidebar, arePropsEqual);
