// Hero section component
import { Box, Container, Stack, Typography, Button } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import PlayCircleOutlinedIcon from '@mui/icons-material/PlayCircleOutlined';
import { getMoonlitGradient, getNaturalMoonlitEffects, KEYFRAMES, getGlowButtonSx } from '../../theme';
import { Section } from './index';

function Hero({ onGetStarted }) {
  const theme = useTheme();
  const effects = getNaturalMoonlitEffects(theme);

  return (
    <Section sx={{ py: { xs: 8, md: 6 } }}>
      {/* Animated gradient orbs */}
      <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <Box
          sx={{
            position: 'absolute',
            top: '-20%',
            left: '10%',
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: effects.glow,
            filter: 'blur(80px)',
            animation: 'float 8s ease-in-out infinite',
            ...KEYFRAMES.float,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            top: '10%',
            right: '5%',
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${alpha(theme.palette.info.main, 0.12)}, transparent 70%)`,
            filter: 'blur(60px)',
            animation: 'float 10s ease-in-out infinite 1s',
            ...KEYFRAMES.float,
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            bottom: '10%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 250,
            height: 250,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.08)}, transparent 70%)`,
            filter: 'blur(50px)',
            animation: 'float 12s ease-in-out infinite 2s',
            ...KEYFRAMES.float,
          }}
        />
      </Box>

      {/* Radial gradient */}
      <Box sx={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 80% 50% at 50% -20%, ${alpha(theme.palette.primary.main, 0.18)}, transparent)`, pointerEvents: 'none' }} />

      <Container maxWidth="md" sx={{ zIndex: 2, textAlign: 'center' }}>
        <Stack spacing={2.5} alignItems="center">
          {/* Badge */}
          <Box
            sx={{
              px: 2,
              py: 0.5,
              borderRadius: 10,
              background: alpha(theme.palette.primary.main, 0.1),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
              animation: 'fadeIn 0.6s ease-out',
              ...KEYFRAMES.fadeIn,
            }}
          >
            <Typography variant="labelMedium" sx={{ color: theme.palette.primary.main, fontWeight: 600 }}>
              ✨ AI-Powered Database Assistant
            </Typography>
          </Box>

          {/* Main Heading */}
          <Typography
            component="h1"
            sx={{
              fontWeight: 800,
              fontSize: { xs: '2rem', sm: '2.5rem', md: '3.25rem' },
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}
          >
            Stop Writing SQL.
            <br />
            <Box
              component="span"
              sx={{
                background: getMoonlitGradient(theme),
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: `drop-shadow(0 0 32px ${alpha(theme.palette.info.main, 0.3)})`,
              }}
            >
              Start Asking Questions.
            </Box>
          </Typography>

          {/* Value Proposition */}
          <Typography
            variant="bodyLarge"
            color="text.secondary"
            sx={{
              maxWidth: 560,
              opacity: 0.9,
              fontSize: { xs: '1rem', md: '1.125rem' },
              lineHeight: 1.7,
            }}
          >
            Connect to your database, ask in plain English, and get instant results.
            No SQL expertise required. Your data never leaves your infrastructure.
          </Typography>

          {/* CTAs */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ pt: 0.5 }}>
            <Button
              size="large"
              onClick={onGetStarted}
              endIcon={<ArrowForwardRoundedIcon />}
              sx={getGlowButtonSx(theme)}
            >
              Get Started Free
            </Button>
            <Button
              size="large"
              startIcon={<PlayCircleOutlinedIcon />}
              onClick={() => document.getElementById('demo-section')?.scrollIntoView({ behavior: 'smooth' })}
              sx={{
                px: 3,
                py: 1.5,
                borderRadius: 12,
                borderColor: alpha(theme.palette.primary.main, 0.3),
                borderWidth: 1.5,
                color: theme.palette.text.primary,
                '&:hover': {
                  borderColor: theme.palette.primary.main,
                  backgroundColor: effects.hover,
                  transform: 'translateY(-2px)',
                },
              }}
            >
              Watch Demo
            </Button>
          </Stack>

          {/* Database Logos - Trust Signal */}
          <Stack spacing={1.5} alignItems="center" sx={{ pt: 2 }}>
            <Typography variant="labelSmall" color="text.secondary" sx={{ opacity: 0.7, fontSize: '0.65rem' }}>
              WORKS WITH YOUR FAVORITE DATABASES
            </Typography>
            <Stack
              direction="row"
              spacing={{ xs: 2.5, md: 4 }}
              alignItems="center"
              justifyContent="center"
              sx={{
                opacity: 0.7,
                filter: theme.palette.mode === 'dark' ? 'brightness(0.85) invert(0)' : 'none',
              }}
            >
              {[
                { src: '/logo-postgresql.svg', alt: 'PostgreSQL' },
                { src: '/logo-mysql.svg', alt: 'MySQL' },
                { src: '/logo-sqlite.svg', alt: 'SQLite' },
                { src: '/logo-microsoft-sql-server.svg', alt: 'SQL Server', hideXs: true },
                { src: '/logo-oracle.svg', alt: 'Oracle', hideXs: true },
              ].map((db) => (
                <Box
                  key={db.alt}
                  sx={{
                    width: { xs: 32, md: 40 },
                    height: { xs: 32, md: 40 },
                    display: db.hideXs ? { xs: 'none', sm: 'flex' } : 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      opacity: 1,
                      transform: 'scale(1.15)',
                    },
                  }}
                >
                  <Box
                    component="img"
                    src={db.src}
                    alt={db.alt}
                    sx={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                    }}
                  />
                </Box>
              ))}
            </Stack>
          </Stack>
        </Stack>
      </Container>
    </Section>
  );
}

export default Hero;
