/**
 * Premium surface tokens for the logged-in interface shell.
 *
 * Dark interface styling shared across sidebar, chat, artifacts, and settings.
 * Anything that needs to look like "the app chrome" should source
 * its visual language from this module so the whole shell stays cohesive.
 *
 * Conventions:
 *   - All hairline borders go through `getHairlineBorder` so they stay 1px
 *     and never disappear on non-retina displays.
 *   - The composer keeps its existing low-contrast hairline in every state.
 *
 * @module features/styles/interfaceChrome
 */

import { TOUCH_DEVICE_QUERY } from '../../styles/mediaQueries.js';
import { UI_LAYOUT } from '../../styles/shared.js';

export const COMPOSER_MAX_WIDTH = UI_LAYOUT.chatInputMaxWidth;

/** Radius scale used by interface chrome. */
export const INTERFACE_RADIUS = Object.freeze({
  row: '8px',
  control: '8px',
  composer: '26px',
  suggestionPanel: '16px',
  panel: '8px',
  popover: '8px',
});

/** Responsive pill geometry for labeled chat controls. */
export function getResponsivePillControlSx(theme, { desktopHeight, mobileHeight = 44 } = {}) {
  return {
    height: { xs: mobileHeight, md: desktopHeight },
    minHeight: { xs: mobileHeight, md: desktopHeight },
    borderRadius: theme.shape.radius.pill,
  };
}

/** Responsive pill geometry for square chat icon buttons. */
export function getResponsivePillIconButtonSx(theme, { desktopSize, mobileSize = 44 } = {}) {
  return {
    width: { xs: mobileSize, md: desktopSize },
    height: { xs: mobileSize, md: desktopSize },
    minWidth: { xs: mobileSize, md: desktopSize },
    minHeight: { xs: mobileSize, md: desktopSize },
    borderRadius: theme.shape.radius.pill,
    [TOUCH_DEVICE_QUERY]: { minWidth: UI_LAYOUT.touchTarget, minHeight: UI_LAYOUT.touchTarget },
  };
}

/** Offset a mobile touch target by its container gutter while preserving its size. */
export function getMobileEdgeControlSx(edge, gutter) {
  const marginProperty = edge === 'right' ? 'mr' : 'ml';

  return {
    [marginProperty]: { xs: -gutter, sm: 0 },
  };
}

/** Spacing and minimum-height contract for the chat composer. */
export function getComposerLayoutSx(theme) {
  return {
    form: {
      px: 0,
      pb: { xs: `max(${theme.spacing(1)}, env(safe-area-inset-bottom))`, md: 1 },
    },
    surface: { minHeight: { xs: 116, md: 108 } },
    content: { px: { xs: 1.5, md: 2 }, py: 1.5, gap: 1 },
    toolbar: { gap: 1 },
  };
}

/**
 * Stable three-row stage used by both the welcome and active chat states.
 * Structural track changes intentionally snap so streaming updates cannot
 * displace the composer while its containing grid is mid-transition.
 */
export function getChatStageLayoutSx(placement) {
  const isWelcome = placement === 'welcome';
  return {
    gridTemplateRows: isWelcome
      ? 'minmax(0, 1fr) auto minmax(0, 1fr)'
      : 'minmax(0, 1fr) auto minmax(0, 0fr)',
    transition: 'none',
    reducedMotion: { transition: 'none' },
    composer: { gridRow: 2 },
    transcript: {
      gridRow: 1,
      pointerEvents: isWelcome ? 'none' : 'auto',
    },
  };
}

