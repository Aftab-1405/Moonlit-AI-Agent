import { useState, useCallback, memo } from 'react';
import {
  Button,
  Typography,
  Box,
  CircularProgress,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import DialogShell from './DialogShell';
import {
  getInsetPanelSx,
  UI_LAYOUT,
} from '../styles/shared';

/**
 * Custom confirmation dialog that matches the app's theme.
 * Use instead of window.confirm() for better UX.
 */
function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmColor = 'primary',
  icon = null,
  sqlQuery = null,
}) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const isCompactMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [isExecuting, setIsExecuting] = useState(false);

  const handleExecute = useCallback(async () => {
    if (isExecuting) return;
    setIsExecuting(true);
    try {
      await onConfirm?.();
    } finally {
      setIsExecuting(false);
    }
  }, [isExecuting, onConfirm]);

  const handleClose = useCallback(() => {
    if (!isExecuting) {
      onClose?.();
    }
  }, [isExecuting, onClose]);

  return (
    <DialogShell
      open={open}
      onClose={handleClose}
      isMobile={isCompactMobile}
      maxWidth="sm"
      desktopMaxHeight={560}
      desktopMinHeight={280}
      headerIcon={icon || <WarningAmberRoundedIcon sx={{ color: 'warning.main' }} />}
      headerTitle={title}
      closeAriaLabel="Close confirmation dialog"
      bodySx={{ flexDirection: 'column' }}
      footer={(
        <>
          <Button
            onClick={handleClose}
            color="inherit"
            disabled={isExecuting}
            fullWidth={isCompactMobile}
            sx={{ color: 'text.secondary', borderColor: 'divider', minHeight: UI_LAYOUT.touchTarget }}
          >
            {cancelText}
          </Button>
          <Button
            onClick={handleExecute}
            disabled={isExecuting}
            color={confirmColor}
            fullWidth={isCompactMobile}
            startIcon={isExecuting ? <CircularProgress size={16} color="inherit" /> : (sqlQuery ? <PlayArrowRoundedIcon /> : null)}
            sx={{ minWidth: 100, minHeight: UI_LAYOUT.touchTarget }}
          >
            {isExecuting ? 'Executing...' : confirmText}
          </Button>
        </>
      )}
      footerSx={{ gap: 1, flexWrap: 'wrap' }}
    >
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="body1" color="text.secondary">
          {message}
        </Typography>
        {sqlQuery ? (
          <Box
            sx={{
              ...getInsetPanelSx(theme, { backgroundOpacity: isDarkMode ? 0.1 : 0.04, borderRadius: theme.shape.borderRadius / 4 + 2 }),
              fontFamily: theme.typography.fontFamilyMono,
              fontSize: theme.typography.uiCodeBlock.fontSize,
              maxHeight: 200,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: 'text.primary',
              p: 2,
            }}
          >
            {sqlQuery}
          </Box>
        ) : null}
      </Box>
    </DialogShell>
  );
}

export default memo(ConfirmDialog);

