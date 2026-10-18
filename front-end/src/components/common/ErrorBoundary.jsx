import { Box, Button, Collapse, Paper, Tooltip, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Component, useState } from 'react';
import {
  BugIcon,
  CheckIcon,
  CopyIcon,
  ExpandMoreIcon,
  HomeIcon,
  RefreshIcon,
} from '@/components/icons';
import { getScrollbarStyles } from '@/styles/shared';

/**
 * Builds the plain-text payload shown in the dev stack-trace panel and copied
 * to the clipboard when the user clicks "Copy".
 */
function buildErrorReport(error, errorInfo) {
  const lines = [];
  if (error) {
    lines.push('Error:');
    lines.push(String(error?.message || error));
    if (error?.stack) {
      lines.push('');
      lines.push('Stack:');
      lines.push(error.stack);
    }
  }
  if (errorInfo?.componentStack) {
    lines.push('');
    lines.push('Component stack:');
    lines.push(errorInfo.componentStack);
  }
  return lines.join('\n');
}

function CopyErrorButton({ report }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(report);
      } else {
        // Fallback for older browsers / insecure contexts
        const textarea = document.createElement('textarea');
        textarea.value = report;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Silently fail — clipboard may be blocked by permissions policy
    }
  };

  return (
    <Tooltip title={copied ? 'Copied!' : 'Copy error details'}>
      <Button
        size="small"
        onClick={handleCopy}
        aria-label="Copy error details"
        startIcon={
          copied ? <CheckIcon sx={{ fontSize: 15 }} /> : <CopyIcon sx={{ fontSize: 15 }} />
        }
        sx={(theme) => ({
          color: copied ? 'success.main' : 'text.secondary',
          textTransform: 'none',
          fontWeight: 400,
          fontSize: '0.78rem',
          borderRadius: '8px',
          border: `1px solid ${theme.palette.border.default}`,
          backgroundColor: theme.palette.layer.surfaceTranslucent,
          px: 1.25,
          py: 0.4,
          minWidth: 0,
          '&:hover': {
            color: copied ? 'success.main' : 'text.primary',
            backgroundColor: theme.palette.action.hover,
          },
        })}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </Tooltip>
  );
}

function DevErrorDetails({ error, errorInfo }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(true);
  const report = buildErrorReport(error, errorInfo);

  return (
    <Box
      sx={{
        mt: 2.5,
        borderRadius: '8px',
        border: `1px solid ${theme.palette.divider}`,
        backgroundColor: theme.palette.layer.barely,
        overflow: 'hidden',
      }}
    >
      {/* Header row — title + expand toggle + copy */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          px: 1.75,
          py: 1,
          borderBottom: expanded ? `1px solid ${theme.palette.divider}` : 'none',
        }}
      >
        <Button
          size="small"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="error-stack-trace"
          startIcon={
            <ExpandMoreIcon
              sx={{
                fontSize: 18,
                transition: theme.transitions.create('transform', {
                  duration: theme.transitions.duration.shorter,
                }),
                transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
              }}
            />
          }
          sx={{
            color: 'text.secondary',
            textTransform: 'none',
            fontWeight: 400,
            fontSize: '0.78rem',
            letterSpacing: '0.04em',
            minWidth: 0,
            p: 0,
            '&:hover': {
              color: 'text.primary',
              backgroundColor: 'transparent',
            },
          }}
        >
          Development details
        </Button>
        <CopyErrorButton report={report} />
      </Box>

      {/* Stack trace — taller, scrollable, monospace */}
      <Collapse in={expanded}>
        <Box
          id="error-stack-trace"
          component="pre"
          sx={{
            m: 0,
            px: 1.75,
            py: 1.5,
            maxHeight: 360,
            overflow: 'auto',
            fontFamily:
              theme.typography.fontFamilyMono || 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '0.78rem',
            lineHeight: 1.55,
            color: 'text.secondary',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            ...getScrollbarStyles(theme),
          }}
        >
          {report}
        </Box>
      </Collapse>
    </Box>
  );
}

