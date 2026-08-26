import { Avatar, Box, Collapse, Tooltip, Typography, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DatabaseIcon,
  MindmapIcon,
  NewChatIcon,
  RecentChatIcon,
  SearchIcon,
  SettingsIcon,
  SidebarPanelIcon,
} from '@/components/icons';
import { Drawer as CustomDrawer, DrawerContent, DrawerOverlay } from '@/components/ui/Drawer';
import SidebarOverlays from '@/features/sidebar-left/components/SidebarOverlays';
import {
  ConversationItem,
  HistoryListSkeleton,
  SidebarNavItem,
} from '@/features/sidebar-left/components/SidebarPrimitives';
import {
  getProfileControlGeometry,
  getProfileSettingsMode,
} from '@/features/sidebar-left/profileSettingsModel';
import {
  buildDesktopNavSx,
  buildMobileDrawerPaperStyles,
  buildNavRowSx,
  buildSidebarFooterSx,
  buildSidebarSectionLabelSx,
  getCollapsingLabelSx,
  getSidebarRailTooltipSlotProps,
  ICON_COL,
  ROW_PX,
} from '@/features/sidebar-left/styles/sidebarStyles';
import { getInteractionColors, getScrollbarStyles } from '@/styles/shared';

const EMPTY_INLINE_RENAME = Object.freeze({
  surface: null,
  conversationId: null,
  title: '',
  originalTitle: '',
  saving: false,
});

