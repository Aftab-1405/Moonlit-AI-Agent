import { useMemo } from 'react';
import { Box, Container, Typography, Stack } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SpeedIcon from '@mui/icons-material/Speed';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { Section, REDUCED_MOTION_QUERY, HOVER_CAPABLE_QUERY } from './index';

function ValueGrid() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const values = useMemo(() => [
    {
      Icon: AutoAwesomeIcon,
      title: 'Natural Language Queries',
      desc: 'Just ask what you want to know. The AI translates your questions into optimized SQL automatically.',
    },
    {
      Icon: SpeedIcon,
      title: 'Instant Results',
      desc: 'Get answers in seconds, not hours. View as tables, charts, or export to CSV with one click.',
    },
    {
      Icon: VisibilityIcon,
      title: 'Visualize Instantly',
      desc: 'Turn query results into beautiful charts. Bar, line, pie, or doughnut — your choice.',
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
              color: 'text.secondary',
              ...theme.typography.uiCaptionXs,
              display: 'block',
              mb: 1.5,
            }}
          >
            Why Moonlit
          </Typography>
          <Typography
            variant="h3"
            fontWeight="bold"
            sx={{ ...theme.typography.uiHeadingLandingLg }}
          >
            Built for{' '}
            <Box
              component="span"
              sx={{
                color: isDark
                  ? alpha(theme.palette.text.primary, 0.45)
                  : alpha(theme.palette.text.primary, 0.38),
              }}
            >
              Everyone.
            </Box>
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            gap: 2.5,
            justifyContent: 'center',
          }}
        >
          {values.map((v, i) => (
            <Box
              key={v.title}
              sx={{
                flex: { xs: '1 1 auto', md: '1 1 0' },
                minWidth: 0,
                p: { xs: 3, md: 4 },
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
                    borderColor: alpha(theme.palette.text.primary, isDark ? 0.16 : 0.12),
                    backgroundColor: isDark
                      ? alpha(theme.palette.text.primary, 0.045)
                      : alpha(theme.palette.text.primary, 0.03),
                    transform: 'translateY(-5px)',
                    boxShadow: isDark
                      ? `0 20px 40px -16px ${alpha(theme.palette.text.primary, 0.18)}`
                      : `0 20px 40px -16px ${alpha(theme.palette.text.primary, 0.1)}`,
                    '& .icon-container': { transform: 'scale(1.06)' },
                    '& .card-number': { opacity: 0.5 },
                  },
                },
              }}
            >
              {/* Card number */}
              <Typography
                className="card-number"
                sx={{
                  position: 'absolute',
                  top: 20,
                  right: 20,
                  fontFamily: theme.typography.fontFamilyMono || 'monospace',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  color: 'text.secondary',
                  opacity: 0.2,
                  transition: theme.transitions.create('opacity', { duration: 250 }),
                  userSelect: 'none',
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </Typography>

              <Stack spacing={2.5} alignItems="center">
                {/* Icon */}
                <Box
                  className="icon-container"
                  sx={{
                    width: 54,
                    height: 54,
                    borderRadius: 2,
                    backgroundColor: isDark
                      ? alpha(theme.palette.text.primary, 0.06)
                      : alpha(theme.palette.text.primary, 0.045),
                    border: `1px solid ${alpha(theme.palette.text.primary, isDark ? 0.1 : 0.08)}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: theme.transitions.create('transform', { duration: 250 }),
                    boxShadow: isDark
                      ? `inset 0 1px 0 ${alpha(theme.palette.text.primary, 0.06)}`
                      : `inset 0 1px 0 ${alpha(theme.palette.text.primary, 0.04)}`,
                  }}
                >
                  <v.Icon sx={{ fontSize: 24, color: 'text.primary', opacity: 0.75 }} />
                </Box>

                <Box sx={{ textAlign: 'center' }}>
                  <Typography
                    variant="h6"
                    fontWeight={700}
                    sx={{ mb: 0.75, ...theme.typography.uiCardTitle }}
                  >
                    {v.title}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ ...theme.typography.uiCardBody, opacity: 0.75 }}
                  >
                    {v.desc}
                  </Typography>
                </Box>
              </Stack>
            </Box>
          ))}
        </Box>
      </Container>
    </Section>
  );
}

export default ValueGrid;