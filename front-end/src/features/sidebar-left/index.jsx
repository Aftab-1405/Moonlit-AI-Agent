import {
  Avatar,
  Box,
  Button,
  IconButton,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  CloseIcon,
  DashboardIcon,
  DatabaseIcon,
  HomeIcon,
  MindmapIcon,
  SearchIcon,
  SidebarPanelIcon,
} from '@/components/icons';
import { Drawer, DrawerContent, DrawerOverlay } from '@/components/ui/Drawer';
import { getScrollbarStyles, UI_LAYOUT } from '@/styles/shared';
import DashboardPreview from './components/DashboardPreview';
import DatabasePreview from './components/DatabasePreview';
import UserProfileMenu from './components/ProfilePreview';
import {
  ConversationItem,
  HistoryListSkeleton,
  SidebarNavItem,
} from './components/SidebarPrimitives';
import { SidebarSkeleton } from './components/SidebarSectionLayout';
import { buildDesktopNavSx, buildMobileDrawerPaperStyles } from './styles/sidebarStyles';

const CONVERSATIONS_PER_PAGE = 40;

const EMPTY_INLINE_RENAME = {
  surface: null,
  conversationId: null,
  title: '',
  originalTitle: '',
  saving: false,
};
const PANEL_TITLES = {
  home: 'Home',
  dashboard: 'Dashboard',
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
  dbType,
  currentSchema,
  isStreaming,
  isDatabaseBusy,
  databaseStatus = 'ready',
  onRetryDatabaseStatus,
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
  const [selectedMode, setSelectedMode] = useState('home');
  const [peekMode, setPeekMode] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [conversationPage, setConversationPage] = useState(0);
  const [inlineRename, setInlineRename] = useState(EMPTY_INLINE_RENAME);
  const inlineRenameRef = useRef(EMPTY_INLINE_RENAME);
  const navRef = useRef(null);
  const panelRef = useRef(null);
  const listScrollRef = useRef(null);
  const triggerRef = useRef(null);
  const homeRef = useRef(null);
  const closeRef = useRef(null);
  const searchRef = useRef(null);
  const focusSearchRef = useRef(false);
  const timerRef = useRef(null);
  const mode = isMobile ? selectedMode : peekMode || selectedMode;
  const activeItem = mode;
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
    setConversationPage(0);
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
      panelVisible && activeItem !== nextMode ? 300 : 100,
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
  const handleSelectConversation = useCallback(
    (id) => {
      onSelectConversation?.(id);
      closePeek();
      if (isMobile) onMobileClose?.();
    },
    [onSelectConversation, closePeek, isMobile, onMobileClose],
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

  const normalizedQuery = mode === 'search' ? searchQuery.trim().toLowerCase() : '';
  const matchingConversations = useMemo(
    () =>
      conversations.filter(
        (conv) =>
          !normalizedQuery ||
          (conv.title || 'New Conversation').toLowerCase().includes(normalizedQuery),
      ),
    [conversations, normalizedQuery],
  );
  const pageCount = Math.ceil(matchingConversations.length / CONVERSATIONS_PER_PAGE);
  const page = Math.min(conversationPage, Math.max(0, pageCount - 1));
  const shownConversations = matchingConversations.slice(
    page * CONVERSATIONS_PER_PAGE,
    (page + 1) * CONVERSATIONS_PER_PAGE,
  );
  const activeIndex = conversations.findIndex((conv) => conv.id === currentConversationId);
  const activeIsVisible = shownConversations.some((conv) => conv.id === currentConversationId);
  const navItem = (id, label, Icon, extra = {}) => (
    <SidebarNavItem
      key={id}
      label={label}
      icon={<Icon sx={{ fontSize: 20 }} />}
      isCollapsed={!isMobile}
      isActive={panelVisible && activeItem === id}
      expanded={panelVisible && activeItem === id}
      onClick={(event) => chooseMode(id, event)}
      onPointerEnter={(event) => previewMode(id, event)}
      onPointerLeave={leavePreview}
      {...extra}
    />
  );
  const profile = (
    <IconButton
      aria-label={`Open ${user?.displayName || 'Profile'} profile`}
      aria-expanded={panelVisible && mode === 'profile'}
      onClick={(event) => chooseMode('profile', event)}
      onPointerEnter={(event) => previewMode('profile', event)}
      onPointerLeave={leavePreview}
      sx={{ width: isMobile ? 44 : 36, height: isMobile ? 44 : 36, borderRadius: '9999px' }}
    >
      <Avatar src={user?.photoURL || undefined} sx={{ width: 26, height: 26, fontSize: 11 }}>
        {(user?.displayName || 'Moonlit')
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0])
          .join('')}
      </Avatar>
    </IconButton>
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
        sx={{
          height: 52,
          minHeight: 52,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          px: 1.5,
        }}
      >
        <Typography component="h2" sx={{ fontSize: 15, fontWeight: 500, flex: 1 }}>
          {PANEL_TITLES[mode]}
        </Typography>
        <IconButton
          ref={closeRef}
          aria-label="Close sidebar panel"
          onClick={closePanel}
          sx={{ borderRadius: '9999px', width: isMobile ? 44 : 32, height: isMobile ? 44 : 32 }}
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
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setConversationPage(0);
          }}
          size="small"
          slotProps={{ htmlInput: { 'aria-label': 'Search chats' } }}
          sx={{
            mx: 1.5,
            mb: 1,
            '& .MuiOutlinedInput-root': {
              borderRadius: '10px',
              fontSize: 14,
              bgcolor: 'background.input',
            },
          }}
        />
      )}
      <Box
        ref={listScrollRef}
        sx={{
          flex: 1,
          minHeight: 0,
          scrollbarGutter: ['dashboard', 'profile', 'database'].includes(mode) ? 'auto' : 'stable',
          overflowY: ['dashboard', 'profile', 'database'].includes(mode) ? 'hidden' : 'auto',
          ...getScrollbarStyles(theme),
        }}
      >
        {(mode === 'home' || mode === 'search') && (
          <>
            <Typography sx={{ color: 'text.secondary', fontSize: 12, px: 2, py: 1 }}>
              {mode === 'search' ? 'Results' : 'Recent chats'}
            </Typography>
            {isConversationsLoading && conversations.length === 0 ? (
              <HistoryListSkeleton
                label={mode === 'search' ? 'Loading conversations' : 'Loading recent conversations'}
              />
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
        {panelVisible && mode === 'database' && (
          <DatabasePreview
            key={isConnected ? 'connected' : 'disconnected'}
            {...{
              isConnected,
              currentDatabase,
              dbType,
              currentSchema,
              availableDatabases,
              isStreaming,
              isDatabaseBusy,
              onDatabaseSwitch,
              databaseStatus,
              onRetryDatabaseStatus,
            }}
            onOpenDatabase={onOpenDbModal}
          />
        )}
        {panelVisible && mode === 'dashboard' && (
          <DashboardPreview
            userId={user?.uid}
            isConnected={isConnected}
            currentDatabase={currentDatabase}
            onOpenDashboard={() => {
              closePeek();
              if (isMobile) onMobileClose?.();
              onOpenDashboard?.();
            }}
          />
        )}
        {mode === 'profile' && (
          <UserProfileMenu
            inline
            open
            user={user}
            theme={theme}
            onOpenSettings={onOpenSettings}
            onLogout={onLogout}
          />
        )}
      </Box>
      {(mode === 'home' || mode === 'search') && (
        <Box
          component="nav"
          aria-label="Conversation pages"
          sx={{ height: 72, flex: '0 0 72px', boxSizing: 'border-box', px: 2, overflow: 'hidden' }}
        >
          <Box
            sx={{
              minHeight: 32,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            {isConversationsLoading && !conversations.length ? (
              <SidebarSkeleton width="65%" />
            ) : (
              pageCount > 1 && (
                <Typography sx={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                  Page {page + 1} of {pageCount}
                </Typography>
              )
            )}
            {activeIndex >= 0 && !activeIsVisible && (
              <Button
                size="small"
                onClick={() => {
                  setSelectedMode('home');
                  setPeekMode(!isMobile && !open ? 'home' : null);
                  listScrollRef.current?.scrollTo?.({ top: 0 });
                  setConversationPage(Math.floor(activeIndex / CONVERSATIONS_PER_PAGE));
                }}
                sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                Show current chat
              </Button>
            )}
          </Box>
          <Box sx={{ height: 36, display: 'flex', justifyContent: 'space-between' }}>
            {pageCount > 1 && (
              <>
                <Button
                  size="small"
                  aria-disabled={page === 0 || Boolean(inlineRename.conversationId)}
                  onClick={() => {
                    if (page === 0 || inlineRename.conversationId) return;
                    setConversationPage(page - 1);
                    listScrollRef.current?.scrollTo?.({ top: 0 });
                  }}
                >
                  Previous chats
                </Button>
                <Button
                  size="small"
                  aria-disabled={page >= pageCount - 1 || Boolean(inlineRename.conversationId)}
                  onClick={() => {
                    if (page >= pageCount - 1 || inlineRename.conversationId) return;
                    setConversationPage(page + 1);
                    listScrollRef.current?.scrollTo?.({ top: 0 });
                  }}
                >
                  Next chats
                </Button>
              </>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
  const navigation = (
    <>
      {isMobile && navItem('home', 'Home', HomeIcon)}
      {navItem('search', 'Search chats', SearchIcon)}
      {navItem('dashboard', 'Dashboard', DashboardIcon)}
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
          m: `${UI_LAYOUT.navigationRailInset}px`,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          bgcolor: 'transparent',
          pt: `${(UI_LAYOUT.workspaceTopRowHeight - UI_LAYOUT.controlRowHeight) / 2 - UI_LAYOUT.navigationRailInset}px`,
          pb: 1,
          gap: 2,
        }}
      >
        <SidebarNavItem
          buttonRef={homeRef}
          label="Home"
          icon={<HomeIcon sx={{ fontSize: 20 }} />}
          isCollapsed
          isActive={panelVisible && activeItem === 'home'}
          expanded={panelVisible && activeItem === 'home'}
          onClick={(event) => chooseMode('home', event)}
          onPointerEnter={(event) => previewMode('home', event)}
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