// ─── Main Sidebar component ───────────────────────────────────────────────────
//
// Layout ownership: AppShell owns the three-column layout, including the
// sidebar's column-width animation. The Sidebar feature fills its slot
// (100% × 100%) and paints no surface of its own — the column already did.
//
// On narrow viewports the Sidebar renders its own Drawer (portal-rendered)
// which still needs its own surface paint because it lives outside the
// column flow.
function Sidebar({
  conversations = [],
  isConversationsLoading = false,
  conversationListError = null,
  onRetryConversations,
  currentConversationId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  isConnected,
  currentDatabase,
  availableDatabases = [],
  onOpenDbModal,
  onOpenMindmap,
  onDatabaseSwitch,
  open = true,
  onToggleOpen,
  user = null,
  onProfileOpen,
  onOpenSettings,
  profileMenuOpen = false,
  mobileOpen = false,
  onMobileClose,
  onMobileExited,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const mobileCloseButtonRef = useRef(null);

  const [dbPopoverAnchor, setDbPopoverAnchor] = useState(null);
  const [historyPopoverAnchor, setHistoryPopoverAnchor] = useState(null);
  const [searchPopoverAnchor, setSearchPopoverAnchor] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentsCollapsed, setRecentsCollapsed] = useState(false);
  const [inlineRename, setInlineRename] = useState(EMPTY_INLINE_RENAME);
  const inlineRenameRef = useRef(EMPTY_INLINE_RENAME);

  const scrollbarStyles = useMemo(() => getScrollbarStyles(theme), [theme]);
  const neutralInteraction = useMemo(() => getInteractionColors(theme), [theme]);
  const mobileDrawerPaperStyles = useMemo(() => buildMobileDrawerPaperStyles(theme), [theme]);
  const desktopNavSx = useMemo(() => buildDesktopNavSx(theme), [theme]);
  const railTooltipSlotProps = useMemo(() => getSidebarRailTooltipSlotProps(theme), [theme]);

  const userInitials = useMemo(() => {
    const name = user?.displayName?.trim();
    if (!name) return 'M';
    const parts = name.split(/\s+/).filter(Boolean);
    return (
      parts
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join('') || 'M'
    );
  }, [user?.displayName]);
  const conversationListView =
    conversations.length > 0
      ? 'list'
      : isConversationsLoading
        ? 'loading'
        : conversationListError
          ? 'error'
          : 'empty';

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleDatabaseSelect = useCallback(
    (dbName) => {
      setDbPopoverAnchor(null);
      if (dbName !== currentDatabase) onDatabaseSwitch?.(dbName);
    },
    [currentDatabase, onDatabaseSwitch],
  );

  const handleDatabaseAction = useCallback(
    (event) => {
      if (isConnected && availableDatabases.length > 0) {
        setDbPopoverAnchor(event.currentTarget);
      } else {
        onOpenDbModal?.(event);
      }
    },
    [isConnected, availableDatabases.length, onOpenDbModal],
  );

  const handleHistoryClick = useCallback(
    (event) => {
      if (conversations.length > 0) setHistoryPopoverAnchor(event.currentTarget);
    },
    [conversations.length],
  );

  const handleSearchClick = useCallback((event) => {
    setSearchPopoverAnchor(event.currentTarget);
  }, []);

  const toggleRecentsCollapsed = useCallback(() => setRecentsCollapsed((p) => !p), []);
  const handleCloseDbPopover = useCallback(() => setDbPopoverAnchor(null), []);
  const handleCloseHistoryPopover = useCallback(() => {
    setHistoryPopoverAnchor(null);
    setInlineRename((current) => {
      if (current.surface !== 'history') return current;
      inlineRenameRef.current = EMPTY_INLINE_RENAME;
      return EMPTY_INLINE_RENAME;
    });
  }, []);
  const handleCloseSearchPopover = useCallback(() => {
    setSearchPopoverAnchor(null);
    setSearchQuery('');
    setInlineRename((current) => {
      if (current.surface !== 'search') return current;
      inlineRenameRef.current = EMPTY_INLINE_RENAME;
      return EMPTY_INLINE_RENAME;
    });
  }, []);
  const handleProfileClick = useCallback(
    (e) => {
      onProfileOpen?.(e);
    },
    [onProfileOpen],
  );
  const handleOpenNewConnection = useCallback(
    (event) => {
      setDbPopoverAnchor(null);
      onOpenDbModal?.(event);
    },
    [onOpenDbModal],
  );
  const handleSelectConversation = useCallback(
    (id) => {
      onSelectConversation?.(id);
    },
    [onSelectConversation],
  );
  const handleInlineRenameStart = useCallback((surface, conversationId, title) => {
    const nextRename = {
      surface,
      conversationId,
      title: title || '',
      originalTitle: title || '',
      saving: false,
    };
    inlineRenameRef.current = nextRename;
    setInlineRename(nextRename);
  }, []);
  const handleInlineRenameChange = useCallback((title) => {
    setInlineRename((current) => {
      const nextRename = { ...current, title };
      inlineRenameRef.current = nextRename;
      return nextRename;
    });
  }, []);
  const handleInlineRenameCancel = useCallback(() => {
    inlineRenameRef.current = EMPTY_INLINE_RENAME;
    setInlineRename(EMPTY_INLINE_RENAME);
  }, []);
  const handleInlineRenameCommit = useCallback(async () => {
    const currentRename = inlineRenameRef.current;
    const title = currentRename.title.trim();
    if (!currentRename.conversationId || !title || currentRename.saving) return;

    if (title === currentRename.originalTitle.trim()) {
      inlineRenameRef.current = EMPTY_INLINE_RENAME;
      setInlineRename(EMPTY_INLINE_RENAME);
      return;
    }

    const savingRename = { ...currentRename, saving: true };
    inlineRenameRef.current = savingRename;
    setInlineRename(savingRename);
    try {
      const didRename = await onRenameConversation?.(currentRename.conversationId, title);
      if (didRename === false) {
        const retryRename = { ...currentRename, saving: false };
        inlineRenameRef.current = retryRename;
        setInlineRename(retryRename);
        return;
      }
      inlineRenameRef.current = EMPTY_INLINE_RENAME;
      setInlineRename(EMPTY_INLINE_RENAME);
    } catch {
      const retryRename = { ...currentRename, saving: false };
      inlineRenameRef.current = retryRename;
      setInlineRename(retryRename);
    }
  }, [onRenameConversation]);

  // Close popovers when sidebar closes
  useEffect(() => {
    if ((isMobile && !mobileOpen) || (!isMobile && !open)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDbPopoverAnchor(null);
      setHistoryPopoverAnchor(null);
      setSearchPopoverAnchor(null);
      setSearchQuery('');
      inlineRenameRef.current = EMPTY_INLINE_RENAME;
      setInlineRename(EMPTY_INLINE_RENAME);
    }
  }, [isMobile, mobileOpen, open]);

  // ── Nav item definitions ─────────────────────────────────────────────────────
  const topNavItems = useMemo(
    () => [
      {
        id: 'new-chat',
        label: 'New chat',
        tooltip: 'New chat',
        icon: <NewChatIcon sx={{ fontSize: 18 }} />,
        onClick: () => {
          onNewChat?.();
        },
      },
      {
        id: 'search',
        label: 'Search chats',
        tooltip: 'Search chats',
        icon: <SearchIcon sx={{ fontSize: 18 }} />,
        onClick: handleSearchClick,
      },
    ],
    [handleSearchClick, onNewChat],
  );

  const workspaceNavItems = useMemo(() => {
    const items = [
      {
        id: 'database',
        label: 'Database',
        tooltip: isConnected ? currentDatabase || 'Connected' : 'Connect database',
        icon: <DatabaseIcon sx={{ fontSize: 18 }} />,
        onClick: handleDatabaseAction,
        showStatus: isConnected,
        uiTarget: 'database_button',
      },
    ];
    items.push({
      id: 'mindmap',
      label: 'Mindmap',
      tooltip:
        isConnected && currentDatabase
          ? 'Mindmap'
          : 'Connect a database to view the schema mindmap',
      icon: <MindmapIcon sx={{ fontSize: 18 }} />,
      onClick: onOpenMindmap,
      disabled: !isConnected || !currentDatabase,
    });
    return items;
  }, [isConnected, currentDatabase, handleDatabaseAction, onOpenMindmap]);

  // ── Shared overlay props ─────────────────────────────────────────────────────
  const overlayProps = useMemo(
    () => ({
      theme,
      isPopoverOpen: Boolean(dbPopoverAnchor),
      dbPopoverAnchor,
      handleCloseDbPopover,
      availableDatabases,
      currentDatabase,
      handleDatabaseSelect,
      handleOpenNewConnection,
      isSearchPopoverOpen: Boolean(searchPopoverAnchor),
      searchPopoverAnchor,
      handleCloseSearchPopover,
      searchQuery,
      setSearchQuery,
      isHistoryPopoverOpen: Boolean(historyPopoverAnchor),
      historyPopoverAnchor,
      handleCloseHistoryPopover,
      conversations,
      currentConversationId,
      onSelectConversation: handleSelectConversation,
      onDeleteConversation,
      inlineRename,
      handleInlineRenameStart,
      handleInlineRenameChange,
      handleInlineRenameCancel,
      handleInlineRenameCommit,
      sidebarOpen: open,
    }),
    [
      availableDatabases,
      conversations,
      currentConversationId,
      currentDatabase,
      dbPopoverAnchor,
      handleCloseDbPopover,
      handleCloseHistoryPopover,
      handleCloseSearchPopover,
      handleDatabaseSelect,
      handleOpenNewConnection,
      handleSelectConversation,
      historyPopoverAnchor,
      inlineRename,
      onDeleteConversation,
      handleInlineRenameCancel,
      handleInlineRenameChange,
      handleInlineRenameCommit,
      handleInlineRenameStart,
      open,
      searchPopoverAnchor,
      searchQuery,
      theme,
    ],
  );

  // ── Render helpers ───────────────────────────────────────────────────────────

  /**
   * Header row — toggle button + "Moonlit" title.
   *
   * The toggle button uses the same buildNavRowSx as all other rows.
   * The icon column is ICON_COL wide (same as SidebarNavItem) so the
   * toggle icon is always pixel-aligned with every nav icon below it.
   */
  const renderHeader = ({ mobile = false } = {}) => {
    const collapsed = !mobile && !open;
    const label = mobile ? 'Close sidebar' : collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    return (
      <Box component="header" sx={{ px: ROW_PX, pt: 1, pb: 0.5 }}>
        <Tooltip
          title={collapsed ? label : ''}
          placement="right"
          arrow
          slotProps={railTooltipSlotProps}
          disableHoverListener={!collapsed}
          disableFocusListener={!collapsed}
          disableTouchListener={!collapsed}
        >
          <Box
            ref={mobile ? mobileCloseButtonRef : undefined}
            component="button"
            type="button"
            onClick={mobile ? onMobileClose : onToggleOpen}
            aria-label={label}
            aria-expanded={mobile ? undefined : !collapsed}
            sx={{
              ...buildNavRowSx(theme, { collapsed }),
              px: 0,
            }}
          >
            {/* Icon column — always ICON_COL wide, icon centered */}
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                flexShrink: 0,
                width: ICON_COL,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <SidebarPanelIcon sx={{ fontSize: 18 }} />
            </Box>

            {/* Title — fades + collapses when sidebar is collapsed.
                Solid text.primary — no gradient. Premium wordmarks (Linear,
                Stripe, Vercel) are monochrome. Brand color is reserved for
                primary actions, not identity text. */}
            <Box sx={getCollapsingLabelSx(theme, collapsed)}>
              <Typography
                noWrap
                sx={{
                  ...theme.typography.uiBrandWordmark,
                  fontSize: '1rem',
                  color: 'text.primary',
                  whiteSpace: 'nowrap',
                }}
              >
                Moonlit
              </Typography>
            </Box>
          </Box>
        </Tooltip>
      </Box>
    );
  };

  /**
   * Nav group — renders a list of SidebarNavItem rows.
   * px: ROW_PX on the container gives the hover pill a small inset from the sidebar edges.
   */
  const renderNavGroup = (items, collapsed, { pt = 1, ariaLabel = 'Navigation' } = {}) => (
    <Box
      role="group"
      aria-label={ariaLabel}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        pt,
        px: ROW_PX,
      }}
    >
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
          uiTarget={item.uiTarget}
        />
      ))}
    </Box>
  );

  /**
   * Recents section — collapsible list of conversations.
   * Only shown in expanded state.
   */
  const renderHistorySection = () => (
    <Box
      sx={{
        flex: recentsCollapsed ? '0 0 auto' : 1,
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Section header / collapse toggle */}
      <Box
        component="button"
        type="button"
        aria-expanded={!recentsCollapsed}
        onClick={toggleRecentsCollapsed}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          minHeight: { xs: 44, md: 36 },
          px: 2,
          pt: 1.5,
          pb: 0.75,
          border: 'none',
          outline: 'none',
          appearance: 'none',
          cursor: 'pointer',
          backgroundColor: 'transparent',
          flexShrink: 0,
          '&:hover .toggle-hint': { opacity: 0.7 },
          '&:focus-visible': {
            outline: `2px solid ${theme.palette.border.focus}`,
            outlineOffset: -2,
            borderRadius: '8px',
          },
        }}
      >
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.875,
            minWidth: 0,
          }}
        >
          <RecentChatIcon sx={{ fontSize: 18 }} />
          <Typography
            component="span"
            sx={{ ...buildSidebarSectionLabelSx(theme), px: 0, pt: 0, pb: 0 }}
          >
            Recents
          </Typography>
        </Box>
        <Typography
          className="toggle-hint"
          component="span"
          sx={{
            ...theme.typography.uiCaptionXs,
            color: 'text.secondary',
            opacity: 0,
            transition: 'opacity 0.15s ease',
          }}
        >
          {recentsCollapsed ? 'Show' : 'Hide'}
        </Typography>
      </Box>

      {/* Conversation list */}
      <Collapse
        in={!recentsCollapsed}
        timeout="auto"
        sx={{
          flex: recentsCollapsed ? 0 : 1,
          minHeight: 0,
          overflow: recentsCollapsed ? 'hidden' : 'auto',
          ...scrollbarStyles,
        }}
      >
        <Box
          component="ul"
          role="list"
          sx={{
            listStyle: 'none',
            m: 0,
            px: 1,
            pb: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            ...scrollbarStyles,
          }}
        >
          {conversationListView === 'loading' ? (
            <Box component="li" sx={{ listStyle: 'none' }}>
              <HistoryListSkeleton />
            </Box>
          ) : conversationListView === 'error' ? (
            <Box component="li" sx={{ listStyle: 'none' }}>
              <Box
                role="alert"
                sx={{
                  mx: 1,
                  mt: 0.5,
                  px: 1.25,
                  py: 1.1,
                  borderRadius: '8px',
                  border: '1px solid',
                  borderColor: theme.palette.border.subtle,
                  bgcolor: theme.palette.layer.surfaceTranslucent,
                }}
              >
                <Typography
                  sx={{
                    ...theme.typography.uiNavItem,
                    color: 'text.secondary',
                    lineHeight: 1.35,
                  }}
                >
                  Couldn’t load conversations
                </Typography>
                <Box
                  component="button"
                  type="button"
                  onClick={onRetryConversations}
                  sx={{
                    mt: 1,
                    minWidth: 44,
                    minHeight: { xs: 44, md: 32 },
                    px: 1.5,
                    border: '1px solid',
                    borderColor: theme.palette.border.idle,
                    borderRadius: 9999,
                    color: 'text.primary',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    ...theme.typography.uiNavItem,
                    '&:hover': {
                      backgroundColor: neutralInteraction.hoverBackground,
                      borderColor: theme.palette.border.hover,
                    },
                    '&:focus-visible': {
                      outline: `2px solid ${theme.palette.border.focus}`,
                      outlineOffset: 2,
                    },
                  }}
                >
                  Retry
                </Box>
              </Box>
            </Box>
          ) : conversationListView === 'empty' ? (
            <Box component="li" sx={{ listStyle: 'none' }}>
              <Box
                role="status"
                aria-live="polite"
                sx={{
                  mx: 1,
                  mt: 0.5,
                  px: 1.25,
                  py: 1.1,
                  borderRadius: '8px',
                  border: '1px solid',
                  borderColor: theme.palette.border.subtle,
                  bgcolor: theme.palette.layer.surfaceTranslucent,
                }}
              >
                <Typography
                  sx={{
                    ...theme.typography.uiNavItem,
                    color: 'text.secondary',
                    lineHeight: 1.35,
                  }}
                >
                  No conversations yet
                </Typography>
              </Box>
            </Box>
          ) : (
            conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                isActive={conv.id === currentConversationId}
                onSelect={handleSelectConversation}
                onDelete={onDeleteConversation}
                inlineRename={
                  inlineRename.surface === 'main' && inlineRename.conversationId === conv.id
                    ? inlineRename
                    : null
                }
                renameSurface="main"
                onRenameStart={handleInlineRenameStart}
                onRenameChange={handleInlineRenameChange}
                onRenameCancel={handleInlineRenameCancel}
                onRenameCommit={handleInlineRenameCommit}
              />
            ))
          )}
        </Box>
      </Collapse>
    </Box>
  );

  /**
   * Footer — profile avatar + name + settings action.
   * Same icon-column model as nav items.
   */
  const renderFooter = ({ mobile = false } = {}) => {
    const collapsed = !mobile && !open;
    const { showDirectSettings } = getProfileSettingsMode(!collapsed);
    return (
      <Box
        component="footer"
        sx={buildSidebarFooterSx()}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip
            title={collapsed ? user?.displayName || 'Profile' : ''}
            placement="right"
            arrow
            slotProps={railTooltipSlotProps}
            disableHoverListener={!collapsed}
            disableFocusListener={!collapsed}
            disableTouchListener={!collapsed}
          >
            <Box
              component="button"
              type="button"
              onClick={handleProfileClick}
              aria-label={`Open ${user?.displayName || 'Profile'} profile`}
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen || undefined}
              sx={{
                ...buildNavRowSx(theme, { collapsed }),
                ...getProfileControlGeometry(),
                width: collapsed ? 36 : 'auto',
                flex: collapsed ? '0 0 36px' : '1 1 auto',
                minWidth: 0,
                px: 0,
                opacity: 0.8,
                '&:hover': {
                  opacity: 1,
                  backgroundColor: neutralInteraction.hoverBackground,
                  color: theme.palette.text.primary,
                },
              }}
            >
              {/* Avatar — in the same ICON_COL slot as all nav icons */}
              <Box
                component="span"
                sx={{
                  display: 'inline-flex',
                  flexShrink: 0,
                  width: ICON_COL,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Avatar
                  src={user?.photoURL || undefined}
                  sx={{
                    width: 26,
                    height: 26,
                    fontSize: '0.7rem',
                    fontWeight: 400,
                  }}
                >
                  {!user?.photoURL && userInitials}
                </Avatar>
              </Box>

              {/* Name — fades + collapses when collapsed */}
              <Box sx={getCollapsingLabelSx(theme, collapsed)}>
                <Typography
                  noWrap
                  sx={{
                    ...theme.typography.uiNavItem,
                    fontWeight: 400,
                    color: 'text.primary',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {user?.displayName || 'Profile'}
                </Typography>
              </Box>
            </Box>
          </Tooltip>

          {showDirectSettings && (
            <Tooltip title="Settings" placement="top" arrow>
              <Box
                component="button"
                type="button"
                onClick={onOpenSettings}
                aria-label="Open settings"
                data-ui-target="settings_button"
                sx={{
                  ...buildNavRowSx(theme, { collapsed: true }),
                  ...getProfileControlGeometry({ iconOnly: true }),
                  justifyContent: 'center',
                  px: 0,
                  flex: '0 0 auto',
                  opacity: 0.8,
                  '&:hover': {
                    opacity: 1,
                    backgroundColor: neutralInteraction.hoverBackground,
                    color: theme.palette.text.primary,
                  },
                }}
              >
                <SettingsIcon sx={{ fontSize: 18, color: 'text.secondary', display: 'block' }} />
              </Box>
            </Tooltip>
          )}
        </Box>
      </Box>
    );
  };

  // ── Content trees ────────────────────────────────────────────────────────────

  // Mobile: always fully expanded
  const mobileContent = (
    <Box
      component="nav"
      aria-label="Sidebar"
      sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      {renderHeader({ mobile: true })}
      {renderNavGroup(topNavItems, false, { ariaLabel: 'Primary actions' })}
      {renderNavGroup(workspaceNavItems, false, {
        pt: 0.25,
        ariaLabel: 'Workspace actions',
      })}
      {renderHistorySection()}
      {renderFooter()}
    </Box>
  );

  // Desktop: collapses/expands with smooth width transition.
  // The history section and collapsed history icon are BOTH always mounted
  // and crossfade via opacity/visibility — no unmount/remount jitter.
  const desktopContent = (
    <>
      {renderHeader()}

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {renderNavGroup(topNavItems, !open, { ariaLabel: 'Primary actions' })}
        {renderNavGroup(workspaceNavItems, !open, {
          pt: 0.25,
          ariaLabel: 'Workspace actions',
        })}

        {/* Scrollable zone — history list (expanded) and history icon (collapsed) */}
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              opacity: open ? 1 : 0,
              visibility: open ? 'visible' : 'hidden',
              pointerEvents: open ? 'auto' : 'none',
              transition: theme.transitions.create('opacity', {
                duration: 160,
              }),
            }}
          >
            {renderHistorySection()}
          </Box>

          <Box
            sx={{
              px: ROW_PX,
              opacity: open ? 0 : 1,
              visibility: open ? 'hidden' : 'visible',
              pointerEvents: open ? 'none' : 'auto',
              transition: theme.transitions.create('opacity', {
                duration: 160,
              }),
            }}
          >
            <SidebarNavItem
              label="History"
              tooltip="Recent chats"
              icon={<RecentChatIcon sx={{ fontSize: 18 }} />}
              onClick={handleHistoryClick}
              isCollapsed
              disabled={conversations.length === 0}
            />
          </Box>
        </Box>
      </Box>

      {renderFooter()}
    </>
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        <CustomDrawer
          open={mobileOpen}
          onOpenChange={(val) => {
            if (!val) onMobileClose?.();
          }}
          onExited={onMobileExited}
          side="left"
          initialFocusRef={mobileCloseButtonRef}
        >
          <DrawerOverlay />
          <DrawerContent sx={mobileDrawerPaperStyles} showCloseButton={false}>
            {mobileContent}
          </DrawerContent>
        </CustomDrawer>
        <SidebarOverlays {...overlayProps} />
      </>
    );
  }

  return (
    <>
      <Box component="nav" aria-label="Sidebar" sx={desktopNavSx}>
        {desktopContent}
      </Box>
      <SidebarOverlays {...overlayProps} />
    </>
  );
}

