import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Container,
  Paper,
  Stack,
  TextField,
  CircularProgress,
  Alert,
  Divider,
  IconButton,
  InputAdornment,
  Tabs,
  Tab,
  Link,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  useMediaQuery,
} from '@mui/material';
import GlobalStyles from '@mui/material/GlobalStyles';
import { useNavigate } from 'react-router-dom';
import { useTheme, alpha } from '@mui/material/styles';
import GoogleIcon from '@mui/icons-material/Google';
import GitHubIcon from '@mui/icons-material/GitHub';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useAuth } from '../contexts/AuthContext';
import StarfieldCanvas from '../components/StarfieldCanvas';
import {
  useFormValidation,
  signInSchema,
  signUpSchema,
  resetPasswordSchema,
  authFieldSchemas,
} from '../validation';
import { BACKDROP_FILTER_FALLBACK_QUERY } from '../styles/mediaQueries';
import logger from '../utils/logger';

// ─── Keyframes ────────────────────────────────────────────────────────────────
const AUTH_KEYFRAMES = (
  <GlobalStyles
    styles={{
      '@keyframes authSlideIn': {
        from: { opacity: 0, transform: 'translateX(20px)' },
        to: { opacity: 1, transform: 'translateX(0)' },
      },
      '@keyframes authFadeUp': {
        from: { opacity: 0, transform: 'translateY(10px)' },
        to: { opacity: 1, transform: 'translateY(0)' },
      },
      '@keyframes mockupReveal': {
        '0%, 55%': { opacity: 0, transform: 'translateY(8px)' },
        '75%, 100%': { opacity: 1, transform: 'translateY(0)' },
      },
      '@keyframes pulse-dot': {
        '0%, 100%': { opacity: 1, transform: 'scale(1)' },
        '50%': { opacity: 0.3, transform: 'scale(0.8)' },
      },
    }}
  />
);

// ─── Shared submit button sx ──────────────────────────────────────────────────
const getSubmitButtonSx = (theme) => ({
  py: { xs: 1, sm: 1.125 },
  borderRadius: 1.5,
  fontWeight: 600,
  backgroundColor: theme.palette.text.primary,
  color: theme.palette.background.default,
  border: 'none',
  boxShadow:
    theme.palette.mode === 'dark'
      ? `0 4px 20px ${alpha(theme.palette.text.primary, 0.28)}`
      : `0 4px 20px ${alpha(theme.palette.text.primary, 0.15)}`,
  transition: theme.transitions.create(
    ['background-color', 'transform', 'box-shadow'],
    { duration: 200 }
  ),
  '@media (hover: hover)': {
    '&:hover': {
      backgroundColor: alpha(theme.palette.text.primary, 0.88),
      transform: 'translateY(-1px)',
      boxShadow:
        theme.palette.mode === 'dark'
          ? `0 6px 24px ${alpha(theme.palette.text.primary, 0.34)}`
          : `0 6px 24px ${alpha(theme.palette.text.primary, 0.2)}`,
    },
  },
  '&:active': { transform: 'scale(0.98)', boxShadow: 'none' },
  '&.Mui-disabled': {
    backgroundColor: alpha(theme.palette.text.primary, 0.3),
    color: alpha(theme.palette.background.default, 0.6),
    boxShadow: 'none',
  },
});

