import { memo, useCallback, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Skeleton,
  Menu,
  MenuItem,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import QuestionAnswerOutlinedIcon from '@mui/icons-material/QuestionAnswerOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import { TOUCH_DEVICE_QUERY } from '../../styles/mediaQueries';

export const ConversationItem = memo(function ConversationItem({
  conv,
  isActive,
  onSelect,
  onDelete,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [menuAnchor, setMenuAnchor] = useState(null);
  const menuOpen = Boolean(menuAnchor);

  const handleClick = useCallback(() => onSelect(conv.id), [onSelect, conv.id]);
  const handleMenuOpen = useCallback((e) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
  }, []);
  const handleMenuClose = useCallback(() => setMenuAnchor(null), []);
  const handleDeleteFromMenu = useCallback((e) => {
    e.stopPropagation();
    setMenuAnchor(null);
    onDelete(conv.id);
  }, [onDelete, conv.id]);

  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <Box
        component="button"
        type="button"
        onClick={handleClick}
        aria-current={isActive ? 'true' : undefined}
        sx={{
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
          width: '100%',
          mb: 0.25,
          pl: 1.25,
          pr: 3.5,
          py: 0.75,
          minHeight: 38,
          borderRadius: '10px',
          border: 'none',
          outline: 'none',
          appearance: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: isActive ? theme.palette.text.primary : theme.palette.text.secondary,
          backgroundColor: isActive
            ? alpha(theme.palette.text.primary, isDark ? 0.1 : 0.07)
            : 'transparent',
          boxShadow: isActive
            ? `inset 2px 0 0 ${alpha(theme.palette.text.primary, isDark ? 0.45 : 0.35)}`
            : 'none',
          transition: theme.transitions.create(['background-color', 'color', 'box-shadow'], {
            duration: theme.transitions.duration.shorter,
          }),
          '& .options-btn': { opacity: 0 },
          '&:hover .options-btn, &:focus-within .options-btn': { opacity: 1 },
          ...(menuOpen && { '& .options-btn': { opacity: 1 } }),
          '&:hover .conv-title, &:focus-within .conv-title': {
            maskImage: 'linear-gradient(to right, black 78%, transparent 95%)',
            WebkitMaskImage: 'linear-gradient(to right, black 78%, transparent 95%)',
          },
          ...(menuOpen && {
            '& .conv-title': {
              maskImage: 'linear-gradient(to right, black 78%, transparent 95%)',
              WebkitMaskImage: 'linear-gradient(to right, black 78%, transparent 95%)',
            },
          }),
          [TOUCH_DEVICE_QUERY]: {
            '& .options-btn': { opacity: 1 },
            '& .conv-title': {
              maskImage: 'linear-gradient(to right, black 78%, transparent 95%)',
              WebkitMaskImage: 'linear-gradient(to right, black 78%, transparent 95%)',
            },
          },
          '&:hover': {
            backgroundColor: isActive
              ? alpha(theme.palette.text.primary, isDark ? 0.14 : 0.1)
              : alpha(theme.palette.text.primary, isDark ? 0.06 : 0.05),
            color: theme.palette.text.primary,
          },
          '&:focus-visible': {
            boxShadow: `0 0 0 2px ${alpha(theme.palette.text.primary, 0.2)}`,
          },
        }}
      >
        <Typography
          className="conv-title"
          noWrap
          sx={{
            flex: '1 1 auto',
            minWidth: 0,
            fontSize: '0.84rem',
            lineHeight: 1.3,
            fontWeight: isActive ? 500 : 400,
          }}
        >
          {conv.title || 'New Conversation'}
        </Typography>
        <IconButton
          className="options-btn"
          size="small"
          onClick={handleMenuOpen}
          aria-label="Conversation options"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          sx={{
            position: 'absolute',
            right: 4,
            top: '50%',
            transform: 'translateY(-50%)',
            p: 0.5,
            borderRadius: '6px',
            color: theme.palette.text.secondary,
            transition: 'opacity 0.15s ease, color 0.15s ease',
            '&:hover': {
              color: theme.palette.text.primary,
              backgroundColor: 'transparent',
            },
          }}
        >
          <MoreHorizRoundedIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
      <Menu
        anchorEl={menuAnchor}
        open={menuOpen}
        onClose={handleMenuClose}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              minWidth: 140,
              borderRadius: '10px',
              mt: 0.5,
            },
          },
        }}
      >
        <MenuItem
          onClick={handleDeleteFromMenu}
          sx={{ fontSize: '0.84rem', gap: 1, color: theme.palette.error.main }}
        >
          <ListItemIcon sx={{ minWidth: 'auto' }}>
            <DeleteOutlineRoundedIcon sx={{ fontSize: 16, color: 'inherit' }} />
          </ListItemIcon>
          Delete
        </MenuItem>
      </Menu>
    </Box>
  );
});

