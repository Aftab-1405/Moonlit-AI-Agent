// ValueGrid section component
import { useMemo } from 'react';
import { Box, Container, Typography, Grid } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SpeedIcon from '@mui/icons-material/Speed';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { getMoonlitGradient, getNaturalMoonlitEffects, getGlassCardSx, getGradientTextSx, KEYFRAMES } from '../../theme';
import { Section } from './index';

function ValueGrid() {
  const theme = useTheme();
  const effects = getNaturalMoonlitEffects(theme);
  const values = useMemo(() => [
    {
      Icon: AutoAwesomeIcon,
      title: 'Natural Language Queries',
      desc: 'Just ask what you want to know. The AI translates your questions into optimized SQL automatically.'
    },
    {
      Icon: SpeedIcon,
      title: 'Instant Results',
      desc: 'Get answers in seconds, not hours. View as tables, charts, or export to CSV with one click.'
    },
    {
      Icon: VisibilityIcon,
      title: 'Visualize Instantly',
      desc: 'Turn query results into beautiful charts. Bar, line, pie, or doughnut — your choice.'
    },
  ], []);

  return (
    <Section sx={{ background: effects.ambient, py: { xs: 6, md: 8 } }}>
      <Container maxWidth="lg">
        <Box textAlign="center" mb={3}>
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
          <Typography variant="h3" fontWeight="bold" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, mt: 1 }}>
            Built for{' '}
            <Box component="span" sx={getGradientTextSx(theme)}>
              Everyone.
            </Box>
          </Typography>
        </Box>
        <Grid container spacing={2.5} justifyContent="center">
          {values.map((v, i) => (
            <Grid item xs={12} sm={4} key={v.title}>
              <Box
                sx={{
                  ...getGlassCardSx(theme),
                  p: 3,
                  textAlign: 'center',
                  animation: `slideUp 0.6s ease-out ${i * 0.15}s both`,
                  ...KEYFRAMES.slideUp,
                }}
              >
                <Box
                  sx={{
                    width: 52,
                    height: 52,
                    borderRadius: 3,
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
                  <v.Icon sx={{ fontSize: 24, color: theme.palette.info.main }} />
                </Box>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                  {v.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6, opacity: 0.85, fontSize: '0.85rem' }}>
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

export default ValueGrid;
