/**
 * Shared styling helpers built on theme tokens.
 *
 * This module is the single source of truth for cross-cutting styling
 * primitives (popover paper, menu items, scrollbars, focus rings, etc.).
 * Anything that needs to look the same in multiple places should live here
 * so we can evolve the visual language in one shot.
 *
 * Conventions:
 *   - Hairline borders always use `1px solid <alpha(text.primary, n)>`.
 *     We avoid `0.5px` borders — they disappear on non-retina displays and
 *     render inconsistently across browsers. Lower alpha achieves the same
 *     "soft" feel without the rendering risk.
 *   - Focus rings use `--focus-ring` token below; do not roll your own.
 *   - Scrollbars are visible-but-subtle. Hiding them entirely (the old
 *     behaviour) removed a key navigation affordance in long conversations.
 */
import { alpha } from '@mui/material/styles';
import {
  BACKDROP_FILTER_FALLBACK_QUERY,
  HOVER_CAPABLE_QUERY,
  REDUCED_MOTION_QUERY,
  TOUCH_DEVICE_QUERY,
} from './mediaQueries.js';

const DIALOG_VIEWPORT_SUPPORT_QUERY = '@supports (height: 100dvh)';

export const UI_LAYOUT = Object.freeze({
  touchTarget: 44,
  compactTouchTarget: 40,
  controlRowHeight: 36,
  sidebarExpandedWidth: 344,
  sidebarCollapsedWidth: 52,
  chatInputMaxWidth: 768,
  contentMaxWidth: 800,
  dialogDesktopOffset: 64,
});

// ─── Z-index layer cake ───────────────────────────────────────────────────────
//
// Must stay in sync with MUI's built-in zIndex defaults:
//   appBar        1100
//   drawer        1200
//   modal         1300  ← ALL MUI portals: Menu, Popover, Select, Autocomplete
//   snackbar      1400
//   tooltip       1500
//
// Rule: artifactFullscreen MUST stay between drawer (1200) and modal (1300).
// If it ever exceeds 1300, MUI sidebar menus/popovers will be hidden behind
// the fullscreen panel — which is the bug this change was made to fix.
// ─────────────────────────────────────────────────────────────────────────────
export const UI_Z_INDEX = Object.freeze({
  mainContentBase: 1,
  mainContentControl: 3,
  artifactStickyHeader: 2,
  artifactFullscreen: 1250, // above drawer (1200), BELOW MUI modal (1300)
  mainContentModal: 1320, // our custom modals — above MUI modal
  confirmModal: 1400, // highest priority — confirm/destructive dialogs
});

export const UI_POPOVER = Object.freeze({
  paperRadius: '16px',
  paperPadding: 0.75,
  rowRadius: '8px',
  // Match the expanded-sidebar action/conversation rows on pointer devices.
  // Touch devices are promoted to `touchTarget` by getPopoverMenuItemSx.
  rowMinHeight: UI_LAYOUT.controlRowHeight,
  descriptiveRowMinHeight: 60,
  rowPaddingX: 1,
  rowPaddingY: 0.75,
  rowGap: 1,
  iconSlotWidth: 24,
  iconSize: 18,
  sectionGap: 0.5,
});

/** Subtle but discoverable scrollbar styling for product scroll regions. */
export const getScrollbarStyles = (theme, { compact = false } = {}) => ({
  scrollbarWidth: 'thin',
  scrollbarColor: `${theme.palette.scrollbar?.thumb || 'var(--scrollbar-thumb)'} transparent`,
  '&::-webkit-scrollbar': {
    display: 'block',
    width: compact ? 6 : 8,
    height: compact ? 6 : 8,
  },
  '&::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
  '&::-webkit-scrollbar-thumb': {
    minHeight: 32,
    border: '2px solid transparent',
    borderRadius: 999,
    backgroundColor: theme.palette.scrollbar?.thumb || 'var(--scrollbar-thumb)',
    backgroundClip: 'padding-box',
  },
  '&::-webkit-scrollbar-thumb:hover': {
    backgroundColor: theme.palette.scrollbar?.thumbHover || 'var(--scrollbar-thumb-hover)',
  },
  '&::-webkit-scrollbar-corner': { backgroundColor: 'transparent' },
});

