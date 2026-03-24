import { Box, Container, Typography } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { Section, REDUCED_MOTION_QUERY, HOVER_CAPABLE_QUERY } from './index';

function DemoSection() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Section
      id="demo-section"
      sx={{ py: { xs: 4, md: 6 } }}
    >
      <Container maxWidth="lg">
        <Box textAlign="center" mb={4}>
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
            sx={{ ...theme.typography.uiHeadingLandingMd, mt: 1 }}
          >
            From Question to{' '}
            <Box
              component="span"
              sx={{
                color: isDark
                  ? alpha(theme.palette.text.primary, 0.45)
                  : alpha(theme.palette.text.primary, 0.38),
              }}
            >
              Answer
            </Box>
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 1.5, maxWidth: 440, mx: 'auto', opacity: 0.7 }}
          >
            Watch how anyone can explore databases without writing a single line of SQL.
          </Typography>
        </Box>

        <Box
          sx={{
            position: 'relative',
            maxWidth: { xs: '100%', md: 760 },
            mx: 'auto',
            perspective: '1200px',
          }}
        >
          {/* Ambient glow behind the window */}
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              inset: { xs: -30, md: -60 },
              background: `radial-gradient(ellipse at 50% 40%, ${alpha(theme.palette.text.primary, isDark ? 0.06 : 0.04)}, transparent 65%)`,
              pointerEvents: 'none',
              zIndex: 0,
              filter: { xs: 'blur(30px)', md: 'blur(60px)' },
            }}
          />

          <Box
            sx={{
              position: 'relative',
              zIndex: 1,
              transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
              transformStyle: 'preserve-3d',
              [REDUCED_MOTION_QUERY]: { transition: 'none' },
              [HOVER_CAPABLE_QUERY]: {
                '&:hover': { transform: 'rotateX(1.5deg) rotateY(-2deg) scale(1.015)' },
              },
            }}
          >
            {/* Browser chrome */}
            <Box
              sx={{
                borderRadius: `${theme.shape.borderRadius + 4}px ${theme.shape.borderRadius + 4}px 0 0`,
                backgroundColor: alpha(theme.palette.text.primary, isDark ? 0.05 : 0.03),
                border: `1px solid ${alpha(theme.palette.text.primary, isDark ? 0.1 : 0.07)}`,
                borderBottom: 'none',
                px: 2.5,
                py: 1.25,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              {/* Traffic lights */}
              <Box sx={{ display: 'flex', gap: 0.625, flexShrink: 0 }}>
                {[0.22, 0.14, 0.08].map((opacity, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: alpha(theme.palette.text.primary, opacity),
                    }}
                  />
                ))}
              </Box>
              {/* URL bar */}
              <Box
                sx={{
                  flex: 1,
                  px: 2,
                  py: 0.625,
                  borderRadius: 1.5,
                  backgroundColor: alpha(theme.palette.text.primary, isDark ? 0.04 : 0.025),
                  border: `1px solid ${alpha(theme.palette.text.primary, isDark ? 0.06 : 0.05)}`,
                  color: 'text.secondary',
                  ...theme.typography.uiBodySm,
                  fontFamily: theme.typography.fontFamilyMono,
                  opacity: 0.7,
                  letterSpacing: '0.01em',
                }}
              >
                moonlit.app/chat
              </Box>
            </Box>

            {/* Video */}
            <Box
              component="video"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              sx={{
                width: '100%',
                maxHeight: { xs: '45vh', md: '56vh' },
                objectFit: 'cover',
                display: 'block',
                borderRadius: `0 0 ${theme.shape.borderRadius + 4}px ${theme.shape.borderRadius + 4}px`,
                border: `1px solid ${alpha(theme.palette.text.primary, isDark ? 0.1 : 0.07)}`,
                borderTop: 'none',
                backgroundColor: theme.palette.background.paper,
              }}
            >
              <source src="/moonlit-demo.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </Box>
          </Box>
        </Box>
      </Container>
    </Section>
  );
}

export default DemoSection;