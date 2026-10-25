import { Box, Button, Container, Drawer, IconButton, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CloseIcon, MenuIcon } from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import AnalysisSection from '@/pages/Landing/AnalysisSection';
import AudienceBridge from '@/pages/Landing/AudienceBridge';
import CapabilityGrid from '@/pages/Landing/CapabilityGrid';
import DatabaseStrip from '@/pages/Landing/DatabaseStrip';
import FaqSection from '@/pages/Landing/FaqSection';
import FinalCTA from '@/pages/Landing/FinalCTA';
import Hero from '@/pages/Landing/Hero';
import { getGlassNavSx } from '@/pages/Landing/landingAnimations';
import { getLandingDestination, LANDING_COPY, NAV_LINKS } from '@/pages/Landing/landingContent';
import { getLandingPresentationSx } from '@/pages/Landing/landingPresentation';
import ProductShowcase from '@/pages/Landing/ProductShowcase';
import SchemaIntelligenceSection from '@/pages/Landing/SchemaIntelligenceSection';
import SecuritySection from '@/pages/Landing/SecuritySection';
import SqlControlSection from '@/pages/Landing/SqlControlSection';
import { useScrolled } from '@/pages/Landing/useScrollReveal';
import { REDUCED_MOTION_QUERY } from '@/styles/mediaQueries';

const MOBILE_NAVIGATION_ID = 'mobile-navigation';
const landingPresentationSx = getLandingPresentationSx();

const navLinkSx = (theme) => ({
  minHeight: 36,
  px: 1.5,
  color: theme.palette.common.white,
  borderColor: 'transparent',
  '&:hover': {
    borderColor: 'transparent',
    backgroundColor: alpha(theme.palette.common.white, 0.08),
  },
});

function MoonlitBrand({ onClick, color = 'text.primary' }) {
  return (
    <Box
      component="a"
      href="#top"
      onClick={onClick}
      sx={(theme) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        color,
        textDecoration: 'none',
        '&:focus-visible': {
          outline: `2px solid ${theme.palette.border.focus}`,
          outlineOffset: 2,
        },
      })}
    >
      <Box component="img" src="/moonlit.svg" alt="" sx={{ width: 32, height: 32 }} />
      <Typography component="span" sx={(theme) => theme.typography.uiBrandWordmark}>
        Moonlit
      </Typography>
    </Box>
  );
}