// ─── Memoization ─────────────────────────────────────────────────────────────
function areConversationMetaEqual(prev = [], next = []) {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i]?.id !== next[i]?.id || prev[i]?.title !== next[i]?.title) return false;
  }
  return true;
}

function areStringArraysEqual(prev = [], next = []) {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== next[i]) return false;
  }
  return true;
}

function arePropsEqual(p, n) {
  return (
    p.currentConversationId === n.currentConversationId &&
    p.isConnected === n.isConnected &&
    p.isConversationsLoading === n.isConversationsLoading &&
    p.conversationListError === n.conversationListError &&
    p.currentDatabase === n.currentDatabase &&
    p.open === n.open &&
    p.mobileOpen === n.mobileOpen &&
    p.onNewChat === n.onNewChat &&
    p.onSelectConversation === n.onSelectConversation &&
    p.onDeleteConversation === n.onDeleteConversation &&
    p.onRenameConversation === n.onRenameConversation &&
    p.onRetryConversations === n.onRetryConversations &&
    p.onOpenDbModal === n.onOpenDbModal &&
    p.onOpenMindmap === n.onOpenMindmap &&
    p.onDatabaseSwitch === n.onDatabaseSwitch &&
    p.onToggleOpen === n.onToggleOpen &&
    p.onProfileOpen === n.onProfileOpen &&
    p.onOpenSettings === n.onOpenSettings &&
    p.profileMenuOpen === n.profileMenuOpen &&
    p.onMobileClose === n.onMobileClose &&
    p.onMobileExited === n.onMobileExited &&
    p.user?.photoURL === n.user?.photoURL &&
    p.user?.displayName === n.user?.displayName &&
    areConversationMetaEqual(p.conversations, n.conversations) &&
    areStringArraysEqual(p.availableDatabases, n.availableDatabases)
  );
}

export default memo(Sidebar, arePropsEqual);
