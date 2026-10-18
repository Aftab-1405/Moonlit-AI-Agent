import { HOVER_CAPABLE_QUERY } from '../../../styles/mediaQueries.js';
import { getInteractionColors, UI_LAYOUT } from '../../../styles/shared.js';
import { getAppPanelSurfaceSx } from '../../styles/interfaceChrome.js';

/**
 * Sidebar styling primitives.
 *
 * Every clickable row in the sidebar (toggle, nav items, conversation rows,
 * footer) goes through `buildNavRowSx` or `buildConversationRowSx` so the
 * row geometry — height, padding, icon column width, border radius — stays
 * consistent. Visual state (hover, active, focus, disabled) is driven by
 * the shared `getInteractionColors` helper.
 *
 * Layout invariants:
 *   - `ICON_COL` (36px) is the fixed-width icon slot for navigation rows.
 *   - `ROW_PX` (8px) is the horizontal inset for every row's hover pill.
 *   - `ROW_HEIGHT` (36px) is the consistent height for every row.
 */

const SIDEBAR_RADIUS = '10px';

// ─── Shared token ────────────────────────────────────────────────────────────
// Every clickable row uses the same horizontal inset (px: ROW_PX = 8px each side).
// The icon column is ICON_COL wide — a fixed-width slot that centers the icon.
// Height is controlled by the row's minHeight, not the icon slot.
const ROW_PX = 1; // MUI spacing → 8px each side
export const ICON_COL = 36; // px — fixed icon column width only (not height)
const ROW_HEIGHT = UI_LAYOUT.controlRowHeight; // shared with popover action rows
const focusRing = (theme) => `0 0 0 3px ${theme.palette.border.focus}`;

export function getSidebarRailTooltipSlotProps(_theme) {
  return {
    popper: {
      modifiers: [
        {
          name: 'offset',
          options: { offset: [0, 8] },
        },
      ],
    },
  };
}

export function getCollapsingLabelSx(_theme, collapsed, maxWidth = 200) {
  return {
    flex: '1 1 auto',
    minWidth: 0,
    maxWidth: collapsed ? 0 : maxWidth,
    opacity: collapsed ? 0 : 1,
    overflow: 'hidden',
  };
}

// ─── Nav row (toggle, nav items, footer) ─────────────────────────────────────
export function buildNavRowSx(
  theme,
  { isActive = false, disabled = false, collapsed = false } = {},
) {
  const interaction = getInteractionColors(theme, { active: isActive });
  return {
    display: 'flex',
    position: 'relative',
    alignItems: 'center',
    width: collapsed ? '36px' : '100%',
    height: { xs: UI_LAYOUT.touchTarget, md: ROW_HEIGHT },
    minHeight: { xs: UI_LAYOUT.touchTarget, md: ROW_HEIGHT },
    px: ROW_PX,
    py: 0,
    gap: 0,
    border: 'none',
    outline: 'none',
    appearance: 'none',
    textAlign: 'left',
    cursor: disabled ? 'default' : 'pointer',
    borderRadius: SIDEBAR_RADIUS,
    boxSizing: 'border-box',
    backgroundColor: isActive ? interaction.activeBackground : 'transparent',
    boxShadow: 'none',
    color: isActive ? theme.palette.text.primary : theme.palette.text.secondary,
    opacity: disabled ? 0.4 : 1,
    transition: theme.transitions.create(
      ['background-color', 'color', 'opacity', 'box-shadow', 'width'],
      {
        duration: theme.transitions.duration.shorter,
      },
    ),
    [HOVER_CAPABLE_QUERY]: {
      '&:hover:not(:disabled)': {
        backgroundColor: isActive ? interaction.activeHoverBackground : interaction.hoverBackground,
        color: theme.palette.text.primary,
      },
    },
    '&:active:not(:disabled)': { backgroundColor: interaction.activeBackground },
    '&:focus-visible': {
      outline: 'none',
      // Use boxShadow (not outline) so the ring doesn't clip with borderRadius.
      boxShadow: focusRing(theme),
    },
  };
}

