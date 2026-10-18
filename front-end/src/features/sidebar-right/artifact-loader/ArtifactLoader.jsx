// ArtifactLoader — host panel for canvas artifacts (right side of the workspace).
//
// Responsibilities:
//   - Look up the correct renderer for `artifact.type` in `artifactRegistry`.
//   - Coordinate full-view controls and focus with the shell.
//   - Catch renderer errors via `ArtifactErrorBoundary` so one broken
//     artifact doesn't take down the whole panel.
//
// Renderers (all lazy-loaded so they don't bloat the initial bundle):
//   - `sql-editor`     → SqlWorkspace             (CodeMirror)
//   - `visualization`  → DataVisualizationPanel   (Perspective — ~10MB)
//   - `react-flow`     → DiagramFlowRenderer      (react-flow + dagre)
//
// Layout: ArtifactLoader no longer owns its column-width animation — that is
// AppShell's responsibility. ArtifactLoader fills its slot (100% × 100%) and
// paints no surface of its own (the column already did).
//
// Full view is coordinated with AppShell. One in-flow renderer stays mounted
// while the shell reallocates the space beside navigation.

import { Box, Skeleton } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Component,
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ErrorIcon } from '@/components/icons';
import ConversationOutputs from '@/features/chat/ConversationOutputs';
import { ArtifactEmptyState } from '@/features/sidebar-right/artifact-loader/ArtifactLayout';
import { getAppSunkenSurfaceSx } from '@/features/styles/interfaceChrome';

// ─── Lazy-loaded renderers ───────────────────────────────────────────────────
const DataVisualizationPanel = lazy(
  () => import('@/features/sidebar-right/artifacts/data-visualization'),
);
const DiagramFlowRenderer = lazy(() => import('@/features/sidebar-right/artifacts/diagram-flow'));
const SqlWorkspace = lazy(() => import('@/features/sidebar-right/artifacts/sql-workspace'));
const QueryResultArtifact = lazy(
  () => import('@/features/sidebar-right/artifacts/QueryResultArtifact'),
);

/**
 * Suspense fallback shown while a renderer chunk downloads. Mimics the
 * structure of an actual artifact panel: a header row (icon + title bar),
 * a toolbar row of action-button slots, and a large body placeholder.
 */
function RendererFallback() {
  return (
    <Box
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label="Loading artifact"
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header row — icon slot + title bar + action-button slots */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Skeleton variant="rounded" width={30} height={30} sx={{ borderRadius: '8px' }} />
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Skeleton variant="rounded" width="55%" height={10} sx={{ borderRadius: 999 }} />
          <Skeleton variant="rounded" width="32%" height={8} sx={{ borderRadius: 999 }} />
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="circular" width={28} height={28} animation="wave" />
          ))}
        </Box>
      </Box>

      {/* Body placeholder — large rounded rectangle fills remaining space */}
      <Box sx={{ flex: 1, minHeight: 0, p: 2, display: 'flex' }}>
        <Skeleton
          variant="rounded"
          animation="wave"
          sx={{ width: '100%', height: '100%', borderRadius: 2 }}
        />
      </Box>
    </Box>
  );
}

const dataVisualizationRenderer = {
  loader: DataVisualizationPanel,
  getProps: ({ artifact, common }) => ({
    data: artifact.props?.data,
    title: artifact.title,
    sourceQuery: artifact.props?.sourceQuery,
    sourceType: artifact.props?.sourceType,
    ...common,
    currentDatabase: artifact.source?.database || null,
  }),
};

const artifactRegistry = {
  'query-result': {
    loader: QueryResultArtifact,
    getProps: ({ artifact, common }) => ({
      ...artifact.props,
      ...common,
      currentDatabase: artifact.source?.database || null,
    }),
  },
  'sql-editor': {
    loader: SqlWorkspace,
    getProps: ({ artifact, common }) => ({
      ...artifact.props,
      ...common,
      title: artifact.title,
      isConnected: common.isDbConnected,
      currentDatabase: common.currentDatabase,
      isStreaming: artifact.props?.isStreaming ?? false,
    }),
  },
  visualization: dataVisualizationRenderer,
  // Compatibility for persisted artifacts and older callers that still emit "results".
  results: dataVisualizationRenderer,
  'react-flow': {
    loader: DiagramFlowRenderer,
    getProps: ({ artifact, common }) => ({
      code: artifact.props?.code || '',
      title: artifact.title,
      ...common,
    }),
  },
};

