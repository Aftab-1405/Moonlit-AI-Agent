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
import { useTheme } from '@mui/material/styles';
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
          py: 1,
          borderRadius: 1.5,
          minHeight: 44,
          color: theme.palette.text.secondary,
          backgroundColor: 'transparent',
          '& .delete-btn': { opacity: 0 },
          '&:hover .delete-btn': { opacity: 1 },
          [TOUCH_DEVICE_QUERY]: { '& .delete-btn': { opacity: 1 } },
          '&:hover': {
            backgroundColor: theme.palette.action.hover,
            color: theme.palette.text.primary,
          },
          '&.Mui-selected': {
            backgroundColor: theme.palette.action.selected,
            color: theme.palette.text.primary,
          },
          '&.Mui-selected:hover': { backgroundColor: theme.palette.action.selected },
        }}
      >
        <ListItemIcon sx={{ minWidth: 0, mr: 1.5, color: 'inherit' }}>
          <QuestionAnswerOutlinedIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText
          primary={conv.title || 'New Conversation'}
          primaryTypographyProps={{ variant: 'body2', noWrap: true, sx: { fontWeight: isActive ? 500 : 400 } }}
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
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          mb: 0.25,
          px: 0.5,
          minHeight: 44,
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
        {!isCollapsed && (
          <Box sx={{ ml: 0.5, minWidth: 0, overflow: 'hidden' }}>
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
    <ListItemButton selected={isActive} onClick={handleClick} sx={{ borderRadius: 1, py: 0.75, minHeight: { xs: 40, sm: 34 } }}>
      <ListItemIcon sx={{ minWidth: 28 }}>
        {isActive ? (
          <CheckCircleOutlineRoundedIcon sx={{ fontSize: 16, color: theme.palette.text.primary }} />
        ) : (
          <QuestionAnswerOutlinedIcon sx={{ fontSize: 14, color: theme.palette.text.secondary }} />
        )}
      </ListItemIcon>
      <ListItemText
        primary={conv.title || 'New Conversation'}
        primaryTypographyProps={{ variant: 'body2', noWrap: true, sx: { fontWeight: isActive ? 500 : 400 } }}
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