/** Full-viewport layout contract for the immersive schema mindmap viewer. */
export function getMindmapViewerLayoutSx() {
  return {
    paper: {
      width: '100vw',
      maxWidth: '100vw',
      height: '100dvh',
      maxHeight: '100dvh',
      minHeight: '100dvh',
      m: 0,
      borderRadius: 0,
      '@supports not (height: 100dvh)': {
        height: '100vh',
        maxHeight: '100vh',
        minHeight: '100vh',
      },
    },
    header: {
      minHeight: { xs: 64, sm: 68 },
      px: { xs: 1.5, sm: 2.5, md: 3 },
      py: 0,
      flexShrink: 0,
    },
    content: {
      width: '100%',
      maxWidth: 'none',
      mx: 0,
      px: { xs: 1, sm: 1.5, md: 2 },
      pt: { xs: 1, sm: 1.5, md: 2 },
      pb: { xs: 'max(8px, env(safe-area-inset-bottom))', sm: 1.5, md: 2 },
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      overflow: 'hidden',
      minHeight: 0,
    },
    canvas: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      width: '100%',
      minWidth: 0,
      minHeight: 0,
    },
  };
}

/** Keep the full schema legible while avoiding excessive empty fit-view space. */
export function getMindmapFitViewOptions(isMobile) {
  return { padding: isMobile ? 0.18 : 0.1 };
}

/** Trackpad and mouse-wheel gestures zoom the mindmap; dragging pans it. */
export function getMindmapInteractionProps(isMobile) {
  return {
    panOnScroll: false,
    panOnDrag: true,
    zoomOnScroll: !isMobile,
    zoomOnPinch: true,
    preventScrolling: true,
  };
}

/** Responsive spacing contract for the empty chat state. */
export function getWelcomeLayoutSx() {
  return {
    outer: {
      alignItems: { xs: 'stretch', sm: 'safe center' },
      px: { xs: 1, md: 3 },
      pt: { xs: 2.5, md: 4 },
      pb: { xs: 0, sm: 2.5, md: 4 },
    },
    content: {
      height: { xs: '100%', sm: 'auto' },
      minHeight: 0,
      gap: { xs: 0, sm: 2, md: 3 },
    },
    hero: {
      flex: { xs: 1, sm: '0 0 auto' },
      minHeight: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    composer: {
      width: '100%',
      flexShrink: 0,
    },
    suggestions: {
      display: { xs: 'none', sm: 'block' },
    },
  };
}

/** Category control styling for welcome suggestions. */
export function getWelcomeCategorySx(theme) {
  return {
    height: { xs: 44, md: 32 },
    minHeight: { xs: 44, md: 32 },
    minWidth: { xs: 44, md: 0 },
    px: 1.5,
    gap: 0.75,
    borderRadius: INTERFACE_RADIUS.control,
    border: 0,
    backgroundColor: theme.palette.action.hover,
    color: theme.palette.text.secondary,
    boxShadow: 'none',
    '& .MuiButton-startIcon': { m: 0 },
    '&:hover': {
      backgroundColor: theme.palette.action.selected,
      color: theme.palette.text.primary,
    },
    '&.Mui-focusVisible': {
      backgroundColor: theme.palette.action.selected,
      outline: `2px solid ${theme.palette.border.focus}`,
      outlineOffset: 2,
      boxShadow: 'none',
    },
  };
}

/** Shared panel surface for welcome suggestions. */
export function getWelcomeSuggestionPanelSx(theme) {
  return {
    width: '100%',
    maxWidth: COMPOSER_MAX_WIDTH,
    borderRadius: INTERFACE_RADIUS.suggestionPanel,
    border: `1px solid ${theme.palette.border.idle}`,
    backgroundColor: theme.palette.background.input,
    backgroundImage: 'none',
    boxShadow: 'none',
    overflow: 'hidden',
  };
}

/** Compact close control for the welcome suggestion panel header. */
export function getWelcomeSuggestionCloseSx(theme) {
  return {
    width: { xs: 44, md: 28 },
    height: { xs: 44, md: 28 },
    minWidth: { xs: 44, md: 28 },
    minHeight: { xs: 44, md: 28 },
    p: 0,
    borderRadius: INTERFACE_RADIUS.control,
    color: theme.palette.text.secondary,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
      color: theme.palette.text.primary,
    },
    '&.Mui-focusVisible': {
      backgroundColor: theme.palette.action.hover,
      outline: `2px solid ${theme.palette.border.focus}`,
      outlineOffset: 1,
    },
  };
}

