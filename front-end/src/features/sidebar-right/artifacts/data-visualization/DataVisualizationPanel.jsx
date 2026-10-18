import { Box, Button, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  AnalyticsIcon,
  CodeEditorIcon,
  CopyIcon,
  DownloadIcon,
  FilterIcon,
  ImageIcon,
  ResetIcon,
  SaveIcon,
  WarningIcon,
} from '@/components/icons';
import { ArtifactEmptyState, ArtifactShell } from '@/features/sidebar-right/artifact-loader';
import { useAuth } from '@/contexts/AuthContext';
import PerspectiveDashboard from '@/features/sidebar-right/artifacts/data-visualization/PerspectiveDashboard';
import { createAnalysisStorageKey } from '@/features/sidebar-right/artifacts/data-visualization/perspectiveAnalysis';
import { getSecondaryActionButtonSx } from '@/styles/shared';
import { copyToClipboard } from '@/utils/clipboard';

function DataVisualizationPanel({
  data,
  chrome = 'standalone',
  _title = 'Data Analysis',
  onClose,
  onOpenArtifact,
  onRequestClose,
  onRequestOpenArtifact,
  isFullscreen = false,
  onEnterFullscreen,
  onExitFullscreen,
  onToggleFullscreen,
  sourceQuery,
  currentDatabase,
  workspaceContainerRef,
  onNotify,
}) {
  const theme = useTheme();
  const { user } = useAuth();
  const dashboardRef = useRef(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [selection, setSelection] = useState(null);
  const columns = useMemo(() => data?.columns || [], [data?.columns]);
  const rows = useMemo(() => data?.rows || [], [data?.rows]);
  // Preserve column_types so PerspectiveDashboard can build an explicit schema
  // instead of falling back to sample-based inference. Without this, every
  // query result loses its type information at this boundary.
  const column_types = useMemo(() => data?.column_types || {}, [data?.column_types]);
  const memoizedData = useMemo(
    () => ({ columns, rows, column_types }),
    [columns, rows, column_types],
  );

  const storageKey = useMemo(
    () =>
      createAnalysisStorageKey({
        userId: user?.uid,
        sourceQuery,
        columns,
        database: currentDatabase,
      }),
    [columns, currentDatabase, sourceQuery, user?.uid],
  );
  const isTruncated = Boolean(data?.truncated);
  const displayedRowCount = data?.row_count ?? rows.length;

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
        await dashboardRef.current?.[action]?.(...args);
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
        title="Query results"
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
        <ArtifactEmptyState
          role="status"
          ariaLive="polite"
          icon={<AnalyticsIcon sx={{ fontSize: 48 }} />}
          title="No rows returned"
          message="The query completed without returning data."
        />
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
        title="Perspective"
        chrome={chrome}
        onClose={onClose}
        onRequestClose={onRequestClose}
        isFullscreen={isFullscreen}
        onEnterFullscreen={onEnterFullscreen}
        onExitFullscreen={onExitFullscreen}
        onToggleFullscreen={onToggleFullscreen}
        workspaceContainerRef={workspaceContainerRef}
        bodySx={{ p: 2, display: 'flex', flexDirection: 'column' }}
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
            label: 'Copy current view as CSV',
            icon: <CopyIcon sx={{ fontSize: 18 }} />,
            onClick: () => runDashboardAction('copy', 'Current view copied.'),
            disabled: !viewerReady,
          },
          {
            key: 'download-csv',
            label: 'Download current view as CSV',
            icon: <DownloadIcon sx={{ fontSize: 18 }} />,
            onClick: () => runDashboardAction('download', 'CSV download started.'),
            disabled: !viewerReady,
          },
          {
            key: 'export-visualization',
            label: 'Export visualization',
            icon: <ImageIcon sx={{ fontSize: 18 }} />,
            onClick: () =>
              runDashboardAction('exportVisualization', 'Visualization export started.'),
            disabled: !viewerReady,
          },
          {
            key: 'reset-analysis',
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
        {isTruncated ? (
          <Box
            role="alert"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              mb: 1.5,
              px: 1.5,
              py: 1,
              borderRadius: '8px',
              color: 'warning.main',
              bgcolor: alpha(theme.palette.warning.main, theme.palette.opacity.medium),
              border: `1px solid ${alpha(theme.palette.warning.main, 0.24)}`,
            }}
          >
            <WarningIcon sx={{ fontSize: 18, flexShrink: 0 }} />
            <Typography sx={{ ...theme.typography.uiCaptionMd, color: 'text.secondary' }}>
              Analysis only includes the first {displayedRowCount.toLocaleString()} rows. Increase
              the query row limit or aggregate in SQL before drawing conclusions.
            </Typography>
          </Box>
        ) : null}
        <Box sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
          <PerspectiveDashboard
            ref={dashboardRef}
            data={memoizedData}
            storageKey={storageKey}
            onReadyChange={setViewerReady}
            onSelectionChange={setSelection}
          />
        </Box>
      </ArtifactShell>
    </Box>
  );
}

export default memo(DataVisualizationPanel);