function LandingNav({ getStartedTo }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingMobileAnchor, setPendingMobileAnchor] = useState(null);
  const scrolled = useScrolled();
  const closeMobile = () => setMobileOpen(false);
  const handleMobileAnchorClick = (event, href) => {
    event.preventDefault();
    setPendingMobileAnchor(href);
    closeMobile();
  };
  const handleMobileDrawerExited = () => {
    if (!pendingMobileAnchor) return;

    const destination = document.querySelector(pendingMobileAnchor);
    const destinationHeading = destination?.querySelector('h2[tabindex="-1"]');
    destinationHeading?.focus({ preventScroll: true });
    destination?.scrollIntoView({ block: 'start' });
    if (window.location.hash !== pendingMobileAnchor) {
      window.history.pushState(null, '', pendingMobileAnchor);
    }
    setPendingMobileAnchor(null);
  };

  return (
    <>
      <Box
        component="header"
        sx={{
          ...landingPresentationSx.header,
          ...getGlassNavSx(scrolled),
        }}
      >
        <Container
          maxWidth="lg"
          sx={{
            minHeight: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <MoonlitBrand color="common.white" />

          <Stack
            component="nav"
            aria-label="Desktop primary navigation"
            direction="row"
            spacing={0.5}
            alignItems="center"
            sx={{ display: { xs: 'none', md: 'flex' } }}
          >
            {NAV_LINKS.map((link) => (
              <Button key={link.href} component="a" href={link.href} variant="text" sx={navLinkSx}>
                {link.label}
              </Button>
            ))}
            <Button
              variant="outlined"
              component={Link}
              to="/auth"
              sx={(theme) => ({
                ml: 1,
                color: theme.palette.common.white,
                borderColor: alpha(theme.palette.common.white, 0.5),
                '&:hover': {
                  borderColor: theme.palette.common.white,
                  backgroundColor: alpha(theme.palette.common.white, 0.08),
                },
              })}
            >
              Sign in
            </Button>
            <Button
              variant="contained"
              component={Link}
              to={getStartedTo}
              sx={(theme) => ({
                ml: 0.5,
                color: theme.palette.common.black,
                backgroundColor: theme.palette.common.white,
                '&:hover': { backgroundColor: alpha(theme.palette.common.white, 0.88) },
              })}
            >
              Get started
            </Button>
          </Stack>

          <IconButton
            aria-label="Open navigation"
            aria-controls={MOBILE_NAVIGATION_ID}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
            sx={{
              display: { xs: 'inline-flex', md: 'none' },
              width: 44,
              height: 44,
              color: 'common.white',
            }}
          >
            <MenuIcon />
          </IconButton>
        </Container>
      </Box>

      <Drawer
        anchor="right"
        open={mobileOpen}
        onClose={closeMobile}
        onTransitionExited={handleMobileDrawerExited}
        slotProps={{
          paper: {
            sx: {
              width: 'min(88vw, 360px)',
              borderRadius: 0,
              borderLeft: '1px solid',
              borderColor: 'border.subtle',
              backgroundColor: 'background.default',
              p: 2,
            },
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
          <MoonlitBrand onClick={closeMobile} />
          <IconButton
            aria-label="Close navigation"
            onClick={closeMobile}
            sx={{ width: 44, height: 44 }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
        <Stack
          id={MOBILE_NAVIGATION_ID}
          component="nav"
          aria-label="Mobile navigation"
          spacing={1}
          alignItems="stretch"
        >
          {NAV_LINKS.map((link) => (
            <Button
              key={link.href}
              component="a"
              href={link.href}
              variant="text"
              onClick={(event) => handleMobileAnchorClick(event, link.href)}
              sx={{ minHeight: 44, justifyContent: 'flex-start' }}
            >
              {link.label}
            </Button>
          ))}
          <Button
            variant="outlined"
            component={Link}
            to="/auth"
            onClick={closeMobile}
            sx={{ minHeight: 44 }}
          >
            Sign in
          </Button>
          <Button
            variant="contained"
            component={Link}
            to={getStartedTo}
            onClick={closeMobile}
            sx={{ minHeight: 44 }}
          >
            Get started
          </Button>
        </Stack>
      </Drawer>
    </>
  );
}

function LandingFooter({ getStartedTo }) {
  return (
    <Box component="footer" sx={landingPresentationSx.footer}>
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'flex-start', md: 'center' },
            justifyContent: 'space-between',
            gap: 4,
          }}
        >
          <Box>
            <MoonlitBrand />
            <Typography sx={{ mt: 1.5, color: 'text.secondary', maxWidth: 420 }}>
              {LANDING_COPY.footer.tagline}
            </Typography>
            <Typography
              sx={(theme) => ({
                ...theme.typography.captionMonoSm,
                mt: 1.5,
                color: 'text.disabled',
              })}
            >
              {LANDING_COPY.accountFlow}
            </Typography>
          </Box>
          <Box
            component="nav"
            aria-label="Footer navigation"
            sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}
          >
            {NAV_LINKS.map((link) => (
              <Button key={link.href} component="a" href={link.href} variant="text">
                {link.label}
              </Button>
            ))}
            <Button variant="text" component={Link} to="/auth">
              Sign in
            </Button>
            <Button variant="outlined" component={Link} to={getStartedTo}>
              Get started
            </Button>
          </Box>
        </Box>
        <Typography
          sx={(theme) => ({ ...theme.typography.captionMonoSm, mt: 5, color: 'text.disabled' })}
        >
          © {new Date().getFullYear()} Moonlit
        </Typography>
      </Container>
    </Box>
  );
}

export default function Landing() {
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    document.title = LANDING_COPY.documentTitle;
  }, []);

  const getStartedTo = getLandingDestination({ loading, isAuthenticated });

  return (
    <Box
      data-landing-scroll
      sx={{
        height: '100dvh',
        overflowY: 'auto',
        overflowX: 'hidden',
        backgroundColor: 'background.default',
        color: 'text.primary',
        scrollBehavior: 'smooth',
        [REDUCED_MOTION_QUERY]: { scrollBehavior: 'auto' },
      }}
    >
      <Box id="top" aria-hidden="true" sx={{ height: 0 }} />
      <LandingNav getStartedTo={getStartedTo} />
      <Box component="main">
        <Hero getStartedTo={getStartedTo} />
        <ProductShowcase />
        <SchemaIntelligenceSection />
        <SqlControlSection />
        <AnalysisSection />
        <AudienceBridge />
        <CapabilityGrid />
        <SecuritySection />
        <DatabaseStrip />
        <FaqSection />
        <FinalCTA getStartedTo={getStartedTo} />
      </Box>
      <LandingFooter getStartedTo={getStartedTo} />
    </Box>
  );
}
