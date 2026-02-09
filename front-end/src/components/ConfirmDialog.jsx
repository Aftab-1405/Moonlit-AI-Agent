import { useState, useCallback, memo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  CircularProgress,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { BORDER_RADIUS } from '../styles/shared';

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
    <Dialog
      open={open}
      onClose={handleClose}
      fullScreen={isCompactMobile}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: isCompactMobile ? 0 : BORDER_RADIUS.lg,
          backgroundImage: 'none',
        },
      }}
    >
      <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 }, px: { xs: 2, sm: 3 } }}>
        {icon || <WarningAmberRoundedIcon sx={{ color: 'warning.main' }} />}
        <Typography variant="h6" component="span" fontWeight={600}>
          {title}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
        <Typography variant="body1" color="text.secondary" sx={{ mb: sqlQuery ? 2 : 0 }}>
          {message}
        </Typography>
        {sqlQuery && (
          <Box
            sx={{
              p: 2,
              borderRadius: BORDER_RADIUS.lg,
              backgroundColor: alpha(theme.palette.text.primary, isDarkMode ? 0.1 : 0.04),
              border: '1px solid',
              borderColor: theme.palette.divider,
              fontFamily: theme.typography.fontFamilyMono,
              fontSize: '0.85rem',
              maxHeight: 200,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: 'text.primary',
            }}
          >
            {sqlQuery}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 3 }, gap: 1, flexWrap: 'wrap' }}>
        <Button
          onClick={handleClose}
          color="inherit"
          disabled={isExecuting}
          fullWidth={isCompactMobile}
          sx={{ color: 'text.secondary', borderColor: 'divider', minHeight: 44 }}
        >
          {cancelText}
        </Button>
        <Button
          onClick={handleExecute}
          disabled={isExecuting}
          color={confirmColor}
          fullWidth={isCompactMobile}
          startIcon={isExecuting ? <CircularProgress size={16} color="inherit" /> : (sqlQuery ? <PlayArrowRoundedIcon /> : null)}
          sx={{ minWidth: 100, minHeight: 44 }}
        >
          {isExecuting ? 'Executing...' : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default memo(ConfirmDialog);
