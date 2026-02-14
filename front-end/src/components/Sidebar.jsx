import { useState, memo, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Divider,
  Popover,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Avatar,
  Drawer as MuiDrawer,
  Dialog,
  DialogTitle,
  DialogContent,
  Chip,
  CircularProgress,
  Skeleton,
  useMediaQuery,
} from '@mui/material';
import { styled, useTheme } from '@mui/material/styles';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import QuestionAnswerOutlinedIcon from '@mui/icons-material/QuestionAnswerOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import KeyboardDoubleArrowLeftRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowLeftRounded';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import CloseIcon from '@mui/icons-material/Close';
import SchemaFlowDiagram from './SchemaFlowDiagram';
import { getUserContext } from '../api';
import { getGlassmorphismStyles, getScrollbarStyles } from '../styles/shared';
import logger from '../utils/logger';
const EXPANDED_WIDTH = 260;
const COLLAPSED_WIDTH = 56;
const SIDEBAR_WIDTH_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const SIDEBAR_WIDTH_DURATION = 240;
const MOBILE_MEDIA_QUERY = '@media (max-width:899.95px)';
const TOUCH_DEVICE_QUERY = '@media (hover: none)';
const BACKDROP_FILTER_FALLBACK_QUERY =
  '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))';
const CONTENT_CONTAINER_STYLES = {
  position: 'relative',
  height: '100%',
  minHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
};
const openedMixin = (theme) => ({
  width: EXPANDED_WIDTH,
  transition: theme.transitions.create('width', {
    easing: SIDEBAR_WIDTH_EASING,
    duration: SIDEBAR_WIDTH_DURATION,
  }),
  willChange: 'width',
  overflowX: 'hidden',
  ...getGlassmorphismStyles(theme),
  [BACKDROP_FILTER_FALLBACK_QUERY]: {
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
  },
});

const closedMixin = (theme) => ({
  transition: theme.transitions.create('width', {
    easing: SIDEBAR_WIDTH_EASING,
    duration: SIDEBAR_WIDTH_DURATION,
  }),
  willChange: 'width',
  overflowX: 'hidden',
  width: COLLAPSED_WIDTH,
  ...getGlassmorphismStyles(theme),
  [BACKDROP_FILTER_FALLBACK_QUERY]: {
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
  },
});

const StyledDrawer = styled(MuiDrawer, {
  shouldForwardProp: (prop) => prop !== 'open',
})(({ theme, open }) => ({
  width: EXPANDED_WIDTH,
  height: '100%',
  flexShrink: 0,
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
  ...(open && {
    ...openedMixin(theme),
    '& .MuiDrawer-paper': {
      ...openedMixin(theme),
      borderRadius: 0,  // No rounded corners for sidebar
    },
  }),
  ...(!open && {
    ...closedMixin(theme),
    '& .MuiDrawer-paper': {
      ...closedMixin(theme),
      borderRadius: 0,  // No rounded corners for sidebar
    },
  }),
}));

/**
 * Memoized conversation list item - prevents re-render when other conversations change
 */