// ─── Conversation row ─────────────────────────────────────────────────────────
export function buildConversationRowSx(theme, { isActive = false, isRenaming = false } = {}) {
  const interaction = getInteractionColors(theme, { active: isActive });
  return {
    display: 'grid',
    gridTemplateColumns: isRenaming
      ? { xs: 'minmax(0, 1fr) 88px', md: 'minmax(0, 1fr) 56px' }
      : 'minmax(0, 1fr) auto',
    columnGap: 0,
    alignItems: 'center',
    position: 'relative',
    width: '100%',
    height: { xs: UI_LAYOUT.touchTarget, md: ROW_HEIGHT },
    minHeight: { xs: UI_LAYOUT.touchTarget, md: ROW_HEIGHT },
    pl: 0,
    pr: 0,
    py: 0,
    mb: 0.125,
    border: 'none',
    outline: 'none',
    appearance: 'none',
    cursor: isRenaming ? 'default' : 'pointer',
    textAlign: 'left',
    borderRadius: SIDEBAR_RADIUS,
    boxSizing: 'border-box',
    backgroundColor: isActive ? interaction.activeBackground : 'transparent',
    color: isActive ? theme.palette.text.primary : theme.palette.text.secondary,
    boxShadow: 'none',
    transition: theme.transitions.create(['background-color', 'color', 'box-shadow'], {
      duration: theme.transitions.duration.shorter,
    }),
    '&:hover .conversation-options, & .conversation-options:focus-visible, & .conversation-options.Mui-focusVisible':
      {
        opacity: 1,
        color: theme.palette.text.primary,
      },
    '&:hover .conversation-title-text, & .conversation-select:focus-visible .conversation-title-text':
      {
        transform: 'translateX(calc(-1 * var(--conversation-title-overflow)))',
        transition: 'transform var(--conversation-title-duration) linear 300ms',
      },
    '@media (prefers-reduced-motion: reduce)': {
      '&:hover .conversation-title-text, & .conversation-select:focus-visible .conversation-title-text':
        {
          transition: 'none',
        },
    },
    '&:hover': {
      backgroundColor: isActive ? interaction.activeHoverBackground : interaction.hoverBackground,
      color: theme.palette.text.primary,
    },
  };
}

export function buildConversationSelectSx(theme) {
  return {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    minWidth: 0,
    pl: 1,
    pr: 0,
    py: 0,
    border: 0,
    outline: 0,
    appearance: 'none',
    borderRadius: SIDEBAR_RADIUS,
    color: 'inherit',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    boxShadow: 'none',
    '&:focus-visible': {
      outline: 'none',
      boxShadow: focusRing(theme),
    },
  };
}

// ─── Desktop nav element ──────────────────────────────────────────────────────
//
// The desktop sidebar's outer column (including width animation, surface paint,
// and right-edge divider) is owned by AppShell. The Sidebar feature fills its
// slot — so this sx only needs to fill the parent and constrain overflow.
export function buildDesktopNavSx(_theme) {
  return {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
    boxSizing: 'border-box',
  };
}

// ─── Mobile drawer paper ──────────────────────────────────────────────────────
export function buildMobileDrawerPaperStyles(theme) {
  return {
    height: '100dvh',
    '@supports not (height: 100dvh)': { height: '100vh' },
    display: 'flex',
    flexDirection: 'column',
    width: { xs: '88vw', sm: 320 },
    maxWidth: 320,
    paddingBottom: 'env(safe-area-inset-bottom)',
    borderRadius: '0 20px 20px 0',
    boxSizing: 'border-box',
    ...getAppPanelSurfaceSx(theme),
    backgroundColor: theme.palette.background.paper,
    borderRight: 'none',
  };
}
