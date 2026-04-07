import { memo } from 'react';
import { Popover } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { BACKDROP_FILTER_FALLBACK_QUERY } from '../styles/mediaQueries';

/**
 * AppPopover — shared styled Popover shell.
 *
 * Owns all paper styling (blur, border, shadow, radius). Each consumer
 * controls positioning via anchorOrigin/transformOrigin, sizing via `width`,
 * and any per-instance paper overrides via `paperSx`.
 *
 * Props:
 *   anchorEl        — anchor DOM element
 *   open            — controlled open state
 *   onClose         — close handler
 *   anchorOrigin    — MUI anchorOrigin (default: top-left)
 *   transformOrigin — MUI transformOrigin (default: bottom-left)
 *   width           — number → responsive { xs: min(Npx, calc(100vw-24px)), sm: N }
 *                     or an MUI sx width value. Omit to let content/paperSx control width.
 *   paperSx         — extra sx merged into Paper (e.g. mt, ml, minWidth, maxWidth)
 *   children        — popover content
 *   ...rest         — spread to MUI Popover (aria labels, disablePortal, etc.)
 */
const AppPopover = memo(function AppPopover({
  anchorEl,
  open,
  onClose,
  anchorOrigin = { vertical: 'top', horizontal: 'left' },
  transformOrigin = { vertical: 'bottom', horizontal: 'left' },
  width,
  paperSx,
  children,
  ...rest
}) {
  const theme = useTheme();

  return (
    <Popover
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      anchorOrigin={anchorOrigin}
      transformOrigin={transformOrigin}
      slotProps={{
        paper: {
          sx: {
            ...(width !== undefined && {
              width:
                typeof width === 'number'
                  ? { xs: `min(${width}px, calc(100vw - 24px))`, sm: width }
                  : width,
            }),
            borderRadius: '14px',
            border: `0.5px solid ${alpha(theme.palette.text.primary, 0.1)}`,
            backgroundColor:
              theme.palette.mode === 'dark'
                ? alpha(theme.palette.background.elevated, 0.97)
                : alpha(theme.palette.background.paper, 0.99),
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow:
              theme.palette.mode === 'dark'
                ? `0 2px 8px ${alpha(theme.palette.common.black, 0.32)}`
                : `0 2px 8px ${alpha(theme.palette.common.black, 0.08)}`,
            p: 0.75,
            [BACKDROP_FILTER_FALLBACK_QUERY]: {
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
            },
            ...paperSx,
          },
        },
      }}
      {...rest}
    >
      {children}
    </Popover>
  );
});

export default AppPopover;
