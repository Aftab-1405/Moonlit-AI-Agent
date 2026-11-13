import { useAppearanceReducedMotion } from '@/hooks/useAppearanceReducedMotion';
import { Box, MenuItem, Popover, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { forwardRef, memo } from 'react';
import {
  getPopoverMenuItemSx,
  getPopoverPaperSx,
  getPopoverSectionLabelSx,
  getScrollbarStyles,
  UI_POPOVER,
} from '@/styles/shared';

/** Standard section heading used inside AppPopover surfaces. */
export const AppPopoverSectionLabel = memo(function AppPopoverSectionLabel({
  children,
  sx,
  ...props
}) {
  const theme = useTheme();
  return (
    <Typography sx={[getPopoverSectionLabelSx(theme), sx]} {...props}>
      {children}
    </Typography>
  );
});

/**
 * Standard scroll/list region. It deliberately owns the internal spacing so
 * callers do not need one-off margin and scrollbar adjustments.
 */
export const AppPopoverList = memo(
  forwardRef(function AppPopoverList({ children, maxHeight = 320, sx, ...props }, ref) {
    const theme = useTheme();
    return (
      <Box
        ref={ref}
        sx={[
          {
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            maxHeight,
            overflowY: 'auto',
            overflowX: 'hidden',
            ...getScrollbarStyles(theme, { compact: true }),
          },
          sx,
        ]}
        {...props}
      >
        {children}
      </Box>
    );
  }),
);

/** Shared empty-state treatment for every popover use case. */
export const AppPopoverEmptyState = memo(function AppPopoverEmptyState({
  title,
  description,
  sx,
  ...props
}) {
  const theme = useTheme();
  return (
    <Box
      role="status"
      sx={[
        {
          px: UI_POPOVER.rowPaddingX,
          py: 1,
          minHeight: UI_POPOVER.rowMinHeight,
          borderRadius: UI_POPOVER.rowRadius,
        },
        sx,
      ]}
      {...props}
    >
      <Typography sx={{ ...theme.typography.uiNavItem, color: 'text.primary', fontWeight: 400 }}>
        {title}
      </Typography>
      {description ? (
        <Typography sx={{ ...theme.typography.uiCaptionMd, color: 'text.secondary', mt: 0.25 }}>
          {description}
        </Typography>
      ) : null}
    </Box>
  );
});

/**
 * Canonical popover row. Single-line selectors and descriptive command rows
 * share the same alignment, interaction, icon slots, and selected treatment.
 */
export const AppPopoverItem = memo(function AppPopoverItem({
  label,
  description,
  icon,
  trailing,
  reserveTrailing = false,
  selected = false,
  tone = 'neutral',
  role = 'menuitem',
  ariaChecked,
  tabIndex = 0,
  labelSx,
  descriptionSx,
  sx,
  ...props
}) {
  const theme = useTheme();
  const hasLeading = Boolean(icon);
  const hasTrailing = reserveTrailing || Boolean(trailing);
  const columns = [
    hasLeading ? `${UI_POPOVER.iconSlotWidth}px` : null,
    'minmax(0, 1fr)',
    hasTrailing ? '20px' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <MenuItem
      component="div"
      role={role}
      aria-checked={ariaChecked}
      tabIndex={tabIndex}
      selected={selected}
      sx={[getPopoverMenuItemSx(theme, { active: selected, tone, columns }), sx]}
      {...props}
    >
      {hasLeading ? (
        <Box
          component="span"
          aria-hidden
          sx={{
            width: UI_POPOVER.iconSlotWidth,
            minWidth: UI_POPOVER.iconSlotWidth,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: tone === 'neutral' ? (selected ? 'text.primary' : 'text.secondary') : 'inherit',
            '& .MuiSvgIcon-root': { fontSize: UI_POPOVER.iconSize },
          }}
        >
          {icon}
        </Box>
      ) : null}
      <Box sx={{ minWidth: 0 }}>
        {typeof label === 'string' ? (
          <Typography
            noWrap
            sx={{
              font: 'inherit',
              color: 'inherit',
              fontWeight: 400,
              minWidth: 0,
              ...labelSx,
            }}
          >
            {label}
          </Typography>
        ) : (
          label
        )}
        {description ? (
          <Typography
            noWrap
            title={typeof description === 'string' ? description : undefined}
            sx={{
              fontSize: 12,
              lineHeight: '16px',
              color: 'text.secondary',
              mt: 0.25,
              minWidth: 0,
              ...descriptionSx,
            }}
          >
            {description}
          </Typography>
        ) : null}
      </Box>
      {hasTrailing ? (
        <Box
          component="span"
          aria-hidden
          sx={{
            width: 20,
            minWidth: 20,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: props.disabled
              ? 'text.disabled'
              : selected && ariaChecked
                ? 'accent.foreground'
                : 'text.primary',
            '& .MuiSvgIcon-root': { fontSize: UI_POPOVER.iconSize },
          }}
        >
          {trailing || null}
        </Box>
      ) : null}
    </MenuItem>
  );
});

/**
 * AppPopover — shared styled Popover shell.
 *
 * Owns all paper styling via getPopoverPaperSx (from styles/shared).
 * Each consumer controls positioning via anchorOrigin/transformOrigin,
 * sizing via `width`, and any per-instance overrides via `paperSx`.
 *
 * Use this for custom floating surfaces. MUI Menu and Select keep their
 * native primitives for keyboard/focus semantics, but consume the same
 * popover tokens through shared helpers and theme overrides.
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
 *   transitionDuration — compact enter/exit timing; respects reduced-motion automatically
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
  transitionDuration = { enter: 140, exit: 100 },
  slotProps = {},
  children,
  ...rest
}) {
  const theme = useTheme();
  const prefersReducedMotion = useAppearanceReducedMotion();

  const responsiveWidth =
    typeof width === 'number' ? { xs: `min(${width}px, calc(100vw - 24px))`, sm: width } : width;

  const sharedPaperSx = {
    ...getPopoverPaperSx(theme),
    p: UI_POPOVER.paperPadding,
    maxWidth: 'calc(100vw - 24px)',
    maxHeight: 'calc(100vh - 24px)',
    overflow: 'hidden',
    isolation: 'isolate',
    '@supports (height: 100dvh)': {
      maxHeight: 'calc(100dvh - 24px)',
    },
    ...(width !== undefined && { width: responsiveWidth }),
  };

  return (
    <Popover
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      anchorOrigin={anchorOrigin}
      transformOrigin={transformOrigin}
      marginThreshold={12}
      transitionDuration={prefersReducedMotion ? 0 : transitionDuration}
      slotProps={{
        ...slotProps,
        paper: {
          elevation: 0,
          'data-app-popover': '',
          ...slotProps.paper,
          sx: [sharedPaperSx, paperSx, slotProps.paper?.sx],
        },
      }}
      {...rest}
    >
      {children}
    </Popover>
  );
});

export default AppPopover;
