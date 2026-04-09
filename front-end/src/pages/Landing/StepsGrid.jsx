import { useMemo } from 'react';
import { Box, Container, Typography, Stack } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { Section, REDUCED_MOTION_QUERY, HOVER_CAPABLE_QUERY } from './index';

function StepsGrid() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const brand = theme.palette.primary.main;
  const brandLight = theme.palette.primary.light;
  const accent = theme.palette.secondary.main;
  const brandGradient = `linear-gradient(to right, ${accent}, ${brandLight}, ${brand}, ${brandLight}, ${accent})`;
  const brandGradientStatic = `linear-gradient(135deg, ${accent}, ${brandLight}, ${brand})`;

  const steps = useMemo(() => [
    {
      num: '01',
      title: 'Connect',
      desc: 'Link your PostgreSQL, MySQL, SQL Server, or Oracle database in seconds.',
    },
    {
      num: '02',
      title: 'Ask',
      desc: 'Type your question in plain English. No SQL syntax needed.',
    },
    {
      num: '03',
      title: 'Get Answers',
      desc: 'View results as tables, visualize as charts, or export to CSV.',
    },
  ], []);

  return (
    <Section tinted sx={{ py: { xs: 8, md: 10 } }}>
      <Container maxWidth="lg">
        <Box textAlign="center" mb={6}>
          <Typography
            variant="caption"
            fontWeight="bold"
            sx={{
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              color: accent,
              ...theme.typography.uiCaptionXs,
              display: 'block',
              mb: 1.5,
            }}
          >
            How It Works
          </Typography>
          <Typography
            variant="h3"
            fontWeight="bold"
            sx={{ ...theme.typography.uiHeadingLandingLg }}
          >
            Three Steps.{' '}
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
              Zero Learning Curve.
            </Box>
          </Typography>
        </Box>

        {/* Steps layout */}
        <Box sx={{ position: 'relative' }}>

          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              gap: 3,
              justifyContent: 'center',
            }}
          >
            {steps.map((s, i) => (
              <Box
                key={s.num}
                sx={{
                  flex: { xs: '1 1 auto', md: '1 1 0' },
                  minWidth: 0,
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                {/* Card */}
                <Box
                  sx={{
                    p: { xs: 3, md: 4 },
                    pt: { xs: 4.5, md: 5 },
                    position: 'relative',
                    backgroundColor: isDark
                      ? alpha(theme.palette.text.primary, 0.03)
                      : alpha(theme.palette.text.primary, 0.02),
                    border: `1px solid ${alpha(theme.palette.text.primary, isDark ? 0.08 : 0.06)}`,
                    borderRadius: 3,
                    transition: theme.transitions.create(
                      ['border-color', 'background-color', 'transform', 'box-shadow'],
                      { duration: 250 }
                    ),
                    animation: { xs: 'none', md: `fadeIn 0.5s ease-out ${i * 0.12}s both` },
                    [REDUCED_MOTION_QUERY]: { animation: 'none', transition: 'none' },
                    [HOVER_CAPABLE_QUERY]: {
                      '&:hover': {
                        borderColor: alpha(brand, isDark ? 0.32 : 0.22),
                        backgroundColor: isDark
                          ? alpha(brand, 0.06)
                          : alpha(brand, 0.04),
                        transform: 'translateY(-5px)',
                        boxShadow: isDark
                          ? `0 20px 40px -16px ${alpha(brand, 0.22)}`
                          : `0 20px 40px -16px ${alpha(brand, 0.13)}`,
                      },
                    },
                  }}
                >
                  {/* Step badge */}
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -22,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      backgroundImage: brandGradientStatic,
                      backgroundColor: 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: `0 4px 16px ${alpha(brand, isDark ? 0.45 : 0.3)}`,
                      border: `3px solid ${theme.palette.background.default}`,
                    }}
                  >
                    <Typography
                      sx={{
                        ...theme.typography.uiStepNumber,
                        fontWeight: 700,
                        color: theme.palette.background.paper,
                        letterSpacing: '0.02em',
                      }}
                    >
                      {s.num}
                    </Typography>
                  </Box>

                  <Stack spacing={1} alignItems="center" textAlign="center">
                    <Typography
                      variant="h6"
                      fontWeight={700}
                      sx={{ ...theme.typography.uiCardTitle }}
                    >
                      {s.title}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ ...theme.typography.uiCardBody, opacity: 0.75 }}
                    >
                      {s.desc}
                    </Typography>
                  </Stack>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Container>
    </Section>
  );
}

export default StepsGrid;