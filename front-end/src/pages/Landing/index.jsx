// Landing page - main component with inline TrustStrip, Footer, and Section
import { useEffect, useCallback, useMemo } from 'react';
import { Box, Container, Stack, Typography, Link } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTheme, alpha } from '@mui/material/styles';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { useAuth } from '../../contexts/AuthContext';

// Section components
import Hero from './Hero';
import ValueGrid from './ValueGrid';
import DemoSection from './DemoSection';
import StepsGrid from './StepsGrid';
import FinalCTA from './FinalCTA';

// Barrel exports
export { default as Hero } from './Hero';
export { default as ValueGrid } from './ValueGrid';
export { default as DemoSection } from './DemoSection';
export { default as StepsGrid } from './StepsGrid';
export { default as FinalCTA } from './FinalCTA';

// ---------- Inline Section ----------
export const Section = ({ children, sx = {}, id, fullHeight = true }) => (
  <Box
    id={id}
    component="section"
    sx={{
      width: '100%',
      minHeight: fullHeight ? '100vh' : 'auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      py: { xs: 6, sm: 8, md: 10, lg: 12 },
      px: { xs: 2, sm: 3, md: 4 },
      boxSizing: 'border-box',
      scrollSnapAlign: 'start',
      scrollSnapStop: 'always',
      ...sx,
    }}
  >
    {children}
  </Box>
);

// ---------- Inline TrustStrip ----------
function TrustStrip() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const trustItems = useMemo(() => [
    { Icon: LockOutlinedIcon, text: 'Credentials never stored' },
    { Icon: StorageOutlinedIcon, text: 'Read-only queries' },
    { Icon: CloudOffOutlinedIcon, text: 'No data retention' },
    { Icon: VerifiedUserOutlinedIcon, text: 'Your infrastructure' },
  ], []);

  return (
    <Box
      sx={{
        py: { xs: 4, md: 5 },
        backgroundColor: alpha(theme.palette.text.primary, isDark ? 0.02 : 0.01),
        borderTop: `1px solid ${alpha(theme.palette.text.primary, 0.06)}`,
        borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.06)}`,
        scrollSnapAlign: 'start',
      }}
    >
      <Container maxWidth="lg">
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={{ xs: 2, sm: 4, md: 6 }}
          justifyContent="center"
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
        >
          {trustItems.map((item) => (
            <Stack
              key={item.text}
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ opacity: 0.7 }}
            >
              <item.Icon sx={{ fontSize: 18, color: 'text.secondary' }} />
              <Typography variant="body2" fontWeight={500} color="text.secondary">
                {item.text}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Container>
    </Box>
  );
}

// ---------- Inline Footer ----------
function Footer() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      component="footer"
      sx={{
        width: '100%',
        py: 3,
        borderTop: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
        backgroundColor: alpha(theme.palette.background.paper, 0.6),
        backdropFilter: 'blur(12px)',
        scrollSnapAlign: 'end',
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
                color: 'text.primary',
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
                  '&:hover': { color: 'text.primary' },
                }}
              >
                {l}
              </Link>
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.6 }}>
            © {new Date().getFullYear()} ABN Alliance
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}

// ---------- Main Landing ----------
export default function Landing() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  useEffect(() => { document.title = 'Moonlit - AI Database Assistant'; }, []);

  const handleGetStarted = useCallback(() => {
    navigate(isAuthenticated ? '/chat' : '/auth');
  }, [navigate, isAuthenticated]);

  return (
    <Box
      sx={{
        height: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        backgroundColor: 'background.default',
        scrollBehavior: 'smooth',
        scrollSnapType: 'y mandatory',
        position: 'relative',
        '@media (prefers-reduced-motion: reduce)': {
          scrollBehavior: 'auto',
          scrollSnapType: 'none',
          '& *': { animation: 'none !important', transition: 'none !important' },
        },
      }}
      role="main"
    >
      <Hero onGetStarted={handleGetStarted} />
      <ValueGrid />
      <DemoSection />
      <StepsGrid />
      <TrustStrip />
      <FinalCTA onGetStarted={handleGetStarted} />
      <Footer />
    </Box>
  );
}
