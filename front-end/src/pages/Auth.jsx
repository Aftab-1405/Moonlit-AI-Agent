import {
  Alert,
  Box,
  Button,
  Link,
  Snackbar,
  Stack,
  SvgIcon,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ButtonLoadingSpinner from '@/components/common/ButtonLoadingSpinner';
import DialogShell from '@/components/common/DialogShell';
import { getConfirmActionGeometrySx } from '@/components/common/dialogActionStyles';
import PageLoader from '@/components/common/PageLoader';
import { GitHubBrandIcon } from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import { useFormValidation } from '@/hooks/useFormValidation';
import AuthBrandPanel, { PRODUCT_COPY } from '@/pages/AuthBrandPanel';
import { getAuthActionSx } from '@/pages/authActionStyles';
import { getAuthLayoutSx } from '@/pages/authLayoutStyles';
import { getOutlinedFieldStateSx } from '@/styles/shared';
import logger from '@/utils/logger';
import {
  authFieldSchemas,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from '@/utils/validationSchemas';

function GoogleBrandIcon(props) {
  const theme = useTheme();
  const provider = theme.palette.identity.provider;
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <path
        fill={provider.googleBlue}
        d="M21.6 12.23c0-.78-.07-1.53-.2-2.23H12v4.26h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.33 2.98-7.55z"
      />
      <path
        fill={provider.googleGreen}
        d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.24-2.5c-.9.6-2.04.95-3.38.95-2.6 0-4.8-1.76-5.59-4.12H3.06v2.58A10 10 0 0 0 12 22z"
      />
      <path
        fill={provider.googleYellow}
        d="M6.41 13.9A6 6 0 0 1 6.1 12c0-.66.11-1.3.31-1.9V7.52H3.06A10 10 0 0 0 2 12c0 1.61.39 3.13 1.06 4.48l3.35-2.58z"
      />
      <path
        fill={provider.googleRed}
        d="M12 5.98c1.47 0 2.78.5 3.82 1.49l2.87-2.87C16.95 2.98 14.7 2 12 2a10 10 0 0 0-8.94 5.52l3.35 2.58C7.2 7.74 9.4 5.98 12 5.98z"
      />
    </SvgIcon>
  );
}

function Auth() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'));
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
  const [authOperation, setAuthOperation] = useState(null);
  const authOperationRef = useRef(null);
  const resetEmailInputRef = useRef(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('error');
  const [forgotDialogOpen, setForgotDialogOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const authBusy = authOperation !== null;

  const {
    errors: fieldErrors,
    validateField,
    validateForm,
    clearError: clearFieldError,
    resetErrors,
  } = useFormValidation(authFieldSchemas);

  useEffect(() => {
    document.title = 'Moonlit - Sign In';
  }, []);

  useEffect(() => {
    if (isAuthenticated) navigate('/chat');
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    resetErrors();
    clearAuthError?.();
  }, [clearAuthError, resetErrors]);

  useEffect(() => {
    if (!error) return;
    setSnackbarMessage(error);
    setSnackbarSeverity('error');
    setSnackbarOpen(true);
  }, [error]);

  const fieldSx = useMemo(() => {
    const outlinedFieldSx = getOutlinedFieldStateSx(theme, { radius: '8px' });
    const outlinedInputRootSx = outlinedFieldSx['& .MuiOutlinedInput-root'];

    return {
      ...outlinedFieldSx,
      '& .MuiOutlinedInput-root': {
        ...outlinedInputRootSx,
        minHeight: 48,
      },
      '& .MuiFormHelperText-root': { mx: 0, mt: 0.5 },
    };
  }, [theme]);
  const authActionSx = useMemo(() => getAuthActionSx(theme), [theme]);
  const authLayoutSx = useMemo(() => getAuthLayoutSx(theme), [theme]);

  const runAuthOperation = useCallback(async (operation, action, errorLabel) => {
    if (authOperationRef.current) return false;

    authOperationRef.current = operation;
    setAuthOperation(operation);
    try {
      await action();
      return true;
    } catch (operationError) {
      logger.error(errorLabel, operationError);
      return false;
    } finally {
      authOperationRef.current = null;
      setAuthOperation(null);
    }
  }, []);

  const changeMode = useCallback(
    (next) => {
      if (authOperationRef.current || next === tabValue) return;
      setTabValue(next);
      setPassword('');
      setConfirmPassword('');
      setDisplayName('');
      resetErrors();
      clearAuthError?.();
    },
    [clearAuthError, resetErrors, tabValue],
  );

  const handleSnackbarClose = (_, reason) => {
    if (reason === 'clickaway') return;
    setSnackbarOpen(false);
    clearAuthError?.();
  };

  const handleEmailSignIn = useCallback(
    async (event) => {
      event.preventDefault();
      if (!validateForm(signInSchema, { email, password })) return;
      await runAuthOperation('email', () => signInWithEmail(email, password), 'Sign in failed:');
    },
    [email, password, runAuthOperation, signInWithEmail, validateForm],
  );

  const handleEmailSignUp = useCallback(
    async (event) => {
      event.preventDefault();
      if (
        !validateForm(signUpSchema, {
          email,
          passwordSignUp: password,
          confirmPassword,
          displayName,
        })
      )
        return;
      await runAuthOperation(
        'email',
        () => signUpWithEmail(email, password, displayName),
        'Sign up failed:',
      );
    },
    [
      confirmPassword,
      displayName,
      email,
      password,
      runAuthOperation,
      signUpWithEmail,
      validateForm,
    ],
  );

  const handleProviderSignIn = useCallback(
    async (provider) => {
      const action = provider === 'google' ? signInWithGoogle : signInWithGitHub;
      await runAuthOperation(
        provider,
        action,
        `${provider === 'google' ? 'Google' : 'GitHub'} sign in failed:`,
      );
    },
    [runAuthOperation, signInWithGitHub, signInWithGoogle],
  );

  const handlePasswordReset = useCallback(async () => {
    if (!validateForm(resetPasswordSchema, { email: resetEmail })) return;
    const succeeded = await runAuthOperation(
      'reset',
      () => resetPassword(resetEmail),
      'Password reset failed:',
    );
    if (!succeeded) return;

    setForgotDialogOpen(false);
    setResetEmail('');
    setSnackbarMessage('Password reset link sent.');
    setSnackbarSeverity('success');
    setSnackbarOpen(true);
  }, [resetEmail, resetPassword, runAuthOperation, validateForm]);

  const openResetDialog = useCallback(() => {
    if (authOperationRef.current) return;
    resetErrors();
    clearAuthError?.();
    setResetEmail(email);
    setForgotDialogOpen(true);
  }, [clearAuthError, email, resetErrors]);

  const closeResetDialog = useCallback(() => {
    if (authOperationRef.current === 'reset') return;
    setForgotDialogOpen(false);
    resetErrors();
  }, [resetErrors]);

  const handleResetDialogEntered = useCallback(() => {
    resetErrors();
    resetEmailInputRef.current?.focus();
  }, [resetErrors]);

  if (loading) {
    return <PageLoader />;
  }

  return (
    <>
      <Box data-auth-page="" sx={authLayoutSx.page}>
        <AuthBrandPanel
          actionSx={authActionSx}
          layoutSx={authLayoutSx}
          onNavigateHome={() => navigate('/')}
        />

        <Box component="main" sx={authLayoutSx.formPanel}>
          <Box sx={authLayoutSx.formInner}>
            <Box>
              <Typography
                sx={(muiTheme) => ({
                  ...muiTheme.typography.captionMonoSm,
                  color: 'text.secondary',
                })}
              >
                Account access
              </Typography>
              <Typography
                component="h1"
                sx={(muiTheme) => ({ ...muiTheme.typography.displaySm, mt: 1.5 })}
              >
                {tabValue === 0 ? 'Welcome back.' : 'Create your account.'}
              </Typography>
              <Typography
                sx={{ mt: 1.5, color: 'text.secondary', ...authLayoutSx.desktopProductCopy }}
              >
                {tabValue === 0
                  ? 'Sign in to continue your database conversations.'
                  : 'Start querying and visualizing your databases with Moonlit.'}
              </Typography>
              <Typography
                sx={{ mt: 1.5, color: 'text.secondary', ...authLayoutSx.mobileProductCopy }}
              >
                {PRODUCT_COPY}
              </Typography>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 0.5,
                  p: 0.5,
                  mt: 4,
                  border: '1px solid',
                  borderColor: 'border.subtle',
                  borderRadius: 999,
                }}
              >
                {['Sign in', 'Sign up'].map((label, index) => (
                  <Button
                    key={label}
                    variant="text"
                    onClick={() => changeMode(index)}
                    disabled={authBusy}
                    aria-pressed={tabValue === index}
                    sx={{
                      ...authActionSx,
                      backgroundColor: tabValue === index ? 'action.selected' : 'transparent',
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </Box>

              <Stack
                component="form"
                onSubmit={tabValue === 0 ? handleEmailSignIn : handleEmailSignUp}
                aria-busy={authBusy}
                spacing={2}
                sx={{ mt: 3 }}
              >
                {tabValue === 1 && (
                  <TextField
                    fullWidth
                    label="Display name"
                    placeholder="Enter your name"
                    value={displayName}
                    disabled={authBusy}
                    onChange={(event) => setDisplayName(event.target.value)}
                    error={Boolean(fieldErrors.displayName)}
                    helperText={fieldErrors.displayName}
                    sx={fieldSx}
                  />
                )}
                <TextField
                  fullWidth
                  type="email"
                  label="Email"
                  placeholder="you@example.com"
                  value={email}
                  disabled={authBusy}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    clearFieldError('email');
                  }}
                  onBlur={() => validateField('email', email)}
                  error={Boolean(fieldErrors.email)}
                  helperText={fieldErrors.email}
                  sx={fieldSx}
                />
                <TextField
                  fullWidth
                  type="password"
                  label="Password"
                  placeholder="Enter your password"
                  value={password}
                  disabled={authBusy}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    clearFieldError(tabValue === 0 ? 'password' : 'passwordSignUp');
                  }}
                  onBlur={() =>
                    validateField(tabValue === 0 ? 'password' : 'passwordSignUp', password)
                  }
                  error={Boolean(fieldErrors[tabValue === 0 ? 'password' : 'passwordSignUp'])}
                  helperText={
                    fieldErrors[tabValue === 0 ? 'password' : 'passwordSignUp'] ||
                    (tabValue === 1 ? 'At least 6 characters' : '')
                  }
                  sx={fieldSx}
                />
                {tabValue === 1 && (
                  <TextField
                    fullWidth
                    type="password"
                    label="Confirm password"
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    disabled={authBusy}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      clearFieldError('confirmPassword');
                    }}
                    onBlur={() => validateField('confirmPassword', confirmPassword)}
                    error={Boolean(fieldErrors.confirmPassword)}
                    helperText={fieldErrors.confirmPassword}
                    sx={fieldSx}
                  />
                )}

                {tabValue === 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Link
                      component="button"
                      type="button"
                      onClick={openResetDialog}
                      disabled={authBusy}
                      sx={{
                        minHeight: authActionSx.minHeight,
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      Forgot password?
                    </Link>
                  </Box>
                )}

                <Button
                  fullWidth
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={authBusy}
                  sx={{ ...authActionSx, mt: '8px !important' }}
                >
                  {authOperation === 'email'
                    ? tabValue === 0
                      ? 'Signing in'
                      : 'Creating account'
                    : tabValue === 0
                      ? 'Sign in'
                      : 'Create account'}
                </Button>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Button
                    type="button"
                    fullWidth
                    variant="outlined"
                    disabled={authBusy}
                    startIcon={
                      authOperation === 'google' ? (
                        <ButtonLoadingSpinner size={16} />
                      ) : (
                        <GoogleBrandIcon sx={{ fontSize: 18 }} />
                      )
                    }
                    onClick={() => handleProviderSignIn('google')}
                    sx={authActionSx}
                  >
                    {authOperation === 'google' ? 'Connecting' : 'Google'}
                  </Button>
                  <Button
                    type="button"
                    fullWidth
                    variant="outlined"
                    disabled={authBusy}
                    startIcon={
                      authOperation === 'github' ? (
                        <ButtonLoadingSpinner size={16} />
                      ) : (
                        <GitHubBrandIcon sx={{ fontSize: 18 }} />
                      )
                    }
                    onClick={() => handleProviderSignIn('github')}
                    sx={authActionSx}
                  >
                    {authOperation === 'github' ? 'Connecting' : 'GitHub'}
                  </Button>
                </Box>
              </Stack>

              <Typography sx={{ mt: 4, textAlign: 'center', color: 'text.secondary' }}>
                {tabValue === 0 ? 'New to Moonlit? ' : 'Already have an account? '}
                <Link
                  component="button"
                  disabled={authBusy}
                  onClick={() => changeMode(tabValue === 0 ? 1 : 0)}
                  sx={{
                    minHeight: authActionSx.minHeight,
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  {tabValue === 0 ? 'Create an account' : 'Sign in'}
                </Link>
              </Typography>
            </Box>

            <Typography
              sx={(muiTheme) => ({
                ...muiTheme.typography.captionMonoSm,
                ...authLayoutSx.mobileProductCopy,
                mt: 3,
                color: 'text.disabled',
                textAlign: 'center',
                textTransform: 'uppercase',
              })}
            >
              Secure by design · Work with confidence
            </Typography>
          </Box>
        </Box>
      </Box>

      <DialogShell
        open={forgotDialogOpen}
        onClose={closeResetDialog}
        maxWidth="xs"
        desktopMinHeight={0}
        desktopMaxHeight={440}
        headerTitle="Reset password"
        headerTitleId="reset-password-title"
        ariaLabelledBy="reset-password-title"
        transitionProps={{ onEntered: handleResetDialogEntered }}
        bodySx={{ overflowY: 'auto' }}
        footer={
          <>
            <Button
              variant="outlined"
              onClick={closeResetDialog}
              disabled={authOperation === 'reset'}
              sx={getConfirmActionGeometrySx(theme)}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handlePasswordReset}
              disabled={authBusy}
              startIcon={authOperation === 'reset' ? <ButtonLoadingSpinner size={14} /> : null}
              sx={getConfirmActionGeometrySx(theme)}
            >
              {authOperation === 'reset' ? 'Sending' : 'Send reset link'}
            </Button>
          </>
        }
      >
        <Box sx={{ width: '100%', p: { xs: 2.5, sm: 3 } }}>
          <Typography sx={{ color: 'text.secondary', mb: 2 }}>
            Enter your email and Moonlit will send you a reset link.
          </Typography>
          <TextField
            fullWidth
            type="email"
            label="Email"
            inputRef={resetEmailInputRef}
            value={resetEmail}
            disabled={authOperation === 'reset'}
            onChange={(event) => {
              setResetEmail(event.target.value);
              clearFieldError('email');
            }}
            onBlur={() => validateField('email', resetEmail)}
            error={Boolean(fieldErrors.email)}
            helperText={fieldErrors.email}
            sx={fieldSx}
          />
        </Box>
      </DialogShell>

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