function getArtifactSignature(artifact) {
  if (!artifact) return 'empty';
  if (artifact.id || artifact.version) {
    return `${artifact.type}-${artifact.id || 'artifact'}-${artifact.version || 'v0'}`;
  }
  const props = artifact.props || {};
  if (artifact.type === 'react-flow') return `${artifact.type}-${props.code?.length || 0}`;
  if (artifact.type === 'sql-editor')
    return `${artifact.type}-${props.initialQuery || ''}-${props.initialResults?.row_count || 0}`;
  return `${artifact.type}-${props.data?.row_count || 0}-${props.data?.columns?.join('|') || ''}`;
}

class ArtifactErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <ArtifactEmptyState
          role="alert"
          ariaLive="assertive"
          icon={<ErrorIcon sx={{ fontSize: 44 }} />}
          title="Artifact failed to render"
          message={
            this.state.error?.message || 'Try opening another artifact or rerun the request.'
          }
        />
      );
    }

    return this.props.children;
  }
}

function UnknownArtifactFallback({ type }) {
  return (
    <Box sx={{ height: '100%', minHeight: 0 }}>
      <ArtifactEmptyState
        role="alert"
        ariaLive="assertive"
        icon={<ErrorIcon sx={{ fontSize: 44 }} />}
        title="Unsupported artifact"
        message={
          type ? `No renderer is registered for "${type}".` : 'No artifact renderer is registered.'
        }
      />
    </Box>
  );
}

function ArtifactRenderer({
  artifact,
  isDbConnected,
  currentDatabase,
  onClose,
  onOpenArtifact,
  onRequestClose,
  onRequestOpenArtifact,
  isFullscreen,
  onEnterFullscreen,
  onExitFullscreen,
  onToggleFullscreen,
  onNotify,
}) {
  if (!artifact) return null;

  const registryEntry = artifactRegistry[artifact.type];
  if (!registryEntry) return <UnknownArtifactFallback type={artifact.type} />;

  const Renderer = registryEntry.loader;
  const rendererProps = registryEntry.getProps({
    artifact,
    common: {
      chrome: 'standalone',
      onClose,
      onOpenArtifact,
      onRequestClose,
      onRequestOpenArtifact,
      isFullscreen,
      onEnterFullscreen,
      onExitFullscreen,
      onToggleFullscreen,
      isDbConnected,
      currentDatabase,
      onNotify,
    },
  });

  return (
    <Suspense fallback={<RendererFallback />}>
      <Renderer {...rendererProps} />
    </Suspense>
  );
}

