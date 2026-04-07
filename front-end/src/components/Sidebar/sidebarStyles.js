import { alpha } from '@mui/material/styles';
import { UI_LAYOUT } from '../../styles/shared';

export const EXPANDED_WIDTH = UI_LAYOUT.sidebarExpandedWidth;
export const COLLAPSED_WIDTH = UI_LAYOUT.sidebarCollapsedWidth;

/**
 * Builds sx for the desktop sidebar <nav> element.
 * Replaces the old StyledDesktopSidebarPanel (styled MuiDrawer).
 * Result: 1 <nav> element instead of MuiDrawer > MuiPaper > MuiDrawer-paper (3+ wrappers).
 */
export function buildDesktopNavSx(theme, open) {
  const isDark = theme.palette.mode === 'dark';
  return {
    width: open ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
    flexShrink: 0,
    height: '100vh',
    position: 'sticky',
    top: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    zIndex: 2,
    transition: theme.transitions.create('width', {
      easing: theme.transitions.easing.sharp,
      duration: open
        ? theme.transitions.duration.enteringScreen
        : theme.transitions.duration.leavingScreen,
    }),
    backgroundColor: alpha(
      theme.palette.background.paper,
      isDark ? 0.9 : 0.98,
    ),
    backgroundImage: isDark
      ? `linear-gradient(180deg, ${alpha(theme.palette.common.white, 0.03)} 0%, transparent 18%)`
      : `linear-gradient(180deg, ${alpha(theme.palette.common.black, 0.02)} 0%, transparent 18%)`,
    borderRight: `1px solid ${alpha(
      theme.palette.text.primary,
      isDark ? 0.09 : 0.08,
    )}`,
    boxShadow: 'none',
  };
}

export function buildMobileDrawerPaperStyles(theme) {
  return {
    height: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    '@supports not (height: 100dvh)': {
      height: '100vh',
    },
    width: { xs: '88vw', sm: 320 },
    maxWidth: 320,
    paddingBottom: 'env(safe-area-inset-bottom)',
    borderRadius: 0,
    boxSizing: 'border-box',
    backgroundColor: theme.palette.background.paper,
    backgroundImage: theme.palette.mode === 'dark'
      ? `linear-gradient(180deg, ${alpha(theme.palette.common.white, 0.03)} 0%, transparent 18%)`
      : `linear-gradient(180deg, ${alpha(theme.palette.common.black, 0.02)} 0%, transparent 18%)`,
    borderRight: `1px solid ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.09 : 0.08)}`,
  };
}