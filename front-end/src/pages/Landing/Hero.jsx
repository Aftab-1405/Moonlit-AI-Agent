// Hero section component - Monochromatic design
import { Box, Container, Stack, Typography, Button } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import PlayCircleOutlinedIcon from '@mui/icons-material/PlayCircleOutlined';
import { Section } from './index';

function Hero({ onGetStarted }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Section sx={{ py: { xs: 8, md: 6 } }}>
      {/* Subtle floating orbs - grayscale */}
      <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <Box
          sx={{
            position: 'absolute',
            top: '-20%',
            left: '10%',
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${alpha(theme.palette.text.primary, isDark ? 0.04 : 0.03)}, transparent 70%)`,
            filter: 'blur(80px)',
            animation: 'float 8s ease-in-out infinite',
            '@keyframes float': {
              '0%, 100%': { transform: 'translateY(0) scale(1)' },
              '50%': { transform: 'translateY(30px) scale(1.05)' },
            },
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            top: '10%',
            right: '5%',
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${alpha(theme.palette.text.primary, isDark ? 0.03 : 0.02)}, transparent 70%)`,
            filter: 'blur(60px)',
            animation: 'float 10s ease-in-out infinite 1s',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            bottom: '10%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 250,
            height: 250,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${alpha(theme.palette.text.primary, isDark ? 0.025 : 0.015)}, transparent 70%)`,
            filter: 'blur(50px)',
            animation: 'float 12s ease-in-out infinite 2s',
          }}
        />
      </Box>

      {/* Radial gradient - subtle */}
      <Box 
        sx={{ 
          position: 'absolute', 
          inset: 0, 
          background: `radial-gradient(ellipse 80% 50% at 50% -20%, ${alpha(theme.palette.text.primary, isDark ? 0.06 : 0.04)}, transparent)`, 
          pointerEvents: 'none' 
        }} 
      />

      <Container maxWidth="md" sx={{ zIndex: 2, textAlign: 'center' }}>
        <Stack spacing={2.5} alignItems="center">
          {/* Badge - subtle monochrome */}
          <Box
            sx={{
              px: 2,
              py: 0.5,
              borderRadius: 2,
              backgroundColor: alpha(theme.palette.text.primary, isDark ? 0.06 : 0.04),
              border: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`,
              animation: 'fadeIn 0.6s ease-out',
              '@keyframes fadeIn': {
                from: { opacity: 0, transform: 'translateY(8px)' },
                to: { opacity: 1, transform: 'translateY(0)' },
              },
            }}
          >
            <Typography 
              variant="caption" 
              sx={{ 
                color: 'text.secondary', 
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                fontSize: '0.7rem',
              }}
            >
              ✨ AI-Powered Database Assistant
            </Typography>
          </Box>

          {/* Main Heading */}
          <Typography
            component="h1"
            sx={{
              fontWeight: 800,
              fontSize: { xs: '2rem', sm: '2.5rem', md: '3.25rem' },
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              color: 'text.primary',
            }}
          >
            Stop Writing SQL.
            <br />
            <Box
              component="span"
              sx={{
                color: isDark 
                  ? alpha(theme.palette.text.primary, 0.7)
                  : alpha(theme.palette.text.primary, 0.65),
              }}
            >
              Start Asking Questions.
            </Box>
          </Typography>

          {/* Value Proposition */}
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{
              maxWidth: 560,
              opacity: 0.8,
              fontSize: { xs: '1rem', md: '1.125rem' },
              lineHeight: 1.7,
            }}
          >
            Connect to your database, ask in plain English, and get instant results.
            No SQL expertise required. Your data never leaves your infrastructure.
          </Typography>

          {/* CTAs - Monochrome buttons */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ pt: 0.5 }}>
            <Button
              size="large"
              onClick={onGetStarted}
              endIcon={<ArrowForwardRoundedIcon />}
              sx={{
                px: 3,
                py: 1.5,
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
            <Button
              size="large"
              variant="outlined"
              startIcon={<PlayCircleOutlinedIcon />}
              onClick={() => document.getElementById('demo-section')?.scrollIntoView({ behavior: 'smooth' })}
              sx={{
                px: 3,
                py: 1.5,
                borderRadius: 2,
                borderColor: alpha(theme.palette.text.primary, 0.2),
                borderWidth: 1,
                color: 'text.primary',
                transition: theme.transitions.create(['border-color', 'background-color', 'transform'], {
                  duration: 200,
                }),
                '&:hover': {
                  borderColor: alpha(theme.palette.text.primary, 0.4),
                  backgroundColor: alpha(theme.palette.text.primary, 0.04),
                  transform: 'translateY(-2px)',
                },
              }}
            >
              Watch Demo
            </Button>
          </Stack>

          {/* Database Logos - Trust Signal */}
          <Stack spacing={1.5} alignItems="center" sx={{ pt: 2 }}>
            <Typography 
              variant="caption" 
              color="text.secondary" 
              sx={{ 
                opacity: 0.5, 
                fontSize: '0.65rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              WORKS WITH YOUR FAVORITE DATABASES
            </Typography>
            <Stack
              direction="row"
              spacing={{ xs: 2.5, md: 4 }}
              alignItems="center"
              justifyContent="center"
              sx={{
                opacity: 0.7,
                transition: 'opacity 0.3s ease',
                '&:hover': {
                  opacity: 0.9,
                },
              }}
            >
              {[
                { src: '/logo-postgresql.svg', alt: 'PostgreSQL' },
                { src: '/logo-mysql.svg', alt: 'MySQL' },
                { src: '/logo-sqlite.svg', alt: 'SQLite' },
                { src: '/logo-microsoft-sql-server.svg', alt: 'SQL Server', hideXs: true },
                { src: '/logo-oracle.svg', alt: 'Oracle', hideXs: true },
              ].map((db) => (
                <Box
                  key={db.alt}
                  sx={{
                    width: { xs: 32, md: 40 },
                    height: { xs: 32, md: 40 },
                    display: db.hideXs ? { xs: 'none', sm: 'flex' } : 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'transform 0.3s ease',
                    '&:hover': {
                      transform: 'scale(1.15)',
                    },
                  }}
                >
                  <Box
                    component="img"
                    src={db.src}
                    alt={db.alt}
                    sx={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                    }}
                  />
                </Box>
              ))}
            </Stack>
          </Stack>
        </Stack>
      </Container>
    </Section>
  );
}

export default Hero;
