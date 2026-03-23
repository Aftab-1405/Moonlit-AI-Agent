import { Box, Dialog, IconButton, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import {
  getCompactActionSx,
  getDialogFooterSx,
  getDialogHeaderSx,
  getDialogPaperSx,
} from '../styles/shared';

function DialogShell({
  open,
  onClose,
  isMobile = false,
  maxWidth = 'md',
  fullWidth = true,
  TransitionComponent,
  desktopMaxHeight = 720,
  desktopMinHeight = 400,
  headerLeading,
  headerIcon,
  headerTitle,
  titleVariant = 'h6',
  showCloseButton = true,
  closeAriaLabel = 'Close dialog',
  paperSx = {},
  bodySx = {},
  footer = null,
  footerSx = {},
  children,
}) {
  const theme = useTheme();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      TransitionComponent={TransitionComponent}
      PaperProps={{
        sx: {
          ...getDialogPaperSx(theme, { isMobile, desktopMaxHeight, desktopMinHeight }),
          ...paperSx,
        },
      }}
    >
      {(headerLeading || headerIcon || headerTitle || showCloseButton) && (
        <Box sx={getDialogHeaderSx()}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flex: 1 }}>
            {headerLeading}
            {headerIcon}
            {headerTitle ? (
              <Typography variant={titleVariant} fontWeight={600} sx={{ minWidth: 0 }}>
                {headerTitle}
              </Typography>
            ) : null}
          </Box>
          {showCloseButton ? (
            <IconButton
              onClick={onClose}
              size="small"
              aria-label={closeAriaLabel}
              sx={getCompactActionSx(theme)}
            >
              <CloseRoundedIcon />
            </IconButton>
          ) : null}
        </Box>
      )}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', ...bodySx }}>
        {children}
      </Box>
      {footer ? <Box sx={{ ...getDialogFooterSx(), ...footerSx }}>{footer}</Box> : null}
    </Dialog>
  );
}

export default DialogShell;
