// Landing.jsx (patched)
import { useEffect, useMemo, useCallback } from 'react';
import {
  Box, Container, Stack, Typography, Button, Grid, Link
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTheme, alpha } from '@mui/material/styles';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import PlayCircleOutlinedIcon from '@mui/icons-material/PlayCircleOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ShieldIcon from '@mui/icons-material/Shield';
import InsightsIcon from '@mui/icons-material/Insights';
import { getMoonlitGradient, getNaturalMoonlitEffects } from '../theme';
import { useAuth } from '../contexts/AuthContext';

// ---------- Shared Styles ----------
const glassCard = (theme) => ({
  background: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.03 : 0.7),
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderRadius: 6,
  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  '&:hover': {
    transform: 'translateY(-6px)',
  },
});

// ---------- Section Wrapper ----------
const Section = ({ children, sx = {}, id }) => (
  <Box
    id={id}
    component="section"
    sx={{
      minHeight: '100vh',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      scrollSnapAlign: 'start',
      py: { xs: 6, md: 8 },
      px: { xs: 2, md: 0 },
      ...sx,
    }}
  >
    {children}
  </Box>
);

// ---------- Hero Section ----------
function Hero({ onGetStarted }) {
  const theme = useTheme();
  const effects = getNaturalMoonlitEffects(theme);

  return (
    <Section>
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
            '@keyframes float': {
              '0%, 100%': { transform: 'translateY(0) scale(1)' },
              '50%': { transform: 'translateY(30px) scale(1.05)' },
            },
            '@media (prefers-reduced-motion: reduce)': {
              animation: 'none',
              transition: 'none',
            },
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
          }}
        />
      </Box>

      {/* Original radial gradient */}
      <Box sx={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 80% 50% at 50% -20%, ${alpha(theme.palette.primary.main, 0.18)}, transparent)`, pointerEvents: 'none' }} />

      <Container maxWidth="md" sx={{ zIndex: 2, textAlign: 'center' }}>
        <Stack spacing={3} alignItems="center">
          {/* Moonlit Title with pulsing glow */}
          <Typography
            component="span"
            sx={{
              fontSize: { xs: '2.5rem', md: '4rem' },
              fontWeight: 800,
              background: getMoonlitGradient(theme),
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: `drop-shadow(0 0 32px ${alpha(theme.palette.info.main, 0.4)})`,
              animation: 'pulseGlow 3s ease-in-out infinite',
              '@keyframes pulseGlow': {
                '0%, 100%': { filter: `drop-shadow(0 0 32px ${alpha(theme.palette.info.main, 0.4)})` },
                '50%': { filter: `drop-shadow(0 0 48px ${alpha(theme.palette.info.main, 0.6)})` },
              },
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
              },
            }}
          >
            Moonlit
          </Typography>

          {/* Main Heading */}
          <Typography component="h1" variant="h1" sx={{ fontWeight: 800, fontSize: { xs: '1.75rem', md: '3.25rem' }, lineHeight: 1.15 }}>
            Talk to Your Database
            <br />
            <Box component="span" sx={{ background: `linear-gradient(135deg, ${theme.palette.info.light}, ${theme.palette.primary.main})`, backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Like Never Before
            </Box>
          </Typography>

          {/* Subtitle */}
          <Typography variant="bodyLarge" color="text.secondary" sx={{ maxWidth: 600, opacity: 0.9 }}>
            Whether you're a seasoned DBA or exploring data for the first time — connect to any major database and let AI handle the SQL. Ask questions in plain English, get instant results.
          </Typography>

          {/* CTAs with shimmer effect */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Button
              aria-label="Get started"
              size="large"
              onClick={onGetStarted}
              endIcon={<ArrowForwardRoundedIcon />}
              sx={{
                px: 5,
                py: 1.75,
                borderRadius: 12,
                background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.info.main})`,
                color: theme.palette.getContrastText(theme.palette.primary.main),
                fontWeight: 600,
                position: 'relative',
                overflow: 'hidden',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: '-100%',
                  width: '100%',
                  height: '100%',
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                  animation: 'shimmer 2.5s infinite',
                },
                '@keyframes shimmer': {
                  '0%': { left: '-100%' },
                  '100%': { left: '100%' },
                },
                '&:hover': {
                  background: `linear-gradient(135deg, ${theme.palette.info.main}, ${theme.palette.primary.main})`,
                  transform: 'translateY(-3px)',
                  boxShadow: effects.shadow,
                },
                '@media (prefers-reduced-motion: reduce)': {
                  '&::before': { animation: 'none' },
                  transition: 'none',
                },
              }}
            >
              Get Started Free
            </Button>
            <Button
              aria-label="Watch demo"
              size="large"
              startIcon={<PlayCircleOutlinedIcon />}
              onClick={() => document.getElementById('demo-section')?.scrollIntoView({ behavior: 'smooth' })}
              sx={{
                px: 5,
                py: 1.75,
                borderRadius: 12,
                borderColor: alpha(theme.palette.primary.main, 0.4),
                borderWidth: 1.5,
                color: theme.palette.primary.main,
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

          {/* Floating Stats */}
          <Stack
            direction="row"
            spacing={{ xs: 4, md: 6 }}
            sx={{
              pt: 3,
              animation: 'floatStats 6s ease-in-out infinite',
              '@keyframes floatStats': {
                '0%, 100%': { transform: 'translateY(0)' },
                '50%': { transform: 'translateY(-8px)' },
              },
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
              },
            }}
          >
            {[
              { value: '5', label: 'Databases' },
              { value: '20+', label: 'Providers' },
              { value: 'Read-Only', label: 'Safe Mode' },
            ].map((s, i) => (
              <Box
                key={s.label}
                textAlign="center"
                sx={{
                  animation: `fadeIn 0.6s ease-out ${i * 0.1}s both`,
                  '@keyframes fadeIn': {
                    from: { opacity: 0, transform: 'translateY(10px)' },
                    to: { opacity: 1, transform: 'translateY(0)' },
                  },
                  '@media (prefers-reduced-motion: reduce)': {
                    animation: 'none',
                  },
                }}
              >
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 'bold',
                    background: getMoonlitGradient(theme),
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {s.value}
                </Typography>
                <Typography variant="labelMedium" color="text.secondary">{s.label}</Typography>
              </Box>
            ))}
          </Stack>
        </Stack>
      </Container>
    </Section>
  );
}

