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
  const isDark = theme.palette.mode === 'dark';

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
            borderRadius: '16px',
            border: `1px solid ${
              isDark
                ? alpha(theme.palette.primary.main, 0.28)
                : alpha(theme.palette.primary.main, 0.2)
            }`,
            backgroundColor: isDark
              ? alpha(theme.palette.background.elevated, 0.94)
              : alpha(theme.palette.background.paper, 0.97),
            backgroundImage: isDark
              ? `linear-gradient(180deg, ${alpha('#ffffff', 0.03)}, transparent 60%)`
              : `linear-gradient(180deg, ${alpha('#000000', 0.012)}, transparent 60%)`,
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow: isDark
              ? `0 1px 2px ${alpha('#000', 0.44)},
                 0 8px 20px -4px ${alpha('#000', 0.48)},
                 0 24px 48px -8px ${alpha('#000', 0.32)}`
              : `0 1px 2px ${alpha('#000', 0.06)},
                 0 8px 20px -4px ${alpha('#000', 0.1)},
                 0 24px 48px -8px ${alpha('#000', 0.08)}`,
            p: 0.75,
            [BACKDROP_FILTER_FALLBACK_QUERY]: {
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
              backgroundColor: isDark
                ? theme.palette.background.elevated
                : theme.palette.background.paper,
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
