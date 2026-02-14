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


