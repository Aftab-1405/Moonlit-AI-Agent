import Box from '@mui/material/Box';
import { styled } from '@mui/material/styles';
import { getGlassmorphismStyles, UI_LAYOUT } from '../../styles/shared';
import {
  BACKDROP_FILTER_FALLBACK_QUERY,
  MOBILE_MD_QUERY,
} from '../../styles/mediaQueries';

export const EXPANDED_WIDTH = UI_LAYOUT.sidebarExpandedWidth;
export const COLLAPSED_WIDTH = UI_LAYOUT.sidebarCollapsedWidth;
export const MOBILE_MEDIA_QUERY = MOBILE_MD_QUERY;

export const CONTENT_CONTAINER_STYLES = {
  position: 'relative',
  height: '100%',
  minHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
};

const buildGlassPanelStyles = (theme) => ({
  ...getGlassmorphismStyles(theme),
  borderRight: `1px solid ${theme.palette.border.subtle}`,
  [BACKDROP_FILTER_FALLBACK_QUERY]: {
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
  },
});

const openedMixin = (theme) => ({
  width: EXPANDED_WIDTH,
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  overflowX: 'hidden',
  ...buildGlassPanelStyles(theme),
});

const closedMixin = (theme) => ({
  width: COLLAPSED_WIDTH,
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  overflowX: 'hidden',
  ...buildGlassPanelStyles(theme),
});

export const StyledDesktopSidebarPanel = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'open',
})(({ theme, open }) => ({
  ...CONTENT_CONTAINER_STYLES,
  flexShrink: 0,
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
  ...(open ? openedMixin(theme) : closedMixin(theme)),
}));

export function buildMobileDrawerPaperStyles(theme) {
  return {
    ...CONTENT_CONTAINER_STYLES,
    width: { xs: '90vw', sm: 320 },
    maxWidth: 320,
    height: '100dvh',
    '@supports not (height: 100dvh)': {
      height: '100vh',
    },
    paddingBottom: 'env(safe-area-inset-bottom)',
    borderRadius: 0,
    boxSizing: 'border-box',
    ...getGlassmorphismStyles(theme),
    [BACKDROP_FILTER_FALLBACK_QUERY]: {
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
    },
    [MOBILE_MEDIA_QUERY]: {
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
    },
  };
}