// ─── SQL→NL Decorative Mockup ─────────────────────────────────────────────────
function QueryMockup({ isDark }) {
  const theme = useTheme();

  const C = {
    panelBg: isDark
      ? 'rgba(255,255,255,0.04)'
      : alpha(theme.palette.text.primary, 0.035),
    panelBorder: isDark
      ? 'rgba(255,255,255,0.10)'
      : alpha(theme.palette.text.primary, 0.12),
    text: isDark
      ? 'rgba(255,255,255,0.9)'
      : alpha(theme.palette.text.primary, 0.92),
    muted: isDark
      ? 'rgba(255,255,255,0.5)'
      : alpha(theme.palette.text.primary, 0.62),
    subtle: isDark
      ? 'rgba(255,255,255,0.03)'
      : alpha(theme.palette.text.primary, 0.025),
    codeBg: isDark
      ? 'rgba(0,0,0,0.22)'
      : alpha(theme.palette.text.primary, 0.055),
    keyword: isDark
      ? 'rgba(255,255,255,0.95)'
      : alpha(theme.palette.text.primary, 0.92),
    codeText: isDark
      ? 'rgba(255,255,255,0.58)'
      : alpha(theme.palette.text.primary, 0.7),
    highlight: isDark
      ? 'rgba(255,255,255,0.05)'
      : alpha(theme.palette.text.primary, 0.05),
    dot: isDark
      ? 'rgba(255,255,255,0.32)'
      : alpha(theme.palette.text.primary, 0.22),
  };

  const SQL_LINES = [
    {
      tokens: [
        { kw: true, v: 'SELECT' },
        { v: ' c.name, ' },
        { kw: true, v: 'SUM' },
        { v: '(o.amount) ' },
        { kw: true, v: 'AS' },
        { v: ' revenue' },
      ],
    },
    { tokens: [{ kw: true, v: 'FROM' }, { v: ' customers c' }] },
    {
      tokens: [
        { kw: true, v: 'JOIN' },
        { v: ' orders o ' },
        { kw: true, v: 'ON' },
        { v: ' c.id = o.customer_id' },
      ],
    },
    {
      tokens: [
        { kw: true, v: 'WHERE' },
        { v: " o.created_at >= DATE_TRUNC('quarter', NOW())" },
      ],
    },
    { tokens: [{ kw: true, v: 'GROUP BY' }, { v: ' c.name' }] },
    {
      tokens: [
        { kw: true, v: 'ORDER BY' },
        { v: ' revenue ' },
        { kw: true, v: 'DESC' },
      ],
    },
    { tokens: [{ kw: true, v: 'LIMIT' }, { v: ' 10;' }] },
  ];

  const ROWS = [
    { name: 'Acme Corp', revenue: '$284,920', top: true },
    { name: 'Globex Ltd', revenue: '$198,455', top: false },
    { name: 'Initech', revenue: '$176,310', top: false },
  ];

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: { md: 340, lg: 390 },
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        animation: 'authFadeUp 0.6s ease-out 0.4s both',
      }}
    >
      <Box
        sx={{
          borderRadius: 2,
          border: `1px solid ${C.panelBorder}`,
          backgroundColor: C.panelBg,
          p: 1.35,
          display: 'flex',
          gap: 1.1,
          alignItems: 'flex-start',
        }}
      >
        <Box
          sx={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            backgroundColor: alpha(theme.palette.text.primary, isDark ? 0.07 : 0.05),
            border: `1px solid ${C.panelBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            mt: 0.125,
          }}
        >
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: C.dot,
            }}
          />
        </Box>

        <Box>
          <Typography
            sx={{
              fontSize: '0.63rem',
              fontWeight: 700,
              color: C.muted,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              mb: 0.5,
            }}
          >
            You
          </Typography>
          <Typography
            sx={{
              fontSize: '0.78rem',
              color: C.text,
              lineHeight: 1.5,
            }}
          >
            Show me top 10 customers by revenue this quarter
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          borderRadius: 2,
          border: `1px solid ${C.panelBorder}`,
          backgroundColor: C.panelBg,
          overflow: 'hidden',
          animation: 'mockupReveal 3s ease-out 1s both',
        }}
      >
        <Box
          sx={{
            px: 1.4,
            py: 0.85,
            display: 'flex',
            alignItems: 'center',
            gap: 0.875,
            borderBottom: `1px solid ${C.panelBorder}`,
          }}
        >
          <AutoAwesomeIcon sx={{ fontSize: 12, color: C.muted }} />
          <Typography
            sx={{
              fontSize: '0.63rem',
              fontWeight: 700,
              color: C.muted,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
            }}
          >
            Moonlit
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Box
            sx={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              backgroundColor: C.dot,
              animation: 'pulse-dot 2s ease-in-out infinite',
            }}
          />
        </Box>

        <Box
          sx={{
            px: 1.4,
            pt: 1.05,
            pb: 0.95,
            borderBottom: `1px solid ${C.panelBorder}`,
            backgroundColor: C.codeBg,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.625, mb: 0.85 }}>
            {[0.24, 0.15, 0.1].map((o, i) => (
              <Box
                key={i}
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: alpha(theme.palette.text.primary, o),
                }}
              />
            ))}
            <Typography
              sx={{
                fontSize: '0.58rem',
                color: C.muted,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                ml: 0.5,
              }}
            >
              Generated SQL
            </Typography>
          </Box>

          <Box
            component="pre"
            sx={{
              m: 0,
              fontFamily: theme.typography.fontFamilyMono || 'monospace',
              fontSize: '0.6rem',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflow: 'hidden',
            }}
          >
            {SQL_LINES.map((line, li) => (
              <Box key={li} component="span" sx={{ display: 'block' }}>
                {line.tokens.map((t, ti) => (
                  <Box
                    key={ti}
                    component="span"
                    sx={{
                      color: t.kw ? C.keyword : C.codeText,
                      fontWeight: t.kw ? 700 : 400,
                    }}
                  >
                    {t.v}
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        </Box>

        <Box sx={{ px: 1.4, py: 1.15 }}>
          <Typography
            sx={{
              fontSize: '0.6rem',
              color: C.muted,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              mb: 0.8,
            }}
          >
            10 rows returned
          </Typography>

          <Box sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
            {['Customer', 'Revenue'].map((h) => (
              <Typography
                key={h}
                sx={{
                  flex: 1,
                  fontSize: '0.58rem',
                  fontWeight: 700,
                  color: C.muted,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                }}
              >
                {h}
              </Typography>
            ))}
          </Box>

          <Box sx={{ height: '1px', backgroundColor: C.panelBorder, mb: 0.6 }} />

          {ROWS.map((row) => (
            <Box
              key={row.name}
              sx={{
                display: 'flex',
                gap: 1,
                py: 0.35,
                px: 0.5,
                mx: -0.5,
                borderRadius: 0.75,
                backgroundColor: row.top ? C.highlight : 'transparent',
              }}
            >
              <Typography
                sx={{
                  flex: 1,
                  fontSize: '0.7rem',
                  color: row.top ? C.text : C.codeText,
                }}
              >
                {row.name}
              </Typography>
              <Typography
                sx={{
                  flex: 1,
                  fontSize: '0.7rem',
                  color: row.top ? C.text : C.codeText,
                  fontFamily: theme.typography.fontFamilyMono || 'monospace',
                }}
              >
                {row.revenue}
              </Typography>
            </Box>
          ))}

          <Box sx={{ display: 'flex', gap: 1, py: 0.35, px: 0.5, mx: -0.5, opacity: 0.2 }}>
            <Typography sx={{ flex: 1, fontSize: '0.7rem', color: C.text }}>···</Typography>
            <Typography sx={{ flex: 1, fontSize: '0.7rem', color: C.text }}>···</Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

// ─── TabPanel ─────────────────────────────────────────────────────────────────
function TabPanel({ children, value, index }) {
  return (
    <Box role="tabpanel" hidden={value !== index} sx={{ width: '100%' }}>
      {value === index && children}
    </Box>
  );
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
function Auth() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    document.title = 'Moonlit - Sign In';
  }, []);

  const {
    signInWithGoogle,
    signInWithGitHub,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    isAuthenticated,
    loading,
    error,
    clearError: clearAuthError,
  } = useAuth();

  const [tabValue, setTabValue] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('error');
  const [forgotDialogOpen, setForgotDialogOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const {
    errors: fieldErrors,
    validateField,
    validateForm,
    clearError: clearFieldError,
    resetErrors,
  } = useFormValidation(authFieldSchemas);

  useEffect(() => {
    if (isAuthenticated) navigate('/chat');
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    resetErrors();
    clearAuthError?.();
  }, [tabValue, clearAuthError, resetErrors]);

  useEffect(() => {
    if (error) {
      setSnackbarMessage(error);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  }, [error]);

  const handleSnackbarClose = (_, reason) => {
    if (reason === 'clickaway') return;
    setSnackbarOpen(false);
    clearAuthError?.();
  };

  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    if (!validateForm(signInSchema, { email, password })) return;

    setFormLoading(true);
    try {
      await signInWithEmail(email, password);
      navigate('/chat');
    } catch (err) {
      logger.error('Sign in failed:', err);
    } finally {
      setFormLoading(false);
    }
  };

  const handleEmailSignUp = async (e) => {
    e.preventDefault();
    if (!validateForm(signUpSchema, { email, password, confirmPassword, displayName })) return;

    setFormLoading(true);
    try {
      await signUpWithEmail(email, password, displayName);
      navigate('/chat');
    } catch (err) {
      logger.error('Sign up failed:', err);
    } finally {
      setFormLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      navigate('/chat');
    } catch {
      // surfaced by AuthContext
    }
  };

  const handleGitHubSignIn = async () => {
    try {
      await signInWithGitHub();
      navigate('/chat');
    } catch {
      // surfaced by AuthContext
    }
  };

  const handlePasswordReset = async () => {
    if (!validateForm(resetPasswordSchema, { email: resetEmail })) return;

    setResetLoading(true);
    try {
      await resetPassword(resetEmail);
      setForgotDialogOpen(false);
      setResetEmail('');
    } catch (err) {
      logger.error('Password reset failed:', err);
    } finally {
      setResetLoading(false);
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          height: '100dvh',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'background.default',
          overflow: 'hidden',
        }}
      >
        <CircularProgress sx={{ color: 'text.primary', opacity: 0.45 }} size={28} />
      </Box>
    );
  }

  const tabsSx = {
    width: '100%',
    minHeight: 36,
    borderRadius: 1.5,
    backgroundColor: alpha(theme.palette.text.primary, isDark ? 0.05 : 0.04),
    border: `1px solid ${alpha(theme.palette.text.primary, isDark ? 0.08 : 0.06)}`,
    p: 0.5,
    '& .MuiTabs-indicator': {
      height: '100%',
      borderRadius: 1,
      backgroundColor: alpha(theme.palette.text.primary, isDark ? 0.12 : 0.1),
      boxShadow: `0 1px 4px ${alpha(theme.palette.text.primary, 0.1)}`,
      zIndex: 0,
    },
    '& .MuiTab-root': {
      minHeight: 32,
      py: 0.5,
      borderRadius: 1,
      fontWeight: 500,
      color: 'text.secondary',
      zIndex: 1,
      transition: theme.transitions.create('color', { duration: 150 }),
      '&.Mui-selected': { color: 'text.primary', fontWeight: 600 },
    },
  };

  return (
    <>
      {AUTH_KEYFRAMES}

      <Box
        sx={{
          height: '100dvh',
          minHeight: '100vh',
          width: '100%',
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          backgroundColor: 'background.default',
          backgroundImage: isDark
            ? 'none'
            : `linear-gradient(
                180deg,
                ${alpha(theme.palette.text.primary, 0.015)} 0%,
                transparent 30%
              )`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {!isMobile && (
          <Box
            sx={{
              flex: '0 0 50%',
              minWidth: 0,
              minHeight: 0,
              height: '100%',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              px: { md: 4, lg: 6 },
              py: { md: 3.5, lg: 4.5 },
              overflow: 'hidden',
              borderRight: `1px solid ${alpha(
                theme.palette.text.primary,
                isDark ? 0.07 : 0.08
              )}`,
              backgroundColor: isDark
                ? 'transparent'
                : alpha(theme.palette.background.paper, 0.72),
              backgroundImage: isDark
                ? 'none'
                : `
                    radial-gradient(circle at 12% 8%, ${alpha(theme.palette.text.primary, 0.045)}, transparent 32%),
                    linear-gradient(180deg, ${alpha(theme.palette.text.primary, 0.02)} 0%, transparent 42%)
                  `,
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                zIndex: 0,
                opacity: isDark ? 1 : 0.38,
              }}
            >
              <StarfieldCanvas active />
            </Box>

            <Box
              aria-hidden
              sx={{
                position: 'absolute',
                top: '-20%',
                left: '-10%',
                width: '60%',
                height: '60%',
                background: `radial-gradient(circle, ${alpha(
                  theme.palette.text.primary,
                  isDark ? 0.065 : 0.05
                )} 0%, transparent 70%)`,
                filter: 'blur(70px)',
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
            <Box
              aria-hidden
              sx={{
                position: 'absolute',
                bottom: '-15%',
                right: '-5%',
                width: '50%',
                height: '50%',
                background: `radial-gradient(circle, ${alpha(
                  theme.palette.text.primary,
                  isDark ? 0.045 : 0.035
                )} 0%, transparent 70%)`,
                filter: 'blur(60px)',
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />

            <Box
              aria-hidden
              sx={{
                position: 'absolute',
                inset: 0,
                zIndex: 1,
                backgroundImage: `radial-gradient(${alpha(
                  theme.palette.text.primary,
                  isDark ? 0.07 : 0.08
                )} 1px, transparent 1px)`,
                backgroundSize: '26px 26px',
                maskImage:
                  'radial-gradient(ellipse 90% 90% at 40% 50%, black 20%, transparent 90%)',
                WebkitMaskImage:
                  'radial-gradient(ellipse 90% 90% at 40% 50%, black 20%, transparent 90%)',
                pointerEvents: 'none',
                opacity: isDark ? 1 : 0.55,
              }}
            />

            <Stack
              spacing={3}
              sx={{
                position: 'relative',
                zIndex: 2,
                width: '100%',
                maxWidth: 390,
                justifyContent: 'center',
                minHeight: 0,
              }}
            >
              <Button
                startIcon={<ArrowBackRoundedIcon sx={{ fontSize: 13 }} />}
                onClick={() => navigate('/')}
                size="small"
                sx={{
                  alignSelf: 'flex-start',
                  color: 'text.secondary',
                  opacity: isDark ? 0.6 : 0.78,
                  fontWeight: 500,
                  ...theme.typography.uiCaptionXs,
                  border: `1px solid ${alpha(theme.palette.text.primary, isDark ? 0.12 : 0.14)}`,
                  backgroundColor: isDark
                    ? alpha(theme.palette.background.paper, 0.04)
                    : alpha(theme.palette.background.paper, 0.8),
                  '@media (hover: hover)': {
                    '&:hover': {
                      opacity: 1,
                      backgroundColor: alpha(
                        theme.palette.text.primary,
                        isDark ? 0.06 : 0.045
                      ),
                      color: 'text.primary',
                    },
                  },
                }}
              >
                Back to home
              </Button>

              <Stack spacing={1}>
                <Typography
                  component="span"
                  sx={{
                    ...theme.typography.uiBrandWordmark,
                    color: 'text.primary',
                    letterSpacing: '-0.02em',
                    animation: 'authFadeUp 0.5s ease-out 0.15s both',
                  }}
                >
                  Moonlit
                </Typography>
              </Stack>

              <QueryMockup isDark={isDark} />
            </Stack>
          </Box>
        )}

        <Box
          sx={{
            flex: { xs: '1 1 auto', md: '0 0 50%' },
            minWidth: 0,
            minHeight: 0,
            height: '100%',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            py: { xs: 2, sm: 3, md: 4 },
            px: { xs: 2, sm: 3, md: 4 },
            backgroundColor: isDark
              ? alpha(theme.palette.background.paper, 0.3)
              : alpha(theme.palette.background.default, 0.68),
            overflow: 'hidden',
          }}
        >
          {isMobile && (
            <Box
              sx={{
                position: 'fixed',
                inset: 0,
                zIndex: 0,
                opacity: isDark ? 1 : 0.3,
              }}
            >
              <StarfieldCanvas active />
            </Box>
          )}

          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              top: '20%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '80%',
              height: '50%',
              background: `radial-gradient(ellipse at center, ${alpha(
                theme.palette.text.primary,
                isDark ? 0.04 : 0.025
              )}, transparent 70%)`,
              filter: 'blur(50px)',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />

          <Container
            maxWidth="xs"
            disableGutters
            sx={{
              width: '100%',
              maxWidth: { xs: 420, sm: 440 },
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              minHeight: 0,
            }}
          >
            {isMobile && (
              <Stack
                spacing={0.5}
                alignItems="center"
                mb={{ xs: 2, sm: 2.5 }}
                sx={{ animation: 'authFadeUp 0.5s ease-out both' }}
              >
                <Typography
                  component="span"
                  sx={{
                    ...theme.typography.uiBrandWordmark,
                    color: 'text.primary',
                    letterSpacing: '-0.02em',
                  }}
                >
                  Moonlit
                </Typography>

                <Typography
                  sx={{
                    color: 'text.secondary',
                    opacity: 0.55,
                    ...theme.typography.uiCaptionXs,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}
                >
                  AI Database Assistant
                </Typography>
              </Stack>
            )}

            <Paper
              elevation={0}
              sx={{
                width: '100%',
                p: { xs: 2.25, sm: 3 },
                backgroundColor: isDark
                  ? alpha(theme.palette.background.paper, 0.78)
                  : alpha(theme.palette.background.paper, 0.94),
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                [BACKDROP_FILTER_FALLBACK_QUERY]: {
                  backdropFilter: 'none',
                  WebkitBackdropFilter: 'none',
                  backgroundColor: theme.palette.background.paper,
                },
                [theme.breakpoints.down('sm')]: {
                  backdropFilter: 'none',
                  WebkitBackdropFilter: 'none',
                  backgroundColor: theme.palette.background.paper,
                },
                border: `1px solid ${alpha(
                  theme.palette.text.primary,
                  isDark ? 0.1 : 0.08
                )}`,
                borderRadius: { xs: 2.5, sm: 3 },
                boxShadow: isDark
                  ? `0 32px 64px -16px ${alpha('#000', 0.45)}`
                  : `0 24px 48px -12px ${alpha('#000', 0.1)}`,
                animation: 'authSlideIn 0.45s cubic-bezier(0.4, 0, 0.2, 1) 0.15s both',
                '& .MuiInputBase-input': { ...theme.typography.uiInput },
              }}
            >
              <Stack spacing={{ xs: 2, sm: 2.5 }} alignItems="center">
                <Box sx={{ textAlign: 'center' }}>
                  <Typography
                    variant="h5"
                    sx={{
                      mb: 0.35,
                      fontWeight: 700,
                      fontSize: { xs: '1.45rem', sm: theme.typography.h5.fontSize },
                    }}
                  >
                    {tabValue === 0 ? 'Welcome back' : 'Create account'}
                  </Typography>

                  <Typography variant="body2" color="text.secondary" sx={{ opacity: 0.72 }}>
                    {tabValue === 0
                      ? 'Sign in to start querying with AI'
                      : 'Join Moonlit and unlock your data'}
                  </Typography>
                </Box>

                <Tabs
                  value={tabValue}
                  onChange={(_, v) => setTabValue(v)}
                  variant="fullWidth"
                  sx={tabsSx}
                >
                  <Tab label="Sign In" />
                  <Tab label="Sign Up" />
                </Tabs>

                <TabPanel value={tabValue} index={0}>
                  <Stack spacing={{ xs: 1.25, sm: 1.5 }} component="form" onSubmit={handleEmailSignIn}>
                    <TextField
                      fullWidth
                      size="small"
                      type="email"
                      label="Email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearFieldError('email');
                      }}
                      onBlur={() => validateField('email', email)}
                      error={!!fieldErrors.email}
                      helperText={fieldErrors.email}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <EmailOutlinedIcon
                              sx={{ color: 'text.secondary', fontSize: 17, opacity: 0.65 }}
                            />
                          </InputAdornment>
                        ),
                      }}
                    />

                    <TextField
                      fullWidth
                      size="small"
                      type={showPassword ? 'text' : 'password'}
                      label="Password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearFieldError('password');
                      }}
                      onBlur={() => validateField('password', password)}
                      error={!!fieldErrors.password}
                      helperText={fieldErrors.password}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <LockOutlinedIcon
                              sx={{ color: 'text.secondary', fontSize: 17, opacity: 0.65 }}
                            />
                          </InputAdornment>
                        ),
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowPassword((p) => !p)}
                              edge="end"
                              size="small"
                              sx={{ color: 'text.secondary', opacity: 0.55 }}
                            >
                              {showPassword ? (
                                <VisibilityOffOutlinedIcon fontSize="small" />
                              ) : (
                                <VisibilityOutlinedIcon fontSize="small" />
                              )}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />

                    <Box sx={{ textAlign: 'right', mt: -0.35 }}>
                      <Link
                        component="button"
                        type="button"
                        variant="caption"
                        onClick={() => {
                          setResetEmail(email);
                          setForgotDialogOpen(true);
                        }}
                        sx={{
                          color: 'text.secondary',
                          opacity: 0.72,
                          textDecoration: 'none',
                          ...theme.typography.uiCaptionXs,
                          transition: theme.transitions.create('opacity', { duration: 150 }),
                          '@media (hover: hover)': { '&:hover': { opacity: 1 } },
                        }}
                      >
                        Forgot password?
                      </Link>
                    </Box>

                    <Button fullWidth type="submit" disabled={formLoading} sx={getSubmitButtonSx(theme)}>
                      {formLoading ? <CircularProgress size={18} color="inherit" /> : 'Sign In'}
                    </Button>
                  </Stack>
                </TabPanel>

                <TabPanel value={tabValue} index={1}>
                  <Stack spacing={{ xs: 1.25, sm: 1.5 }} component="form" onSubmit={handleEmailSignUp}>
                    <TextField
                      fullWidth
                      size="small"
                      type="text"
                      label="Display Name (optional)"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <PersonOutlineRoundedIcon
                              sx={{ color: 'text.secondary', fontSize: 17, opacity: 0.65 }}
                            />
                          </InputAdornment>
                        ),
                      }}
                    />

                    <TextField
                      fullWidth
                      size="small"
                      type="email"
                      label="Email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearFieldError('email');
                      }}
                      onBlur={() => validateField('email', email)}
                      error={!!fieldErrors.email}
                      helperText={fieldErrors.email}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <EmailOutlinedIcon
                              sx={{ color: 'text.secondary', fontSize: 17, opacity: 0.65 }}
                            />
                          </InputAdornment>
                        ),
                      }}
                    />

                    <TextField
                      fullWidth
                      size="small"
                      type={showPassword ? 'text' : 'password'}
                      label="Password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearFieldError('passwordSignUp');
                      }}
                      onBlur={() => validateField('passwordSignUp', password)}
                      error={!!fieldErrors.passwordSignUp}
                      helperText={fieldErrors.passwordSignUp || 'At least 6 characters'}
                      FormHelperTextProps={{ sx: { mt: 0.25 } }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <LockOutlinedIcon
                              sx={{ color: 'text.secondary', fontSize: 17, opacity: 0.65 }}
                            />
                          </InputAdornment>
                        ),
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowPassword((p) => !p)}
                              edge="end"
                              size="small"
                              sx={{ color: 'text.secondary', opacity: 0.55 }}
                            >
                              {showPassword ? (
                                <VisibilityOffOutlinedIcon fontSize="small" />
                              ) : (
                                <VisibilityOutlinedIcon fontSize="small" />
                              )}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />

                    <TextField
                      fullWidth
                      size="small"
                      type={showPassword ? 'text' : 'password'}
                      label="Confirm Password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        clearFieldError('confirmPassword');
                      }}
                      onBlur={() => validateField('confirmPassword', confirmPassword)}
                      error={!!fieldErrors.confirmPassword}
                      helperText={fieldErrors.confirmPassword}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <LockOutlinedIcon
                              sx={{ color: 'text.secondary', fontSize: 17, opacity: 0.65 }}
                            />
                          </InputAdornment>
                        ),
                      }}
                    />

                    <Button fullWidth type="submit" disabled={formLoading} sx={getSubmitButtonSx(theme)}>
                      {formLoading ? <CircularProgress size={18} color="inherit" /> : 'Create Account'}
                    </Button>
                  </Stack>
                </TabPanel>

                <Divider sx={{ width: '100%' }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                      opacity: 0.5,
                      ...theme.typography.uiCaptionXs,
                    }}
                  >
                    or continue with
                  </Typography>
                </Divider>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ width: '100%' }}>
                  {[
                    { label: 'Google', Icon: GoogleIcon, handler: handleGoogleSignIn },
                    { label: 'GitHub', Icon: GitHubIcon, handler: handleGitHubSignIn },
                  ].map(({ label, Icon, handler }) => (
                    <Button
                      key={label}
                      fullWidth
                      variant="outlined"
                      startIcon={<Icon sx={{ fontSize: 17 }} />}
                      onClick={handler}
                      sx={{
                        py: 0.8,
                        borderRadius: 1.5,
                        borderColor: alpha(theme.palette.text.primary, isDark ? 0.12 : 0.1),
                        color: 'text.primary',
                        backgroundColor: alpha(theme.palette.text.primary, isDark ? 0.03 : 0.02),
                        fontWeight: 500,
                        transition: theme.transitions.create(
                          ['border-color', 'background-color', 'box-shadow'],
                          { duration: 180 }
                        ),
                        '@media (hover: hover)': {
                          '&:hover': {
                            borderColor: alpha(theme.palette.text.primary, isDark ? 0.25 : 0.2),
                            backgroundColor: alpha(
                              theme.palette.text.primary,
                              isDark ? 0.06 : 0.045
                            ),
                            boxShadow: `0 2px 8px ${alpha(theme.palette.text.primary, 0.06)}`,
                          },
                        },
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                </Stack>

                {isMobile && (
                  <Button
                    startIcon={<ArrowBackRoundedIcon sx={{ fontSize: 13 }} />}
                    onClick={() => navigate('/')}
                    sx={{
                      color: 'text.secondary',
                      opacity: 0.62,
                      py: 0.35,
                      ...theme.typography.uiCaptionXs,
                      '@media (hover: hover)': {
                        '&:hover': {
                          opacity: 1,
                          backgroundColor: 'transparent',
                          color: 'text.primary',
                        },
                      },
                    }}
                  >
                    Back to home
                  </Button>
                )}
              </Stack>
            </Paper>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: 'block',
                textAlign: 'center',
                mt: 1.5,
                opacity: 0.45,
                ...theme.typography.uiCaptionXs,
              }}
            >
              By signing in, you agree to our Terms and Privacy Policy
            </Typography>
          </Container>
        </Box>
      </Box>

      <Dialog
        open={forgotDialogOpen}
        onClose={() => {
          setForgotDialogOpen(false);
          clearAuthError?.();
        }}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: isDark
              ? alpha(theme.palette.background.paper, 0.9)
              : alpha(theme.palette.background.paper, 0.96),
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            [BACKDROP_FILTER_FALLBACK_QUERY]: {
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
              backgroundColor: theme.palette.background.paper,
            },
            border: `1px solid ${alpha(theme.palette.text.primary, isDark ? 0.1 : 0.08)}`,
            boxShadow: isDark
              ? `0 32px 64px -16px ${alpha('#000', 0.5)}`
              : `0 24px 48px -12px ${alpha('#000', 0.12)}`,
            m: 2,
            backgroundImage: 'none',
          },
        }}
      >
        <DialogTitle sx={{ pb: 0.5, fontWeight: 700, fontSize: '1rem' }}>
          Reset Password
        </DialogTitle>

        <DialogContent sx={{ pt: '12px !important' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, opacity: 0.7 }}>
            Enter your email and we'll send you a reset link.
          </Typography>

          <TextField
            fullWidth
            type="email"
            label="Email"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            size="small"
            autoFocus
          />
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            size="small"
            onClick={() => setForgotDialogOpen(false)}
            sx={{
              color: 'text.secondary',
              fontWeight: 500,
              '@media (hover: hover)': {
                '&:hover': {
                  backgroundColor: 'transparent',
                  color: 'text.primary',
                },
              },
            }}
          >
            Cancel
          </Button>

          <Button
            size="small"
            onClick={handlePasswordReset}
            disabled={resetLoading}
            sx={{ ...getSubmitButtonSx(theme), py: 0.625, px: 2 }}
          >
            {resetLoading ? <CircularProgress size={14} color="inherit" /> : 'Send Reset Link'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'top', horizontal: isSmall ? 'center' : 'right' }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </>
  );
}

export default Auth;