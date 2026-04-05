import { Box, Container, Stack, Typography, Button } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import PlayCircleOutlinedIcon from '@mui/icons-material/PlayCircleOutlined';
import { Section, REDUCED_MOTION_QUERY, HOVER_CAPABLE_QUERY } from './index';

const STATS = [
  { value: '10K+', label: 'Queries/day' },
  { value: '<100ms', label: 'Avg response' },
  { value: '5', label: 'DB engines' },
];

function Hero({ onGetStarted }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Section sx={{ py: { xs: 8, md: 6 } }}>
      {/* Dot-grid texture */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(${alpha(theme.palette.text.primary, isDark ? 0.055 : 0.04)} 1px, transparent 1px)`,
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse 80% 80% at 50% 0%, black 30%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 0%, black 30%, transparent 100%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Floating orbs */}
      <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <Box
          sx={{
            position: 'absolute',
            top: '-15%',
            left: '8%',
            width: { xs: 280, md: 440 },
            height: { xs: 280, md: 440 },
            borderRadius: '50%',
            background: `radial-gradient(circle, ${alpha(theme.palette.text.primary, isDark ? 0.05 : 0.035)}, transparent 70%)`,
            filter: { xs: 'blur(40px)', md: 'blur(80px)' },
            animation: 'float 8s ease-in-out infinite',
            [REDUCED_MOTION_QUERY]: { animation: 'none' },
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            top: '8%',
            right: '4%',
            width: { xs: 200, md: 340 },
            height: { xs: 200, md: 340 },
            borderRadius: '50%',
            background: `radial-gradient(circle, ${alpha(theme.palette.text.primary, isDark ? 0.035 : 0.025)}, transparent 70%)`,
            filter: { xs: 'blur(30px)', md: 'blur(60px)' },
            animation: 'float 10s ease-in-out infinite 1.5s',
            [REDUCED_MOTION_QUERY]: { animation: 'none' },
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            bottom: '12%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: { xs: 160, md: 280 },
            height: { xs: 160, md: 280 },
            borderRadius: '50%',
            background: `radial-gradient(circle, ${alpha(theme.palette.text.primary, isDark ? 0.03 : 0.018)}, transparent 70%)`,
            filter: { xs: 'blur(25px)', md: 'blur(50px)' },
            animation: 'float 12s ease-in-out infinite 3s',
            [REDUCED_MOTION_QUERY]: { animation: 'none' },
          }}
        />
      </Box>

      {/* Top gradient */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 80% 50% at 50% -10%, ${alpha(theme.palette.text.primary, isDark ? 0.07 : 0.05)}, transparent)`,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <Container maxWidth="md" sx={{ zIndex: 2, textAlign: 'center' }}>
        <Stack spacing={3} alignItems="center">
          {/* Badge */}
          <Box
            sx={{
              px: 2,
              py: 0.625,
              borderRadius: 2,
              backgroundColor: alpha(theme.palette.text.primary, isDark ? 0.06 : 0.04),
              border: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              animation: 'fadeIn 0.5s ease-out',
              [REDUCED_MOTION_QUERY]: { animation: 'none' },
            }}
          >
            {/* Pulsing dot */}
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: isDark
                  ? alpha(theme.palette.text.primary, 0.6)
                  : alpha(theme.palette.text.primary, 0.5),
                animation: 'pulse-dot 2s ease-in-out infinite',
                flexShrink: 0,
                [REDUCED_MOTION_QUERY]: { animation: 'none' },
              }}
            />
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                ...theme.typography.uiCaptionXs,
              }}
            >
              AI-Powered Database Assistant
            </Typography>
          </Box>

          {/* Heading */}
          <Typography
            component="h1"
            sx={{
              fontWeight: 800,
              ...theme.typography.uiHeadingHero,
              color: 'text.primary',
              animation: 'fadeIn 0.6s ease-out 0.1s both',
              [REDUCED_MOTION_QUERY]: { animation: 'none' },
            }}
          >
            Stop Writing SQL.
            <br />
            <Box
              component="span"
              sx={{
                color: isDark
                  ? alpha(theme.palette.text.primary, 0.45)
                  : alpha(theme.palette.text.primary, 0.4),
              }}
            >
              Start Asking Questions.
            </Box>
          </Typography>

          {/* Subheading */}
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{
              maxWidth: 520,
              opacity: 0.75,
              ...theme.typography.uiBodyLg,
              animation: 'fadeIn 0.6s ease-out 0.2s both',
              [REDUCED_MOTION_QUERY]: { animation: 'none' },
            }}
          >
            Connect to your database, ask in plain English, and get instant results.
            No SQL expertise required. Your data never leaves your infrastructure.
          </Typography>

          {/* CTAs */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{
              pt: 0.5,
              animation: 'fadeIn 0.6s ease-out 0.3s both',
              [REDUCED_MOTION_QUERY]: { animation: 'none' },
            }}
          >
            <Button
              size="large"
              onClick={onGetStarted}
              endIcon={<ArrowForwardRoundedIcon />}
              sx={{
                px: 3.5,
                py: 1.5,
                borderRadius: 2,
                fontWeight: 600,
                backgroundColor: 'text.primary',
                color: 'background.default',
                border: 'none',
                boxShadow: isDark
                  ? `0 4px 24px ${alpha(theme.palette.text.primary, 0.3)}`
                  : `0 4px 24px ${alpha(theme.palette.text.primary, 0.18)}`,
                transition: theme.transitions.create(['background-color', 'transform', 'box-shadow'], { duration: 200 }),
                [REDUCED_MOTION_QUERY]: { transition: 'none' },
                [HOVER_CAPABLE_QUERY]: {
                  '&:hover': {
                    backgroundColor: isDark
                      ? alpha(theme.palette.text.primary, 0.85)
                      : alpha(theme.palette.text.primary, 0.9),
                    transform: 'translateY(-2px)',
                    boxShadow: isDark
                      ? `0 8px 28px ${alpha(theme.palette.text.primary, 0.38)}`
                      : `0 8px 28px ${alpha(theme.palette.text.primary, 0.22)}`,
                  },
                },
                '&:active': { transform: 'scale(0.98)' },
              }}
            >
              Get Started Free
            </Button>
            <Button
              size="large"
              variant="outlined"
              startIcon={<PlayCircleOutlinedIcon />}
              onClick={() => {
                const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
                document.getElementById('demo-section')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
              }}
              sx={{
                px: 3.5,
                py: 1.5,
                borderRadius: 2,
                borderColor: alpha(theme.palette.text.primary, 0.18),
                borderWidth: 1,
                color: 'text.primary',
                transition: theme.transitions.create(['border-color', 'background-color', 'transform'], { duration: 200 }),
                [REDUCED_MOTION_QUERY]: { transition: 'none' },
                [HOVER_CAPABLE_QUERY]: {
                  '&:hover': {
                    borderColor: alpha(theme.palette.text.primary, 0.38),
                    backgroundColor: alpha(theme.palette.text.primary, 0.04),
                    transform: 'translateY(-2px)',
                  },
                },
              }}
            >
              Watch Demo
            </Button>
          </Stack>

          {/* Stats strip */}
          <Stack
            direction="row"
            spacing={0}
            divider={
              <Box
                sx={{
                  width: '1px',
                  height: 28,
                  backgroundColor: alpha(theme.palette.text.primary, 0.1),
                  mx: 3,
                  alignSelf: 'center',
                }}
              />
            }
            sx={{
              pt: 1,
              animation: 'fadeIn 0.6s ease-out 0.4s both',
              [REDUCED_MOTION_QUERY]: { animation: 'none' },
            }}
          >
            {STATS.map((s) => (
              <Box key={s.label} textAlign="center">
                <Typography
                  sx={{
                    fontWeight: 700,
                    color: 'text.primary',
                    ...theme.typography.uiHeadingLandingMd,
                    fontSize: { xs: '1.1rem', md: '1.25rem' },
                    lineHeight: 1.2,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {s.value}
                </Typography>
                <Typography
                  sx={{
                    color: 'text.secondary',
                    opacity: 0.6,
                    ...theme.typography.uiCaptionXs,
                    mt: 0.25,
                  }}
                >
                  {s.label}
                </Typography>
              </Box>
            ))}
          </Stack>

          {/* DB logos */}
          <Stack spacing={1.25} alignItems="center" sx={{ pt: 1 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                opacity: 0.4,
                ...theme.typography.uiCaption2xs,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              Works with your favorite databases
            </Typography>
            <Stack
              direction="row"
              spacing={{ xs: 2.5, md: 4 }}
              alignItems="center"
              justifyContent="center"
              sx={{
                opacity: 0.65,
                transition: 'opacity 0.3s ease',
                [HOVER_CAPABLE_QUERY]: { '&:hover': { opacity: 0.9 } },
              }}
            >
              {[
                { src: '/logo-postgresql.svg', alt: 'PostgreSQL' },
                { src: '/logo-mysql.svg', alt: 'MySQL' },
{ src: '/logo-microsoft-sql-server.svg', alt: 'SQL Server', hideXs: true },
                { src: '/logo-oracle.svg', alt: 'Oracle', hideXs: true },
              ].map((db) => (
                <Box
                  key={db.alt}
                  sx={{
                    width: { xs: 30, md: 38 },
                    height: { xs: 30, md: 38 },
                    display: db.hideXs ? { xs: 'none', sm: 'flex' } : 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'transform 0.25s ease',
                    [HOVER_CAPABLE_QUERY]: { '&:hover': { transform: 'scale(1.18)' } },
                  }}
                >
                  <Box
                    component="img"
                    src={db.src}
                    alt={db.alt}
                    loading="lazy"
                    decoding="async"
                    sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
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