function MinimalErrorFallback({ onRetry }) {
  const theme = useTheme();
  return (
    <Box
      role="alert"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        p: { xs: 2.5, sm: 3.5 },
        gap: 1.5,
        minHeight: 220,
        textAlign: 'center',
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          display: 'grid',
          placeItems: 'center',
          borderRadius: '8px',
          color: 'text.secondary',
          backgroundColor: theme.palette.layer.subtle,
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        <BugIcon sx={{ fontSize: 23 }} />
      </Box>
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 400, color: 'text.primary' }}>
          This section could not load
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Try rendering it again.
        </Typography>
      </Box>
      <Button
        size="small"
        variant="outlined"
        onClick={onRetry}
        startIcon={<RefreshIcon sx={{ fontSize: 17 }} />}
        sx={{ px: 1.75 }}
      >
        Try again
      </Button>
    </Box>
  );
}

function FullPageErrorFallback({ error, errorInfo, onReload, onGoHome }) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        minHeight: '100vh',
        '@supports (height: 100dvh)': { minHeight: '100dvh' },
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'background.default',
        p: { xs: 2, sm: 3, md: 4 },
      }}
    >
      <Paper
        role="alert"
        aria-live="assertive"
        elevation={0}
        sx={{
          position: 'relative',
          overflow: 'hidden',
          maxWidth: 720,
          width: '100%',
          p: { xs: 2.75, sm: 4, md: 4.5 },
          border: '1px solid',
          borderColor: theme.palette.divider,
          borderRadius: '8px',
          bgcolor: 'background.paper',
        }}
      >
        {/* Icon + eyebrow + title */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            mb: 2.5,
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              display: 'grid',
              placeItems: 'center',
              borderRadius: '8px',
              color: 'text.secondary',
              backgroundColor: theme.palette.layer.subtle,
              border: `1px solid ${theme.palette.divider}`,
              mb: 2,
            }}
          >
            <BugIcon sx={{ fontSize: 28 }} />
          </Box>

          <Typography
            component="p"
            sx={{
              ...theme.typography.uiCaptionMd,
              mb: 1,
              color: 'text.secondary',
              fontWeight: 400,
            }}
          >
            Recovery mode
          </Typography>
          <Typography
            variant="h5"
            sx={{ fontWeight: 400, letterSpacing: '-0.025em', color: 'text.primary' }}
          >
            Moonlit hit an unexpected error
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 1, lineHeight: 1.65, maxWidth: 480 }}
          >
            Reload the app to restore your workspace. If the problem continues, return home and try
            again.
          </Typography>
        </Box>

        {/* Error summary — always visible (non-dev too) so users have something to share */}
        {error && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              p: 2,
              borderRadius: '8px',
              border: `1px solid ${theme.palette.divider}`,
              backgroundColor: theme.palette.layer.barely,
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 400,
                color: 'text.primary',
                fontFamily: theme.typography.fontFamilyMono || 'ui-monospace, monospace',
                fontSize: '0.85rem',
              }}
            >
              {error?.name || 'Error'}
            </Typography>
            <Typography
              component="div"
              sx={{
                fontFamily: theme.typography.fontFamilyMono || 'ui-monospace, monospace',
                fontSize: '0.82rem',
                lineHeight: 1.55,
                color: 'text.secondary',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
              }}
            >
              {String(error?.message || error)}
            </Typography>
          </Box>
        )}

        {/* Dev-only stack trace — collapsible, tall, with copy button */}
        {import.meta.env.DEV && error && <DevErrorDetails error={error} errorInfo={errorInfo} />}

        {/* Action buttons — roomy, clear primary/secondary hierarchy */}
        <Box
          sx={{
            display: 'flex',
            gap: 1.25,
            justifyContent: 'center',
            flexWrap: 'wrap',
            mt: 3,
          }}
        >
          <Button
            variant="contained"
            color="primary"
            startIcon={<RefreshIcon />}
            onClick={onReload}
            sx={{
              borderRadius: '9999px',
              px: 2.25,
              py: 1,
              fontSize: '0.9rem',
              fontWeight: 400,
              minWidth: 150,
              boxShadow: 'none',
            }}
          >
            Reload page
          </Button>
          <Button
            variant="outlined"
            color="inherit"
            startIcon={<HomeIcon />}
            onClick={onGoHome}
            sx={{
              borderRadius: '9999px',
              px: 2.25,
              py: 1,
              fontSize: '0.9rem',
              fontWeight: 400,
              minWidth: 150,
            }}
          >
            Go home
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

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

    // TODO: Send to an error reporting service when one is configured.
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
        return <MinimalErrorFallback onRetry={this.handleRetry} />;
      }
      return (
        <FullPageErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReload={this.handleReload}
          onGoHome={this.handleGoHome}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
