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

export const getMenuPaperStyles = (theme) => {
  const isDarkMode = theme.palette.mode === 'dark';

  return {
    borderRadius: 2,
    border: '1px solid',
    borderColor: alpha(theme.palette.divider, isDarkMode ? 0.24 : 0.4),
    backgroundColor: alpha(theme.palette.background.elevated, isDarkMode ? 0.96 : 0.98),
    backgroundImage: 'none',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    boxShadow: 'none',
  };
};

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