const getPaletteInteractionColors = (palette, { active = false, tone = 'neutral' } = {}) => {
  const semanticColor = palette[tone]?.main;
  const color = tone === 'neutral' ? palette.text.primary : semanticColor || palette.text.primary;
  const textColor = tone === 'neutral' ? palette.text.primary : color;
  const restingTextColor = tone === 'neutral' ? palette.text.secondary : color;

  if (tone !== 'neutral') {
    return {
      color: active ? textColor : restingTextColor,
      restingColor: restingTextColor,
      hoverColor: textColor,
      activeColor: textColor,
      background: active ? alpha(color, palette.opacity.statusBackground) : 'transparent',
      hoverBackground: alpha(color, palette.opacity.statusHover),
      activeBackground: alpha(color, palette.opacity.statusSelected),
      activeHoverBackground: alpha(color, palette.opacity.statusSelectedHover),
      border: alpha(color, palette.opacity.statusBorder),
      hoverBorder: alpha(color, palette.opacity.statusBorderHover),
      activeBorder: alpha(color, palette.opacity.statusBorder),
      focusRing: palette.border.focus,
    };
  }

  return {
    color: active ? palette.text.primary : palette.text.secondary,
    restingColor: palette.text.secondary,
    hoverColor: palette.text.primary,
    activeColor: palette.text.primary,
    background: active ? palette.action.selected : 'transparent',
    hoverBackground: palette.action.hover,
    activeBackground: palette.action.selected,
    activeHoverBackground: palette.layer.medium,
    border: palette.border.idle,
    hoverBorder: palette.border.hover,
    activeBorder: palette.border.idle,
    focusRing: palette.border.focus,
  };
};

export const getInteractionColors = (theme, options = {}) =>
  getPaletteInteractionColors(theme.palette, options);

/** Shared idle → hover → focus treatment for outlined inputs and selects. */
export const getOutlinedFieldStateSx = (
  theme,
  {
    rootSelector = '& .MuiOutlinedInput-root',
    radius = '8px',
    backgroundColor = theme.palette.background.input,
  } = {},
) => ({
  [rootSelector]: {
    borderRadius: radius,
    backgroundColor,
    transition: theme.transitions.create(['background-color', 'border-color', 'box-shadow'], {
      duration: theme.transitions.duration.shorter,
    }),
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.border.idle,
    },
    '&:hover': {
      backgroundColor,
    },
    '&:hover .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.border.hover,
    },
    '&.Mui-focused': {
      backgroundColor,
      outline: 'none',
      boxShadow: 'none',
    },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.border.idle,
      borderWidth: 1,
    },
    '&.Mui-focused:hover': {
      backgroundColor,
    },
    '&.Mui-focused:hover .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.border.hover,
      borderWidth: 1,
    },
    '&.Mui-error .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.error.main,
    },
    '&.Mui-error.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.error.main,
      borderWidth: 1,
    },
  },
});

export const getInteractiveControlSx = (
  theme,
  {
    active = false,
    tone = 'neutral',
    size = 36,
    radius = '8px',
    showBorder = tone !== 'neutral',
  } = {},
) => {
  const interaction = getInteractionColors(theme, { active, tone });
  return {
    minHeight: size,
    borderRadius: radius,
    color: interaction.color,
    backgroundColor: interaction.background,
    borderColor: showBorder
      ? active
        ? interaction.activeBorder
        : interaction.border
      : 'transparent',
    transition: theme.transitions.create(
      ['background-color', 'border-color', 'color', 'box-shadow'],
      {
        duration: theme.transitions.duration.shorter,
      },
    ),
    [HOVER_CAPABLE_QUERY]: {
      '&:hover:not(:disabled):not(.Mui-disabled)': {
        color: interaction.hoverColor,
        backgroundColor: active ? interaction.activeHoverBackground : interaction.hoverBackground,
        borderColor: showBorder ? interaction.hoverBorder : 'transparent',
      },
    },
    '&:active:not(:disabled):not(.Mui-disabled)': {
      backgroundColor: interaction.activeBackground,
    },
    [REDUCED_MOTION_QUERY]: { transition: 'none' },
    '&:focus-visible': {
      outline: `2px solid ${interaction.focusRing}`,
      outlineOffset: 2,
    },
  };
};

export const getInteractiveIconButtonSx = (
  theme,
  {
    active = false,
    tone = 'neutral',
    size = 36,
    radius = '8px',
    showBorder = tone !== 'neutral',
  } = {},
) => ({
  ...getInteractiveControlSx(theme, { active, tone, size, radius, showBorder }),
  width: size,
  height: size,
  minWidth: size,
  minHeight: size,
  p: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid transparent',
  boxShadow: 'none',
});

