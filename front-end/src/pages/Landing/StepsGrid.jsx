// StepsGrid (How It Works) section component
import { useMemo } from 'react';
import { Box, Container, Typography, Grid } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { getMoonlitGradient, getNaturalMoonlitEffects, getGlassCardSx, getGradientTextSx, KEYFRAMES } from '../../theme';
import { Section } from './index';

function StepsGrid() {
  const theme = useTheme();
  const effects = getNaturalMoonlitEffects(theme);
  const steps = useMemo(() => [
    { num: '01', title: 'Connect', desc: 'Link your PostgreSQL, MySQL, SQL Server, Oracle, or SQLite database in seconds.' },
    { num: '02', title: 'Ask', desc: 'Type your question in plain English. No SQL syntax needed.' },
    { num: '03', title: 'Get Answers', desc: 'View results as tables, visualize as charts, or export to CSV.' },
  ], []);

  return (
    <Section sx={{ background: effects.ambient, py: { xs: 6, md: 8 } }}>
      <Container maxWidth="lg">
        <Box textAlign="center" mb={4}>
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
            How It Works
          </Typography>
          <Typography variant="h3" fontWeight="bold" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, mt: 1 }}>
            Three Steps.{' '}
            <Box component="span" sx={getGradientTextSx(theme)}>
              Zero Learning Curve.
            </Box>
          </Typography>
        </Box>

        <Box sx={{ position: 'relative' }}>
          {/* Connecting line */}
          <Box
            sx={{
              display: { xs: 'none', md: 'block' },
              position: 'absolute',
              top: '52px',
              left: 'calc(16.67% + 40px)',
              right: 'calc(16.67% + 40px)',
              height: 2,
              background: `linear-gradient(90deg, ${alpha(theme.palette.info.main, 0.3)}, ${alpha(theme.palette.primary.main, 0.3)})`,
            }}
          />

          <Grid container spacing={3} justifyContent="center">
            {steps.map((s, i) => (
              <Grid item xs={12} md={4} key={s.num}>
                <Box
                  sx={{
                    ...getGlassCardSx(theme),
                    p: 3,
                    position: 'relative',
                    overflow: 'visible',
                    textAlign: 'center',
                    animation: `slideUp 0.6s ease-out ${i * 0.15}s both`,
                    ...KEYFRAMES.slideUp,
                  }}
                >
                  {/* Number badge */}
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -18,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: `linear-gradient(135deg, ${theme.palette.info.main}, ${theme.palette.primary.main})`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: effects.shadow,
                      border: `2px solid ${theme.palette.background.default}`,
                    }}
                  >
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#000' }}>
                      {s.num}
                    </Typography>
                  </Box>

                  <Box sx={{ position: 'relative', zIndex: 1, pt: 1.5 }}>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                      {s.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6, opacity: 0.85, fontSize: '0.85rem' }}>
                      {s.desc}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>
      </Container>
    </Section>
  );
}

export default StepsGrid;
