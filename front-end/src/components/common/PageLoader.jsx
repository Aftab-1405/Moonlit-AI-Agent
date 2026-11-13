import { Box, keyframes, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
`;
const horizonSweep = keyframes`
  0%   { transform: translateX(-130%); opacity: 0; }
  20%  { opacity: 1; }
  80%  { opacity: 1; }
  100% { transform: translateX(230%); opacity: 0; }
`;
function PageLoader() {
  const theme = useTheme();

  return (
    <Box
      sx={{
        minHeight: '100vh',
        '@supports (height: 100dvh)': { minHeight: '100dvh' },
        display: 'grid',
        placeItems: 'center',
        backgroundColor: 'background.default',
        px: 3,
      }}
      role="status"
      aria-live="polite"
      aria-label="Loading Moonlit"
    >
      <Box
        aria-hidden="true"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1.75,
          animation: `${fadeIn} 420ms ease-out both`,
          'html[data-moonlit-reduced-motion="true"] &': { animation: 'none' },
        }}
      >
        <Typography
          sx={{
            ...theme.typography.uiLoaderWordmark,
            color: 'text.primary',
            letterSpacing: '-0.025em',
          }}
        >
          Moonlit
        </Typography>
        <Box
          sx={{
            position: 'relative',
            width: 112,
            height: 1,
            overflow: 'hidden',
            borderRadius: 999,
            backgroundColor: alpha(theme.palette.text.primary, 0.12),
            '&::after': {
              content: '""',
              position: 'absolute',
              inset: 0,
              width: '42%',
              borderRadius: 'inherit',
              backgroundColor: 'text.primary',
              animation: `${horizonSweep} 1.8s ease-in-out infinite`,
            },
            'html[data-moonlit-reduced-motion="true"] &': {
              '&::after': {
                width: '100%',
                opacity: 0.5,
                animation: 'none',
              },
            },
          }}
        />
      </Box>
    </Box>
  );
}

export default PageLoader;
