import { useMemo } from 'react';
import { Box, Container, Typography, Stack } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SpeedIcon from '@mui/icons-material/Speed';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { Section } from './index';

function ValueGrid() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

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
              fontSize: '0.7rem',
              display: 'block',
              mb: 1.5,
            }}
          >
            Why Moonlit
          </Typography>
          <Typography 
            variant="h3" 
            fontWeight="bold" 
            sx={{ 
              fontSize: { xs: '1.75rem', md: '2.25rem' }, 
            }}
          >
            Built for{' '}
            <Box 
              component="span" 
              sx={{ 
                color: isDark 
                  ? alpha(theme.palette.text.primary, 0.6)
                  : alpha(theme.palette.text.primary, 0.5),
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
            gap: 3,
            justifyContent: 'center',
          }}
        >
          {values.map((v, i) => (
            <Box
              key={v.title}
              sx={{
                flex: { xs: '1 1 auto', md: '1 1 0' },
                minWidth: 0,
                p: 4,
                backgroundColor: isDark 
                  ? alpha(theme.palette.common.white, 0.03)
                  : alpha(theme.palette.common.black, 0.02),
                border: `1px solid ${alpha(theme.palette.text.primary, isDark ? 0.08 : 0.06)}`,
                borderRadius: 3,
                transition: theme.transitions.create(['border-color', 'background-color', 'transform'], {
                  duration: 250,
                }),
                animation: `fadeInUp 0.5s ease-out ${i * 0.12}s both`,
                '@keyframes fadeInUp': {
                  from: { opacity: 0, transform: 'translateY(24px)' },
                  to: { opacity: 1, transform: 'translateY(0)' },
                },
                '&:hover': {
                  borderColor: alpha(theme.palette.text.primary, isDark ? 0.15 : 0.12),
                  backgroundColor: isDark 
                    ? alpha(theme.palette.common.white, 0.04)
                    : alpha(theme.palette.common.black, 0.03),
                  transform: 'translateY(-4px)',
                  '& .icon-container': {
                    transform: 'scale(1.05)',
                  },
                },
              }}
            >
              <Stack 
                direction="column"
                spacing={2}
                alignItems="center"
              >
                <Box
                  className="icon-container"
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: 2,
                    backgroundColor: isDark 
                      ? alpha(theme.palette.common.white, 0.05)
                      : alpha(theme.palette.common.black, 0.04),
                    border: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: theme.transitions.create(['transform'], {
                      duration: 250,
                    }),
                  }}
                >
                  <v.Icon sx={{ fontSize: 26, color: 'text.primary', opacity: 0.8 }} />
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography 
                    variant="h6" 
                    fontWeight={700} 
                    sx={{ 
                      mb: 0.75,
                      fontSize: '1.1rem',
                    }}
                  >
                    {v.title}
                  </Typography>
                  <Typography 
                    variant="body2" 
                    color="text.secondary" 
                    sx={{ 
                      lineHeight: 1.7, 
                      opacity: 0.8, 
                      fontSize: '0.9rem',
                    }}
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
