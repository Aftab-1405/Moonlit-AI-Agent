import { Box, Container, Typography } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { Section, REDUCED_MOTION_QUERY, HOVER_CAPABLE_QUERY } from './index';

function DemoSection() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Section 
      id="demo-section" 
      sx={{ 
        py: { xs: 4, md: 6 },
      }}
    >
      <Container maxWidth="lg">
        <Box textAlign="center" mb={3}>
          <Typography
            variant="caption"
            fontWeight="bold"
            sx={{
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              color: 'text.secondary',
              ...theme.typography.uiCaptionXs,
            }}
          >
            See It In Action
          </Typography>
          <Typography 
            variant="h3" 
            fontWeight="bold" 
            sx={{ 
              ...theme.typography.uiHeadingLandingMd,
              mt: 1 
            }}
          >
            From Question to{' '}
            <Box 
              component="span" 
              sx={{ 
                color: isDark 
                  ? alpha(theme.palette.text.primary, 0.65)
                  : alpha(theme.palette.text.primary, 0.55),
              }}
            >
              Answer
            </Box>
          </Typography>
          <Typography 
            variant="body2" 
            color="text.secondary" 
            sx={{ 
              mt: 1.5, 
              maxWidth: 440, 
              mx: 'auto', 
              opacity: 0.75 
            }}
          >
            Watch how anyone can explore databases without writing a single line of SQL.
          </Typography>
        </Box>

        <Box
          sx={{
            position: 'relative',
            maxWidth: { xs: '100%', md: 720 },
            mx: 'auto',
            perspective: '1000px',
          }}
        >
          <Box
            sx={{
              transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              transformStyle: 'preserve-3d',
              [REDUCED_MOTION_QUERY]: {
                transition: 'none',
              },
              [HOVER_CAPABLE_QUERY]: {
                '&:hover': {
                  transform: 'rotateX(2deg) rotateY(-2deg) scale(1.02)',
                },
              },
            }}
          >
            <Box
              sx={{
                borderRadius: `${theme.shape.borderRadius + 2}px ${theme.shape.borderRadius + 2}px 0 0`,
                backgroundColor: alpha(theme.palette.text.primary, isDark ? 0.04 : 0.03),
                border: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
                borderBottom: 'none',
                px: 2.5,
                py: 1.25,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
              }}
            >
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                <Box 
                  sx={{ 
                    width: 10, 
                    height: 10, 
                    borderRadius: '50%', 
                    backgroundColor: alpha(theme.palette.text.primary, 0.2),
                  }} 
                />
                <Box 
                  sx={{ 
                    width: 10, 
                    height: 10, 
                    borderRadius: '50%', 
                    backgroundColor: alpha(theme.palette.text.primary, 0.15),
                  }} 
                />
                <Box 
                  sx={{ 
                    width: 10, 
                    height: 10, 
                    borderRadius: '50%', 
                    backgroundColor: alpha(theme.palette.text.primary, 0.1),
                  }} 
                />
              </Box>
              <Box
                sx={{
                  flex: 1,
                  ml: 2,
                  px: 2,
                  py: 0.75,
                  borderRadius: 1.5,
                  backgroundColor: alpha(theme.palette.text.primary, isDark ? 0.04 : 0.03),
                  color: 'text.secondary',
                  ...theme.typography.uiBodySm,
                  fontFamily: theme.typography.fontFamilyMono,
                }}
              >
                moonlit.app/chat
              </Box>
            </Box>
            <Box
              component="video"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              sx={{
                width: '100%',
                maxHeight: { xs: '45vh', md: '55vh' },
                objectFit: 'cover',
                display: 'block',
                borderRadius: `0 0 ${theme.shape.borderRadius + 2}px ${theme.shape.borderRadius + 2}px`,
                border: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
                borderTop: 'none',
                backgroundColor: theme.palette.background.paper,
              }}
            >
              <source src="/moonlit-demo.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </Box>
          </Box>
          <Box
            sx={{
              position: 'absolute',
              inset: { xs: -20, md: -40 },
              background: `radial-gradient(ellipse at center, ${alpha(theme.palette.text.primary, isDark ? 0.03 : 0.02)}, transparent 70%)`,
              pointerEvents: 'none',
              zIndex: -1,
              filter: { xs: 'blur(20px)', md: 'blur(40px)' },
            }}
          />
        </Box>
      </Container>
    </Section>
  );
}

export default DemoSection;
