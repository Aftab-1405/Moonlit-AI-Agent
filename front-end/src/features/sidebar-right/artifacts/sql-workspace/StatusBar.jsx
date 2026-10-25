import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { runQuery } from '@/api';
import { CheckIcon, CopyIcon, ExecuteIcon } from '@/components/icons';
import { useDatabaseConnection } from '@/contexts/DatabaseContext';
import { useTheme as useAppTheme } from '@/contexts/ThemeContext';
import { getArtifactActionButtonSx } from '@/features/sidebar-right/artifact-loader';
import { copyToClipboard } from '@/utils/clipboard';
import { normalizeQueryResult } from '@/utils/queryResult';

const STATUS_ACTION_SIZE = 30;

function StatusBar({
  isConnected,
  currentDatabase,
  activeTab,
  onQueryExecute,
  onRegisterRunQuery,
}) {
  const theme = useTheme();
  const { settings } = useAppTheme();
  const { currentSchema, lastConnectedAt, isLoading: sourceChanging } = useDatabaseConnection();
  const [isRunning, setIsRunning] = useState(false);
  const requestRef = useRef(null);
  useLayoutEffect(() => {
    setIsRunning(false);
    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [activeTab?.id, currentDatabase, isConnected, currentSchema, lastConnectedAt, sourceChanging]);
  const [copied, setCopied] = useState(false);

  const handleRunQuery = useCallback(async () => {
    if (!activeTab?.query?.trim() || requestRef.current || !isConnected || sourceChanging) return;

    const request = new AbortController();
    requestRef.current = request;
    setIsRunning(true);

    try {
      const maxRows = settings.maxRows ?? 1000;
      const queryTimeout = settings.queryTimeout ?? 30;
      const response = await runQuery(
        {
          sql: activeTab.query,
          maxRows,
          timeout: queryTimeout,
        },
        request.signal,
      );
      if (request.signal.aborted || requestRef.current !== request) return;

      if (response.status === 'success') {
        const queryData = response.data;
        const results = normalizeQueryResult(queryData);
        onQueryExecute(results, null);
      } else {
        onQueryExecute(null, response.message || 'Query execution failed');
      }
    } catch (error) {
      if (request.signal.aborted || requestRef.current !== request) return;
      const message =
        error?.data?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to execute query';
      onQueryExecute(null, message);
    } finally {
      if (requestRef.current === request) {
        requestRef.current = null;
        setIsRunning(false);
      }
    }
  }, [activeTab, isConnected, onQueryExecute, settings, sourceChanging]);

  useEffect(() => {
    onRegisterRunQuery?.(handleRunQuery);
  }, [handleRunQuery, onRegisterRunQuery]);

  const handleCopyQuery = useCallback(async () => {
    if (!activeTab?.query) return;
    const didCopy = await copyToClipboard(activeTab.query);
    if (didCopy) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [activeTab]);

  const hasRunnableQuery = Boolean(activeTab?.query?.trim());
  const connectionColor = isConnected ? theme.palette.success.main : theme.palette.text.disabled;

  return (
    <Box
      sx={{
        minHeight: 42,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
        alignItems: 'center',
        gap: 1,
        px: 0.75,
        py: 0.5,
        flexShrink: 0,
        bgcolor: 'transparent',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
        <Box
          sx={{
            minWidth: 0,
            height: 28,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.625,
            px: 1,
            borderRadius: '8px',
            bgcolor: alpha(connectionColor, isConnected ? 0.08 : 0.045),
          }}
        >
          <Typography
            sx={{
              ...theme.typography.uiCaptionXs,
              minWidth: 0,
              color: connectionColor,
              fontWeight: 400,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {currentDatabase || (isConnected ? 'Connected' : 'Not connected')}
          </Typography>
        </Box>

        {activeTab?.results ? (
          <Typography
            sx={{
              ...theme.typography.uiCaptionXs,
              color: 'text.disabled',
              fontFamily: theme.typography.fontFamilyMono,
              whiteSpace: 'nowrap',
            }}
          >
            {activeTab.results.row_count ?? 0} rows
          </Typography>
        ) : null}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Tooltip
          title={
            !isConnected
              ? 'Connect a database to run this query'
              : isRunning
                ? 'Running query'
                : 'Run query (Ctrl+Enter)'
          }
        >
          <span>
            <Button
              size="small"
              variant="contained"
              color="accent"
              onClick={handleRunQuery}
              disabled={isRunning || !hasRunnableQuery || !isConnected || sourceChanging}
              aria-label="Run query"
              loading={isRunning}
              startIcon={<ExecuteIcon />}
              loadingPosition="start"
            >
              <Box component="span" sx={{ display: 'grid' }}>
                <Box
                  component="span"
                  sx={{ gridArea: '1 / 1', visibility: isRunning ? 'hidden' : 'visible' }}
                >
                  Run
                </Box>
                <Box
                  component="span"
                  aria-hidden={!isRunning}
                  sx={{ gridArea: '1 / 1', visibility: isRunning ? 'visible' : 'hidden' }}
                >
                  Running
                </Box>
              </Box>
            </Button>
          </span>
        </Tooltip>

        <Tooltip title={copied ? 'Query copied' : 'Copy query'}>
          <span>
            <IconButton
              size="small"
              onClick={handleCopyQuery}
              disabled={!hasRunnableQuery}
              aria-label={copied ? 'Query copied' : 'Copy query'}
              sx={{
                ...getArtifactActionButtonSx(theme, { size: STATUS_ACTION_SIZE }),
                color: copied ? 'success.main' : 'text.secondary',
                bgcolor: copied ? alpha(theme.palette.success.main, 0.08) : 'transparent',
              }}
            >
              {copied ? <CheckIcon sx={{ fontSize: 16 }} /> : <CopyIcon sx={{ fontSize: 15 }} />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 0.75,
          minWidth: 0,
        }}
      >
        <Typography
          sx={{
            ...theme.typography.uiCaptionXs,
            color: 'text.disabled',
            fontFamily: theme.typography.fontFamilyMono,
          }}
        >
          SQL
        </Typography>
        <Box
          component="kbd"
          sx={{
            display: { xs: 'none', sm: 'inline-flex' },
            alignItems: 'center',
            height: 22,
            px: 0.75,
            borderRadius: '6px',
            color: 'text.disabled',
            bgcolor: alpha(theme.palette.text.primary, theme.palette.opacity.subtle),
            fontFamily: theme.typography.fontFamilyMono,
            fontSize: '0.625rem',
            lineHeight: 1,
          }}
        >
          Ctrl ↵
        </Box>
      </Box>
    </Box>
  );
}

export default memo(StatusBar);