/**
 * Hairline border — 1px solid with low-alpha foreground.
 * We never use `0.5px` borders because they vanish on non-retina displays.
 */
function getHairlineBorder(theme) {
  return `1px solid ${theme.palette.border.separator}`;
}

/** Standardised divider colour used between major interface sections. */
export function getAppDividerColor(theme) {
  return theme.palette.border.separator;
}

/** Panel surface — sidebar, artifact panel, settings sections. */
export function getAppPanelSurfaceSx(theme) {
  return {
    backgroundColor: theme.palette.background.default,
    backgroundImage: 'none',
  };
}

/** Bar surface — toolbar / header strips inside panels. */
export function getAppBarSurfaceSx(theme) {
  return {
    backgroundColor: theme.palette.background.paper,
    backgroundImage: 'none',
  };
}

/** Sunken surface — workspace canvas background. Sits one step below panels. */
export function getAppSunkenSurfaceSx(theme) {
  return {
    backgroundColor: theme.palette.background.default,
    backgroundImage: 'none',
  };
}

/** Shell workspace surface — main chat column background. */
export function getShellWorkspaceSx(theme) {
  return {
    backgroundColor: theme.palette.background.default,
    border: `1px solid ${theme.palette.border.subtle}`,
    borderRadius: { xs: 0, md: '20px' },
    backgroundImage: 'none',
  };
}

/** Layout-only sidebar wrapper; rounded surfaces paint above the shell backdrop. */
export function getSidebarChromeSx(_theme) {
  return {
    backgroundColor: 'transparent',
    backgroundImage: 'none',
    borderRight: 'none',
    boxShadow: 'none',
  };
}

/**
 * Composer (chat input) surface.
 *
 * The composer uses a solid tone one step lighter than the surrounding canvas.
 */
export function getComposerSurfaceSx(theme) {
  return {
    borderRadius: INTERFACE_RADIUS.composer,
    border: `1px solid ${theme.palette.border.idle}`,
    overflow: 'hidden',
    backgroundColor: theme.palette.background.composer,
    backgroundImage: 'none',
    boxShadow: 'none',
    transition: 'border-color 140ms ease, background-color 140ms ease',
  };
}

/** Artifact card uses the same enclosed surface as the chat workspace. */
export function getArtifactPanelChromeSx(theme) {
  return {
    ...getShellWorkspaceSx(theme),
    borderRadius: '20px',
  };
}

/**
 * Preference surface paper — full-height right-side panel used by the
 * settings overlay. Stretches to viewport height, full-width column.
 */
export function getPreferencePanelPaperSx(theme, left, width) {
  return {
    position: 'fixed',
    inset: '0 auto auto auto',
    left,
    top: 0,
    width,
    maxWidth: width,
    height: '100vh',
    maxHeight: '100vh',
    minHeight: '100vh',
    m: 0,
    borderRadius: 0,
    borderLeft: getHairlineBorder(theme),
    backgroundColor: theme.palette.background.default,
    backgroundImage: 'none',
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    boxShadow: 'none',
  };
}

/** Preference section surface — individual cards inside the settings panel. */
export function getPreferenceSectionSurfaceSx(theme) {
  return {
    borderRadius: INTERFACE_RADIUS.panel,
    border: getHairlineBorder(theme),
    backgroundColor: theme.palette.layer.surfaceMuted,
    backgroundImage: 'none',
    overflow: 'hidden',
    boxSizing: 'border-box',
    px: { xs: 2, sm: 2.5 },
    py: { xs: 0.75, sm: 1 },
  };
}

/** Welcome hero typography — the large headline on the empty chat state. */
export function getWelcomeHeroSx(theme) {
  return {
    ...theme.typography.uiDisplaySm,
    width: '100%',
    maxWidth: COMPOSER_MAX_WIDTH,
    fontSize: { xs: '1.35rem', md: '1.5rem' },
    fontWeight: 400,
    lineHeight: 1.4,
    color: 'text.primary',
  };
}
