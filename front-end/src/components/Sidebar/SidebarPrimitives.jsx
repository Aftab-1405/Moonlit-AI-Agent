import { memo, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Skeleton,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import QuestionAnswerOutlinedIcon from '@mui/icons-material/QuestionAnswerOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import { TOUCH_DEVICE_QUERY } from '../../styles/mediaQueries';

export const ConversationItem = memo(function ConversationItem({
  conv,
  isActive,
  onSelect,
  onDelete,
}) {
  const theme = useTheme();
  const handleClick = useCallback(() => onSelect(conv.id), [onSelect, conv.id]);
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
          py: 0.875,
          minHeight: 38,
          borderRadius: '10px',
          alignItems: 'center',
          color: theme.palette.text.secondary,
          backgroundColor: 'transparent',
          '& .delete-btn': { opacity: 0 },
          '&:hover .delete-btn, &:focus-within .delete-btn': { opacity: 1 },
          [TOUCH_DEVICE_QUERY]: { '& .delete-btn': { opacity: 1 } },
          '&:hover': {
            backgroundColor: alpha(theme.palette.text.primary, 0.05),
            color: theme.palette.text.primary,
          },
          '&.Mui-selected': {
            backgroundColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.1 : 0.07),
            color: theme.palette.text.primary,
          },
          '&.Mui-selected:hover': {
            backgroundColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.13 : 0.09),
          },
        }}
      >
        <ListItemIcon sx={{ minWidth: 0, mr: 1.25, color: 'inherit' }}>
          <QuestionAnswerOutlinedIcon sx={{ fontSize: 16 }} />
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
            minWidth: { xs: 34, sm: 'auto' },
            minHeight: { xs: 34, sm: 'auto' },
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

export const SidebarNavItem = memo(function SidebarNavItem({
  label,
  tooltip,
  icon,
  onClick,
  isCollapsed,
  isActive = false,
  showStatus = false,
  disabled = false,
}) {
  const theme = useTheme();

  return (
    <Tooltip
      title={isCollapsed ? tooltip : ''}
      placement="right"
      arrow
      disableHoverListener={!isCollapsed || !tooltip}
      disableFocusListener={!isCollapsed || !tooltip}
      disableTouchListener={!isCollapsed || !tooltip}
    >
      <Box sx={{ px: 0.75, py: 0.25 }}>
        <ListItemButton
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          sx={{
            minHeight: 38,
            px: 1,
            py: 0.75,
            borderRadius: '10px',
            justifyContent: 'flex-start',
            gap: 1,
            overflow: 'hidden',
            color: isActive ? theme.palette.text.primary : theme.palette.text.secondary,
            backgroundColor: isActive
              ? alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.1 : 0.07)
              : 'transparent',
            transition: theme.transitions.create(['background-color', 'color'], {
              duration: theme.transitions.duration.shorter,
            }),
            '&:hover': {
              backgroundColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.08 : 0.05),
              color: theme.palette.text.primary,
            },
          }}
        >
          <ListItemIcon
            sx={{
              minWidth: 20,
              width: 20,
              color: 'inherit',
              position: 'relative',
              justifyContent: 'center',
              flexShrink: 0,
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
                }}
              />
            )}
          </ListItemIcon>

          {/*
            FIX: Removed `flex: isCollapsed ? '0 0 0px' : '1 1 auto'`.
            Changing the flex shorthand triggers a layout reflow mid-transition
            because the browser recalculates flex-grow, flex-shrink, and flex-basis
            simultaneously. maxWidth + opacity is sufficient and avoids reflow.
          */}
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
        </ListItemButton>
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