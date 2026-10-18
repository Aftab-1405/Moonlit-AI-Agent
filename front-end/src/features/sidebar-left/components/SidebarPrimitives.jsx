import {
  Box,
  CircularProgress,
  IconButton,
  InputBase,
  ListItemIcon,
  Menu,
  MenuItem,
  Skeleton,
  Tooltip,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { CheckIcon, CloseIcon, DeleteIcon, MoreIcon, RenameIcon } from '@/components/icons';
import { getConversationActivityPresentation } from '@/features/sidebar-left/conversationActivityModel';
import {
  buildConversationRowSx,
  buildConversationSelectSx,
  buildNavRowSx,
  getCollapsingLabelSx,
  getSidebarRailTooltipSlotProps,
  ICON_COL,
} from '@/features/sidebar-left/styles/sidebarStyles';
import { HOVER_CAPABLE_QUERY } from '@/styles/mediaQueries';
import {
  getPopoverMenuItemSx,
  getPopoverMenuListSx,
  getPopoverPaperSx,
  getUtilityIconButtonSx,
  UI_LAYOUT,
  UI_POPOVER,
} from '@/styles/shared';
import { getConversationDisplayTitle } from '@/utils/conversationTitles';

/**
 * Sidebar primitive components — the building blocks rendered inside the
 * sidebar (left). Exported components:
 *
 *   - `SidebarNavItem`        — single row in the nav list (Search, History, Database, etc.)
 *   - `ConversationItem`      — single row in the Recents list, with rename/delete menu
 *   - `HistoryListSkeleton`   — loading placeholder for the conversation list
 *
 * All rows share the same geometry (height, icon column width, padding) via
 * `buildNavRowSx` / `buildConversationRowSx` in sidebarStyles.js.
 */

const ConversationTitle = memo(function ConversationTitle({ title, theme }) {
  const viewportRef = useRef(null);
  const textRef = useRef(null);
  const [overflowWidth, setOverflowWidth] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!viewport || !text) return undefined;

    const measureOverflow = () => {
      const nextOverflow = Math.max(0, Math.ceil(text.scrollWidth - viewport.clientWidth));
      setOverflowWidth((currentOverflow) =>
        currentOverflow === nextOverflow ? currentOverflow : nextOverflow,
      );
    };

    measureOverflow();

    if (typeof ResizeObserver === 'undefined') return undefined;
    const resizeObserver = new ResizeObserver(measureOverflow);
    resizeObserver.observe(viewport);
    resizeObserver.observe(text);
    return () => resizeObserver.disconnect();
  }, []);

  const travelDuration = Math.min(5000, Math.max(1200, overflowWidth * 25));

  return (
    <Box
      ref={viewportRef}
      component="span"
      className="conversation-title"
      sx={{
        width: 'auto',
        flex: 1,
        height: '100%',
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        '--conversation-title-overflow': `${overflowWidth}px`,
        '--conversation-title-duration': `${travelDuration}ms`,
      }}
    >
      <Typography
        ref={textRef}
        component="span"
        className="conversation-title-text"
        sx={{
          ...theme.typography.uiNavItem,
          display: 'inline-block',
          minWidth: 'max-content',
          fontWeight: 400,
          lineHeight: theme.typography.uiNavItem.lineHeight,
          whiteSpace: 'nowrap',
          transform: 'translateX(0)',
          transition: 'transform 180ms ease-out',
          '@media (prefers-reduced-motion: reduce)': {
            transition: 'none',
          },
        }}
      >
        {title}
      </Typography>
    </Box>
  );
});

