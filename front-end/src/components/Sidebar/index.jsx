import { useState, memo, useCallback, useMemo, useEffect } from 'react';
import {
  Box,
  Typography,
  Tooltip,
  List,
  Avatar,
  Drawer,
  ListItemButton,
  useMediaQuery,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { getUserContext } from '../../api';
import { getScrollbarStyles } from '../../styles/shared';
import logger from '../../utils/logger';
import {
  ConversationItem,
  SidebarNavItem,
  HistoryListSkeleton,
} from './SidebarPrimitives';
import SidebarOverlays from './SidebarOverlays';
import {
  StyledDesktopSidebarPanel,
  buildMobileDrawerPaperStyles,
} from './sidebarStyles';

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
  const isPopoverOpen = Boolean(dbPopoverAnchor);
  const isHistoryPopoverOpen = Boolean(historyPopoverAnchor);
  const scrollbarStyles = useMemo(() => getScrollbarStyles(theme), [theme]);
  const mobileDrawerPaperStyles = useMemo(
    () => buildMobileDrawerPaperStyles(theme),
    [theme],
  );
  const userInitials = useMemo(() => {
    const name = user?.displayName?.trim();
    if (!name) return 'M';
    const parts = name.split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'M';
  }, [user?.displayName]);

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
    if ((isMobile && !mobileOpen) || (!isMobile && !open)) {
      setDbPopoverAnchor(null);
      setHistoryPopoverAnchor(null);
    }
  }, [isMobile, mobileOpen, open]);

  const primaryNavItems = useMemo(() => {
    const items = [
      {
        id: 'new-chat',
        label: 'New chat',
        tooltip: 'New chat',
        icon: <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 18 }} />,
        onClick: () => onNewChat?.(),
      },
      {
        id: 'database',
        label: 'Database',
        tooltip: isConnected ? (currentDatabase || 'Connected database') : 'Connect database',
        icon: <StorageOutlinedIcon sx={{ fontSize: 18 }} />,
        onClick: handleDatabaseAction,
        showStatus: isConnected,
      },
    ];

    if (isConnected) {
      items.push({
        id: 'mindmap',
        label: 'Mindmap',
        tooltip: 'View database mindmap',
        icon: <AccountTreeOutlinedIcon sx={{ fontSize: 18 }} />,
        onClick: () => handleOpenMindmap(),
      });
    }

    return items;
  }, [onNewChat, isConnected, currentDatabase, handleDatabaseAction, handleOpenMindmap]);

  const railNavItems = useMemo(
    () => [
      ...primaryNavItems,
      {
        id: 'history',
        label: 'History',
        tooltip: 'Recent chats',
        icon: <HistoryOutlinedIcon sx={{ fontSize: 18 }} />,
        onClick: handleHistoryClick,
        disabled: conversations.length === 0,
      },
    ],
    [conversations.length, handleHistoryClick, primaryNavItems],
  );

  // FIX 1: renderHeader — always 'row', never flips flexDirection.
  // Title uses opacity + maxWidth transition instead of conditional mount/unmount.
  // Stable minHeight prevents height jitter during transition.
  const renderHeader = ({ collapsed = false, mobile = false } = {}) => {
    const toggleLabel = mobile
      ? 'Close sidebar'
      : collapsed
        ? 'Expand sidebar'
        : 'Collapse sidebar';

    return (
      <Box
        sx={{
          px: 1.25,
          pt: 1.25,
          pb: 1,
          minHeight: 52,
          display: 'flex',
          flexDirection: 'row',        // FIXED: never flips — flexDirection is not CSS-animatable
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 1,
        }}
      >
        <Tooltip title={toggleLabel} placement="right" arrow>
          <Box
            component="button"
            type="button"
            onClick={mobile ? onMobileClose : onToggleOpen}
            aria-label={toggleLabel}
            sx={{
              width: 36,
              height: 36,
              p: 0,
              border: 'none',
              outline: 'none',
              appearance: 'none',
              borderRadius: '10px',
              backgroundColor: 'transparent',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'inherit',
              flexShrink: 0,
              WebkitTapHighlightColor: 'transparent',
              transition: theme.transitions.create('background-color', {
                easing: theme.transitions.easing.easeInOut,
                duration: theme.transitions.duration.shorter,
              }),
              '&:hover': {
                backgroundColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.08 : 0.06),
              },
              '&:focus-visible': {
                boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.28)}`,
              },
            }}
          >
            <Box
              component="img"
              src="/product-logo.png"
              alt="Moonlit"
              sx={{
                width: 22,
                height: 22,
                flexShrink: 0,
                opacity: 0.95,
                display: 'block',
              }}
            />
          </Box>
        </Tooltip>

        {/* FIXED: always mounted, fades + shrinks instead of unmounting */}
        <Box
          sx={{
            flex: '1 1 auto',
            minWidth: 0,
            maxWidth: collapsed ? 0 : 160,
            opacity: collapsed ? 0 : 1,
            overflow: 'hidden',
            transition: theme.transitions.create(['max-width', 'opacity'], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.shorter,
            }),
          }}
        >
          <Typography
            noWrap
            sx={{
              fontSize: '0.95rem',
              fontWeight: 600,
              lineHeight: 1.2,
              color: 'text.primary',
            }}
          >
            Moonlit
          </Typography>
        </Box>
      </Box>
    );
  };

  const renderNavigation = (items, collapsed) => (
    <Box sx={{ px: 0.25, py: 0.25 }}>
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
            disabled={item.disabled}
          />
        ))}
      </List>
    </Box>
  );

  const renderHistorySection = () => (
    <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display: 'block',
          px: 2,
          pt: 1.5,
          pb: 0.75,
          fontSize: '0.7rem',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        Recent chats
      </Typography>
      <List
        dense
        disablePadding
        sx={{
          px: 0.75,
          pb: 0.75,
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          ...scrollbarStyles,
        }}
      >
        {isConversationsLoading ? (
          <HistoryListSkeleton />
        ) : conversations.length === 0 ? (
          <Box sx={{ px: 1.5, py: 2, opacity: 0.6 }}>
            <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', lineHeight: 1.4 }}>
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

  // FIX 2: renderFooter — Avatar is a stable 30px (no size jump during transition).
  // Label + chevron always mounted, fades + shrinks instead of unmounting.
  const renderFooter = ({ collapsed = false } = {}) => {
    const profileTooltipTitle = collapsed ? (user?.displayName || 'Profile') : '';

    return (
      <Box
        sx={{
          borderTop: `1px solid ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.08 : 0.06)}`,
          px: 0.75,
          py: 0.75,
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
          <ListItemButton
            onClick={handleProfileClick}
            aria-label="Open profile menu"
            sx={{
              minHeight: collapsed ? 40 : 44,
              px: collapsed ? 0.5 : 1,
              py: collapsed ? 0.5 : 0.75,
              borderRadius: '12px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: collapsed ? 0 : 1,
            }}
          >
            {/* FIXED: stable 30px — no size reflow during collapse animation */}
            {user?.photoURL ? (
              <Avatar src={user.photoURL} sx={{ width: 30, height: 30, flexShrink: 0 }} />
            ) : (
              <Avatar sx={{ width: 30, height: 30, flexShrink: 0, fontSize: '0.78rem', fontWeight: 600 }}>
                {userInitials}
              </Avatar>
            )}

            {/* FIXED: always mounted, fades + shrinks */}
            <Box
              sx={{
                flex: '1 1 auto',
                minWidth: 0,
                maxWidth: collapsed ? 0 : 200,
                opacity: collapsed ? 0 : 1,
                overflow: 'hidden',
                transition: theme.transitions.create(['max-width', 'opacity'], {
                  easing: theme.transitions.easing.sharp,
                  duration: theme.transitions.duration.shorter,
                }),
              }}
            >
              <Typography noWrap sx={{ fontSize: '0.86rem', fontWeight: 500, lineHeight: 1.2, color: 'text.primary' }}>
                {user?.displayName || 'Profile'}
              </Typography>
              <Typography noWrap sx={{ fontSize: '0.72rem', lineHeight: 1.2, color: 'text.secondary', mt: 0.2 }}>
                Settings
              </Typography>
            </Box>

            {/* FIXED: chevron always mounted, fades out */}
            <Box
              sx={{
                maxWidth: collapsed ? 0 : 24,
                opacity: collapsed ? 0 : 1,
                overflow: 'hidden',
                flexShrink: 0,
                transition: theme.transitions.create(['max-width', 'opacity'], {
                  easing: theme.transitions.easing.sharp,
                  duration: theme.transitions.duration.shorter,
                }),
              }}
            >
              <ExpandMoreRoundedIcon sx={{ fontSize: 18, color: 'text.secondary', display: 'block' }} />
            </Box>
          </ListItemButton>
        </Tooltip>
      </Box>
    );
  };

  const expandedSidebarContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {renderHeader({ mobile: isMobile })}
      {renderNavigation(primaryNavItems, false)}
      {renderHistorySection()}
      {renderFooter()}
    </Box>
  );

  // FIX 3: desktopSidebarContent — history section and collapsed history icon are BOTH
  // always mounted inside a stable flex:1 container. They crossfade via opacity + visibility
  // instead of unmounting and remounting, which was the primary cause of layout jitter.
  const desktopSidebarContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {renderHeader({ collapsed: !open })}
      {renderNavigation(primaryNavItems, !open)}

      <Box sx={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {/* Expanded: full history list — always mounted, hidden when collapsed */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            opacity: open ? 1 : 0,
            visibility: open ? 'visible' : 'hidden',
            transition: theme.transitions.create('opacity', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.shorter,
            }),
          }}
        >
          {renderHistorySection()}
        </Box>

        {/* Collapsed: history icon — always mounted, hidden when expanded */}
        <Box
          sx={{
            px: 0.25,
            py: 0.25,
            opacity: open ? 0 : 1,
            visibility: open ? 'hidden' : 'visible',
            transition: theme.transitions.create('opacity', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.shorter,
            }),
          }}
        >
          <List disablePadding>
            <SidebarNavItem
              label="History"
              tooltip="Recent chats"
              icon={<HistoryOutlinedIcon sx={{ fontSize: 18 }} />}
              onClick={handleHistoryClick}
              isCollapsed
              disabled={conversations.length === 0}
            />
          </List>
        </Box>
      </Box>

      {renderFooter({ collapsed: !open })}
    </Box>
  );

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
      <StyledDesktopSidebarPanel variant="permanent" open={open}>
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