export const getSegmentedToggleGroupSx = (
  theme,
  { itemMinHeight = 34, itemRadius = '8px', gap = 0.25 } = {},
) => {
  const interaction = getInteractionColors(theme);

  return {
    p: 0,
    gap,
    borderRadius: itemRadius,
    border: 'none',
    backgroundColor: 'transparent',
    boxShadow: 'none',
    display: 'flex',
    flexWrap: 'wrap',
    '& .MuiToggleButtonGroup-grouped': {
      minHeight: itemMinHeight,
      px: 1.25,
      py: 0,
      gap: 0.75,
      border: '1px solid transparent',
      borderColor: 'transparent',
      borderRadius: `${itemRadius} !important`,
      ml: '0 !important',
      textTransform: 'none',
      ...theme.typography.uiNavItem,
      fontWeight: 400,
      color: 'text.secondary',
      backgroundColor: 'transparent',
      transition: theme.transitions.create(['background-color', 'border-color', 'color'], {
        duration: theme.transitions.duration.shorter,
      }),
      [HOVER_CAPABLE_QUERY]: {
        '&:hover': {
          color: 'text.primary',
          backgroundColor: interaction.hoverBackground,
          borderColor: 'transparent',
        },
      },
      '&.Mui-selected': {
        color: 'text.primary',
        backgroundColor: interaction.activeBackground,
        borderColor: 'transparent',
        fontWeight: 400,
        [HOVER_CAPABLE_QUERY]: {
          '&:hover': {
            backgroundColor: interaction.activeHoverBackground,
            borderColor: 'transparent',
          },
        },
      },
      '&.Mui-disabled': {
        borderColor: 'transparent',
      },
      '&.Mui-focusVisible': {
        outline: `2px solid ${interaction.focusRing}`,
        outlineOffset: 2,
      },
    },
  };
};

export const getPopoverMenuListSx = () => ({
  py: UI_POPOVER.paperPadding,
  px: UI_POPOVER.paperPadding,
  display: 'flex',
  flexDirection: 'column',
  gap: 0.25,
});

export const getPopoverMenuItemSx = (
  theme,
  { active = false, tone = 'neutral', columns = 'auto minmax(0, 1fr)' } = {},
) => {
  const interaction = getInteractionColors(theme, { active, tone });

  return {
    ...theme.typography.uiNavItem,
    height: UI_POPOVER.rowMinHeight,
    minHeight: UI_POPOVER.rowMinHeight,
    boxSizing: 'border-box',
    borderRadius: UI_POPOVER.rowRadius,
    px: UI_POPOVER.rowPaddingX,
    py: UI_POPOVER.rowPaddingY,
    my: 0,
    mx: 0,
    gap: UI_POPOVER.rowGap,
    display: 'grid',
    gridTemplateColumns: columns,
    alignItems: 'center',
    color: interaction.color,
    backgroundColor: interaction.background,
    transition: theme.transitions.create(['background-color', 'color'], {
      duration: theme.transitions.duration.shorter,
    }),
    '& .MuiListItemIcon-root': {
      minWidth: UI_POPOVER.iconSlotWidth,
      width: UI_POPOVER.iconSlotWidth,
      color: 'inherit',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    '& .MuiSvgIcon-root': {
      fontSize: UI_POPOVER.iconSize,
    },
    [HOVER_CAPABLE_QUERY]: {
      '&:hover': {
        color: interaction.hoverColor,
        backgroundColor: active ? interaction.activeHoverBackground : interaction.hoverBackground,
      },
    },
    '&.Mui-selected': {
      color: interaction.activeColor,
      backgroundColor: interaction.activeBackground,
      fontWeight: 400,
      [HOVER_CAPABLE_QUERY]: {
        '&:hover': {
          backgroundColor: interaction.activeHoverBackground,
        },
      },
    },
    '&.Mui-focusVisible': {
      color: interaction.hoverColor,
      backgroundColor: active ? interaction.activeHoverBackground : interaction.hoverBackground,
      outline: `2px solid ${interaction.focusRing}`,
      outlineOffset: -2,
    },
    '&.Mui-selected.Mui-focusVisible': {
      color: interaction.activeColor,
      backgroundColor: interaction.activeHoverBackground,
      outline: `2px solid ${interaction.focusRing}`,
      outlineOffset: -2,
    },
    [TOUCH_DEVICE_QUERY]: {
      height: UI_LAYOUT.touchTarget,
      minHeight: UI_LAYOUT.touchTarget,
    },
  };
};

export const getInsetPanelSx = (
  theme,
  { backgroundOpacity = 0.5, borderRadius = 2, enableHover = false } = {},
) => ({
  borderRadius,
  border: 0,
  backgroundColor: alpha(theme.palette.background.paper, backgroundOpacity),
  ...(enableHover
    ? {
        transition: 'background-color 0.15s ease',
        [HOVER_CAPABLE_QUERY]: {
          '&:hover': {
            backgroundColor: theme.palette.layer.soft,
          },
        },
      }
    : {}),
});

export const getUtilityIconButtonSx = (theme, { padding = 0.5, radius = '6px' } = {}) => {
  const baseSx = getInteractiveControlSx(theme, { radius });
  return {
    ...baseSx,
    p: padding,
    minHeight: 'auto',
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    boxShadow: 'none',
  };
};

export const getPopoverSectionLabelSx = (theme, { pt = 0.5 } = {}) => ({
  px: UI_POPOVER.rowPaddingX,
  pt,
  pb: 0.375,
  ...theme.typography.uiCaptionMd,
  fontWeight: 400,
  color: 'text.disabled',
  display: 'block',
  lineHeight: 1.4,
});

export const getPopoverDividerSx = (theme, { my = 0.75, mx = 0.5 } = {}) => ({
  height: '1px',
  mx,
  my,
  backgroundColor: theme.palette.border.separator,
});

export const getDialogPaperSx = (
  theme,
  { isMobile = false, desktopMaxHeight = 720, desktopMinHeight = 400 } = {},
) => ({
  ...getPopoverPaperSx(theme, {
    borderRadius: isMobile ? 0 : '8px',
    height: isMobile ? '100vh' : `calc(100vh - ${UI_LAYOUT.dialogDesktopOffset}px)`,
    maxHeight: isMobile ? '100vh' : desktopMaxHeight,
    minHeight: isMobile ? '100vh' : desktopMinHeight,
    [DIALOG_VIEWPORT_SUPPORT_QUERY]: isMobile
      ? {
          height: '100dvh',
          maxHeight: '100dvh',
          minHeight: '100dvh',
        }
      : {},
    overflow: 'hidden',
  }),
});

export const getDialogHeaderSx = (theme) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  px: { xs: 2, sm: 3 },
  py: 2,
  borderBottom: '1px solid',
  borderColor: theme.palette.border.separator,
});