export const SidebarNavItem = memo(function SidebarNavItem({
  label,
  tooltip,
  icon,
  onClick,
  isCollapsed,
  isActive = false,
  showStatus = false,
  disabled = false,
  circularIconBg = false,
  shortcut,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Tooltip
      title={isCollapsed ? tooltip : ''}
      placement="right"
      arrow
      disableHoverListener={!isCollapsed || !tooltip}
      disableFocusListener={!isCollapsed || !tooltip}
      disableTouchListener={!isCollapsed || !tooltip}
    >
      <Box
        component="button"
        type="button"
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        aria-label={label}
        sx={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          minHeight: 38,
          my: 0.25,
          px: 1,
          py: 0.75,
          border: 'none',
          outline: 'none',
          appearance: 'none',
          cursor: disabled ? 'default' : 'pointer',
          textAlign: 'left',
          borderRadius: '10px',
          gap: 1,
          overflow: 'hidden',
          color: isActive ? theme.palette.text.primary : theme.palette.text.secondary,
          backgroundColor: isActive
            ? alpha(theme.palette.text.primary, isDark ? 0.1 : 0.07)
            : 'transparent',
          boxShadow: isActive
            ? `inset 2px 0 0 ${alpha(theme.palette.text.primary, isDark ? 0.45 : 0.35)}`
            : 'none',
          opacity: disabled ? 0.5 : (isActive ? 1 : 0.72),
          transition: theme.transitions.create(['opacity', 'background-color', 'box-shadow'], {
            duration: theme.transitions.duration.shorter,
          }),
          '&:hover:not(:disabled)': {
            opacity: 1,
          },
          '&:hover:not(:disabled) .shortcut-hint': { opacity: 1 },
          ...(circularIconBg && {
            '&:hover:not(:disabled) .nav-icon-wrapper': {
              backgroundColor: alpha(theme.palette.text.primary, isDark ? 0.18 : 0.14),
              transform: 'scale(1.08) rotate(-3deg)',
            },
            '&:active:not(:disabled) .nav-icon-wrapper': {
              transform: 'scale(0.98) rotate(6deg)',
            },
          }),
          '&:focus-visible': {
            boxShadow: `0 0 0 2px ${alpha(theme.palette.text.primary, 0.2)}`,
          },
        }}
      >
        <Box
          className="nav-icon-wrapper"
          component="span"
          sx={{
            display: 'inline-flex',
            flexShrink: 0,
            width: circularIconBg ? 24 : 20,
            height: circularIconBg ? 24 : 20,
            justifyContent: 'center',
            alignItems: 'center',
            color: 'inherit',
            position: 'relative',
            borderRadius: circularIconBg ? '50%' : 0,
            backgroundColor: circularIconBg
              ? alpha(theme.palette.text.primary, isDark ? 0.12 : 0.08)
              : 'transparent',
            transition: theme.transitions.create(['background-color', 'transform'], {
              duration: theme.transitions.duration.shorter,
            }),
          }}
        >
          {icon}
          {showStatus && (
            <Box
              sx={{
                position: 'absolute',
                top: -1,
                right: -2,
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: theme.palette.success.main,
                boxShadow: `0 0 0 1.5px ${theme.palette.background.paper}`,
              }}
            />
          )}
        </Box>
        <Box
          sx={{
            flex: '1 1 auto',
            minWidth: 0,
            maxWidth: isCollapsed ? 0 : 160,
            opacity: isCollapsed ? 0 : 1,
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
              fontSize: '0.88rem',
              lineHeight: 1.3,
              fontWeight: isActive ? 500 : 400,
              color: 'inherit',
            }}
          >
            {label}
          </Typography>
        </Box>
        {shortcut && !isCollapsed && (
          <Typography
            className="shortcut-hint"
            component="span"
            sx={{
              fontSize: '0.72rem',
              fontWeight: 400,
              color: 'text.disabled',
              flexShrink: 0,
              opacity: 0,
              transition: 'opacity 0.15s ease',
              whiteSpace: 'nowrap',
              pr: 0.25,
            }}
          >
            {shortcut}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
});

export const HistoryPopoverItem = memo(function HistoryPopoverItem({
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
      sx={{
        borderRadius: '10px',
        py: 0.75,
        px: 1,
        minHeight: 38,
      }}
    >
      <ListItemIcon sx={{ minWidth: 26 }}>
        {isActive ? (
          <CheckCircleOutlineRoundedIcon sx={{ fontSize: 16, color: theme.palette.text.primary }} />
        ) : (
          <QuestionAnswerOutlinedIcon sx={{ fontSize: 14, color: theme.palette.text.secondary }} />
        )}
      </ListItemIcon>
      <ListItemText
        primary={conv.title || 'New Conversation'}
        primaryTypographyProps={{
          noWrap: true,
          sx: {
            fontSize: '0.84rem',
            lineHeight: 1.3,
            fontWeight: isActive ? 500 : 400,
          },
        }}
      />
      <IconButton
        size="small"
        onClick={handleDelete}
        aria-label="Delete conversation"
        sx={{
          opacity: 0.5,
          padding: 0.5,
          color: theme.palette.text.secondary,
          transition: 'opacity 0.15s ease',
          '&:hover': { opacity: 1, backgroundColor: 'transparent' },
        }}
      >
        <DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} />
      </IconButton>
    </ListItemButton>
  );
});

export const HistoryListSkeleton = memo(function HistoryListSkeleton() {
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
            py: 0.875,
            mb: 0.25,
            minHeight: 38,
            borderRadius: '10px',
          }}
        >
          <Skeleton variant="circular" width={16} height={16} />
          <Skeleton
            variant="rounded"
            sx={{
              width: `${92 - (row % 3) * 14}%`,
              maxWidth: 170,
              height: 12,
              borderRadius: 999,
            }}
          />
        </Box>
      ))}
    </Box>
  );
});