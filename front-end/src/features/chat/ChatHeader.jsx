import { Box, CircularProgress, IconButton, InputBase, Tooltip, Typography } from '@mui/material';
import { motion, useReducedMotion } from 'framer-motion';
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, CloseIcon, MenuIcon, NewChatIcon } from '@/components/icons';
import { getChatMotionVariants } from '@/features/chat/chatMotion';
import {
  getMobileEdgeControlSx,
  getResponsivePillIconButtonSx,
} from '@/features/styles/interfaceChrome';
import { getInteractiveIconButtonSx, UI_LAYOUT } from '@/styles/shared';
import { prepareConversationRename } from './chatHeaderModel';

const MotionBox = motion.create(Box);

const ChatHeader = memo(function ChatHeader({
  sessionKey,
  conversationId,
  title,
  onRenameConversation,
  onNewChat,
  isNarrowLayout,
  onOpenSidebar,
  openSidebarButtonRef,
  actions,
  theme,
}) {
  const prefersReducedMotion = useReducedMotion();
  const titleMotion = useMemo(
    () => getChatMotionVariants(prefersReducedMotion).content,
    [prefersReducedMotion],
  );
  const hasTitle = Boolean(conversationId && title);
  const titleLifecycleRef = useRef({
    sessionKey,
    canAnimateGeneratedTitle: !conversationId,
    hadTitle: hasTitle,
  });
  const animateTitle = Boolean(
    hasTitle &&
      titleLifecycleRef.current.sessionKey === sessionKey &&
      titleLifecycleRef.current.canAnimateGeneratedTitle &&
      !titleLifecycleRef.current.hadTitle,
  );

  useLayoutEffect(() => {
    const previous = titleLifecycleRef.current;
    titleLifecycleRef.current =
      previous.sessionKey === sessionKey
        ? { ...previous, hadTitle: previous.hadTitle || hasTitle }
        : {
            sessionKey,
            canAnimateGeneratedTitle: !conversationId,
            hadTitle: hasTitle,
          };
  }, [conversationId, hasTitle, sessionKey]);

  const [renameState, setRenameState] = useState(null);
  const isRenaming = renameState?.conversationId === conversationId;
  const isSaving = Boolean(isRenaming && renameState?.saving);
  const draftTitle = isRenaming ? renameState.title : '';

  const beginRename = useCallback(() => {
    if (!conversationId || !title || !onRenameConversation) return;
    setRenameState({ conversationId, title, saving: false });
  }, [conversationId, onRenameConversation, title]);

  const cancelRename = useCallback(() => {
    if (isSaving) return;
    setRenameState(null);
  }, [isSaving]);

  const commitRename = useCallback(async () => {
    if (isSaving || !isRenaming) return;
    const nextTitle = prepareConversationRename(draftTitle);
    if (!nextTitle) return;
    if (nextTitle === title) {
      setRenameState(null);
      return;
    }

    setRenameState((current) =>
      current?.conversationId === conversationId ? { ...current, saving: true } : current,
    );
    try {
      const renamed = await onRenameConversation?.(conversationId, nextTitle);
      if (renamed !== false) {
        setRenameState((current) => (current?.conversationId === conversationId ? null : current));
      }
    } catch {
      setRenameState((current) =>
        current?.conversationId === conversationId
          ? { conversationId, title, saving: false }
          : current,
      );
    } finally {
      setRenameState((current) =>
        current?.conversationId === conversationId ? { ...current, saving: false } : current,
      );
    }
  }, [conversationId, draftTitle, isRenaming, isSaving, onRenameConversation, title]);

  const handleInputKeyDown = useCallback(
    (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        commitRename();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelRename();
      }
    },
    [cancelRename, commitRename],
  );

  const editorActionSx = getResponsivePillIconButtonSx(theme, {
    desktopSize: 28,
    mobileSize: UI_LAYOUT.touchTarget,
  });

  return (
    <Box
      component="header"
      aria-label="Conversation header"
      sx={{
        height: 48,
        minHeight: 48,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 0.5, sm: 1 },
        px: { xs: 1, sm: 1.5 },
        position: 'relative',
        zIndex: 6,
      }}
    >
      {isNarrowLayout && (
        <Tooltip title="Open sidebar">
          <IconButton
            ref={openSidebarButtonRef}
            onClick={onOpenSidebar}
            aria-label="Open sidebar"
            sx={{
              ...getInteractiveIconButtonSx(theme, {
                size: UI_LAYOUT.touchTarget,
                radius: theme.shape.radius.pill,
              }),
              ...getMobileEdgeControlSx('left', 1),
              flexShrink: 0,
              bgcolor: 'transparent',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <MenuIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      )}

      {onNewChat && (
        <Tooltip title="New chat">
          <IconButton
            aria-label="New chat"
            onClick={onNewChat}
            sx={{ borderRadius: '10px', flexShrink: 0 }}
          >
            <NewChatIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      )}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
        {isRenaming ? (
          <Box
            sx={{
              width: 'min(100%, 560px)',
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 0.25,
            }}
          >
            <InputBase
              autoFocus
              value={draftTitle}
              disabled={isSaving}
              onChange={(event) =>
                setRenameState({ conversationId, title: event.target.value, saving: false })
              }
              onKeyDown={handleInputKeyDown}
              inputProps={{ maxLength: 80, 'aria-label': 'Conversation title' }}
              sx={{
                flex: 1,
                minWidth: 0,
                height: 32,
                px: 1,
                border: '1px solid',
                borderColor: 'border.hover',
                borderRadius: '8px',
                color: 'text.primary',
                bgcolor: 'background.input',
                '& .MuiInputBase-input': {
                  minWidth: 0,
                  p: 0,
                  ...theme.typography.uiNavItem,
                  lineHeight: '30px',
                },
              }}
            />
            <Tooltip title="Save rename">
              <span>
                <IconButton
                  disabled={isSaving || !draftTitle.trim()}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={commitRename}
                  aria-label="Save conversation title"
                  sx={editorActionSx}
                >
                  {isSaving ? (
                    <CircularProgress size={13} thickness={5} color="inherit" />
                  ) : (
                    <CheckIcon sx={{ fontSize: 16 }} />
                  )}
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Cancel rename">
              <span>
                <IconButton
                  disabled={isSaving}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={cancelRename}
                  aria-label="Cancel renaming conversation"
                  sx={editorActionSx}
                >
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        ) : conversationId && title ? (
          <Tooltip title="Rename conversation" arrow>
            <MotionBox
              component="button"
              type="button"
              onClick={beginRename}
              disabled={!onRenameConversation}
              aria-label={`Rename conversation: ${title}`}
              data-title-motion={animateTitle ? 'live' : 'static'}
              initial={animateTitle ? titleMotion.initial : false}
              animate={titleMotion.animate}
              sx={{
                maxWidth: 'min(100%, 560px)',
                minWidth: 0,
                height: 32,
                display: 'inline-flex',
                alignItems: 'center',
                px: 1,
                border: 0,
                borderRadius: '8px',
                color: 'text.primary',
                bgcolor: 'transparent',
                cursor: onRenameConversation ? 'pointer' : 'default',
                '&:hover': { bgcolor: 'action.hover' },
                '&:focus-visible': {
                  outline: `2px solid ${theme.palette.border.focus}`,
                  outlineOffset: -2,
                },
              }}
            >
              <Typography
                component="span"
                noWrap
                sx={{ ...theme.typography.uiNavItem, fontSize: '0.875rem', fontWeight: 400 }}
              >
                {title}
              </Typography>
            </MotionBox>
          </Tooltip>
        ) : (
          <Box aria-hidden sx={{ height: 32 }} />
        )}
      </Box>
      {actions}
    </Box>
  );
});

export default ChatHeader;
