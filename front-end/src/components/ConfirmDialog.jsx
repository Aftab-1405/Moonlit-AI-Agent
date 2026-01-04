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
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';

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
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '12px',
          backgroundImage: 'none',
        },
      }}
    >
      <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {icon || <WarningAmberRoundedIcon sx={{ color: 'warning.main' }} />}
        <Typography variant="h6" component="span" fontWeight={600}>
          {title}
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body1" color="text.secondary" sx={{ mb: sqlQuery ? 2 : 0 }}>
          {message}
        </Typography>

        {/* SQL query preview */}
        {sqlQuery && (
          <Box
            sx={{
              p: 2,
              borderRadius: '12px',
              backgroundColor: alpha(theme.palette.text.primary, isDarkMode ? 0.1 : 0.04),
              border: '1px solid',
              borderColor: theme.palette.divider,
              fontFamily: '"JetBrains Mono", monospace',
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

      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button
          onClick={handleClose}
          color="inherit"
          disabled={isExecuting}
          sx={{ color: 'text.secondary', borderColor: 'divider' }}
        >
          {cancelText}
        </Button>
        <Button
          onClick={handleExecute}
          disabled={isExecuting}
          color={confirmColor}
          startIcon={isExecuting ? <CircularProgress size={16} color="inherit" /> : (sqlQuery ? <PlayArrowRoundedIcon /> : null)}
          sx={{ minWidth: 100 }}
        >
          {isExecuting ? 'Executing...' : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default memo(ConfirmDialog);