const ConversationActivity = memo(function ConversationActivity({ presentation }) {
  if (!presentation) return null;

  return (
    <Tooltip title={presentation.label}>
      <Box
        component="span"
        aria-hidden="true"
        data-conversation-activity={presentation.kind}
        sx={{
          width: 18,
          height: 18,
          ml: 0.5,
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color:
            presentation.kind === 'error'
              ? 'error.main'
              : presentation.kind === 'attention'
                ? 'warning.main'
                : 'text.secondary',
        }}
      >
        {presentation.kind === 'generating' ? (
          <CircularProgress size={12} thickness={5} color="inherit" />
        ) : presentation.kind === 'done' ? (
          <CheckIcon sx={{ fontSize: 14 }} />
        ) : presentation.kind === 'error' ? (
          <CloseIcon sx={{ fontSize: 14 }} />
        ) : (
          <Box
            component="span"
            sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'currentColor' }}
          />
        )}
      </Box>
    </Tooltip>
  );
});

const ConversationActivityStatus = memo(function ConversationActivityStatus({
  presentation,
  title,
}) {
  if (!presentation) return null;

  return (
    <Box
      component="span"
      role="status"
      aria-label={`${presentation.label} for ${title}`}
      sx={{
        position: 'absolute',
        width: 1,
        height: 1,
        p: 0,
        m: -1,
        overflow: 'hidden',
        clip: 'rect(0 0 0 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    />
  );
});

const InlineConversationTitle = memo(function InlineConversationTitle({
  title,
  saving,
  onChange,
  onCommit,
  onCancel,
  theme,
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = useCallback(
    (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        onCommit?.();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onCancel?.();
      }
    },
    [onCancel, onCommit],
  );

  const actionButtonSx = {
    width: { xs: UI_LAYOUT.touchTarget, md: 26 },
    height: { xs: UI_LAYOUT.touchTarget, md: 26 },
    minWidth: { xs: UI_LAYOUT.touchTarget, md: 26 },
    minHeight: { xs: UI_LAYOUT.touchTarget, md: 26 },
    p: 0,
    border: 0,
    borderRadius: 9999,
    color: 'text.secondary',
    backgroundColor: 'transparent',
    boxShadow: 'none',
    '&:hover, &:active': {
      color: 'text.primary',
      backgroundColor: 'transparent',
    },
    '&:focus-visible': {
      outline: `1px solid ${theme.palette.border.focus}`,
      outlineOffset: -1,
      backgroundColor: 'transparent',
    },
  };

  return (
    <>
      <Box component="span" sx={{ minWidth: 0, px: 0.25 }}>
        <InputBase
          inputRef={inputRef}
          value={title}
          disabled={saving}
          onChange={(event) => onChange?.(event.target.value)}
          onKeyDown={handleKeyDown}
          onClick={(event) => event.stopPropagation()}
          inputProps={{ maxLength: 80, 'aria-label': 'Conversation title' }}
          sx={{
            width: '100%',
            height: { xs: UI_LAYOUT.touchTarget, md: 28 },
            minWidth: 0,
            px: 0.875,
            border: '1px solid',
            borderColor: theme.palette.border.hover,
            borderRadius: '8px',
            color: 'text.primary',
            backgroundColor: theme.palette.background.input,
            boxShadow: 'none',
            '&.Mui-focused': {
              borderColor: theme.palette.border.hover,
              outline: 'none',
              boxShadow: 'none',
            },
            '& .MuiInputBase-input': {
              minWidth: 0,
              p: 0,
              ...theme.typography.uiNavItem,
              lineHeight: '26px',
            },
          }}
        />
      </Box>
      <Box
        component="span"
        sx={{
          width: { xs: 88, md: 56 },
          height: '100%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: { xs: 0, md: 0.25 },
        }}
      >
        <Tooltip title="Save rename">
          <span>
            <IconButton
              size="small"
              disableRipple
              disabled={saving || !title.trim()}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                onCommit?.();
              }}
              aria-label="Save conversation title"
              sx={actionButtonSx}
            >
              {saving ? (
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
              size="small"
              disableRipple
              disabled={saving}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                onCancel?.();
              }}
              aria-label="Cancel renaming conversation"
              sx={actionButtonSx}
            >
              <CloseIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </>
  );
});

