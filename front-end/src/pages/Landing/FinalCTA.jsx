// FinalCTA section component - Monochromatic design
import { Box, Container, Stack, Typography, Button } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { Section } from './index';

function FinalCTA({ onGetStarted }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Section sx={{ flexDirection: 'column', py: { xs: 6, md: 8 } }}>
      {/* Subtle radial gradient backdrop - grayscale */}
      <Box
        sx={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '80%',
          height: '60%',
          background: `radial-gradient(ellipse at center, ${alpha(theme.palette.text.primary, isDark ? 0.04 : 0.03)}, transparent 70%)`,
          filter: 'blur(100px)',
          pointerEvents: 'none',
          opacity: 0.8,
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
            <Box 
              component="span" 
              sx={{ 
                color: isDark 
                  ? alpha(theme.palette.text.primary, 0.65)
                  : alpha(theme.palette.text.primary, 0.55),
              }}
            >
              Your Database?
            </Box>
          </Typography>
          <Typography 
            variant="body2" 
            color="text.secondary" 
            sx={{ 
              maxWidth: 420, 
              opacity: 0.75 
            }}
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
              backgroundColor: 'text.primary',
              color: 'background.default',
              border: 'none',
              boxShadow: isDark 
                ? `0 4px 20px ${alpha('#000', 0.4)}`
                : `0 4px 20px ${alpha('#000', 0.15)}`,
              transition: theme.transitions.create(['background-color', 'transform', 'box-shadow'], {
                duration: 200,
              }),
              '&:hover': {
                backgroundColor: isDark 
                  ? alpha(theme.palette.text.primary, 0.85)
                  : alpha(theme.palette.text.primary, 0.9),
                transform: 'translateY(-2px)',
                boxShadow: isDark
                  ? `0 6px 25px ${alpha('#000', 0.5)}`
                  : `0 6px 25px ${alpha('#000', 0.2)}`,
              },
              '&:active': {
                transform: 'scale(0.98)',
              },
            }}
          >
            Get Started Free
          </Button>
          <Typography 
            variant="caption" 
            color="text.secondary" 
            sx={{ 
              opacity: 0.6, 
              fontSize: '0.7rem' 
            }}
          >
            No credit card • Works with your existing databases • Cancel anytime
          </Typography>
        </Stack>
      </Container>
    </Section>
  );
}

export default FinalCTA;
