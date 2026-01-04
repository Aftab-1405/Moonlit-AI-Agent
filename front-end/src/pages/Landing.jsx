// Landing.jsx - Polished with Snap Scroll
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
import StarfieldCanvas from '../components/StarfieldCanvas';
import { getMoonlitGradient } from '../theme';
import { useAuth } from '../contexts/AuthContext';

// ---------- Shared Styles ----------
const glassCard = (theme) => ({
  background: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.05 : 0.85),
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${alpha(theme.palette.common.white, theme.palette.mode === 'dark' ? 0.08 : 0.12)}`,
  borderRadius: 3,
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: theme.palette.mode === 'dark'
    ? `0 4px 20px ${alpha(theme.palette.common.black, 0.2)}`
    : `0 4px 20px ${alpha(theme.palette.common.black, 0.06)}`,
  '&:hover': {
    transform: 'translateY(-8px)',
    boxShadow: theme.palette.mode === 'dark'
      ? `0 8px 32px ${alpha(theme.palette.common.black, 0.3)}, 0 0 0 1px ${alpha(theme.palette.primary.main, 0.1)}`
      : `0 8px 32px ${alpha(theme.palette.common.black, 0.12)}`,
    border: `1px solid ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.2 : 0.3)}`,
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
  return (
    <Section>
      <Box sx={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 80% 50% at 50% -20%, ${alpha(theme.palette.primary.main, 0.15)}, transparent)`, pointerEvents: 'none' }} />
      <Container maxWidth="md" sx={{ zIndex: 2, textAlign: 'center' }}>
        <Stack spacing={3} alignItems="center">
          {/* Moonlit Title */}
          <Typography
            component="span"
            sx={{
              fontSize: { xs: '2.5rem', md: '3.5rem' },
              fontWeight: 800,
              background: getMoonlitGradient(theme),
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: `drop-shadow(0 0 24px ${alpha(theme.palette.primary.main, 0.3)})`,
            }}
          >
            Moonlit
          </Typography>

          {/* Main Heading */}
          <Typography component="h1" variant="h1" sx={{ fontWeight: 800, fontSize: { xs: '1.75rem', md: '3rem' }, lineHeight: 1.2 }}>
            Talk to Your Database
            <br />
            <Box component="span" sx={{ background: `linear-gradient(135deg, ${theme.palette.primary.light}, ${theme.palette.primary.main})`, backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Like Never Before
            </Box>
          </Typography>

          {/* Subtitle */}
          <Typography variant="bodyLarge" color="text.secondary" sx={{ maxWidth: 600 }}>
            Whether you're a seasoned DBA or exploring data for the first time — connect to any major database and let AI handle the SQL. Ask questions in plain English, get instant results.
          </Typography>

          {/* CTAs */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Button
              aria-label="Get started"
              size="large"
              onClick={onGetStarted}
              endIcon={<ArrowForwardRoundedIcon />}
              sx={{
                px: 5,
                py: 1.5,
                borderRadius: 8,
                background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.light})`,
                color: theme.palette.mode === 'dark' ? '#000000' : '#FFFFFF',
                fontWeight: 600,
                '&:hover': {
                  background: `linear-gradient(135deg, ${theme.palette.primary.light}, ${theme.palette.primary.main})`,
                  transform: 'translateY(-2px)',
                  boxShadow: `0 8px 16px ${alpha(theme.palette.primary.main, 0.3)}`,
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
                py: 1.5,
                borderRadius: 8,
                borderColor: alpha(theme.palette.primary.main, 0.5),
                color: theme.palette.primary.main,
                '&:hover': {
                  borderColor: theme.palette.primary.main,
                  backgroundColor: alpha(theme.palette.primary.main, 0.08),
                },
              }}
            >
              Watch Demo
            </Button>
          </Stack>

          {/* Stats */}
          <Stack direction="row" spacing={{ xs: 4, md: 6 }} sx={{ pt: 2 }}>
            {[
              { value: '5', label: 'Databases' },
              { value: '20+', label: 'Providers' },
              { value: 'Read-Only', label: 'Safe Mode' },
            ].map((s) => (
              <Box key={s.label} textAlign="center">
                <Typography variant="h5" color="primary.main" fontWeight="bold">{s.value}</Typography>
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
  const values = useMemo(() => [
    { Icon: AutoAwesomeIcon, title: 'Zero SQL Required', desc: 'Ask in plain English. The AI understands context, navigates your schema, and writes optimized queries for you.' },
    { Icon: ShieldIcon, title: 'Enterprise-Grade Safety', desc: 'Read-only by default. No data leaves your session. Dangerous operations blocked at multiple layers.' },
    { Icon: InsightsIcon, title: 'Instant Insights', desc: 'View results as tables, export to CSV, or ask for visualizations and ER diagrams — all in real-time.' },
  ], []);

  return (
    <Section sx={{ background: `linear-gradient(180deg, transparent, ${alpha(theme.palette.primary.main, 0.03)} 50%, transparent)`, py: { xs: 4, md: 6 } }}>
      <Container maxWidth="lg">
        <Box textAlign="center" mb={3}>
          <Typography variant="labelMedium" fontWeight="bold" sx={{ textTransform: 'uppercase', letterSpacing: '0.1em', color: 'text.secondary' }}>Why Moonlit</Typography>
          <Typography variant="h3" fontWeight="bold" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, mt: 0.5 }}>
            Built for <span style={{ color: theme.palette.primary.main }}>Everyone.</span>
          </Typography>
        </Box>
        <Grid container spacing={2} justifyContent="center">
          {values.map((v) => (
            <Grid item xs={12} sm={4} key={v.title}>
              <Box sx={{ ...glassCard(theme), p: 2.5, textAlign: 'center' }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.25)}, ${alpha(theme.palette.primary.main, 0.15)})`,
                    border: `2px solid ${alpha(theme.palette.primary.main, 0.3)}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mx: 'auto',
                    mb: 1.5,
                    transition: 'transform 0.3s ease',
                    '&:hover': {
                      transform: 'scale(1.1) rotate(5deg)',
                    },
                  }}
                >
                  <v.Icon sx={{ fontSize: 20, color: theme.palette.primary.main }} />
                </Box>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                  {v.title}
                </Typography>
                <Typography variant="bodySmall" color="text.secondary" sx={{ lineHeight: 1.5 }}>
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
  const isDark = theme.palette.mode === 'dark';

  return (
    <Section id="demo-section" sx={{ background: `linear-gradient(180deg, transparent, ${alpha(theme.palette.primary.main, 0.02)} 50%, transparent)`, py: { xs: 4, md: 6 } }}>
      <Container maxWidth="lg">
        <Box textAlign="center" mb={2.5}>
          <Typography variant="labelMedium" fontWeight="bold" sx={{ textTransform: 'uppercase', letterSpacing: '0.1em', color: 'text.secondary' }}>See It In Action</Typography>
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.35rem', md: '1.75rem' }, mt: 0.5 }}>
            From Question to <span style={{ color: theme.palette.primary.main }}>Answer</span>
          </Typography>
          <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 0.5, maxWidth: 450, mx: 'auto' }}>
            See how anyone can query databases without writing a single line of SQL.
          </Typography>
        </Box>

        <Box
          sx={{
            position: 'relative',
            maxWidth: { xs: '100%', sm: 600, md: 700 },
            mx: 'auto',
          }}
        >
          {/* Browser chrome */}
          <Box
            sx={{
              borderRadius: '12px 12px 0 0',
              backgroundColor: alpha(theme.palette.common.white, isDark ? 0.05 : 0.05),
              border: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`,
              borderBottom: 'none',
              px: 2,
              py: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Box sx={{ display: 'flex', gap: 0.75 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#FF5F56' }} />
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#FFBD2E' }} />
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#27C93F' }} />
            </Box>
            <Box
              sx={{
                flex: 1,
                ml: 2,
                px: 2,
                py: 0.5,
                borderRadius: 1,
                backgroundColor: isDark ? alpha(theme.palette.common.white, 0.05) : alpha(theme.palette.common.black, 0.05),
                color: 'text.secondary',
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
              borderRadius: '0 0 12px 12px',
              border: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`,
              borderTop: 'none',
              backgroundColor: theme.palette.background.paper,
            }}
          >
            <source src="/moonlit-demo.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </Box>

          {/* Glow */}
          <Box
            sx={{
              position: 'absolute',
              inset: -30,
              background: `radial-gradient(ellipse at center, ${alpha(theme.palette.primary.main, 0.15)}, transparent 70%)`,
              pointerEvents: 'none',
              zIndex: -1,
              filter: 'blur(30px)',
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
  const steps = useMemo(() => [
    { num: '01', title: 'Connect', desc: 'Link any MySQL, PostgreSQL, SQL Server, Oracle, or SQLite database in seconds — local or cloud-hosted.' },
    { num: '02', title: 'Ask', desc: 'Type your question in plain English. No SQL syntax, no complex joins to remember.' },
    { num: '03', title: 'Get Results', desc: 'See the AI-generated query, approve it, and get formatted results instantly.' },
  ], []);

  return (
    <Section>
      <Container maxWidth="lg">
        <Box textAlign="center" mb={5}>
          <Typography variant="overline" fontWeight="bold" sx={{ color: 'text.secondary' }}>How It Works</Typography>
          <Typography variant="h3" fontWeight="bold" sx={{ fontSize: { xs: '1.75rem', md: '2.5rem' } }}>
            Three Steps. <span style={{ color: theme.palette.primary.main }}>Zero Learning Curve.</span>
          </Typography>
        </Box>
        <Grid container spacing={3} justifyContent="center">
          {steps.map((s) => (
            <Grid item xs={12} md={4} key={s.num}>
              <Box sx={{ ...glassCard(theme), p: 4, position: 'relative', overflow: 'hidden', textAlign: 'center' }}>
                <Typography
                  sx={{
                    position: 'absolute',
                    top: 12,
                    left: 16,
                    opacity: theme.palette.mode === 'dark' ? 0.06 : 0.05,
                    fontSize: '3rem',
                    fontWeight: 900,
                    lineHeight: 1,
                    color: 'primary.main',
                    pointerEvents: 'none',
                  }}
                >
                  {s.num}
                </Typography>
                <Box sx={{ position: 'relative', zIndex: 1 }}>
                  <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>
                    {s.title}
                  </Typography>
                  <Typography variant="bodyMedium" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                    {s.desc}
                  </Typography>
                </Box>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Section>
  );
}

// ---------- Databases ----------
function SupportedDatabases() {
  const theme = useTheme();

  const databases = useMemo(() => [
    { name: 'MySQL', color: '#00758F', providers: ['Local', 'PlanetScale', 'TiDB Cloud', 'Aiven', 'AWS RDS', 'Google Cloud SQL'] },
    { name: 'PostgreSQL', color: '#336791', providers: ['Local', 'Neon', 'Supabase', 'Railway', 'Render', 'AWS RDS', 'Azure'] },
    { name: 'SQL Server', color: '#CC2927', providers: ['Local', 'Azure SQL', 'AWS RDS', 'Google Cloud SQL'] },
    { name: 'Oracle', color: '#F80000', providers: ['Local', 'AWS RDS', 'Oracle Cloud*'] },
    { name: 'SQLite', color: '#003B57', providers: ['Local File'] },
  ], []);

  return (
    <Section sx={{ background: `linear-gradient(180deg, transparent, ${alpha(theme.palette.primary.main, 0.02)} 50%, transparent)` }}>
      <Container maxWidth="lg">
        <Box textAlign="center" mb={4}>
          <Typography variant="overline" fontWeight="bold" sx={{ color: 'text.secondary' }}>Works Everywhere</Typography>
          <Typography variant="h3" fontWeight="bold" sx={{ fontSize: { xs: '1.75rem', md: '2.5rem' } }}>
            Your Database, <span style={{ color: theme.palette.primary.main }}>Your Way</span>
          </Typography>
          <Typography variant="bodyLarge" color="text.secondary" sx={{ mt: 2, maxWidth: 600, mx: 'auto' }}>
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
              width: 80,
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
              animation: 'scroll 25s linear infinite',
              '@keyframes scroll': {
                '0%': { transform: 'translateX(0)' },
                '100%': { transform: 'translateX(-50%)' },
              },
              '&:hover': {
                animationPlayState: 'paused',
              },
            }}
          >
            {[...databases, ...databases].map((db, index) => (
              <Box
                key={`${db.name}-${index}`}
                sx={{
                  ...glassCard(theme),
                  p: 2.5,
                  minWidth: 260,
                  flexShrink: 0,
                  textAlign: 'center',
                }}
              >
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: 2,
                    background: `linear-gradient(135deg, ${alpha(db.color, 0.2)}, ${alpha(db.color, 0.1)})`,
                    border: `2px solid ${alpha(db.color, 0.3)}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mx: 'auto',
                    mb: 1.5,
                  }}
                >
                  <Typography variant="bodyLarge" sx={{ fontWeight: 800, color: db.color }}>
                    {db.name.slice(0, 2).toUpperCase()}
                  </Typography>
                </Box>
                <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
                  {db.name}
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" justifyContent="center" gap={0.5}>
                  {db.providers.map((provider) => (
                    <Box
                      key={provider}
                      sx={{
                        px: 1,
                        py: 0.25,
                        borderRadius: 1,
                        backgroundColor: alpha(db.color, 0.08),
                        border: `1px solid ${alpha(db.color, 0.15)}`,
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

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 3 }}>
          * Oracle Cloud Autonomous DB requires wallet authentication
        </Typography>
      </Container>
    </Section>
  );
}

// ---------- Final CTA ----------
function FinalCTA({ onGetStarted }) {
  const theme = useTheme();
  return (
    <Section sx={{ flexDirection: 'column', justifyContent: 'space-between', py: 0 }}>
      <Box />
      <Container maxWidth="md" sx={{ textAlign: 'center' }}>
        <Stack spacing={3} alignItems="center">
          <Typography variant="h2" fontWeight="bold" sx={{ fontSize: { xs: '1.75rem', md: '2.5rem' } }}>
            Your Data. Your Questions. Instant Answers.
          </Typography>
          <Typography variant="bodyLarge" color="text.secondary" sx={{ maxWidth: 520 }}>
            Whether you're debugging a query or exploring data for the first time — Moonlit meets you where you are.
          </Typography>
          <Button
            size="large"
            onClick={onGetStarted}
            sx={{
              px: 6,
              py: 1.75,
              borderRadius: 8,
              background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.light})`,
              color: theme.palette.mode === 'dark' ? '#000000' : '#FFFFFF',
              fontWeight: 600,
              '&:hover': {
                background: `linear-gradient(135deg, ${theme.palette.primary.light}, ${theme.palette.primary.main})`,
                transform: 'translateY(-2px)',
                boxShadow: `0 8px 16px ${alpha(theme.palette.primary.main, 0.3)}`,
              },
            }}
          >
            Get Started Free
          </Button>
          <Typography variant="caption" color="text.secondary">
            No credit card required • Works with your existing databases
          </Typography>
        </Stack>
      </Container>

      {/* Footer */}
      <Box component="footer" sx={{ width: '100%', py: 3, borderTop: `1px solid ${alpha(theme.palette.divider, 0.08)}`, background: alpha(theme.palette.background.paper, 0.5), backdropFilter: 'blur(8px)' }}>
        <Container maxWidth="lg">
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={1} alignItems="center">
              <Box component="img" src="/product-logo.png" alt="Moonlit" sx={{ width: 24, height: 24 }} />
              <Typography variant="subtitle2" fontWeight="bold">Moonlit</Typography>
            </Stack>
            <Stack direction="row" spacing={3}>
              {['About', 'Docs', 'Privacy', 'Terms'].map((l) => (
                <Link key={l} href="#" underline="hover" color="text.secondary" variant="body2">{l}</Link>
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary">© {new Date().getFullYear()} ABN Alliance</Typography>
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

  useEffect(() => { document.title = 'Moonlit - AI Database Assistant'; }, []);

  // Navigate directly to chat if authenticated, otherwise to auth page
  const handleGetStarted = useCallback(() => {
    navigate(isAuthenticated ? '/chat' : '/auth');
  }, [navigate, isAuthenticated]);

  return (
    <Box
      sx={{
        height: '100vh',
        overflowY: 'scroll',
        overflowX: 'hidden',
        scrollSnapType: 'y mandatory',
        backgroundColor: 'background.default',
        scrollBehavior: 'smooth',
      }}
      role="main"
    >
      {/* Fixed background */}
      <Box sx={{ position: 'fixed', inset: 0, zIndex: 0 }}>
        <StarfieldCanvas active />
      </Box>

      <Hero onGetStarted={handleGetStarted} />
      <ValueGrid />
      <DemoSection />
      <StepsGrid />
      <SupportedDatabases />
      <FinalCTA onGetStarted={handleGetStarted} />
    </Box>
  );
}