function ArtifactLoader({
  artifact,
  outputs = [],
  onOpenArtifact,
  onClose,
  isOpen = true,
  _panelWidth: _deprecatedPanelWidth,
  fullscreen,
  onFullscreenChange,
  isDbConnected = false,
  currentDatabase = null,
  _isResizing: _deprecatedIsResizing,
  _workspaceContainerRef: _deprecatedWorkspaceContainerRef,
  onNotify,
}) {
  const theme = useTheme();
  const fullscreenRootRef = useRef(null);
  const fullscreenReturnFocusRef = useRef(null);
  const wasFullscreenRef = useRef(false);
  const [internalFullscreen, setInternalFullscreen] = useState(false);
  const isArtifactFullscreen = fullscreen ?? internalFullscreen;
  const setIsArtifactFullscreen = useCallback(
    (value) => {
      setInternalFullscreen(value);
      onFullscreenChange?.(value);
    },
    [onFullscreenChange],
  );
  const artifactSignature = useMemo(() => getArtifactSignature(artifact), [artifact]);
  const effectiveFullscreen = Boolean(isArtifactFullscreen && artifact && isOpen);

  const captureFullscreenReturnFocus = useCallback(() => {
    if (
      typeof document !== 'undefined' &&
      typeof HTMLElement !== 'undefined' &&
      document.activeElement instanceof HTMLElement
    ) {
      fullscreenReturnFocusRef.current = document.activeElement;
    }
  }, []);

  const handleEnterFullscreen = useCallback(() => {
    captureFullscreenReturnFocus();
    setIsArtifactFullscreen(true);
  }, [captureFullscreenReturnFocus, setIsArtifactFullscreen]);

  const handleExitFullscreen = useCallback(() => {
    setIsArtifactFullscreen(false);
  }, [setIsArtifactFullscreen]);

  const handleToggleFullscreen = useCallback(() => {
    if (effectiveFullscreen) {
      setIsArtifactFullscreen(false);
      return;
    }

    captureFullscreenReturnFocus();
    setIsArtifactFullscreen(true);
  }, [captureFullscreenReturnFocus, effectiveFullscreen, setIsArtifactFullscreen]);

  const handleFullscreenKeyDown = useCallback(
    (event) => {
      if (!effectiveFullscreen || event.key !== 'Escape') return;

      event.preventDefault();
      event.stopPropagation();
      handleExitFullscreen();
    },
    [effectiveFullscreen, handleExitFullscreen],
  );

  const handleRequestClose = useCallback(() => {
    setIsArtifactFullscreen(false);
    onClose?.();
  }, [onClose, setIsArtifactFullscreen]);

  const handleRequestOpenArtifact = useCallback(
    (nextArtifact, options = {}) => {
      onOpenArtifact?.(
        nextArtifact.type === 'sql-editor' && nextArtifact.props?.initialResults
          ? { ...nextArtifact, id: `${artifact.id}:sql`, source: artifact?.source ?? null }
          : nextArtifact,
      );
      if (options.preserveFullscreen || isArtifactFullscreen) {
        if (!isArtifactFullscreen) captureFullscreenReturnFocus();
        setIsArtifactFullscreen(true);
      }
    },
    [
      artifact,
      captureFullscreenReturnFocus,
      isArtifactFullscreen,
      onOpenArtifact,
      setIsArtifactFullscreen,
    ],
  );

  useEffect(() => {
    let animationFrameId;

    if (effectiveFullscreen) {
      wasFullscreenRef.current = true;
      animationFrameId = window.requestAnimationFrame(() => {
        fullscreenRootRef.current?.focus();
      });
    } else if (wasFullscreenRef.current) {
      wasFullscreenRef.current = false;
      const returnFocusTarget = fullscreenReturnFocusRef.current;
      fullscreenReturnFocusRef.current = null;
      animationFrameId = window.requestAnimationFrame(() => {
        if (returnFocusTarget?.isConnected) returnFocusTarget.focus();
      });
    }

    return () => {
      if (animationFrameId !== undefined) window.cancelAnimationFrame(animationFrameId);
    };
  }, [effectiveFullscreen]);

  // When the panel is closed, render nothing — AppShell animates the column
  // width to 0 (so the layout still transitions smoothly).
  if (!isOpen) return null;

  // The shell expands this same in-flow renderer to fill the space beside navigation.
  // Keeping its parent stable preserves editor tabs, cursor and viewer configuration.
  return (
    <Box
      ref={fullscreenRootRef}
      role="region"
      aria-label={effectiveFullscreen ? 'Fullscreen artifact' : 'Artifact panel'}
      tabIndex={-1}
      onKeyDown={handleFullscreenKeyDown}
      sx={{
        position: 'relative',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxSizing: 'border-box',
        // Apply the sunken surface only in fullscreen so the in-flow state
        // inherits the column's surface (painted by AppShell).
        ...(effectiveFullscreen ? getAppSunkenSurfaceSx(theme) : {}),
      }}
    >
      <ConversationOutputs
        outputs={outputs}
        selectedArtifact={artifact}
        onSelect={onOpenArtifact}
      />
      <Box
        key={artifactSignature}
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <ArtifactErrorBoundary resetKey={artifactSignature}>
          <ArtifactRenderer
            artifact={artifact}
            isDbConnected={isDbConnected}
            currentDatabase={currentDatabase}
            onClose={handleRequestClose}
            onOpenArtifact={handleRequestOpenArtifact}
            onRequestClose={handleRequestClose}
            onRequestOpenArtifact={handleRequestOpenArtifact}
            isFullscreen={effectiveFullscreen}
            onEnterFullscreen={handleEnterFullscreen}
            onExitFullscreen={handleExitFullscreen}
            onToggleFullscreen={handleToggleFullscreen}
            onNotify={onNotify}
          />
        </ArtifactErrorBoundary>
      </Box>
    </Box>
  );
}

export default memo(ArtifactLoader);
