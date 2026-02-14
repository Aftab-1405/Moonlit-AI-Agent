import { alpha } from '@mui/material/styles';

/**
 * Shared styling helpers built on theme tokens.
 */
export const getGlassmorphismStyles = (theme) => ({
  background: theme.palette.glassmorphism.background,
  backdropFilter: theme.palette.glassmorphism.backdropFilter,
  WebkitBackdropFilter: theme.palette.glassmorphism.backdropFilter,
  borderColor: theme.palette.glassmorphism.borderColor,
});

export const getScrollbarStyles = (theme) => ({
  '&::-webkit-scrollbar': { width: 4 },
  '&::-webkit-scrollbar-track': { background: theme.palette.scrollbar.track },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: theme.palette.scrollbar.thumb,
    borderRadius: 2,
    '&:hover': {
      backgroundColor: theme.palette.scrollbar.thumbHover,
    },
  },
});


export const BORDER_RADIUS = {
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  pill: '999px',
};

export const SPACING = {
  xxs: 0.5,
  xs: 1,
  sm: 1.5,
  md: 2,
  lg: 3,
  xl: 4,
};
