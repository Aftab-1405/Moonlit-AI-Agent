import { Button } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { AnalyticsIcon } from '@/components/icons';
import {
  ArtifactCanvasPanel,
  ArtifactEmptyState,
  ArtifactLoadingState,
  ArtifactPanelOverlay,
} from '@/features/sidebar-right/artifact-loader';
import { copyToClipboard } from '@/utils/clipboard';
import { downloadFile } from '@/utils/downloadFile';
import { buildPerspectiveData, resultExportMetadata } from '@/utils/queryResult';
import { clearAnalysisConfig, loadAnalysisConfig, saveAnalysisConfig } from './perspectiveAnalysis';
import { createPerspectiveSession } from './perspectiveSession';
import { createPerspectiveWorker } from './perspectiveWorker';
import { applyPerspectiveFocusStyles } from './perspectiveFocus';
import '@perspective-dev/viewer/themes';

const PerspectiveDashboard = forwardRef(function PerspectiveDashboard(
  { data, storageKey, onReadyChange, onSelectionChange, onMetrics, onNotices, onNotify },
  ref,
) {
  const theme = useTheme();
  const host = useRef(null);
  const sessionRef = useRef(null);
  const readyRef = useRef(false);
  const callbacks = useRef({ onReadyChange, onSelectionChange, onMetrics, onNotices, onNotify });
  const currentKey = useRef(storageKey);
  useLayoutEffect(() => {
    callbacks.current = { onReadyChange, onSelectionChange, onMetrics, onNotices, onNotify };
    currentKey.current = storageKey;
  }, [onReadyChange, onSelectionChange, onMetrics, onNotices, onNotify, storageKey]);
  const saveTimer = useRef(null);
  const loadedKey = useRef(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'loading', error: null });
  const perspectiveTheme = theme.palette.integration.perspectiveTheme;
  const latestTheme = useRef(perspectiveTheme);
  useLayoutEffect(() => {
    latestTheme.current = perspectiveTheme;
  }, [perspectiveTheme]);
  useEffect(() => {
    if (!readyRef.current) return;
    sessionRef.current
      ?.action((viewer) => viewer.restore({ theme: perspectiveTheme }))
      .catch((error) =>
        callbacks.current.onNotify?.(`Could not apply chart theme: ${error.message}`, 'warning'),
      );
  }, [perspectiveTheme]);

  useImperativeHandle(ref, () => {
    const action = (operation) => {
      if (!sessionRef.current) return Promise.reject(new Error('Analysis is not ready.'));
      return sessionRef.current.action(operation);
    };
    const save = () =>
      action(async (viewer) => {
        if (!storageKey)
          throw new Error(
            'This result has no authenticated source identity. Rerun it before saving an analysis.',
          );
        if (!saveAnalysisConfig(storageKey, await viewer.save()))
          throw new Error('Analysis could not be saved in this browser.');
        return true;
      });
    const exportView = (format) =>
      action(async (viewer) => {
        const metadata = resultExportMetadata(data, await viewer.save());
        const filename = `query-${metadata.result_metadata?.execution_id || 'legacy'}-${metadata.result_metadata?.completeness || 'unknown'}-${format === 'csv' ? 'view' : 'visualization'}`;
        if (format === 'csv') {
          // getView() borrows the viewer-owned view; the session owns its cleanup.
          const view = await viewer.getView();
          downloadFile(await view.to_csv(), `${filename}.csv`, 'text/csv;charset=utf-8');
        } else {
          const blob = await viewer.export('plugin');
          if (!(blob instanceof Blob))
            throw new Error('The visualization did not produce an export file.');
          downloadFile(blob, `${filename}.${blob.type === 'image/png' ? 'png' : 'txt'}`, blob.type);
        }
        downloadFile(
          JSON.stringify(metadata, null, 2),
          `${filename}.metadata.json`,
          'application/json',
        );
      });
    return {
      save,
      copy: () =>
        action(async (viewer) => {
          const metadata = resultExportMetadata(data, await viewer.save());
          const view = await viewer.getView();
          const csv = await view.to_csv();
          if (!(await copyToClipboard(JSON.stringify({ ...metadata, csv }, null, 2))))
            throw new Error('Current view could not be copied.');
          return true;
        }),
      download: () => exportView('csv'),
      exportVisualization: () => exportView('plugin'),
      applyConfig: (config) => action((viewer) => viewer.restore(config)),
      reset: () =>
        action(async (viewer) => {
          if (storageKey && !clearAnalysisConfig(storageKey))
            throw new Error('Saved analysis could not be cleared.');
          await viewer.reset(true);
          await viewer.restore({ plugin: 'Datagrid', theme: perspectiveTheme });
        }),
    };
  }, [data, perspectiveTheme, storageKey]);

  useEffect(() => {
    // Each mount owns its own custom element, including React StrictMode replay.
    const viewer = document.createElement('perspective-viewer');
    host.current.appendChild(viewer);
    const session = createPerspectiveSession({
      viewer,
      createClient: createPerspectiveWorker,
      onMetrics: (metrics) => callbacks.current.onMetrics?.(metrics),
      onFatalError: (error) => {
        readyRef.current = false;
        callbacks.current.onReadyChange?.(false);
        setState((previous) => ({ ...previous, status: 'error', error: error.message }));
      },
    });
    sessionRef.current = session;
    loadedKey.current = null;
    const onConfig = () => {
      applyPerspectiveFocusStyles(viewer);
      clearTimeout(saveTimer.current);
      if (!readyRef.current || !currentKey.current) return;
      const key = currentKey.current;
      saveTimer.current = setTimeout(() => {
        if (!readyRef.current || key !== currentKey.current) return;
        session
          .action(async (element) => {
            const config = await element.save();
            if (!readyRef.current || key !== currentKey.current) return;
            if (!saveAnalysisConfig(key, config))
              callbacks.current.onNotify?.('Automatic analysis saving failed.', 'warning');
          })
          .catch(() => {}); // Closing/replacing a result invalidates a pending autosave.
      }, 300);
    };
    const onClick = (event) => {
      if (readyRef.current) callbacks.current.onSelectionChange?.(event.detail || null);
    };
    viewer.addEventListener('perspective-config-update', onConfig);
    viewer.addEventListener('perspective-click', onClick);
    let frame;
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
              if (readyRef.current) session.action((element) => element.resize()).catch(() => {});
            });
          });
    observer?.observe(viewer);
    return () => {
      readyRef.current = false;
      clearTimeout(saveTimer.current);
      observer?.disconnect();
      cancelAnimationFrame(frame);
      viewer.removeEventListener('perspective-config-update', onConfig);
      viewer.removeEventListener('perspective-click', onClick);
      session.dispose();
      viewer.remove();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    let cancelled = false;
    readyRef.current = false;
    callbacks.current.onReadyChange?.(false);
    callbacks.current.onSelectionChange?.(null);
    clearTimeout(saveTimer.current);
    const started = performance.now();
    const session = sessionRef.current;
    async function load() {
      try {
        const built = buildPerspectiveData(data);
        callbacks.current.onMetrics?.({ transformation_ms: performance.now() - started });
        callbacks.current.onNotices?.(built.notices);
        const config = loadedKey.current !== storageKey ? loadAnalysisConfig(storageKey) : null;
        const done = await session.load({
          ...built,
          key: storageKey,
          config,
          fallbackConfig: { plugin: 'Datagrid', theme: latestTheme.current },
          onInvalidConfig: () => {
            clearAnalysisConfig(storageKey);
            callbacks.current.onNotify?.('Incompatible saved settings were reset.', 'warning');
          },
        });
        if (!cancelled && done) {
          // Pinned viewer 4.5.1 has no export interception API. Keep exports in
          // Moonlit's accessible toolbar, where scope and provenance accompany
          // every file. Leave theme, reset and all analysis controls intact.
          const viewer = host.current?.querySelector('perspective-viewer');
          if (viewer?.shadowRoot && !viewer.shadowRoot.querySelector('[data-moonlit-exports]')) {
            const style = document.createElement('style');
            style.dataset.moonlitExports = '';
            style.textContent =
              '#menu-bar > .hover-target:has(#export), #menu-bar > .hover-target:has(#copy) { display: none; }';
            viewer.shadowRoot.appendChild(style);
          }
          await session.action((element) => element.restore({ theme: latestTheme.current }));
          if (viewer) applyPerspectiveFocusStyles(viewer);
          loadedKey.current = storageKey;
          readyRef.current = true;
          setState({ status: 'ready', error: null, data, storageKey, attempt });
          callbacks.current.onReadyChange?.(true);
          callbacks.current.onMetrics?.({ visualization_usable_ms: performance.now() - started });
        }
      } catch (error) {
        await session.dispose();
        if (!cancelled)
          setState({
            status: 'error',
            error: error.message || 'Unable to load this result.',
            data,
            storageKey,
            attempt,
          });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [data, storageKey, attempt]);

  const status =
    state.data === data && state.storageKey === storageKey && state.attempt === attempt
      ? state.status
      : 'loading';
  return (
    <ArtifactCanvasPanel
      sx={{
        '& perspective-viewer': { display: 'block', width: '100%', height: '100%', minHeight: 0 },
        '--psp-font-family': theme.typography.fontFamily,
        '--psp-datagrid--font-size': '13px',
        '--psp-datagrid-pos-color': theme.palette.success.main,
        '--psp-datagrid-neg-color': theme.palette.error.main,
      }}
    >
      <div ref={host} style={{ height: '100%', width: '100%', minHeight: 0 }} />
      {status === 'loading' ? (
        <ArtifactPanelOverlay>
          <ArtifactLoadingState
            title={`Loading ${(data?.rows?.length || 0).toLocaleString()} rows`}
          />
        </ArtifactPanelOverlay>
      ) : null}
      {status === 'error' ? (
        <ArtifactPanelOverlay>
          <ArtifactEmptyState
            role="alert"
            ariaLive="assertive"
            icon={<AnalyticsIcon />}
            title="Unable to load analytics workspace"
            message={state.error}
          />
          <Button onClick={() => setAttempt((value) => value + 1)}>Retry analysis</Button>
        </ArtifactPanelOverlay>
      ) : null}
    </ArtifactCanvasPanel>
  );
});
export default memo(PerspectiveDashboard);
