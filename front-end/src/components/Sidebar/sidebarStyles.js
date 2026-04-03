import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import { alpha, styled } from '@mui/material/styles';
import { UI_LAYOUT } from '../../styles/shared';

export const EXPANDED_WIDTH = UI_LAYOUT.sidebarExpandedWidth;
export const COLLAPSED_WIDTH = UI_LAYOUT.sidebarCollapsedWidth;

export const CONTENT_CONTAINER_STYLES = {
  height: '100dvh',
  minHeight: '100dvh',
  display: 'flex',
  flexDirection: 'column',
};

const buildDesktopSurfaceStyles = (theme) => ({
  backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.9 : 0.98),
  backgroundImage: theme.palette.mode === 'dark'
    ? `linear-gradient(180deg, ${alpha(theme.palette.common.white, 0.03)} 0%, transparent 18%)`
    : `linear-gradient(180deg, ${alpha(theme.palette.common.black, 0.02)} 0%, transparent 18%)`,
  borderRight: `1px solid ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.09 : 0.08)}`,
  boxShadow: 'none',
});

const openedMixin = (theme) => ({
  width: EXPANDED_WIDTH,
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  overflowX: 'hidden',
  ...buildDesktopSurfaceStyles(theme),
});

const closedMixin = (theme) => ({
  width: COLLAPSED_WIDTH,
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  overflowX: 'hidden',
  ...buildDesktopSurfaceStyles(theme),
});

export const StyledDesktopSidebarPanel = styled(Drawer, {
  shouldForwardProp: (prop) => prop !== 'open',
})(({ theme, open }) => ({
  width: open ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
  flexShrink: 0,
  alignSelf: 'stretch',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
  zIndex: 2,
  ...(open
    ? {
        ...openedMixin(theme),
        '& .MuiDrawer-paper': {
          ...CONTENT_CONTAINER_STYLES,
          position: 'relative',
          boxSizing: 'border-box',
          ...openedMixin(theme),
        },
      }
    : {
        ...closedMixin(theme),
        '& .MuiDrawer-paper': {
          ...CONTENT_CONTAINER_STYLES,
          position: 'relative',
          boxSizing: 'border-box',
          ...closedMixin(theme),
        },
      }),
}));

export function buildMobileDrawerPaperStyles(theme) {
  return {
    ...CONTENT_CONTAINER_STYLES,
    width: { xs: '88vw', sm: 320 },
    maxWidth: 320,
    height: '100dvh',
    '@supports not (height: 100dvh)': {
      height: '100vh',
    },
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