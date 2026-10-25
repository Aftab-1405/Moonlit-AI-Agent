import { Box, Button, Container, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { ArrowForwardIcon } from '@/components/icons';
import AgentTrace from './AgentTrace';
import { Reveal } from './LandingSection';
import { getAuroraStyles } from './landingAnimations';
import { LANDING_COPY, PRODUCT_STAGES } from './landingContent';
import { getLandingPresentationSx } from './landingPresentation';

const landingPresentationSx = getLandingPresentationSx();

function Hero({ getStartedTo }) {
  return (
    <Box
      component="section"
      sx={{
        ...landingPresentationSx.hero,
        position: 'relative',
        isolation: 'isolate',
      }}
    >
      {/* Aurora atmospheric backdrops */}
      <Box aria-hidden="true" sx={getAuroraStyles('hero-primary')} />
      <Box aria-hidden="true" sx={getAuroraStyles('hero-secondary')} />

      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1, width: '100%' }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: landingPresentationSx.heroGrid,
            alignItems: 'center',
            gap: { xs: 6, md: 6 },
          }}
        >
          <Reveal heroEntrance sx={{ minWidth: 0 }}>
            <Typography
              sx={(theme) => ({ ...theme.typography.captionMono, color: 'text.secondary' })}
            >
              {LANDING_COPY.hero.eyebrow}
            </Typography>
            <Typography
              component="h1"
              sx={(theme) => ({
                ...theme.typography.displayLg,
                fontSize: { xs: '3rem', md: 'clamp(3.5rem, 5vw, 4.5rem)' },
                mt: 2.5,
                maxWidth: 760,
                textWrap: 'balance',
              })}
            >
              {LANDING_COPY.hero.title}
            </Typography>
            <Typography
              sx={(theme) => ({
                ...theme.typography.bodyLg,
                mt: 3,
                maxWidth: 620,
                color: 'text.secondary',
              })}
            >
              {LANDING_COPY.hero.description}
            </Typography>
            <Stack
              direction={landingPresentationSx.heroActions}
              spacing={1.5}
              alignItems={{ xs: 'stretch', md: 'flex-start' }}
              sx={{ mt: 4.5 }}
            >
              <Button
                variant="contained"
                size="large"
                component={Link}
                to={getStartedTo}
                endIcon={<ArrowForwardIcon />}
              >
                Get started
              </Button>
              <Button component="a" href="#product" variant="outlined" size="large">
                See how it works
              </Button>
            </Stack>
            <Box
              sx={{
                mt: { xs: 4, md: 5 },
                pt: 2,
                maxWidth: 620,
                borderTop: '1px solid',
                borderColor: 'border.subtle',
              }}
            >
              <Typography
                sx={(theme) => ({
                  ...theme.typography.captionMonoSm,
                  color: 'text.disabled',
                  textTransform: 'uppercase',
                })}
              >
                Supported database context
              </Typography>
              <Typography
                sx={(theme) => ({ ...theme.typography.bodySm, mt: 0.75, color: 'text.secondary' })}
              >
                {LANDING_COPY.hero.proof}
              </Typography>
            </Box>
          </Reveal>

          <Reveal heroEntrance delay={0.12} sx={{ minWidth: 0 }}>
            <AgentTrace
              stages={PRODUCT_STAGES}
              activeStageId="execution"
              variant="hero"
              ariaLabel="Moonlit agent path from question to result artifact"
            />
          </Reveal>
        </Box>

        <Box
          component="a"
          href="#product"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            mt: { xs: 6, md: 3 },
            pt: 2,
            borderTop: '1px solid',
            borderColor: 'border.subtle',
            color: 'text.disabled',
            textDecoration: 'none',
          }}
        >
          <Typography
            component="span"
            sx={(theme) => ({ ...theme.typography.captionMonoSm, textTransform: 'uppercase' })}
          >
            Enter the product surface
          </Typography>
          <Typography
            component="span"
            aria-hidden="true"
            sx={(theme) => ({ ...theme.typography.captionMonoSm })}
          >
            Question → artifact
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}

export default Hero;
