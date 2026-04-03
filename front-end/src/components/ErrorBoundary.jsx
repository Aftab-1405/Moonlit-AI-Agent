/**
 * ErrorBoundary Component
 * 
 * Catches JavaScript errors anywhere in the child component tree,
 * logs them, and displays a fallback UI instead of crashing the app.
 * 
 * @module components/ErrorBoundary
 */

import { Component } from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';

/**
 * Error Boundary class component.
 * React error boundaries must be class components.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary] Caught error:', error);
      console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    }
    
    this.setState({ errorInfo });
    
    // TODO: Send to error reporting service (Sentry, etc.)
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const { fallback, minimal } = this.props;
      if (fallback) {
        return fallback;
      }
      if (minimal) {
        return (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              p: 3,
              gap: 2,
              minHeight: 200,
            }}
          >
            <ErrorOutlineRoundedIcon sx={{ fontSize: 40, color: 'error.main', opacity: 0.7 }} />
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Something went wrong in this section
            </Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={this.handleRetry}
              sx={{ textTransform: 'none' }}
            >
              Try Again
            </Button>
          </Box>
        );
      }
      return (
        <Box
          sx={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'background.default',
            p: 3,
          }}
        >
          <Paper
            elevation={0}
            sx={{
              maxWidth: 560,
              width: '100%',
              p: { xs: 2.5, sm: 4 },
              textAlign: 'center',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 3,
              bgcolor: (theme) => alpha(theme.palette.background.paper, 0.8),
            }}
          >
            <ErrorOutlineRoundedIcon
              sx={{
                fontSize: 64,
                color: 'error.main',
                opacity: 0.8,
                mb: 2,
              }}
            />
            
            <Typography variant="h5" fontWeight={600} gutterBottom>
              Oops! Something went wrong
            </Typography>
            
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              We encountered an unexpected error. The issue has been noted and we're working on it.
            </Typography>
            {import.meta.env.DEV && this.state.error && (
              <Box
                sx={{
                  mb: 3,
                  p: 2,
                  bgcolor: (theme) => alpha(theme.palette.error.main, 0.1),
                  borderRadius: 2,
                  textAlign: 'left',
                  overflow: 'auto',
                  maxHeight: 200,
                }}
              >
                <Typography
                  variant="caption"
                  component="pre"
                  sx={(theme) => ({
                    fontFamily: theme.typography.fontFamilyMono,
                    ...theme.typography.uiCaptionXs,
                    whiteSpace: 'pre',
                    overflowX: 'auto',
                    m: 0,
                  })}
                >
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </Typography>
              </Box>
            )}

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={<RefreshRoundedIcon />}
                onClick={this.handleReload}
                sx={{ textTransform: 'none' }}
              >
                Reload Page
              </Button>
              <Button
                variant="outlined"
                startIcon={<HomeRoundedIcon />}
                onClick={this.handleGoHome}
                sx={{ textTransform: 'none' }}
              >
                Go Home
              </Button>
            </Box>
          </Paper>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