const ConversationItem = memo(function ConversationItem({
  conv,
  isActive,
  onSelect,
  onDelete,
}) {
  const theme = useTheme();

  const handleClick = useCallback(() => {
    onSelect(conv.id);
  }, [onSelect, conv.id]);

  const handleDelete = useCallback((e) => {
    e.stopPropagation();
    onDelete(conv.id);
  }, [onDelete, conv.id]);

  return (
    <ListItem disablePadding sx={{ mb: 0.25 }}>
      <ListItemButton
        selected={isActive}
        onClick={handleClick}
        sx={{
          px: 1.25,
          py: 1,
          borderRadius: 1.5,
          minHeight: 44,
          color: theme.palette.text.secondary,
          backgroundColor: 'transparent',
          '& .delete-btn': { opacity: 0 },
          '&:hover .delete-btn': { opacity: 1 },
          [TOUCH_DEVICE_QUERY]: {
            '& .delete-btn': { opacity: 1 },
          },
          '&:hover': {
            backgroundColor: theme.palette.action.hover,
            color: theme.palette.text.primary,
          },
          '&.Mui-selected': {
            backgroundColor: theme.palette.action.selected,
            color: theme.palette.text.primary,
          },
          '&.Mui-selected:hover': {
            backgroundColor: theme.palette.action.selected,
          },
        }}
      >
        <ListItemIcon
          sx={{
            minWidth: 0,
            mr: 1.5,
            color: 'inherit',
          }}
        >
          <QuestionAnswerOutlinedIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText
          primary={conv.title || 'New Conversation'}
          primaryTypographyProps={{
            variant: 'body2',
            noWrap: true,
            sx: { fontWeight: isActive ? 500 : 400 },
          }}
          sx={{ minWidth: 0, m: 0 }}
        />
        <IconButton
          className="delete-btn"
          size="small"
          onClick={handleDelete}
          aria-label="Delete conversation"
          sx={{
            ml: 0.5,
            p: 0.5,
            minWidth: { xs: 36, sm: 'auto' },
            minHeight: { xs: 36, sm: 'auto' },
            color: theme.palette.text.secondary,
            transition: 'opacity 0.15s ease',
          }}
        >
          <DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </ListItemButton>
    </ListItem>
  );
});

const SidebarNavItem = memo(function SidebarNavItem({
  label,
  tooltip,
  icon,
  onClick,
  isCollapsed,
  isActive = false,
  showStatus = false,
  disabled = false,
  collapsedTextStyles,
}) {
  const theme = useTheme();

  return (
    <Tooltip title={isCollapsed ? tooltip : ''} placement="right" arrow>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          mb: 0.25,
          px: 0.5,
        }}
      >
        <IconButton
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          size="small"
          sx={{
            color: isActive ? theme.palette.text.primary : theme.palette.text.secondary,
            position: 'relative',
            width: 44,
            height: 44,
            flexShrink: 0,
          }}
        >
          {icon}
          {showStatus && (
            <Box
              sx={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: theme.palette.success.main,
              }}
            />
          )}
        </IconButton>
        <Box sx={{ ml: 0.5, ...collapsedTextStyles }}>
          <Typography
            variant="body2"
            noWrap
            sx={{
              fontWeight: isActive ? 500 : 450,
              color: isActive ? theme.palette.text.primary : theme.palette.text.secondary,
            }}
          >
            {label}
          </Typography>
        </Box>
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
      sx={{ borderRadius: 1, py: 0.75, minHeight: { xs: 40, sm: 34 } }}
    >
      <ListItemIcon sx={{ minWidth: 28 }}>
        {isActive ? (
          <CheckCircleOutlineRoundedIcon sx={{ fontSize: 16, color: theme.palette.text.primary }} />
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
        aria-label="Delete conversation"
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

const HistoryListSkeleton = memo(function HistoryListSkeleton() {
  const skeletonRows = [0, 1, 2, 3, 4];
  return (
    <Box sx={{ px: 1, pb: 1 }}>
      {skeletonRows.map((row) => (
        <Box
          key={`history-skeleton-${row}`}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            px: 1.25,
            py: 1,
            mb: 0.25,
            minHeight: 44,
            borderRadius: 1.5,
          }}
        >
          <Skeleton variant="circular" width={16} height={16} />
          <Skeleton
            variant="rounded"
            sx={{
              width: `${92 - (row % 3) * 14}%`,
              maxWidth: 170,
              height: 14,
              borderRadius: 999,
            }}
          />
        </Box>
      ))}
    </Box>
  );
});