function getConversationOptionsButtonSx(theme, menuOpen) {
  return {
    ...getUtilityIconButtonSx(theme),
    width: { xs: UI_LAYOUT.touchTarget, md: 28 },
    height: { xs: UI_LAYOUT.touchTarget, md: 28 },
    minWidth: { xs: UI_LAYOUT.touchTarget, md: 28 },
    minHeight: { xs: UI_LAYOUT.touchTarget, md: 28 },
    borderRadius: 9999,
    opacity: { xs: 1, md: menuOpen ? 1 : 0 },
    color: menuOpen ? 'text.primary' : 'text.secondary',
    backgroundColor: 'transparent',
    transition: theme.transitions.create(['background-color', 'color', 'opacity'], {
      duration: theme.transitions.duration.shorter,
    }),
    [HOVER_CAPABLE_QUERY]: {
      '&:hover': {
        color: 'text.primary',
        backgroundColor: 'transparent',
        borderColor: 'transparent',
      },
    },
    '&:active, &:focus-visible': {
      backgroundColor: 'transparent',
    },
  };
}

// ─── ConversationItem ─────────────────────────────────────────────────────────
export const ConversationItem = memo(function ConversationItem({
  conv,
  activity,
  isActive,
  onSelect,
  onDelete,
  inlineRename,
  renameSurface,
  onRenameStart,
  onRenameChange,
  onRenameCancel,
  onRenameCommit,
}) {
  const theme = useTheme();
  const [menuAnchor, setMenuAnchor] = useState(null);
  const menuOpen = Boolean(menuAnchor);
  const optionsButtonSx = getConversationOptionsButtonSx(theme, menuOpen);
  const renameMenuItemSx = getPopoverMenuItemSx(theme);
  const deleteMenuItemSx = getPopoverMenuItemSx(theme, { tone: 'error' });
  const title = conv.title || 'New Conversation';
  const displayTitle = getConversationDisplayTitle(title);
  const isRenaming = inlineRename?.conversationId === conv.id;
  const activityPresentation = getConversationActivityPresentation(activity, { isActive });

  const handleClick = useCallback(() => onSelect(conv.id), [onSelect, conv.id]);
  const handleMenuOpen = useCallback((e) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
  }, []);
  const handleMenuClose = useCallback(() => setMenuAnchor(null), []);
  const handleDelete = useCallback(
    (e) => {
      e.stopPropagation();
      setMenuAnchor(null);
      onDelete(conv.id);
    },
    [onDelete, conv.id],
  );
  const handleRename = useCallback(
    (e) => {
      e.stopPropagation();
      setMenuAnchor(null);
      onRenameStart?.(renameSurface, conv.id, title);
    },
    [conv.id, onRenameStart, renameSurface, title],
  );

  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <Box sx={buildConversationRowSx(theme, { isActive, menuOpen, isRenaming })}>
        {isRenaming ? (
          <InlineConversationTitle
            title={inlineRename.title}
            saving={inlineRename.saving}
            onChange={onRenameChange}
            onCommit={onRenameCommit}
            onCancel={onRenameCancel}
            theme={theme}
          />
        ) : (
          <>
            <Box
              component="button"
              type="button"
              className="conversation-select"
              onClick={handleClick}
              aria-current={isActive ? 'page' : undefined}
              aria-label={`Open ${title}`}
              sx={buildConversationSelectSx(theme)}
            >
              <ConversationTitle key={displayTitle} title={displayTitle} theme={theme} />
              <ConversationActivity presentation={activityPresentation} />
            </Box>
            <ConversationActivityStatus presentation={activityPresentation} title={title} />
            <Tooltip title="Conversation options" arrow>
              <IconButton
                className="conversation-options"
                size="small"
                disableRipple
                onClick={handleMenuOpen}
                aria-label={`Options for ${title}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                sx={optionsButtonSx}
              >
                <MoreIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Box>

      <Menu
        anchorEl={menuAnchor}
        open={menuOpen}
        disableRestoreFocus={isRenaming}
        onClose={handleMenuClose}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: getPopoverPaperSx(theme, {
              minWidth: 160,
              mt: 0.75,
              p: 0,
            }),
          },
          list: { sx: getPopoverMenuListSx() },
        }}
      >
        <MenuItem
          onClick={handleRename}
          sx={{
            ...renameMenuItemSx,
          }}
        >
          <ListItemIcon>
            <RenameIcon />
          </ListItemIcon>
          Rename
        </MenuItem>
        <MenuItem onClick={handleDelete} sx={deleteMenuItemSx}>
          <ListItemIcon>
            <DeleteIcon />
          </ListItemIcon>
          Delete
        </MenuItem>
      </Menu>
    </Box>
  );
});

export const SidebarNavItem = memo(function SidebarNavItem({
  buttonRef,
  label,
  ariaLabel = label,
  tooltip,
  icon,
  onClick,
  onPointerEnter,
  onPointerLeave,
  expanded,
  isCollapsed,
  isActive = false,
  showStatus = false,
  disabled = false,
  uiTarget,
}) {
  const theme = useTheme();
  const tooltipTitle = disabled || isCollapsed ? tooltip || label : '';
  const railTooltipSlotProps = getSidebarRailTooltipSlotProps(theme);

  return (
    <Tooltip
      title={tooltipTitle}
      placement="right"
      arrow
      slotProps={railTooltipSlotProps}
      disableHoverListener={!tooltipTitle}
      disableFocusListener={!tooltipTitle}
      disableTouchListener={!tooltipTitle}
    >
      <Box component="span" sx={{ display: 'block', width: isCollapsed ? '36px' : '100%' }}>
        <Box
          ref={buttonRef}
          component="button"
          type="button"
          onClick={disabled ? undefined : onClick}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          aria-expanded={expanded}
          disabled={disabled}
          aria-label={ariaLabel}
          data-ui-target={uiTarget}
          sx={{
            ...buildNavRowSx(theme, { isActive, disabled, collapsed: isCollapsed }),
            px: 0,
          }}
        >
          {/* ── Icon column ── always ICON_COL wide, icon centered inside ── */}
          <Box
            component="span"
            sx={{
              display: 'inline-flex',
              flexShrink: 0,
              width: ICON_COL,
              justifyContent: 'center',
              alignItems: 'center',
              position: 'relative',
            }}
          >
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                color: showStatus ? 'text.primary' : 'inherit',
              }}
            >
              {icon}
            </Box>
          </Box>

          {/* ── Label — collapses to zero when sidebar is collapsed ── */}
          <Box sx={getCollapsingLabelSx(theme, isCollapsed)}>
            <Typography
              noWrap
              sx={{
                ...theme.typography.uiNavItem,
                fontWeight: 400,
                color: 'inherit',
                textAlign: 'left',
              }}
            >
              {label}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Tooltip>
  );
});

// ─── HistoryListSkeleton ──────────────────────────────────────────────────────
// Skeleton rows match the two-column conversation-row geometry. The options
// column is intentionally empty until interaction.
export const HistoryListSkeleton = memo(function HistoryListSkeleton() {
  return (
    <Box role="status" aria-label="Loading recent conversations" sx={{ px: 1, pb: 1 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Box
          key={i}
          sx={{
            display: 'grid',
            alignItems: 'center',
            gridTemplateColumns: 'minmax(0, 1fr) 32px',
            pl: 1,
            pr: 0,
            py: 0,
            mb: 0.25,
            height: { xs: UI_LAYOUT.touchTarget, md: UI_POPOVER.rowMinHeight },
            minHeight: { xs: UI_LAYOUT.touchTarget, md: UI_POPOVER.rowMinHeight },
          }}
        >
          <Skeleton
            variant="rounded"
            animation="wave"
            sx={{
              width: `${88 - (i % 3) * 12}%`,
              maxWidth: 168,
              height: 10,
              borderRadius: 999,
            }}
          />
        </Box>
      ))}
    </Box>
  );
});
