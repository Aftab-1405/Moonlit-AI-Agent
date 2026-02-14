import { useMemo } from 'react';
import { Box, Container, Typography, Stack } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { Section, REDUCED_MOTION_QUERY, HOVER_CAPABLE_QUERY } from './index';

function StepsGrid() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const steps = useMemo(() => [
    { num: '01', title: 'Connect', desc: 'Link your PostgreSQL, MySQL, SQL Server, Oracle, or SQLite database in seconds.' },
    { num: '02', title: 'Ask', desc: 'Type your question in plain English. No SQL syntax needed.' },
    { num: '03', title: 'Get Answers', desc: 'View results as tables, visualize as charts, or export to CSV.' },
  ], []);

  return (
    <Section 
      sx={{ 
        py: { xs: 8, md: 10 } 
      }}
    >
      <Container maxWidth="lg">
        <Box textAlign="center" mb={6}>
          <Typography
            variant="caption"
            fontWeight="bold"
            sx={{
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              color: 'text.secondary',
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
            sx={{ 
              ...theme.typography.uiHeadingLandingLg,
            }}
          >
            Three Steps.{' '}
            <Box 
              component="span" 
              sx={{ 
                color: isDark 
                  ? alpha(theme.palette.text.primary, 0.6)
                  : alpha(theme.palette.text.primary, 0.5),
              }}
            >
              Zero Learning Curve.
            </Box>
          </Typography>
        </Box>
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
                p: { xs: 3, md: 4 },
                pt: { xs: 4.5, md: 5 },
                position: 'relative',
                backgroundColor: isDark 
                  ? alpha(theme.palette.text.primary, 0.03)
                  : alpha(theme.palette.text.primary, 0.02),
                border: `1px solid ${alpha(theme.palette.text.primary, isDark ? 0.08 : 0.06)}`,
                borderRadius: 3,
                transition: theme.transitions.create(['border-color', 'background-color', 'transform'], {
                  duration: 250,
                }),
                animation: { xs: 'none', md: `fadeInUp 0.5s ease-out ${i * 0.12}s both` },
                '@keyframes fadeInUp': {
                  from: { opacity: 0, transform: 'translateY(24px)' },
                  to: { opacity: 1, transform: 'translateY(0)' },
                },
                [REDUCED_MOTION_QUERY]: {
                  animation: 'none',
                  transition: 'none',
                },
                [HOVER_CAPABLE_QUERY]: {
                  '&:hover': {
                    borderColor: alpha(theme.palette.text.primary, isDark ? 0.15 : 0.12),
                    backgroundColor: isDark
                      ? alpha(theme.palette.text.primary, 0.04)
                      : alpha(theme.palette.text.primary, 0.03),
                    transform: 'translateY(-4px)',
                  },
                },
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  top: -20,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  backgroundColor: theme.palette.text.primary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: isDark 
                    ? `0 4px 16px ${alpha(theme.palette.text.primary, 0.35)}`
                    : `0 4px 16px ${alpha(theme.palette.text.primary, 0.12)}`,
                  border: `3px solid ${theme.palette.background.default}`,
                }}
              >
                <Typography 
                  sx={{ 
                    ...theme.typography.uiStepNumber,
                    fontWeight: 700, 
                    color: theme.palette.background.default,
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
                  sx={{ 
                    ...theme.typography.uiCardBody,
                    opacity: 0.8, 
                  }}
                >
                  {s.desc}
                </Typography>
              </Stack>
            </Box>
          ))}
        </Box>
        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            justifyContent: 'center',
            alignItems: 'center',
            gap: 2,
            mt: 4,
            opacity: 0.4,
          }}
        >
          {[...Array(5)].map((_, i) => (
            <Box
              key={i}
              sx={{
                width: i === 2 ? 8 : 4,
                height: i === 2 ? 8 : 4,
                borderRadius: '50%',
                backgroundColor: 'text.secondary',
              }}
            />
          ))}
        </Box>
      </Container>
    </Section>
  );
}

export default StepsGrid;
