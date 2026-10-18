import {
  Avatar,
  Box,
  IconButton,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AddIcon,
  CheckIcon,
  CloseIcon,
  DatabaseIcon,
  HomeIcon,
  MindmapIcon,
  RecentChatIcon,
  SearchIcon,
  SidebarPanelIcon,
} from '@/components/icons';
import { Drawer, DrawerContent, DrawerOverlay } from '@/components/ui/Drawer';
import UserProfileMenu from '@/features/shell/UserProfileMenu';
import {
  ConversationItem,
  HistoryListSkeleton,
  SidebarNavItem,
} from './components/SidebarPrimitives';
import { buildDesktopNavSx, buildMobileDrawerPaperStyles } from './styles/sidebarStyles';
import { getScrollbarStyles, UI_LAYOUT } from '@/styles/shared';

const EMPTY_INLINE_RENAME = {
  surface: null,
  conversationId: null,
  title: '',
  originalTitle: '',
  saving: false,
};
const PANEL_TITLES = {
  history: 'History',
  search: 'Search chats',
  database: 'Databases',
  profile: 'Your account',
};

function Sidebar({
  conversations = [],
  conversationActivity = {},
  isConversationsLoading = false,
  conversationListError,
  onRetryConversations,
  currentConversationId,
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
  user,
  onOpenSettings,
  onOpenDashboard,
  onLogout,
  mobileOpen = false,
  onMobileClose,
  onMobileExited,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const finePointer = useMediaQuery('(hover: hover) and (pointer: fine)');
  const [selectedMode, setSelectedMode] = useState('history');
  const [peekMode, setPeekMode] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [inlineRename, setInlineRename] = useState(EMPTY_INLINE_RENAME);
  const inlineRenameRef = useRef(EMPTY_INLINE_RENAME);
  const navRef = useRef(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const homeRef = useRef(null);
  const closeRef = useRef(null);
  const searchRef = useRef(null);
  const focusSearchRef = useRef(false);
  const timerRef = useRef(null);
  const mode = isMobile ? selectedMode : peekMode || selectedMode;
  const panelVisible = isMobile ? mobileOpen : open || Boolean(peekMode);
  const clearTimer = useCallback(() => clearTimeout(timerRef.current), []);
  useEffect(() => clearTimer, [clearTimer]);

  const closePeek = useCallback(() => {
    clearTimer();
    if (!open && panelRef.current?.contains(document.activeElement))
      (triggerRef.current || homeRef.current)?.focus();
    setPeekMode(null);
  }, [clearTimer, open, setPeekMode]);

  useEffect(() => {
    if (!peekMode) return undefined;
    const dismiss = (event) => {
      if (!navRef.current?.contains(event.target)) closePeek();
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [peekMode, closePeek]);

  useLayoutEffect(() => {
    if (focusSearchRef.current && panelVisible && mode === 'search') {
      focusSearchRef.current = false;
      searchRef.current?.focus();
    }
  }, [mode, panelVisible, peekMode]);

  const chooseMode = (nextMode, event) => {
    clearTimer();
    triggerRef.current = event?.currentTarget || triggerRef.current;
    setSelectedMode(nextMode);
    setPeekMode(null);
    focusSearchRef.current = nextMode === 'search';
    if (!isMobile && !open) onToggleOpen?.();
    if (nextMode === 'search' && mode === 'search' && panelVisible) searchRef.current?.focus();
  };
  const previewMode = (nextMode, event) => {
    clearTimer();
    if (isMobile || !finePointer || event.pointerType === 'touch' || event.buttons > 0) return;
    if (panelRef.current?.contains(document.activeElement)) return;
    const trigger = event.currentTarget;
    timerRef.current = setTimeout(
      () => {
        triggerRef.current = trigger;
        setPeekMode(nextMode);
      },
      panelVisible && mode !== nextMode ? 300 : 100,
    );
  };
  const leavePreview = () => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      if (!panelRef.current?.contains(document.activeElement)) setPeekMode(null);
    }, 100);
  };
  const pinPreview = () => {
    if (!peekMode) return;
    clearTimer();
    setSelectedMode(peekMode);
    setPeekMode(null);
    if (!open) onToggleOpen?.();
  };
  const closePanel = () => {
    closePeek();
    if (isMobile) onMobileClose?.();
    else if (open) onToggleOpen?.();
    (triggerRef.current || homeRef.current)?.focus();
  };
  const handleSelectConversation = (id) => {
    onSelectConversation?.(id);
    closePeek();
    if (isMobile) onMobileClose?.();
  };
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

  const normalizedQuery = mode === 'search' ? searchQuery.trim().toLowerCase() : '';
  const shownConversations = conversations.filter(
    (conv) =>
      !normalizedQuery ||
      (conv.title || 'New Conversation').toLowerCase().includes(normalizedQuery),
  );
  const navItem = (id, label, Icon, extra = {}) => (
    <SidebarNavItem
      key={id}
      label={label}
      icon={<Icon sx={{ fontSize: 20 }} />}
      isCollapsed={!isMobile}
      isActive={panelVisible && mode === id}
      expanded={panelVisible && mode === id}
      onClick={(event) => chooseMode(id, event)}
      onPointerEnter={(event) => previewMode(id, event)}
      onPointerLeave={leavePreview}
      {...extra}
    />
  );
  const profile = (
    <Tooltip title="Your account" placement="right" disableHoverListener={Boolean(peekMode)}>
      <IconButton
        aria-label={`Open ${user?.displayName || 'Profile'} profile`}
        aria-expanded={panelVisible && mode === 'profile'}
        onClick={(event) => chooseMode('profile', event)}
        onPointerEnter={(event) => previewMode('profile', event)}
        onPointerLeave={leavePreview}
        sx={{ width: isMobile ? 44 : 36, height: isMobile ? 44 : 36, borderRadius: '10px' }}
      >
        <Avatar src={user?.photoURL || undefined} sx={{ width: 26, height: 26, fontSize: 11 }}>
          {(user?.displayName || 'Moonlit')
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0])
            .join('')}
        </Avatar>
      </IconButton>
    </Tooltip>
  );
  const panel = (
    <Box
      ref={panelRef}
      component="section"
      aria-label="Sidebar panel"
      aria-hidden={!panelVisible || undefined}
      inert={!panelVisible ? true : undefined}
      onPointerEnter={clearTimer}
      onPointerLeave={leavePreview}
      onPointerDownCapture={pinPreview}
      onFocusCapture={pinPreview}
      sx={{
        display: panelVisible ? 'flex' : 'none',
        flexDirection: 'column',
        minHeight: 0,
        width: isMobile
          ? '100%'
          : UI_LAYOUT.sidebarExpandedWidth - UI_LAYOUT.sidebarCollapsedWidth - 8,
        position: isMobile || open ? 'relative' : 'absolute',
        left: !isMobile && !open ? 52 : undefined,
        top: !isMobile && !open ? 0 : undefined,
        bottom: !isMobile && !open ? 0 : undefined,
        flex: isMobile ? 1 : undefined,
        flexShrink: isMobile ? 1 : 0,
        m: isMobile ? 0 : 0.5,
        borderRadius: isMobile ? 0 : '16px',
        border: isMobile ? 0 : '1px solid',
        borderColor: 'border.subtle',
        bgcolor: 'background.paper',
        boxShadow: !open ? '8px 0 24px #0005' : 'none',
        overflow: 'hidden',
      }}
    >
      <Box
        component="header"
        sx={{ minHeight: 52, display: 'flex', alignItems: 'center', px: 1.5 }}
      >
        <Typography component="h2" sx={{ fontSize: 15, fontWeight: 500, flex: 1 }}>
          {PANEL_TITLES[mode]}
        </Typography>
        <IconButton
          ref={closeRef}
          aria-label="Close sidebar panel"
          onClick={closePanel}
          sx={{ borderRadius: '8px', width: isMobile ? 44 : 32, height: isMobile ? 44 : 32 }}
        >
          {isMobile ? (
            <CloseIcon sx={{ fontSize: 18 }} />
          ) : (
            <SidebarPanelIcon sx={{ fontSize: 18 }} />
          )}
        </IconButton>
      </Box>
      {mode === 'search' && (
        <TextField
          inputRef={searchRef}
          placeholder="Search chats"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          size="small"
          slotProps={{ htmlInput: { 'aria-label': 'Search chats' } }}
          sx={{
            mx: 1.5,
            mb: 1,
            '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 14, bgcolor: 'background.input' },
          }}
        />
      )}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', ...getScrollbarStyles(theme) }}>
        {(mode === 'history' || mode === 'search') && (
          <>
            <Typography sx={{ color: 'text.secondary', fontSize: 12, px: 2, py: 1 }}>
              {mode === 'search' ? 'Results' : 'Recent chats'}
            </Typography>
            {isConversationsLoading && conversations.length === 0 ? (
              <HistoryListSkeleton />
            ) : conversationListError && conversations.length === 0 ? (
              <Box role="alert" sx={{ p: 2 }}>
                <Typography sx={{ fontSize: 13 }}>Couldn’t load conversations</Typography>
                <SidebarNavItem label="Retry" onClick={onRetryConversations} />
              </Box>
            ) : shownConversations.length === 0 ? (
              <Typography
                role="status"
                sx={{ px: 2, py: 1, color: 'text.secondary', fontSize: 13 }}
              >
                {conversations.length ? 'No matching chats' : 'No conversations yet'}
              </Typography>
            ) : (
              <Box component="ul" sx={{ listStyle: 'none', m: 0, px: 1, pb: 1 }}>
                {shownConversations.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conv={conv}
                    activity={conversationActivity[conv.id]}
                    isActive={conv.id === currentConversationId}
                    onSelect={handleSelectConversation}
                    onDelete={onDeleteConversation}
                    inlineRename={inlineRename.conversationId === conv.id ? inlineRename : null}
                    renameSurface="main"
                    onRenameStart={handleInlineRenameStart}
                    onRenameChange={handleInlineRenameChange}
                    onRenameCancel={handleInlineRenameCancel}
                    onRenameCommit={handleInlineRenameCommit}
                  />
                ))}
              </Box>
            )}
          </>
        )}
        {mode === 'database' && (
          <Box sx={{ px: 1 }}>
            {availableDatabases.map((db) => (
              <SidebarNavItem
                key={db}
                label={db}
                icon={db === currentDatabase ? <CheckIcon /> : <DatabaseIcon />}
                isActive={db === currentDatabase}
                onClick={() => {
                  if (db !== currentDatabase) onDatabaseSwitch?.(db);
                }}
              />
            ))}
            {!isConnected && (
              <Typography sx={{ p: 1, fontSize: 13, color: 'text.secondary' }}>
                Connect a database to explore your data.
              </Typography>
            )}
            <SidebarNavItem
              label="New connection"
              icon={<AddIcon />}
              onClick={onOpenDbModal}
              uiTarget="database_button"
            />
          </Box>
        )}
        {mode === 'profile' && (
          <UserProfileMenu
            inline
            open
            user={user}
            theme={theme}
            onOpenDashboard={onOpenDashboard}
            onOpenSettings={onOpenSettings}
            onLogout={onLogout}
          />
        )}
      </Box>
    </Box>
  );
  const navigation = (
    <>
      {navItem('search', 'Search chats', SearchIcon)}
      {navItem('history', 'History', RecentChatIcon)}
      <Box
        aria-hidden
        sx={{ height: '1px', flexShrink: 0, bgcolor: 'border.separator', my: 0.5, mx: 0.75 }}
      />
      {navItem('database', 'Database', DatabaseIcon, {
        showStatus: isConnected,
        uiTarget: 'database_button',
      })}
      <SidebarNavItem
        label="Mindmap"
        icon={<MindmapIcon sx={{ fontSize: 20 }} />}
        isCollapsed={!isMobile}
        onClick={onOpenMindmap}
        disabled={!isConnected || !currentDatabase}
      />
    </>
  );
  if (isMobile)
    return (
      <Drawer
        open={mobileOpen}
        side="left"
        onOpenChange={(value) => {
          if (!value) onMobileClose?.();
        }}
        onExited={onMobileExited}
        initialFocusRef={closeRef}
      >
        <DrawerOverlay />
        <DrawerContent sx={buildMobileDrawerPaperStyles(theme)} showCloseButton={false}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, pt: 1 }}>
            {profile}
            <Typography>Moonlit</Typography>
          </Box>
          <Box sx={{ px: 1, py: 1 }}>{navigation}</Box>
          {panel}
        </DrawerContent>
      </Drawer>
    );
  return (
    <Box
      ref={navRef}
      component="nav"
      aria-label="Sidebar"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          if (peekMode) closePeek();
          else closePanel();
        }
      }}
      onBlurCapture={(event) => {
        if (peekMode && !event.currentTarget.contains(event.relatedTarget)) closePeek();
      }}
      sx={{ ...buildDesktopNavSx(theme), overflow: 'visible', position: 'relative' }}
    >
      <Box
        role="group"
        aria-label="Navigation rail"
        sx={{
          width: 44,
          flex: '0 0 44px',
          m: 0.5,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          bgcolor: 'transparent',
          py: 1,
          gap: 2,
        }}
      >
        <SidebarNavItem
          buttonRef={homeRef}
          label={open ? 'Collapse sidebar' : 'Expand sidebar'}
          icon={<HomeIcon sx={{ fontSize: 20 }} />}
          isCollapsed
          isActive={open}
          onClick={(event) => {
            triggerRef.current = event.currentTarget;
            clearTimer();
            setPeekMode(null);
            setSelectedMode('history');
            onToggleOpen?.();
          }}
          onPointerEnter={(event) => previewMode('history', event)}
          onPointerLeave={leavePreview}
        />
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            ...getScrollbarStyles(theme),
          }}
        >
          {navigation}
        </Box>
        {profile}
      </Box>
      {panel}
    </Box>
  );
}

export default memo(Sidebar);
