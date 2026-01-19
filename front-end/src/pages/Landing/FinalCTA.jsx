// FinalCTA section component
import { Box, Container, Stack, Typography, Button } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { getNaturalMoonlitEffects, getGradientTextSx, getGlowButtonSx } from '../../theme';
import { Section } from './index';

function FinalCTA({ onGetStarted }) {
  const theme = useTheme();
  const effects = getNaturalMoonlitEffects(theme);

  return (
    <Section sx={{ flexDirection: 'column', py: { xs: 6, md: 8 } }}>
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
      <Container maxWidth="md" sx={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <Stack spacing={3} alignItems="center">
          <Typography
            variant="h2"
            fontWeight="bold"
            sx={{
              fontSize: { xs: '1.5rem', md: '2.25rem' },
              lineHeight: 1.2,
            }}
          >
            Ready to Talk to{' '}
            <Box component="span" sx={getGradientTextSx(theme)}>
              Your Database?
            </Box>
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420, opacity: 0.85 }}>
            Join developers and analysts who've simplified their database workflows. Start free, no credit card required.
          </Typography>
          <Button
            size="large"
            onClick={onGetStarted}
            endIcon={<ArrowForwardRoundedIcon />}
            sx={{
              ...getGlowButtonSx(theme),
              px: 5,
              py: 1.75,
            }}
          >
            Get Started Free
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.7, fontSize: '0.7rem' }}>
            No credit card • Works with your existing databases • Cancel anytime
          </Typography>
        </Stack>
      </Container>
    </Section>
  );
}

export default FinalCTA;
