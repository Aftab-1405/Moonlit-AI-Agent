import { Box, Button, Container, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { ArrowForwardIcon } from '@/components/icons';
import { LandingSection, Reveal } from './LandingSection';
import { LANDING_COPY } from './landingContent';

function FinalCTA({ getStartedTo }) {
  return (
    <LandingSection sx={{ pt: { xs: 10, md: 18 }, pb: { xs: 10, md: 16 } }}>
      <Container maxWidth="lg">
        <Reveal>
          <Typography
            sx={(theme) => ({ ...theme.typography.captionMono, color: 'text.secondary' })}
          >
            {LANDING_COPY.finalCta.eyebrow}
          </Typography>
          <Typography
            component="h2"
            sx={(theme) => ({
              ...theme.typography.displayLg,
              maxWidth: 920,
              mt: 2,
              textWrap: 'balance',
            })}
          >
            {LANDING_COPY.finalCta.title}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) auto' },
              alignItems: { md: 'end' },
              gap: { xs: 4, md: 8 },
              mt: { xs: 3, md: 5 },
              pt: { xs: 3, md: 4 },
              borderTop: '1px solid',
              borderColor: 'border.subtle',
            }}
          >
            <Box sx={{ maxWidth: 620 }}>
              <Typography sx={(theme) => ({ ...theme.typography.bodyLg, color: 'text.secondary' })}>
                {LANDING_COPY.finalCta.description}
              </Typography>
              <Typography
                sx={(theme) => ({
                  ...theme.typography.captionMonoSm,
                  mt: 2,
                  color: 'text.disabled',
                })}
              >
                {LANDING_COPY.accountFlow}
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="large"
              component={Link}
              to={getStartedTo}
              endIcon={<ArrowForwardIcon />}
            >
              Get started
            </Button>
          </Box>
        </Reveal>
      </Container>
    </LandingSection>
  );
}

export default FinalCTA;