function Sidebar({
  conversations = [],
  isConversationsLoading = false,
  currentConversationId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  isConnected,
  currentDatabase,
  availableDatabases = [],
  onOpenDbModal,
  onDatabaseSwitch,
  open = true,
  onToggleOpen,
  user = null,
  onMenuOpen,
  mobileOpen = false,
  onMobileClose,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isCollapsed = !isMobile && !open;

  const [dbPopoverAnchor, setDbPopoverAnchor] = useState(null);
  const [historyPopoverAnchor, setHistoryPopoverAnchor] = useState(null);
  const [mindmapOpen, setMindmapOpen] = useState(false);
  const [schemaData, setSchemaData] = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  const isPopoverOpen = Boolean(dbPopoverAnchor);
  const isHistoryPopoverOpen = Boolean(historyPopoverAnchor);
  const collapsedTextStyles = useMemo(() => ({
    opacity: isCollapsed ? 0 : 1,
    clipPath: isCollapsed ? 'inset(0 100% 0 0)' : 'inset(0 0 0 0)',
    transform: isCollapsed ? 'translateX(-4px)' : 'translateX(0)',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    pointerEvents: isCollapsed ? 'none' : 'auto',
    transition: theme.transitions.create(['opacity', 'clip-path', 'transform'], {
      easing: SIDEBAR_WIDTH_EASING,
      duration: SIDEBAR_WIDTH_DURATION,
    }),
  }), [isCollapsed, theme]);

  const scrollbarStyles = useMemo(() => getScrollbarStyles(theme), [theme]);

  const mobileDrawerPaperStyles = useMemo(() => ({
    width: { xs: '90vw', sm: 320 },
    maxWidth: 320,
    height: '100dvh',
    '@supports not (height: 100dvh)': {
      height: '100vh',
    },
    paddingBottom: 'env(safe-area-inset-bottom)',
    borderRadius: 0,
    ...getGlassmorphismStyles(theme),
    [BACKDROP_FILTER_FALLBACK_QUERY]: {
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
    },
    [MOBILE_MEDIA_QUERY]: {
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
    },
  }), [theme]);

  const handleDatabaseSelect = useCallback((dbName) => {
    setDbPopoverAnchor(null);
    if (dbName !== currentDatabase) {
      onDatabaseSwitch?.(dbName);
    }
  }, [currentDatabase, onDatabaseSwitch]);

  const handleDatabaseAction = useCallback((event) => {
    if (isConnected && availableDatabases.length > 0) {
      setDbPopoverAnchor(event.currentTarget);
      return;
    }
    onOpenDbModal?.();
  }, [isConnected, availableDatabases.length, onOpenDbModal]);

  const handleHistoryClick = useCallback((event) => {
    if (conversations.length === 0) return;
    setHistoryPopoverAnchor(event.currentTarget);
  }, [conversations.length]);

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
      logger.error('Failed to fetch schema:', err);
    } finally {
      setSchemaLoading(false);
    }
  }, [isConnected, currentDatabase]);

  const handleCloseMindmap = useCallback(() => setMindmapOpen(false), []);
  const handleCloseDbPopover = useCallback(() => setDbPopoverAnchor(null), []);
  const handleCloseHistoryPopover = useCallback(() => setHistoryPopoverAnchor(null), []);

  const handleProfileClick = useCallback((event) => {
    onMenuOpen?.(event);
  }, [onMenuOpen]);

  const handleOpenNewConnection = useCallback(() => {
    setDbPopoverAnchor(null);
    onOpenDbModal?.();
  }, [onOpenDbModal]);

  const navItems = useMemo(() => {
    const items = [
      {
        id: 'new-chat',
        label: 'New Chat',
        tooltip: 'New chat',
        icon: <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 20 }} />,
        onClick: () => onNewChat?.(),
      },
      {
        id: 'database',
        label: 'Database',
        tooltip: isConnected ? (currentDatabase || 'Connected database') : 'Connect database',
        icon: <StorageOutlinedIcon sx={{ fontSize: 20 }} />,
        onClick: handleDatabaseAction,
        showStatus: isConnected,
      },
    ];

    if (isConnected) {
      items.push({
        id: 'mindmap',
        label: 'Mindmap',
        tooltip: 'View database mindmap',
        icon: <AccountTreeOutlinedIcon sx={{ fontSize: 20 }} />,
        onClick: () => handleOpenMindmap(),
      });
    }

    if (isCollapsed) {
      items.push({
        id: 'history',
        label: 'History',
        tooltip: 'Conversation history',
        icon: <HistoryOutlinedIcon sx={{ fontSize: 20 }} />,
        onClick: handleHistoryClick,
        disabled: conversations.length === 0,
      });
    }

    return items;
  }, [
    onNewChat,
    isConnected,
    currentDatabase,
    handleDatabaseAction,
    handleOpenMindmap,
    isCollapsed,
    handleHistoryClick,
    conversations.length,
  ]);

  const sidebarContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box
        sx={{
          px: { xs: 1.25, sm: 1.5 },
          py: { xs: 1, sm: 1.5 },
          minHeight: { xs: 48, sm: 56 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}
      >
        <Box
          component="img"
          src="/product-logo.png"
          alt="Moonlit"
          sx={{ width: 24, height: 24, flexShrink: 0, opacity: 0.95, ml: 0.25 }}
        />
        <Typography
          variant="subtitle1"
          sx={{
            ml: { xs: 1.25, sm: 1.5 },
            ...theme.typography.uiSidebarWordmark,
            color: 'text.primary',
            ...collapsedTextStyles,
          }}
        >
          Moonlit
        </Typography>
      </Box>
      <Box sx={{ px: 0.5, py: 0.75 }}>
        <List disablePadding>
          {navItems.map((item) => (
            <SidebarNavItem
              key={item.id}
              label={item.label}
              tooltip={item.tooltip}
              icon={item.icon}
              onClick={item.onClick}
              isCollapsed={isCollapsed}
              showStatus={item.showStatus}
              disabled={item.disabled}
              collapsedTextStyles={collapsedTextStyles}
            />
          ))}
        </List>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {!isCollapsed && (
          <>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', px: 2.5, pt: 1.5, pb: 0.75 }}
            >
              History
            </Typography>
            <List
              dense
              disablePadding
              sx={{
                px: 1,
                pb: 1,
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                ...scrollbarStyles,
              }}
            >
              {isConversationsLoading ? (
                <HistoryListSkeleton />
              ) : conversations.length === 0 ? (
                <Box sx={{ p: 2, textAlign: 'center', opacity: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    No conversations yet
                  </Typography>
                </Box>
              ) : (
                conversations.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conv={conv}
                    isActive={conv.id === currentConversationId}
                    onSelect={onSelectConversation}
                    onDelete={onDeleteConversation}
                  />
                ))
              )}
            </List>
          </>
        )}
      </Box>
      <Box
        sx={{
          borderTop: '1px solid',
          borderColor: 'divider',
          p: 1,
          display: 'flex',
          flexDirection: isCollapsed ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          gap: isCollapsed ? 0.5 : 0,
        }}
      >
        <Tooltip title={isCollapsed ? (user?.displayName || 'Profile') : ''} placement="right" arrow>
          <IconButton onClick={handleProfileClick} size="small" aria-label="Open profile menu" sx={{ width: 44, height: 44 }}>
            {user?.photoURL ? (
              <Avatar src={user.photoURL} sx={{ width: 24, height: 24 }} />
            ) : (
              <AccountCircleOutlinedIcon sx={{ fontSize: 24 }} />
            )}
          </IconButton>
        </Tooltip>

        <Tooltip title={isCollapsed ? 'Expand sidebar' : ''} placement="right" arrow>
          <IconButton
            onClick={isMobile ? onMobileClose : onToggleOpen}
            size="small"
            aria-label={isMobile ? 'Close sidebar' : (isCollapsed ? 'Expand sidebar' : 'Collapse sidebar')}
            sx={{ width: 44, height: 44 }}
          >
            <KeyboardDoubleArrowLeftRoundedIcon
              sx={{
                fontSize: 20,
                transform: isMobile ? 'none' : (isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)'),
                transition: theme.transitions.create('transform', {
                  easing: SIDEBAR_WIDTH_EASING,
                  duration: SIDEBAR_WIDTH_DURATION,
                }),
              }}
            />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
  const popovers = (
    <>
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
              sx={{ borderRadius: 1, py: 0.75, minHeight: { xs: 40, sm: 34 } }}
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
          <ListItemButton
            onClick={handleOpenNewConnection}
            sx={{ borderRadius: 1, py: 0.75, minHeight: { xs: 40, sm: 34 } }}
          >
            <ListItemIcon sx={{ minWidth: 28 }}>
              <AddCircleOutlineRoundedIcon sx={{ fontSize: 16, color: theme.palette.text.primary }} />
            </ListItemIcon>
            <ListItemText
              primary="New Connection"
              primaryTypographyProps={{ variant: 'body2', color: theme.palette.text.primary }}
            />
          </ListItemButton>
        </List>
      </Popover>
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
          <IconButton size="small" onClick={handleCloseMindmap} aria-label="Close schema mindmap" sx={{ color: theme.palette.text.secondary }}>
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
  if (isMobile) {
    return (
      <>
        <MuiDrawer
          variant="temporary"
          open={mobileOpen}
          onClose={onMobileClose}
          ModalProps={{ keepMounted: true }}
          PaperProps={{ sx: mobileDrawerPaperStyles }}
        >
          {sidebarContent}
        </MuiDrawer>
        {popovers}
      </>
    );
  }

  return (
    <>
      <StyledDrawer
        variant="permanent"
        open={open}
        PaperProps={{ sx: CONTENT_CONTAINER_STYLES }}
      >
        {sidebarContent}
      </StyledDrawer>
      {popovers}
    </>
  );
}
function areStringArraysEqual(prev = [], next = []) {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    if (prev[i] !== next[i]) return false;
  }
  return true;
}

function areConversationMetaEqual(prev = [], next = []) {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    if (prev[i]?.id !== next[i]?.id) return false;
    if (prev[i]?.title !== next[i]?.title) return false;
  }
  return true;
}

