// DemoSection component
import { Box, Container, Typography } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { getMoonlitGradient, getNaturalMoonlitEffects, getGradientTextSx } from '../../theme';
import { Section } from './index';

function DemoSection() {
  const theme = useTheme();
  const effects = getNaturalMoonlitEffects(theme);
  const isDark = theme.palette.mode === 'dark';

  return (
    <Section id="demo-section" sx={{ py: { xs: 6, md: 8 } }}>
      <Container maxWidth="lg">
        <Box textAlign="center" mb={3}>
          <Typography
            variant="labelMedium"
            fontWeight="bold"
            sx={{
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              background: getMoonlitGradient(theme),
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            See It In Action
          </Typography>
          <Typography variant="h3" fontWeight="bold" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, mt: 1 }}>
            From Question to{' '}
            <Box component="span" sx={getGradientTextSx(theme)}>
              Answer
            </Box>
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, maxWidth: 440, mx: 'auto', opacity: 0.85 }}>
            Watch how anyone can explore databases without writing a single line of SQL.
          </Typography>
        </Box>

        <Box
          sx={{
            position: 'relative',
            maxWidth: { xs: '100%', md: 800 },
            mx: 'auto',
            perspective: '1000px',
          }}
        >
          {/* Browser wrapper */}
          <Box
            sx={{
              transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              transformStyle: 'preserve-3d',
              '&:hover': {
                transform: 'rotateX(2deg) rotateY(-2deg) scale(1.02)',
              },
            }}
          >
            {/* Browser chrome */}
            <Box
              sx={{
                borderRadius: '16px 16px 0 0',
                background: alpha(theme.palette.background.paper, isDark ? 0.15 : 0.9),
                backdropFilter: 'blur(10px)',
                border: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
                borderBottom: 'none',
                px: 2.5,
                py: 1.25,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
              }}
            >
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#FF5F56' }} />
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#FFBD2E' }} />
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#27C93F' }} />
              </Box>
              <Box
                sx={{
                  flex: 1,
                  ml: 2,
                  px: 2,
                  py: 0.75,
                  borderRadius: 2,
                  backgroundColor: isDark ? alpha(theme.palette.common.white, 0.06) : alpha(theme.palette.common.black, 0.04),
                  color: 'text.secondary',
                  fontSize: '0.8rem',
                  fontFamily: '"JetBrains Mono", monospace',
                }}
              >
                moonlit.app/chat
              </Box>
            </Box>

            {/* Video */}
            <Box
              component="video"
              autoPlay
              loop
              muted
              playsInline
              sx={{
                width: '100%',
                display: 'block',
                borderRadius: '0 0 16px 16px',
                border: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
                borderTop: 'none',
                backgroundColor: theme.palette.background.paper,
              }}
            >
              <source src="/moonlit-demo.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </Box>
          </Box>

          {/* Glow effect */}
          <Box
            sx={{
              position: 'absolute',
              inset: -40,
              background: effects.glow,
              pointerEvents: 'none',
              zIndex: -1,
              filter: 'blur(40px)',
              opacity: 0.8,
            }}
          />
        </Box>
      </Container>
    </Section>
  );
}

export default DemoSection;
