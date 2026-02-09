import { useEffect, useCallback } from 'react';
import { Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Hero from './Hero';
import ValueGrid from './ValueGrid';
import DemoSection from './DemoSection';
import StepsGrid from './StepsGrid';
import FinalCTA from './FinalCTA';

export const REDUCED_MOTION_QUERY = '@media (prefers-reduced-motion: reduce)';
export { default as Hero } from './Hero';
export { default as ValueGrid } from './ValueGrid';
export { default as DemoSection } from './DemoSection';
export { default as StepsGrid } from './StepsGrid';
export { default as FinalCTA } from './FinalCTA';
export const Section = ({ children, sx = {}, id, fullHeight = true }) => (
  <Box
    id={id}
    component="section"
    sx={{
      width: '100%',
      maxWidth: '100%',
      minHeight: fullHeight ? '100dvh' : 'auto',
      '@supports not (min-height: 100dvh)': {
        minHeight: fullHeight ? '100vh' : 'auto',
      },
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      py: { xs: 6, sm: 8, md: 10, lg: 12 },
      px: { xs: 2, sm: 3, md: 4 },
      boxSizing: 'border-box',
      overflowX: 'clip',
      scrollSnapAlign: 'start',
      scrollSnapStop: 'always',
      ...sx,
    }}
  >
    {children}
  </Box>
);
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
        height: '100dvh',
        '@supports not (height: 100dvh)': {
          height: '100vh',
        },
        overflowY: 'auto',
        overflowX: 'hidden',
        backgroundColor: 'background.default',
        scrollBehavior: 'smooth',
        scrollSnapType: { xs: 'y proximity', md: 'y mandatory' },
        position: 'relative',
        [REDUCED_MOTION_QUERY]: {
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
      <FinalCTA onGetStarted={handleGetStarted} />
    </Box>
  );
}