// ---------- Value Props ----------
function ValueGrid() {
  const theme = useTheme();
  const effects = getNaturalMoonlitEffects(theme);
  const values = useMemo(() => [
    { Icon: AutoAwesomeIcon, title: 'Zero SQL Required', desc: 'Ask in plain English. The AI understands context, navigates your schema, and writes optimized queries for you.' },
    { Icon: ShieldIcon, title: 'Enterprise-Grade Safety', desc: 'Read-only by default. No data leaves your session. Dangerous operations blocked at multiple layers.' },
    { Icon: InsightsIcon, title: 'Instant Insights', desc: 'View results as tables, export to CSV, or ask for visualizations and ER diagrams — all in real-time.' },
  ], []);

  return (
    <Section sx={{ background: effects.ambient, py: { xs: 6, md: 8 } }}>
      <Container maxWidth="lg">
        <Box textAlign="center" mb={4}>
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
            Why Moonlit
          </Typography>
          <Typography variant="h3" fontWeight="bold" sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' }, mt: 1 }}>
            Built for <Box component="span" sx={{ background: effects.textGradient, backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Everyone.</Box>
          </Typography>
        </Box>
        <Grid container spacing={3} justifyContent="center">
          {values.map((v, i) => (
            <Grid item xs={12} sm={4} key={v.title}>
              <Box
                sx={{
                  ...glassCard(theme),
                  p: 3,
                  textAlign: 'center',
                  animation: `slideUp 0.6s ease-out ${i * 0.15}s both`,
                  '@keyframes slideUp': {
                    from: { opacity: 0, transform: 'translateY(30px)' },
                    to: { opacity: 1, transform: 'translateY(0)' },
                  },
                  '@media (prefers-reduced-motion: reduce)': {
                    animation: 'none',
                  },
                }}
              >
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: 4,
                    background: `linear-gradient(135deg, ${alpha(theme.palette.info.main, 0.15)}, ${alpha(theme.palette.primary.main, 0.1)})`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mx: 'auto',
                    mb: 2,
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                      transform: 'scale(1.15) rotate(10deg)',
                    },
                  }}
                >
                  <v.Icon sx={{ fontSize: 26, color: theme.palette.info.main }} />
                </Box>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
                  {v.title}
                </Typography>
                <Typography variant="bodySmall" color="text.secondary" sx={{ lineHeight: 1.6, opacity: 0.85 }}>
                  {v.desc}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Section>
  );
}

// ---------- Demo Section ----------
function DemoSection() {
  const theme = useTheme();
  const effects = getNaturalMoonlitEffects(theme);
  const isDark = theme.palette.mode === 'dark';

  return (
    <Section id="demo-section" sx={{ background: effects.ambient, py: { xs: 6, md: 8 } }}>
      <Container maxWidth="lg">
        <Box textAlign="center" mb={4}>
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
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, mt: 1 }}>
            From Question to <Box component="span" sx={{ background: effects.textGradient, backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Answer</Box>
          </Typography>
          <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 1, maxWidth: 480, mx: 'auto', opacity: 0.85 }}>
            See how anyone can query databases without writing a single line of SQL.
          </Typography>
        </Box>

        <Box
          sx={{
            position: 'relative',
            maxWidth: { xs: '100%', sm: 640, md: 720 },
            mx: 'auto',
            perspective: '1000px',
          }}
        >
          {/* Browser wrapper with tilt effect */}
          <Box
            sx={{
              transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              transformStyle: 'preserve-3d',
              '&:hover': {
                transform: 'rotateX(2deg) rotateY(-2deg) scale(1.02)',
              },
              '@media (prefers-reduced-motion: reduce)': {
                transform: 'none',
                transition: 'none',
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
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#FF5F56', boxShadow: '0 0 8px rgba(255, 95, 86, 0.4)' }} />
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#FFBD2E', boxShadow: '0 0 8px rgba(255, 189, 46, 0.4)' }} />
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#27C93F', boxShadow: '0 0 8px rgba(39, 201, 63, 0.4)' }} />
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

          {/* Animated glow */}
          <Box
            sx={{
              position: 'absolute',
              inset: -40,
              background: effects.glow,
              pointerEvents: 'none',
              zIndex: -1,
              filter: 'blur(40px)',
              animation: 'pulseGlowDemo 4s ease-in-out infinite',
              '@keyframes pulseGlowDemo': {
                '0%, 100%': { opacity: 0.8, transform: 'scale(1)' },
                '50%': { opacity: 1, transform: 'scale(1.05)' },
              },
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
              },
            }}
          />

          {/* Reflection */}
          <Box
            sx={{
              position: 'absolute',
              bottom: -60,
              left: '10%',
              right: '10%',
              height: 60,
              background: `linear-gradient(to bottom, ${alpha(theme.palette.info.main, 0.08)}, transparent)`,
              filter: 'blur(20px)',
              borderRadius: '50%',
              pointerEvents: 'none',
            }}
          />
        </Box>
      </Container>
    </Section>
  );
}

// ---------- Steps ----------
function StepsGrid() {
  const theme = useTheme();
  const effects = getNaturalMoonlitEffects(theme);
  const steps = useMemo(() => [
    { num: '01', title: 'Connect', desc: 'Link any MySQL, PostgreSQL, SQL Server, Oracle, or SQLite database in seconds — local or cloud-hosted.' },
    { num: '02', title: 'Ask', desc: 'Type your question in plain English. No SQL syntax, no complex joins to remember.' },
    { num: '03', title: 'Get Results', desc: 'See the AI-generated query, approve it, and get formatted results instantly.' },
  ], []);

  return (
    <Section sx={{ background: effects.ambient }}>
      <Container maxWidth="lg">
        <Box textAlign="center" mb={6}>
          <Typography
            variant="overline"
            fontWeight="bold"
            sx={{
              background: getMoonlitGradient(theme),
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '0.15em',
            }}
          >
            How It Works
          </Typography>
          <Typography variant="h3" fontWeight="bold" sx={{ fontSize: { xs: '1.75rem', md: '2.5rem' }, mt: 1 }}>
            Three Steps. <Box component="span" sx={{ background: effects.textGradient, backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Zero Learning Curve.</Box>
          </Typography>
        </Box>

        <Box sx={{ position: 'relative' }}>
          {/* Connecting line (desktop only) */}
          <Box
            sx={{
              display: { xs: 'none', md: 'block' },
              position: 'absolute',
              top: '40px',
              left: 'calc(16.67% + 40px)',
              right: 'calc(16.67% + 40px)',
              height: 2,
              background: `linear-gradient(90deg, ${alpha(theme.palette.info.main, 0.3)}, ${alpha(theme.palette.primary.main, 0.3)})`,
              '&::before': {
                content: '""',
                position: 'absolute',
                top: -3,
                left: 0,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: theme.palette.info.main,
                boxShadow: `0 0 12px ${alpha(theme.palette.info.main, 0.5)}`,
              },
              '&::after': {
                content: '""',
                position: 'absolute',
                top: -3,
                right: 0,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: theme.palette.primary.main,
                boxShadow: `0 0 12px ${alpha(theme.palette.primary.main, 0.5)}`,
              },
            }}
          />

          <Grid container spacing={4} justifyContent="center">
            {steps.map((s, i) => (
              <Grid item xs={12} md={4} key={s.num}>
                <Box
                  sx={{
                    ...glassCard(theme),
                    p: 3,
                    position: 'relative',
                    overflow: 'visible',
                    textAlign: 'center',
                    animation: `slideUp 0.6s ease-out ${i * 0.15}s both`,
                    '@keyframes slideUp': {
                      from: { opacity: 0, transform: 'translateY(30px)' },
                      to: { opacity: 1, transform: 'translateY(0)' },
                    },
                    '@media (prefers-reduced-motion: reduce)': {
                      animation: 'none',
                    },
                  }}
                >
                  {/* Gradient number badge */}
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -20,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: `linear-gradient(135deg, ${theme.palette.info.main}, ${theme.palette.primary.main})`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: effects.shadow,
                      border: `2px solid ${theme.palette.background.default}`,
                    }}
                  >
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: '#000' }}>
                      {s.num}
                    </Typography>
                  </Box>

                  <Box sx={{ position: 'relative', zIndex: 1, pt: 2 }}>
                    <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>
                      {s.title}
                    </Typography>
                    <Typography variant="bodyMedium" color="text.secondary" sx={{ lineHeight: 1.7, opacity: 0.85 }}>
                      {s.desc}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>
      </Container>
    </Section>
  );
}

// ---------- Databases ----------
function SupportedDatabases() {
  const theme = useTheme();
  const effects = getNaturalMoonlitEffects(theme);

  const databases = useMemo(() => [
    { name: 'MySQL', color: '#00758F', logo: '/logo-mysql.svg', providers: ['Local', 'PlanetScale', 'TiDB Cloud', 'Aiven', 'AWS RDS', 'Google Cloud SQL'] },
    { name: 'PostgreSQL', color: '#336791', logo: '/logo-postgresql.svg', providers: ['Local', 'Neon', 'Supabase', 'Railway', 'Render', 'AWS RDS', 'Azure'] },
    { name: 'SQL Server', color: '#CC2927', logo: '/logo-microsoft-sql-server.svg', providers: ['Local', 'Azure SQL', 'AWS RDS', 'Google Cloud SQL'] },
    { name: 'Oracle', color: '#F80000', logo: '/logo-oracle.svg', providers: ['Local', 'AWS RDS', 'Oracle Cloud*'] },
    { name: 'SQLite', color: '#003B57', logo: '/logo-sqlite.svg', providers: ['Local File'] },
  ], []);

  return (
    <Section sx={{ background: effects.ambient }}>
      <Container maxWidth="lg">
        <Box textAlign="center" mb={5}>
          <Typography
            variant="overline"
            fontWeight="bold"
            sx={{
              background: getMoonlitGradient(theme),
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '0.15em',
            }}
          >
            Works Everywhere
          </Typography>
          <Typography variant="h3" fontWeight="bold" sx={{ fontSize: { xs: '1.75rem', md: '2.5rem' }, mt: 1 }}>
            Your Database, <Box component="span" sx={{ background: effects.textGradient, backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Your Way</Box>
          </Typography>
          <Typography variant="bodyLarge" color="text.secondary" sx={{ mt: 2, maxWidth: 600, mx: 'auto', opacity: 0.85 }}>
            From local development to production cloud — connect to any major relational database with one unified interface.
          </Typography>
        </Box>

        {/* Carousel */}
        <Box
          sx={{
            position: 'relative',
            overflow: 'hidden',
            '&::before, &::after': {
              content: '""',
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: 100,
              zIndex: 2,
              pointerEvents: 'none',
            },
            '&::before': {
              left: 0,
              background: `linear-gradient(to right, ${theme.palette.background.default}, transparent)`,
            },
            '&::after': {
              right: 0,
              background: `linear-gradient(to left, ${theme.palette.background.default}, transparent)`,
            },
          }}
        >
          <Box
            sx={{
              display: 'flex',
              gap: 3,
              animation: 'scroll 30s linear infinite',
              '@keyframes scroll': {
                '0%': { transform: 'translateX(0)' },
                '100%': { transform: 'translateX(-50%)' },
              },
              '&:hover': {
                animationPlayState: 'paused',
              },
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
              },
            }}
          >
            {[...databases, ...databases].map((db, index) => (
              <Box
                key={`${db.name}-${index}`}
                sx={{
                  ...glassCard(theme),
                  p: 3,
                  minWidth: 280,
                  flexShrink: 0,
                  textAlign: 'center',
                }}
              >
                {/* Logo container with shine effect */}
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: 4,
                    background: `linear-gradient(135deg, ${alpha(db.color, 0.12)}, ${alpha(db.color, 0.06)})`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mx: 'auto',
                    mb: 2,
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      top: 0,
                      left: '-100%',
                      width: '100%',
                      height: '100%',
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
                      transition: 'left 0.5s ease',
                    },
                    '&:hover': {
                      transform: 'scale(1.1)',
                      '&::after': {
                        left: '100%',
                      },
                    },
                  }}
                >
                  <Box
                    component="img"
                    src={db.logo}
                    alt={db.name}
                    sx={{ width: 32, height: 32, objectFit: 'contain' }}
                  />
                </Box>
                <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>
                  {db.name}
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" justifyContent="center" gap={0.5}>
                  {db.providers.map((provider) => (
                    <Box
                      key={provider}
                      sx={{
                        px: 1.25,
                        py: 0.35,
                        borderRadius: 1.5,
                        backgroundColor: alpha(db.color, 0.1),
                        border: `1px solid ${alpha(db.color, 0.2)}`,
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          backgroundColor: alpha(db.color, 0.15),
                        },
                      }}
                    >
                      <Typography variant="labelSmall" sx={{ color: 'text.secondary' }}>
                        {provider}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            ))}
          </Box>
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 4, opacity: 0.7 }}>
          * Oracle Cloud Autonomous DB requires wallet authentication
        </Typography>
      </Container>
    </Section>
  );
}

// ---------- Final CTA ----------
function FinalCTA({ onGetStarted }) {
  const theme = useTheme();
  const effects = getNaturalMoonlitEffects(theme);

  return (
    <Section sx={{ flexDirection: 'column', justifyContent: 'space-between', py: 0, position: 'relative' }}>
      {/* Radial gradient backdrop */}
      <Box
        sx={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '80%',
          height: '60%',
          background: effects.glow,
          filter: 'blur(100px)',
          pointerEvents: 'none',
          opacity: 0.6,
        }}
      />

      <Box />
      <Container maxWidth="md" sx={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <Stack spacing={4} alignItems="center">
          <Typography
            variant="h2"
            fontWeight="bold"
            sx={{
              fontSize: { xs: '1.75rem', md: '2.75rem' },
              lineHeight: 1.2,
            }}
          >
            Your Data. Your Questions. <br />
            <Box
              component="span"
              sx={{
                background: effects.textGradient,
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
            >
              Instant Answers.
            </Box>
          </Typography>
          <Typography variant="bodyLarge" color="text.secondary" sx={{ maxWidth: 520, opacity: 0.85 }}>
            Whether you're debugging a query or exploring data for the first time — Moonlit meets you where you are.
          </Typography>
          <Button
            size="large"
            onClick={onGetStarted}
            sx={{
              px: 7,
              py: 2,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.info.main})`,
              color: theme.palette.getContrastText(theme.palette.primary.main),
              fontWeight: 600,
              fontSize: '1rem',
              position: 'relative',
              overflow: 'hidden',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: '-100%',
                width: '100%',
                height: '100%',
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                animation: 'shimmerCTA 3s infinite',
              },
              '@keyframes shimmerCTA': {
                '0%': { left: '-100%' },
                '100%': { left: '100%' },
              },
              '&:hover': {
                background: `linear-gradient(135deg, ${theme.palette.info.main}, ${theme.palette.primary.main})`,
                transform: 'translateY(-3px)',
                boxShadow: effects.shadow,
              },
              '@media (prefers-reduced-motion: reduce)': {
                '&::before': { animation: 'none' },
                transition: 'none',
              },
            }}
          >
            Get Started Free
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.7 }}>
            No credit card required • Works with your existing databases
          </Typography>
        </Stack>
      </Container>

      {/* Footer */}
      <Box
        component="footer"
        sx={{
          width: '100%',
          py: 3,
          borderTop: `1px solid ${alpha(theme.palette.info.main, 0.1)}`,
          background: alpha(theme.palette.background.paper, 0.6),
          backdropFilter: 'blur(12px)',
        }}
      >
        <Container maxWidth="lg">
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box component="img" src="/product-logo.png" alt="Moonlit" sx={{ width: 28, height: 28 }} />
              <Typography
                variant="subtitle2"
                fontWeight="bold"
                sx={{
                  background: getMoonlitGradient(theme),
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Moonlit
              </Typography>
            </Stack>
            <Stack direction="row" spacing={3}>
              {['About', 'Docs', 'Privacy', 'Terms'].map((l) => (
                <Link
                  key={l}
                  href="#"
                  underline="hover"
                  color="text.secondary"
                  variant="body2"
                  sx={{
                    transition: 'color 0.2s ease',
                    '&:hover': { color: theme.palette.primary.main },
                  }}
                >
                  {l}
                </Link>
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.7 }}>
              © {new Date().getFullYear()} ABN Alliance
            </Typography>
          </Stack>
        </Container>
      </Box>
    </Section>
  );
}

// ---------- Main Landing ----------
export default function Landing() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const theme = useTheme();

  useEffect(() => { document.title = 'Moonlit - AI Database Assistant'; }, []);

  // Navigate directly to chat if authenticated, otherwise to auth page
  const handleGetStarted = useCallback(() => {
    navigate(isAuthenticated ? '/chat' : '/auth');
  }, [navigate, isAuthenticated]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollSnapType: 'y mandatory',
        backgroundColor: 'background.default',
        scrollBehavior: 'smooth',
        position: 'relative',
        // Reduced motion support globally
        '@media (prefers-reduced-motion: reduce)': {
          scrollBehavior: 'auto',
          '& *': { animation: 'none !important', transition: 'none !important' },
        },
      }}
      role="main"
    >
      <Hero onGetStarted={handleGetStarted} />
      <ValueGrid />
      <DemoSection />
      <StepsGrid />
      <SupportedDatabases />
      <FinalCTA onGetStarted={handleGetStarted} />
    </Box>
  );
}
