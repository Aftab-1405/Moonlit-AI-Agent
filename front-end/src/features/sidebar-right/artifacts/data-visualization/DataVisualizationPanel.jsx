import { Box, Button, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { memo, useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AnalyticsIcon,
  CodeEditorIcon,
  CopyIcon,
  DownloadIcon,
  FilterIcon,
  ImageIcon,
  ResetIcon,
  SaveIcon,
} from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArtifactCanvasPanel,
  ArtifactEmptyState,
  ArtifactShell,
} from '@/features/sidebar-right/artifact-loader';
import PerspectiveDashboard from '@/features/sidebar-right/artifacts/data-visualization/PerspectiveDashboard';
import { createAnalysisStorageKey } from '@/features/sidebar-right/artifacts/data-visualization/perspectiveAnalysis';
import { getSecondaryActionButtonSx } from '@/styles/shared';
import { copyToClipboard } from '@/utils/clipboard';
import { downloadFile } from '@/utils/downloadFile';
import {
  describeResultScope,
  normalizeQueryResult,
  resultExportMetadata,
  resultToCsv,
} from '@/utils/queryResult';

function DataVisualizationPanel({
  data,
  chrome = 'standalone',
  title,
  outputsSlot,
  onClose,
  onOpenArtifact,
  onRequestClose,
  onRequestOpenArtifact,
  isFullscreen = false,
  onEnterFullscreen,
  onExitFullscreen,
  onToggleFullscreen,
  sourceQuery,

  workspaceContainerRef,
  onNotify,
}) {
  const theme = useTheme();
  const { user } = useAuth();
  const dashboardRef = useRef(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [selection, setSelection] = useState(null);
  const memoizedData = useMemo(() => normalizeQueryResult(data), [data]);
  const { rows, result_metadata: metadata } = memoizedData;
  const [notices, setNotices] = useState([]);
  const [expandedResult, setExpandedResult] = useState(null);
  const detailsId = useId();
  const detailsOpen = expandedResult === memoizedData;
  const storageKey = useMemo(
    () =>
      createAnalysisStorageKey({
        userId: user?.uid,
        sourceId: metadata?.source_id,
        queryId: metadata?.query_id,
        columnMetadata: memoizedData.column_metadata,
      }),
    [metadata, memoizedData.column_metadata, user?.uid],
  );
  const metrics = useRef({});
  useLayoutEffect(() => {
    metrics.current = {
      ...memoizedData.client_metrics,
      execution_time_ms: metadata?.execution_time_ms,
      rows: memoizedData.rows.length,
      columns: memoizedData.columns.length,
    };
  }, [memoizedData, metadata]);
  const recordMetrics = useCallback((values) => {
    Object.assign(metrics.current, values);
    // Keep one numeric-only diagnostic entry, never queries, source identifiers or rows.
    if (typeof performance.measure === 'function') {
      performance.clearMeasures('moonlit:analysis');
      performance.measure('moonlit:analysis', {
        start: 0,
        duration: metrics.current.visualization_usable_ms || 0,
        detail: { ...metrics.current },
      });
    }
  }, []);
  const isTruncated = memoizedData.truncated;
  const scopeLabel = memoizedData.expired
    ? 'Released'
    : isTruncated
      ? 'Truncated'
      : metadata?.completeness === 'complete'
        ? 'Complete'
        : 'Scope unknown';
  const hasApproximateValues = memoizedData.column_metadata.some(
    (column) => column.encoding === 'decimal-string' || column.encoding === 'integer-string',
  );
  const scope = (
    <Box sx={{ px: 1.5, py: 0.5, flexShrink: 0, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Typography
          role={isTruncated ? 'alert' : 'status'}
          sx={{
            ...theme.typography.uiCaptionMd,
            color: isTruncated ? 'warning.main' : 'text.secondary',
          }}
        >
          {rows.length.toLocaleString()} {rows.length === 1 ? 'row' : 'rows'} · {scopeLabel}
        </Typography>
        {hasApproximateValues ? (
          <Typography sx={{ ...theme.typography.uiCaptionSm, color: 'text.secondary' }}>
            Approximate values
          </Typography>
        ) : null}
        <Button
          size="small"
          color="inherit"
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          onClick={() => setExpandedResult(detailsOpen ? null : memoizedData)}
          sx={{ ml: 'auto' }}
        >
          Result details
        </Button>
      </Box>
      {detailsOpen ? (
        <Box id={detailsId} sx={{ py: 1 }}>
          <Typography sx={{ ...theme.typography.uiCaptionSm, color: 'text.secondary' }}>
            {describeResultScope(memoizedData)}
          </Typography>
          <Typography sx={{ ...theme.typography.uiCaptionSm, color: 'text.secondary' }}>
            Filters, pivots, totals, charts and exports cover these loaded rows. A complete SQL
            result may summarize more database rows.
          </Typography>
          {metadata?.executed_at ? (
            <Typography
              sx={{
                ...theme.typography.uiCaptionSm,
                color: 'text.secondary',
                overflowWrap: 'anywhere',
              }}
            >
              Snapshot {metadata.executed_at} · Execution {metadata.execution_id}
            </Typography>
          ) : null}
          {metadata?.timeout_scope === 'driver-configured' ? (
            <Typography sx={{ ...theme.typography.uiCaptionSm, color: 'text.secondary' }}>
              SQL Server uses its configured {metadata.effective_timeout_seconds}s execution timeout
              (requested {metadata.requested_timeout_seconds}s).
            </Typography>
          ) : metadata?.timeout_scope === 'driver-round-trip' ? (
            <Typography sx={{ ...theme.typography.uiCaptionSm, color: 'text.secondary' }}>
              Timeout: {metadata.effective_timeout_seconds}s per database round trip, not a total
              query deadline.
            </Typography>
          ) : null}
          {notices.map((notice) => (
            <Typography
              key={notice}
              sx={{ ...theme.typography.uiCaptionSm, color: 'text.secondary' }}
            >
              {notice}
            </Typography>
          ))}
        </Box>
      ) : null}
    </Box>
  );
  const downloadSource = useCallback(() => {
    try {
      const filename = `query-${metadata?.execution_id || 'legacy'}-${isTruncated ? 'truncated' : metadata?.completeness || 'unknown'}`;
      downloadFile(resultToCsv(memoizedData), `${filename}.csv`, 'text/csv;charset=utf-8');
      downloadFile(
        JSON.stringify(resultExportMetadata(memoizedData), null, 2),
        `${filename}.metadata.json`,
        'application/json',
      );
    } catch (error) {
      onNotify?.(error.message || 'Source export could not be downloaded.', 'error');
    }
  }, [memoizedData, metadata, isTruncated, onNotify]);

  const requestOpenArtifact = onRequestOpenArtifact || onOpenArtifact;

  const openEditor = useCallback(() => {
    requestOpenArtifact?.(
      {
        type: 'sql-editor',
        title: 'SQL Editor',
        props: { initialQuery: sourceQuery, initialResults: data },
      },
      { preserveFullscreen: isFullscreen },
    );
  }, [data, isFullscreen, requestOpenArtifact, sourceQuery]);

  const runDashboardAction = useCallback(
    async (action, successMessage, ...args) => {
      try {
        if (!dashboardRef.current?.[action]) throw new Error('Analysis is not ready.');
        const result = await dashboardRef.current[action](...args);
        if (result === false) throw new Error('The analysis action could not be completed.');
        onNotify?.(successMessage, 'success');
      } catch (actionError) {
        const errMsg = actionError?.message || 'The analysis action could not be completed.';
        onNotify?.(errMsg, 'error');
      }
    },
    [onNotify],
  );

  const applySelectionFilter = useCallback(async () => {
    if (!selection?.config) return;
    await runDashboardAction('applyConfig', 'Selection filter applied.', selection.config);
  }, [runDashboardAction, selection]);

  const copySelection = useCallback(async () => {
    const copied = await copyToClipboard(JSON.stringify(selection?.row || {}, null, 2));
    const msg = copied ? 'Selected row copied.' : 'Selected row could not be copied.';
    onNotify?.(msg, copied ? 'success' : 'error');
  }, [onNotify, selection]);

  if (!rows.length) {
    return (
      <ArtifactShell
        outputsSlot={outputsSlot}
        title={title || 'Query results'}
        chrome={chrome}
        onClose={onClose}
        onRequestClose={onRequestClose}
        isFullscreen={isFullscreen}
        onEnterFullscreen={onEnterFullscreen}
        onExitFullscreen={onExitFullscreen}
        onToggleFullscreen={onToggleFullscreen}
        actions={
          sourceQuery && requestOpenArtifact
            ? [{ key: 'editor', label: 'View SQL', icon: <CodeEditorIcon />, onClick: openEditor }]
            : []
        }
      >
        {scope}
        <ArtifactCanvasPanel>
          <ArtifactEmptyState
            role="status"
            ariaLive="polite"
            icon={<AnalyticsIcon sx={{ fontSize: 48 }} />}
            title={memoizedData.expired ? 'Cached result released' : 'No rows returned'}
            message={
              memoizedData.expired
                ? 'Open the SQL editor and rerun this query to analyse a new snapshot.'
                : 'The query completed without returning data.'
            }
          />
        </ArtifactCanvasPanel>
      </ArtifactShell>
    );
  }

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <ArtifactShell
        outputsSlot={outputsSlot}
        title={title || 'Visualization'}
        chrome={chrome}
        onClose={onClose}
        onRequestClose={onRequestClose}
        isFullscreen={isFullscreen}
        onEnterFullscreen={onEnterFullscreen}
        onExitFullscreen={onExitFullscreen}
        onToggleFullscreen={onToggleFullscreen}
        workspaceContainerRef={workspaceContainerRef}
        actions={[
          sourceQuery && requestOpenArtifact
            ? {
                key: 'editor',
                label: 'View SQL',
                icon: <CodeEditorIcon sx={{ width: 18, height: 18 }} />,
                onClick: openEditor,
              }
            : null,
          {
            key: 'save-analysis',
            label: 'Save analysis',
            icon: <SaveIcon sx={{ fontSize: 18 }} />,
            onClick: () => runDashboardAction('save', 'Analysis saved.'),
            disabled: !viewerReady,
          },
          {
            key: 'copy-view',
            placement: 'overflow',
            label: 'Copy current view with metadata',
            icon: <CopyIcon sx={{ fontSize: 18 }} />,
            onClick: () => runDashboardAction('copy', 'Current view copied.'),
            disabled: !viewerReady,
          },
          {
            key: 'download-source',
            placement: 'overflow',
            label: 'Download source CSV and metadata',
            icon: <DownloadIcon />,
            onClick: downloadSource,
          },
          {
            key: 'download-csv',
            placement: 'overflow',
            label: 'Download current view as CSV',
            icon: <DownloadIcon sx={{ fontSize: 18 }} />,
            onClick: () => runDashboardAction('download', 'CSV download started.'),
            disabled: !viewerReady,
          },
          {
            key: 'export-visualization',
            placement: 'overflow',
            label: 'Export visualization',
            icon: <ImageIcon sx={{ fontSize: 18 }} />,
            onClick: () =>
              runDashboardAction('exportVisualization', 'Visualization export started.'),
            disabled: !viewerReady,
          },
          {
            key: 'reset-analysis',
            placement: 'overflow',
            label: 'Reset analysis',
            icon: <ResetIcon sx={{ fontSize: 18 }} />,
            onClick: () => runDashboardAction('reset', 'Analysis reset.'),
            disabled: !viewerReady,
          },
        ]}
        footer={
          selection?.row ? (
            <Box
              sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, minWidth: 0 }}
            >
              <Typography
                noWrap
                sx={{
                  ...theme.typography.uiCaptionSm,
                  color: 'text.secondary',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                Selected:{' '}
                {Object.entries(selection.row)
                  .slice(0, 3)
                  .map(([key, value]) => `${key}: ${value ?? 'NULL'}`)
                  .join(' · ')}
              </Typography>
              {selection.config ? (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<FilterIcon />}
                  onClick={applySelectionFilter}
                  sx={getSecondaryActionButtonSx(theme)}
                >
                  Filter to selection
                </Button>
              ) : null}
              <Button
                size="small"
                variant="outlined"
                startIcon={<CopyIcon />}
                onClick={copySelection}
                sx={getSecondaryActionButtonSx(theme)}
              >
                Copy row
              </Button>
            </Box>
          ) : null
        }
      >
        {scope}
        <Box sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
          <PerspectiveDashboard
            ref={dashboardRef}
            data={memoizedData}
            storageKey={storageKey}
            onReadyChange={setViewerReady}
            onSelectionChange={setSelection}
            onNotices={setNotices}
            onMetrics={recordMetrics}
            onNotify={onNotify}
          />
        </Box>
      </ArtifactShell>
    </Box>
  );
}

export default memo(DataVisualizationPanel);
