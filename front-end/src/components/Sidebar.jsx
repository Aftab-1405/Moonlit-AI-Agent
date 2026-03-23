import { useState, memo, useCallback, useMemo, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  List,
  Avatar,
  Drawer,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import KeyboardDoubleArrowLeftRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowLeftRounded';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import { getUserContext } from '../api';
import { getScrollbarStyles } from '../styles/shared';
import logger from '../utils/logger';
import {
  ConversationItem,
  SidebarNavItem,
  HistoryListSkeleton,
} from './sidebar/SidebarPrimitives';
import SidebarOverlays from './sidebar/SidebarOverlays';
import {
  StyledDesktopSidebarPanel,
  buildMobileDrawerPaperStyles,
} from './sidebar/sidebarStyles';

const MOBILE_DRAWER_SLIDE_PROPS = {
  mountOnEnter: true,
  unmountOnExit: true,
};

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

  const [dbPopoverAnchor, setDbPopoverAnchor] = useState(null);
  const [historyPopoverAnchor, setHistoryPopoverAnchor] = useState(null);
  const [mindmapOpen, setMindmapOpen] = useState(false);
  const [schemaData, setSchemaData] = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [showExpandedDesktopContent, setShowExpandedDesktopContent] = useState(open);

  const isPopoverOpen = Boolean(dbPopoverAnchor);
  const isHistoryPopoverOpen = Boolean(historyPopoverAnchor);
  const desktopUsesExpandedContent = open || showExpandedDesktopContent;

  const scrollbarStyles = useMemo(() => getScrollbarStyles(theme), [theme]);

  const mobileDrawerPaperStyles = useMemo(
    () => buildMobileDrawerPaperStyles(theme),
    [theme],
  );

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
        const currentSchema = data.schemas?.find((schema) => schema.database === currentDatabase);
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
  const handleProfileClick = useCallback((event) => onMenuOpen?.(event), [onMenuOpen]);
  const handleOpenNewConnection = useCallback(() => {
    setDbPopoverAnchor(null);
    onOpenDbModal?.();
  }, [onOpenDbModal]);

  useEffect(() => {
    if (open) {
      setShowExpandedDesktopContent(true);
    }
  }, [open]);

  useEffect(() => {
    if ((isMobile && !mobileOpen) || (!isMobile && !open)) {
      setDbPopoverAnchor(null);
      setHistoryPopoverAnchor(null);
    }
  }, [isMobile, mobileOpen, open]);

  const handleDesktopTransitionEnd = useCallback((event) => {
    if (event.target !== event.currentTarget || event.propertyName !== 'width' || open) {
      return;
    }
    setShowExpandedDesktopContent(false);
  }, [open]);

  const primaryNavItems = useMemo(() => {
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

    return items;
  }, [
    onNewChat,
    isConnected,
    currentDatabase,
    handleDatabaseAction,
    handleOpenMindmap,
  ]);

  const railNavItems = useMemo(
    () => [
      ...primaryNavItems,
      {
        id: 'history',
        label: 'History',
        tooltip: 'Conversation history',
        icon: <HistoryOutlinedIcon sx={{ fontSize: 20 }} />,
        onClick: handleHistoryClick,
        disabled: conversations.length === 0,
      },
    ],
    [conversations.length, handleHistoryClick, primaryNavItems],
  );

  const renderHeader = (collapsed) => (
    <Box
      sx={{
        px: 1,
        py: { xs: 1, sm: 1.5 },
        minHeight: { xs: 48, sm: 56 },
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box
          component="img"
          src="/product-logo.png"
          alt="Moonlit"
          sx={{
            width: 24,
            height: 24,
            opacity: 0.95,
          }}
        />
      </Box>
      {!collapsed && (
        <Typography
          variant="subtitle1"
          sx={{
            ml: 0.5,
            ...theme.typography.uiSidebarWordmark,
            color: 'text.primary',
          }}
        >
          Moonlit
        </Typography>
      )}
    </Box>
  );

  const renderNavigation = (items, collapsed, disabled = false) => (
    <Box sx={{ px: 0.5, py: 0.75 }}>
      <List disablePadding>
        {items.map((item) => (
          <SidebarNavItem
            key={item.id}
            label={item.label}
            tooltip={item.tooltip}
            icon={item.icon}
            onClick={item.onClick}
            isCollapsed={collapsed}
            showStatus={item.showStatus}
            disabled={disabled || item.disabled}
          />
        ))}
      </List>
    </Box>
  );

  const renderHistorySection = () => (
    <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2.5, pt: 1.5, pb: 0.75 }}>
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
    </Box>
  );

  const renderFooter = ({ collapsed = false, disabled = false, mobile = false } = {}) => {
    const profileTooltipTitle = collapsed ? (user?.displayName || 'Profile') : '';
    const toggleTooltipTitle = collapsed ? 'Expand sidebar' : '';
    const toggleAriaLabel = mobile
      ? 'Close sidebar'
      : collapsed
        ? 'Expand sidebar'
        : 'Collapse sidebar';

    return (
      <Box
        sx={{
          borderTop: '1px solid',
          borderColor: 'divider',
          p: 1,
          display: 'flex',
          flexDirection: collapsed ? 'column' : 'row',
          alignItems: collapsed ? 'flex-start' : 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: collapsed ? 0.5 : 0,
        }}
      >
        <Tooltip
          title={profileTooltipTitle}
          placement="right"
          arrow
          disableHoverListener={!profileTooltipTitle}
          disableFocusListener={!profileTooltipTitle}
          disableTouchListener={!profileTooltipTitle}
        >
          <Box>
            <IconButton
              onClick={handleProfileClick}
              disabled={disabled}
              size="small"
              aria-label="Open profile menu"
              sx={{ width: 44, height: 44 }}
            >
              {user?.photoURL ? (
                <Avatar src={user.photoURL} sx={{ width: 24, height: 24 }} />
              ) : (
                <AccountCircleOutlinedIcon sx={{ fontSize: 24 }} />
              )}
            </IconButton>
          </Box>
        </Tooltip>

        <Tooltip
          title={toggleTooltipTitle}
          placement="right"
          arrow
          disableHoverListener={!toggleTooltipTitle}
          disableFocusListener={!toggleTooltipTitle}
          disableTouchListener={!toggleTooltipTitle}
        >
          <Box>
            <IconButton
              onClick={mobile ? onMobileClose : onToggleOpen}
              disabled={disabled}
              size="small"
              aria-label={toggleAriaLabel}
              sx={{ width: 44, height: 44 }}
            >
              <KeyboardDoubleArrowLeftRoundedIcon
                sx={{
                  fontSize: 20,
                  transform: mobile ? 'none' : (collapsed ? 'rotate(180deg)' : 'rotate(0deg)'),
                  transition: theme.transitions.create('transform', {
                    easing: theme.transitions.easing.sharp,
                    duration: collapsed
                      ? theme.transitions.duration.leavingScreen
                      : theme.transitions.duration.enteringScreen,
                  }),
                }}
              />
            </IconButton>
          </Box>
        </Tooltip>
      </Box>
    );
  };

  const expandedSidebarContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {renderHeader(false)}
      {renderNavigation(primaryNavItems, false)}
      {renderHistorySection()}
      {renderFooter({ mobile: isMobile })}
    </Box>
  );

  const collapsedRailContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {renderHeader(true)}
      {renderNavigation(railNavItems, true)}
      <Box sx={{ flex: 1, minHeight: 0 }} />
      {renderFooter({ collapsed: true })}
    </Box>
  );

  const desktopSidebarContent = desktopUsesExpandedContent
    ? expandedSidebarContent
    : collapsedRailContent;

  if (isMobile) {
    return (
      <>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={onMobileClose}
          SlideProps={MOBILE_DRAWER_SLIDE_PROPS}
          PaperProps={{ sx: mobileDrawerPaperStyles }}
        >
          {expandedSidebarContent}
        </Drawer>
        <SidebarOverlays
          theme={theme}
          isPopoverOpen={isPopoverOpen}
          dbPopoverAnchor={dbPopoverAnchor}
          handleCloseDbPopover={handleCloseDbPopover}
          availableDatabases={availableDatabases}
          currentDatabase={currentDatabase}
          handleDatabaseSelect={handleDatabaseSelect}
          handleOpenNewConnection={handleOpenNewConnection}
          isHistoryPopoverOpen={isHistoryPopoverOpen}
          historyPopoverAnchor={historyPopoverAnchor}
          handleCloseHistoryPopover={handleCloseHistoryPopover}
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelectConversation={onSelectConversation}
          onDeleteConversation={onDeleteConversation}
          mindmapOpen={mindmapOpen}
          handleCloseMindmap={handleCloseMindmap}
          schemaLoading={schemaLoading}
          schemaData={schemaData}
        />
      </>
    );
  }

  return (
    <>
      <StyledDesktopSidebarPanel open={open} onTransitionEnd={handleDesktopTransitionEnd}>
        {desktopSidebarContent}
      </StyledDesktopSidebarPanel>
      <SidebarOverlays
        theme={theme}
        isPopoverOpen={isPopoverOpen}
        dbPopoverAnchor={dbPopoverAnchor}
        handleCloseDbPopover={handleCloseDbPopover}
        availableDatabases={availableDatabases}
        currentDatabase={currentDatabase}
        handleDatabaseSelect={handleDatabaseSelect}
        handleOpenNewConnection={handleOpenNewConnection}
        isHistoryPopoverOpen={isHistoryPopoverOpen}
        historyPopoverAnchor={historyPopoverAnchor}
        handleCloseHistoryPopover={handleCloseHistoryPopover}
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={onSelectConversation}
        onDeleteConversation={onDeleteConversation}
        mindmapOpen={mindmapOpen}
        handleCloseMindmap={handleCloseMindmap}
        schemaLoading={schemaLoading}
        schemaData={schemaData}
      />
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