export const getDialogFooterSx = (theme) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  px: { xs: 2, sm: 3 },
  py: 2,
  paddingBottom: { xs: 'max(env(safe-area-inset-bottom), 12px)', sm: 2 },
  borderTop: '1px solid',
  borderColor: theme.palette.border.separator,
});

/**
 * Shared popover/menu paper styles.
 * Use this for any MUI Popover, Menu, or Select MenuProps so all
 * floating surfaces look identical regardless of which primitive is used.
 *
 * @example — MUI Menu
 *   PaperProps={{ sx: getPopoverPaperSx(theme) }}
 *
 * @example — MUI Select
 *   MenuProps={{ PaperProps: { sx: getPopoverPaperSx(theme) } }}
 *
 * @example — AppPopover (handled internally, no need to call directly)
 *
 * @param {object} theme     — MUI theme
 * @param {object} overrides — extra sx merged last (e.g. width, mt, p overrides)
 */
/**
 * Shared secondary action button sx.
 *
 * Used for small action buttons that appear inside content areas —
 * "View diagram", "Filter to selection", "Copy row", "Load older messages",
 * etc. Keeps every small action button in the app visually identical:
 *   - borderRadius: 8px
 *   - typography: uiBodySm
 *   - color: text.secondary → text.primary on hover
 *   - border: hairline at low alpha
 *   - padding: px 1.75, py 0.625
 *
 * Usage:
 *   <Button size="small" variant="outlined" sx={getSecondaryActionButtonSx(theme)}>...</Button>
 */
export const getSecondaryActionButtonSx = (theme) => {
  return {
    borderRadius: 9999,
    textTransform: 'none',
    ...theme.typography.uiBodySm,
    fontWeight: 400,
    px: 1.75,
    py: 0.5,
    minHeight: 30,
    color: 'text.secondary',
    borderColor: theme.palette.border.idle,
    backgroundColor: 'transparent',
    transition: theme.transitions.create(['background-color', 'border-color', 'color'], {
      duration: theme.transitions.duration.shorter,
    }),
    [HOVER_CAPABLE_QUERY]: {
      '&:hover': {
        color: 'text.primary',
        borderColor: theme.palette.border.hover,
        backgroundColor: theme.palette.action.hover,
      },
    },
    '&.Mui-focusVisible': {
      outline: `2px solid ${theme.palette.border.focus}`,
      outlineOffset: 2,
    },
  };
};

export const getPopoverPaperSx = (theme, overrides = {}) => ({
  borderRadius: UI_POPOVER.paperRadius,
  overflowX: 'hidden',
  border: `1px solid ${theme.palette.border.subtle}`,
  color: 'text.primary',
  backgroundColor: theme.palette.background.elevated || theme.palette.background.paper,
  backgroundImage: 'none',
  backdropFilter: 'none',
  WebkitBackdropFilter: 'none',
  boxShadow: 'none',
  [BACKDROP_FILTER_FALLBACK_QUERY]: {
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    backgroundColor: theme.palette.background.paper,
  },
  ...overrides,
});