function arePropsEqual(prevProps, nextProps) {
  if (prevProps.currentConversationId !== nextProps.currentConversationId) return false;
  if (prevProps.isConnected !== nextProps.isConnected) return false;
  if (prevProps.isConversationsLoading !== nextProps.isConversationsLoading) return false;
  if (prevProps.currentDatabase !== nextProps.currentDatabase) return false;
  if (prevProps.open !== nextProps.open) return false;
  if (prevProps.mobileOpen !== nextProps.mobileOpen) return false;
  if (prevProps.onNewChat !== nextProps.onNewChat) return false;
  if (prevProps.onSelectConversation !== nextProps.onSelectConversation) return false;
  if (prevProps.onDeleteConversation !== nextProps.onDeleteConversation) return false;
  if (prevProps.onOpenDbModal !== nextProps.onOpenDbModal) return false;
  if (prevProps.onDatabaseSwitch !== nextProps.onDatabaseSwitch) return false;
  if (prevProps.onToggleOpen !== nextProps.onToggleOpen) return false;
  if (prevProps.onMenuOpen !== nextProps.onMenuOpen) return false;
  if (prevProps.onMobileClose !== nextProps.onMobileClose) return false;
  if (prevProps.user?.photoURL !== nextProps.user?.photoURL) return false;
  if (prevProps.user?.displayName !== nextProps.user?.displayName) return false;
  if (!areConversationMetaEqual(prevProps.conversations, nextProps.conversations)) return false;
  if (!areStringArraysEqual(prevProps.availableDatabases, nextProps.availableDatabases)) return false;
  return true;
}

export default memo(Sidebar, arePropsEqual);
