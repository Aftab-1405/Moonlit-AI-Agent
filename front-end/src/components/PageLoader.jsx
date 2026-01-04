/**
 * PageLoader - Minimal loading component with Moonlit branding
 * 
 * Features:
 * - "Moonlit" title with breathing effect
 * - Smooth, non-intrusive animation
 */

import { Box, Typography, keyframes } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';

import { getMoonlitGradient } from '../theme';

// Breathing animation
const breathe = keyframes`
  0%, 100% {
    opacity: 0.4;
    transform: scale(0.98);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
`;

// Fade in container
const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

function PageLoader() {
  const theme = useTheme();

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'background.default',
        animation: `${fadeIn} 0.3s ease-out`,
      }}
    >
      <Typography
        sx={{
          fontSize: { xs: '2.5rem', md: '3.5rem' },
          fontWeight: 800,
          background: getMoonlitGradient(theme),
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          filter: `drop-shadow(0 0 24px ${alpha('#818CF8', 0.3)})`,
          animation: `${breathe} 2.5s ease-in-out infinite`,
        }}
      >
        Moonlit
      </Typography>
    </Box>
  );
}

export default PageLoader;

