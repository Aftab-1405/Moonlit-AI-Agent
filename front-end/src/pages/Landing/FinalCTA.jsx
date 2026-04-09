import { Box, Container, Stack, Typography, Button } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { Section, REDUCED_MOTION_QUERY, HOVER_CAPABLE_QUERY } from './index';

function FinalCTA({ onGetStarted }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const brand = theme.palette.primary.main;
  const brandLight = theme.palette.primary.light;
  const accent = theme.palette.secondary.main;
  const brandGradient = `linear-gradient(to right, ${accent}, ${brandLight}, ${brand}, ${brandLight}, ${accent})`;
  const brandGradientStatic = `linear-gradient(135deg, ${accent}, ${brandLight}, ${brand})`;

  return (
    <Section sx={{ flexDirection: 'column', py: { xs: 6, md: 8 } }}>
      {/* Dot-grid texture */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(${alpha(theme.palette.text.primary, isDark ? 0.05 : 0.035)} 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
          maskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 20%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 20%, transparent 80%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Central glow */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          top: '15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '70%',
          height: '70%',
          background: `radial-gradient(ellipse at center, ${alpha(brand, isDark ? 0.14 : 0.09)}, transparent 70%)`,
          filter: { xs: 'blur(50px)', md: 'blur(90px)' },
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <Container maxWidth="md" sx={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <Stack spacing={3} alignItems="center">
          <Typography
            variant="h2"
            fontWeight="bold"
            sx={{ ...theme.typography.uiHeadingLandingLg, lineHeight: 1.2 }}
          >
            Ready to Talk to{' '}
            <Box
              component="span"
              sx={{
                background: brandGradient,
                backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation: 'shimmer 5s linear infinite',
              }}
            >
              Your Database?
            </Box>
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ maxWidth: 420, opacity: 0.7 }}
          >
            Join developers and analysts who've simplified their database workflows. Start free, no credit card required.
          </Typography>

          <Button
            size="large"
            onClick={onGetStarted}
            endIcon={<ArrowForwardRoundedIcon />}
            sx={{
              px: 5,
              py: 1.75,
              borderRadius: 2,
              fontWeight: 600,
              backgroundImage: brandGradientStatic,
              backgroundColor: 'transparent',
              color: '#fff',
              border: 'none',
              boxShadow: `0 4px 24px ${alpha(brand, isDark ? 0.45 : 0.35)}`,
              transition: theme.transitions.create(['filter', 'transform', 'box-shadow'], { duration: 200 }),
              [REDUCED_MOTION_QUERY]: { transition: 'none' },
              [HOVER_CAPABLE_QUERY]: {
                '&:hover': {
                  filter: 'brightness(1.12)',
                  transform: 'translateY(-2px)',
                  boxShadow: `0 8px 28px ${alpha(brand, isDark ? 0.55 : 0.45)}`,
                },
              },
              '&:active': { transform: 'scale(0.98)' },
            }}
          >
            Get Started Free
          </Button>

          {/* Trust badges */}
          <Stack
            direction="row"
            spacing={0}
            alignItems="center"
            divider={
              <Box
                sx={{
                  width: '1px',
                  height: 12,
                  backgroundColor: alpha(theme.palette.text.primary, 0.12),
                  mx: 2,
                }}
              />
            }
          >
            {['No credit card', 'Your existing databases', 'Cancel anytime'].map((item) => (
              <Typography
                key={item}
                variant="caption"
                color="text.secondary"
                sx={{ opacity: 0.5, ...theme.typography.uiCaptionXs }}
              >
                {item}
              </Typography>
            ))}
          </Stack>
        </Stack>
      </Container>
    </Section>
  );
}

export default FinalCTA;