import { alpha } from '@mui/material/styles';
import { REDUCED_MOTION_SELECTOR } from '@/styles/mediaQueries';

export function getAuthLayoutSx(theme) {
  const separator = `1px solid ${theme.palette.border.subtle}`;

  return {
    page: {
      height: '100%',
      minHeight: 0,
      display: 'grid',
      gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(360px, 0.9fr)' },
      gridTemplateRows: { xs: 'auto 1fr', md: 'minmax(min-content, 1fr)' },
      overflowY: 'auto',
      backgroundColor: 'background.default',
      color: 'text.primary',
    },
    brandPanel: {
      position: 'relative',
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      px: { xs: 3, md: 4, lg: 8 },
      py: { xs: 3, md: 5 },
      backgroundColor: { xs: 'background.default', md: 'background.paper' },
      borderRight: { xs: 0, md: separator },
    },
    brandContent: {
      position: 'relative',
      zIndex: 1,
      width: '100%',
      maxWidth: 560,
      mx: 'auto',
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
    },
    productBlock: {
      display: { xs: 'none', md: 'block' },
      my: 'auto',
      py: { md: 5, lg: 7 },
    },
    illustration: {
      mt: 5,
      p: { md: 2.5, lg: 3 },
      border: separator,
      borderRadius: 3,
      backgroundColor: 'background.default',
      animation: 'auth-illustration-enter 600ms ease-out both',
      '@keyframes auth-illustration-enter': {
        from: { opacity: 0, transform: 'translateY(8px)' },
        to: { opacity: 1, transform: 'translateY(0)' },
      },
      [REDUCED_MOTION_SELECTOR]: { animation: 'none' },
    },
    flowStep: {
      display: 'flex',
      alignItems: 'center',
      gap: 1.5,
      py: 1.5,
      borderTop: separator,
    },
    flowMarker: {
      width: 28,
      height: 28,
      flexShrink: 0,
      display: 'grid',
      placeItems: 'center',
      borderRadius: '50%',
      border: separator,
      color: 'text.secondary',
      ...theme.typography.captionMonoSm,
    },
    formPanel: {
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      px: { xs: 3, sm: 4, lg: 6 },
      pt: { xs: 2, md: 6 },
      pb: { xs: 4, md: 6 },
    },
    formInner: {
      width: '100%',
      maxWidth: 400,
      mx: 'auto',
      my: { xs: 0, md: 'auto' },
    },
    orbit: {
      position: 'absolute',
      display: { xs: 'none', md: 'block' },
      width: 640,
      height: 640,
      right: -440,
      top: -240,
      border: separator,
      borderRadius: '50%',
      boxShadow: `0 0 0 64px ${alpha(theme.palette.text.primary, 0.015)}, 0 0 0 128px ${alpha(theme.palette.text.primary, 0.01)}`,
      pointerEvents: 'none',
    },
  };
}
