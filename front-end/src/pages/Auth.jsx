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
} from '@mui/material';
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
import { useAuth } from '../contexts/AuthContext';
import StarfieldCanvas from '../components/StarfieldCanvas';

// Form validation
import {
  useFormValidation,
  signInSchema,
  signUpSchema,
  resetPasswordSchema,
  authFieldSchemas,
} from '../validation';
import { getMoonlitGradient } from '../theme';
import logger from '../utils/logger';

// Tab Panel component
function TabPanel({ children, value, index }) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      sx={{ width: '100%' }}
    >
      {value === index && children}
    </Box>
  );
}

function Auth() {
  const navigate = useNavigate();
  const theme = useTheme();

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

  // Form state
  const [tabValue, setTabValue] = useState(0); // 0 = Sign In, 1 = Sign Up
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('error');

  // Forgot password dialog
  const [forgotDialogOpen, setForgotDialogOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // Form validation
  const {
    errors: fieldErrors,
    validateField,
    validateForm,
    clearError: clearFieldError,
    resetErrors,
  } = useFormValidation(authFieldSchemas);

  // Redirect if authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/chat');
    }
  }, [isAuthenticated, navigate]);

  // Clear errors when switching tabs
  useEffect(() => {
    setFormError('');
    setSuccessMessage('');
    resetErrors();
    clearAuthError?.();
  }, [tabValue, clearAuthError, resetErrors]);

  // Watch for auth context errors and display them in snackbar
  useEffect(() => {
    if (error) {
      setSnackbarMessage(error);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  }, [error]);

  // Handle snackbar close
  const handleSnackbarClose = (event, reason) => {
    if (reason === 'clickaway') return;
    setSnackbarOpen(false);
    clearAuthError?.();
  };

  // Handle Email Sign In
  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    setFormError('');

    // Validate form
    if (!validateForm(signInSchema, { email, password })) {
      return;
    }

    setFormLoading(true);
    try {
      await signInWithEmail(email, password);
      navigate('/chat');
    } catch (error) {
      // Error from Firebase is already handled and displayed via AuthContext
      logger.error('Sign in failed:', error);
    } finally {
      setFormLoading(false);
    }
  };

  // Handle Email Sign Up
  const handleEmailSignUp = async (e) => {
    e.preventDefault();
    setFormError('');

    // Validate form
    if (!validateForm(signUpSchema, { email, password, confirmPassword, displayName })) {
      return;
    }

    setFormLoading(true);
    try {
      await signUpWithEmail(email, password, displayName);
      setSuccessMessage('Account created successfully!');
      navigate('/chat');
    } catch (error) {
      // Error from Firebase is already handled and displayed via AuthContext
      logger.error('Sign up failed:', error);
    } finally {
      setFormLoading(false);
    }
  };

  // Handle Google Sign In
  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      navigate('/chat');
    } catch {
      // Error is handled in AuthContext
    }
  };

  // Handle GitHub Sign In
  const handleGitHubSignIn = async () => {
    try {
      await signInWithGitHub();
      navigate('/chat');
    } catch {
      // Error is handled in AuthContext
    }
  };

  // Handle Password Reset
  const handlePasswordReset = async () => {
    // Validate email
    if (!validateForm(resetPasswordSchema, { email: resetEmail })) {
      return;
    }

    setResetLoading(true);
    try {
      await resetPassword(resetEmail);
      setForgotDialogOpen(false);
      setResetEmail('');
      setSuccessMessage('Password reset email sent! Check your inbox.');
    } catch (error) {
      // Error from Firebase is already handled and displayed via AuthContext
      logger.error('Password reset failed:', error);
    } finally {
      setResetLoading(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'background.default',
        }}
      >
        <CircularProgress sx={{ color: 'primary.main' }} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        width: '100%',
        backgroundColor: 'background.default',
        position: 'relative',
        overflowX: 'hidden',
        overflowY: 'auto', // Enable vertical scrolling
      }}
    >
      {/* Fixed Starfield Background */}
      <Box sx={{ position: 'fixed', inset: 0, zIndex: 0 }}>
        <StarfieldCanvas active />
      </Box>

      {/* Background Effects - Fixed position so they don't scroll */}
      <Box
        sx={{
          position: 'fixed',
          top: '-30%',
          left: '-20%',
          width: '60%',
          height: '60%',
          background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.12)} 0%, transparent 70%)`,
          filter: 'blur(80px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <Box
        sx={{
          position: 'fixed',
          bottom: '-30%',
          right: '-20%',
          width: '60%',
          height: '60%',
          background: `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.15)} 0%, transparent 70%)`,
          filter: 'blur(80px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Content Container */}
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          py: { xs: 3, sm: 4 },
          px: { xs: 2, sm: 3 },
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Container
          maxWidth="xs"
          sx={{
            width: '100%',
          }}
        >
          {/* Main Card */}
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2.5, sm: 3.5 },
              background: alpha(theme.palette.background.paper, 0.03),
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
              borderRadius: { xs: 2, sm: 3 },
            }}
          >
            <Stack spacing={2} alignItems="center">
              {/* Brand Title */}
              <Typography
                component="span"
                sx={{
                  fontSize: { xs: '2rem', sm: '2.5rem' },
                  fontWeight: 800,
                  background: getMoonlitGradient(theme),
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  textShadow: `0 0 40px ${alpha(theme.palette.primary.main, 0.4)}`,
                }}
              >
                Moonlit
              </Typography>

              {/* Title */}
              <Box textAlign="center">
                <Typography
                  variant="h5"
                  sx={{ mb: 0.25 }}
                >
                  {tabValue === 0 ? 'Welcome Back' : 'Create Account'}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                >
                  {tabValue === 0
                    ? 'Sign in to start querying with AI'
                    : 'Join Moonlit and unlock your data'}
                </Typography>
              </Box>

              {/* Tabs */}
              <Tabs
                value={tabValue}
                onChange={(e, v) => setTabValue(v)}
                variant="fullWidth"
                sx={{
                  width: '100%',
                  minHeight: 36,
                  '& .MuiTab-root': {
                    minHeight: 36,
                    py: 0.5,
                  },
                  '& .Mui-selected': {
                    color: 'primary.main',
                  },
                  '& .MuiTabs-indicator': {
                    backgroundColor: 'primary.main',
                  },
                }}
              >
                <Tab label="Sign In" />
                <Tab label="Sign Up" />
              </Tabs>

              {/* Sign In Panel */}
              <TabPanel value={tabValue} index={0}>
                <Stack spacing={1.5} component="form" onSubmit={handleEmailSignIn}>
                  <TextField
                    fullWidth
                    type="email"
                    label="Email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
                    onBlur={() => validateField('email', email)}
                    error={!!fieldErrors.email}
                    helperText={fieldErrors.email}
                    size="small"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <EmailOutlinedIcon sx={{ color: 'text.secondary', fontSize: 18 }} />
                        </InputAdornment>
                      ),
                    }}
                  />
                  <TextField
                    fullWidth
                    type={showPassword ? 'text' : 'password'}
                    label="Password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }}
                    onBlur={() => validateField('password', password)}
                    error={!!fieldErrors.password}
                    helperText={fieldErrors.password}
                    size="small"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LockOutlinedIcon sx={{ color: 'text.secondary', fontSize: 18 }} />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowPassword(!showPassword)}
                            edge="end"
                            size="small"
                          >
                            {showPassword ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />

                  {/* Forgot Password Link */}
                  <Box sx={{ textAlign: 'right', mt: -0.5 }}>
                    <Link
                      component="button"
                      type="button"
                      variant="body2"
                      onClick={() => {
                        setResetEmail(email);
                        setForgotDialogOpen(true);
                      }}
                      sx={{
                        color: 'primary.light',
                        textDecoration: 'none',
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      Forgot password?
                    </Link>
                  </Box>

                  {/* Sign In Button */}
                  <Button
                    fullWidth
                    type="submit"

                    disabled={formLoading}
                    sx={{
                      py: 1,
                      background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 100%)`,
                      color: theme.palette.mode === 'dark' ? '#000000' : '#FFFFFF',
                      fontWeight: 600,
                      '&:hover': {
                        background: `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
                      },
                    }}
                  >
                    {formLoading ? <CircularProgress size={20} color="inherit" /> : 'Sign In'}
                  </Button>
                </Stack>
              </TabPanel>

              {/* Sign Up Panel */}
              <TabPanel value={tabValue} index={1}>
                <Stack spacing={1.5} component="form" onSubmit={handleEmailSignUp}>
                  <TextField
                    fullWidth
                    type="text"
                    label="Display Name (optional)"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    size="small"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <PersonOutlineRoundedIcon sx={{ color: 'text.secondary', fontSize: 18 }} />
                        </InputAdornment>
                      ),
                    }}
                  />
                  <TextField
                    fullWidth
                    type="email"
                    label="Email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
                    onBlur={() => validateField('email', email)}
                    error={!!fieldErrors.email}
                    helperText={fieldErrors.email}
                    size="small"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <EmailOutlinedIcon sx={{ color: 'text.secondary', fontSize: 18 }} />
                        </InputAdornment>
                      ),
                    }}
                  />
                  <TextField
                    fullWidth
                    type={showPassword ? 'text' : 'password'}
                    label="Password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearFieldError('passwordSignUp'); }}
                    onBlur={() => validateField('passwordSignUp', password)}
                    error={!!fieldErrors.passwordSignUp}
                    helperText={fieldErrors.passwordSignUp || 'At least 6 characters'}
                    size="small"
                    FormHelperTextProps={{ sx: { mt: 0.25 } }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LockOutlinedIcon sx={{ color: 'text.secondary', fontSize: 18 }} />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowPassword(!showPassword)}
                            edge="end"
                            size="small"
                          >
                            {showPassword ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                  <TextField
                    fullWidth
                    type={showPassword ? 'text' : 'password'}
                    label="Confirm Password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); clearFieldError('confirmPassword'); }}
                    onBlur={() => validateField('confirmPassword', confirmPassword)}
                    error={!!fieldErrors.confirmPassword}
                    helperText={fieldErrors.confirmPassword}
                    size="small"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LockOutlinedIcon sx={{ color: 'text.secondary', fontSize: 18 }} />
                        </InputAdornment>
                      ),
                    }}
                  />

                  {/* Sign Up Button */}
                  <Button
                    fullWidth
                    type="submit"

                    disabled={formLoading}
                    sx={{
                      py: 1,
                      background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 100%)`,
                      color: theme.palette.mode === 'dark' ? '#000000' : '#FFFFFF',
                      fontWeight: 600,
                      '&:hover': {
                        background: `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
                      },
                    }}
                  >
                    {formLoading ? <CircularProgress size={20} color="inherit" /> : 'Create Account'}
                  </Button>
                </Stack>
              </TabPanel>

              {/* Divider */}
              <Divider sx={{ width: '100%' }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                >
                  or continue with
                </Typography>
              </Divider>

              {/* OAuth Buttons */}
              <Stack
                direction="row"
                spacing={1.5}
                sx={{ width: '100%' }}
              >
                <Button
                  fullWidth

                  startIcon={<GoogleIcon sx={{ fontSize: 18 }} />}
                  onClick={handleGoogleSignIn}
                  sx={{
                    py: 0.875,
                    borderColor: alpha(theme.palette.common.white, 0.15),
                    backgroundColor: alpha(theme.palette.common.white, 0.02),
                    '&:hover': {
                      borderColor: 'primary.main',
                      backgroundColor: alpha(theme.palette.primary.main, 0.1),
                    },
                  }}
                >
                  Google
                </Button>
                <Button
                  fullWidth

                  startIcon={<GitHubIcon sx={{ fontSize: 18 }} />}
                  onClick={handleGitHubSignIn}
                  sx={{
                    py: 0.875,
                    borderColor: alpha(theme.palette.common.white, 0.15),
                    backgroundColor: alpha(theme.palette.common.white, 0.02),
                    '&:hover': {
                      borderColor: alpha(theme.palette.common.white, 0.25),
                      backgroundColor: alpha(theme.palette.common.white, 0.08),
                    },
                  }}
                >
                  GitHub
                </Button>
              </Stack>

              {/* Back to Home */}
              <Button

                startIcon={<ArrowBackRoundedIcon sx={{ fontSize: 16 }} />}
                onClick={() => navigate('/')}
                sx={{
                  color: 'text.secondary',
                  py: 0.5,
                  '&:hover': { color: 'text.primary', backgroundColor: 'transparent' },
                }}
              >
                Back to home
              </Button>
            </Stack>
          </Paper>

          {/* Footer Text */}
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: 'block',
              textAlign: 'center',
              mt: 2,
            }}
          >
            By signing in, you agree to our Terms and Privacy Policy
          </Typography>
        </Container>
      </Box>

      {/* Forgot Password Dialog */}
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
            backgroundColor: 'background.paper',
            backgroundImage: 'none',
            m: 2,
          },
        }}
      >
        <DialogTitle variant="h6" sx={{ pb: 1 }}>
          Reset Password
        </DialogTitle>
        <DialogContent>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 2 }}
          >
            Enter your email address and we'll send you a link to reset your password.
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
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button size="small" onClick={() => setForgotDialogOpen(false)}>Cancel</Button>
          <Button

            size="small"
            onClick={handlePasswordReset}
            disabled={resetLoading}
          >
            {resetLoading ? <CircularProgress size={16} color="inherit" /> : 'Send Reset Link'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Error/Success Snackbar */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert
          onClose={handleSnackbarClose}
          severity={snackbarSeverity}
          sx={{ width: '100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default Auth;
