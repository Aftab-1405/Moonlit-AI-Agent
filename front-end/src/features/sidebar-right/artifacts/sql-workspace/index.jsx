/**
 * SqlWorkspace - Production SQL Editor Workspace
 *
 * A professional SQL IDE-like interface with:
 * - Schema sidebar with database explorer
 * - Multi-tab query editor with Monaco
 * - Integrated result and visualization panels
 * - Resizable panels and clean workspace layout
 */

import { Box, Collapse } from '@mui/material';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArtifactShell } from '@/features/sidebar-right/artifact-loader';
import QueryWorkspace from '@/features/sidebar-right/artifacts/sql-workspace/QueryWorkspace';
import SchemaSidebar from '@/features/sidebar-right/artifacts/sql-workspace/SchemaSidebar';
import StatusBar from '@/features/sidebar-right/artifacts/sql-workspace/StatusBar';
import logger from '@/utils/logger';

const SCHEMA_PANEL_MOTION = {
  duration: 220,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
};

let cachedTabs = null;
let cachedActiveTabId = null;

function SqlWorkspace({
  _title,
  initialQuery = '',
  initialResults = null,
  isConnected = false,
  currentDatabase = null,
  chrome = 'standalone',
  onClose,
  onRequestClose,
  onOpenArtifact,
  isFullscreen = false,
  onEnterFullscreen,
  onExitFullscreen,
  onToggleFullscreen,
  workspaceContainerRef,
  isStreaming = false,
}) {
  // Panel state
  const [schemaSidebarOpen, setSchemaSidebarOpen] = useState(true);
  const [schemaSidebarWidth, setSchemaSidebarWidth] = useState(260);
  const errorDismissRef = useRef(null);

  // Query state
  const [activeTabId, setActiveTabId] = useState(() => cachedActiveTabId || 'query-1');
  const [tabs, setTabs] = useState(() => {
    if (cachedTabs && cachedTabs.length > 0) {
      return cachedTabs;
    }
    return [
      {
        id: 'query-1',
        title: 'Query 1',
        query: initialQuery,
        isDirty: false,
        results: initialResults,
        error: null,
      },
    ];
  });

  // Sync state with cache
  useEffect(() => {
    cachedTabs = tabs;
    cachedActiveTabId = activeTabId;
  }, [tabs, activeTabId]);

  // Handle incoming query/results updates
  useEffect(() => {
    if (initialQuery) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTabs((prev) => {
        const exists = prev.some((t) => t.query === initialQuery);
        if (exists) {
          const existingTab = prev.find((t) => t.query === initialQuery);
          if (existingTab) setActiveTabId(existingTab.id);
          return prev;
        }
        const newId = `query-${Date.now()}`;
        const newTab = {
          id: newId,
          title: `Query ${prev.length + 1}`,
          query: initialQuery,
          isDirty: false,
          results: initialResults,
          error: null,
        };
        setActiveTabId(newId);
        return [...prev, newTab];
      });
    }
  }, [initialQuery, initialResults]);

  // Resizing state
  const [resizingSidebar, setResizingSidebar] = useState(false);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) || tabs[0],
    [tabs, activeTabId],
  );

  // Tab management
  const handleAddTab = useCallback(() => {
    const newId = `query-${Date.now()}`;
    setTabs((prev) => [
      ...prev,
      {
        id: newId,
        title: `Query ${prev.length + 1}`,
        query: '',
        isDirty: false,
        results: null,
        error: null,
      },
    ]);
    setActiveTabId(newId);
  }, []);

  const handleCloseTab = useCallback(
    (tabId) => {
      setTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== tabId);
        if (filtered.length === 0) {
          return [
            {
              id: 'query-1',
              title: 'Query 1',
              query: '',
              isDirty: false,
              results: null,
              error: null,
            },
          ];
        }
        return filtered;
      });
      setActiveTabId((prev) => {
        if (prev === tabId) {
          const idx = tabs.findIndex((t) => t.id === tabId);
          const nextTab = tabs[idx + 1] || tabs[idx - 1] || tabs[0];
          return nextTab?.id || 'query-1';
        }
        return prev;
      });
    },
    [tabs],
  );

  const handleUpdateTab = useCallback((tabId, updates) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, ...updates } : t)));
  }, []);

  const handleClearError = useCallback(() => {
    if (errorDismissRef.current) clearTimeout(errorDismissRef.current);
    handleUpdateTab(activeTabId, { error: null });
  }, [activeTabId, handleUpdateTab]);

  const handleQueryChange = useCallback(
    (value) => {
      handleUpdateTab(activeTabId, { query: value, isDirty: true, error: null });
    },
    [activeTabId, handleUpdateTab],
  );
  const handleQueryExecute = useCallback(
    (results, error) => {
      handleUpdateTab(activeTabId, { results, error, isDirty: false });

      if (results) {
        if (onOpenArtifact) {
          // Open results in the Perspective workspace. It defaults to Datagrid and
          // lets the user switch to visual analysis without another artifact hop.
          onOpenArtifact({
            type: 'visualization',
            title: 'Query Results',
            props: {
              data: results,
              sourceQuery: activeTab?.query,
              sourceType: 'sql-editor',
            },
          });
        } else {
          // Fallback: log warning if onOpenArtifact is not provided
          logger.warn('SqlWorkspace: onOpenArtifact prop is required to display query results');
        }
      }

      if (error) {
        logger.error('Query execution error:', error);
        // Auto-dismiss the inline error alert after 5 s
        if (errorDismissRef.current) clearTimeout(errorDismissRef.current);
        errorDismissRef.current = setTimeout(() => {
          handleClearError();
        }, 5000);
      }
    },
    [activeTabId, activeTab?.query, handleUpdateTab, onOpenArtifact, handleClearError],
  );

  // Cleanup timer on unmount
  useEffect(
    () => () => {
      if (errorDismissRef.current) clearTimeout(errorDismissRef.current);
    },
    [],
  );

  // Ref that StatusBar fills with its handleRunQuery so Monaco Ctrl+Enter
  // calls the exact same execution path as clicking the Run button.
  const runQueryRef = useRef(null);
  const handleRunQueryViaRef = useCallback(() => {
    runQueryRef.current?.();
  }, []);
  const handleRegisterRunQuery = useCallback((fn) => {
    runQueryRef.current = fn;
  }, []);

  // Panel resizing
  const handleSidebarResizeStart = useCallback(
    (e) => {
      setResizingSidebar(true);
      setResizeStartX(e.clientX);
      setResizeStartWidth(schemaSidebarWidth);
    },
    [schemaSidebarWidth],
  );

  const handleSidebarResize = useCallback(
    (e) => {
      if (!resizingSidebar) return;
      e.preventDefault();
      const deltaX = e.clientX - resizeStartX;
      const newWidth = Math.max(200, Math.min(500, resizeStartWidth + deltaX));
      setSchemaSidebarWidth(newWidth);
    },
    [resizingSidebar, resizeStartX, resizeStartWidth],
  );

  const handleMouseUp = useCallback(() => {
    setResizingSidebar(false);
  }, []);

  const handleMouseMove = useCallback(
    (e) => {
      if (resizingSidebar) {
        handleSidebarResize(e);
      }
    },
    [resizingSidebar, handleSidebarResize],
  );

  // Workspace layout
  const workspaceStyles = useMemo(
    () => ({
      display: 'flex',
      height: '100%',
      minHeight: 0,
      overflow: 'hidden',
      contain: 'layout paint style',
      gap: 0.75,
    }),
    [],
  );

  const workspaceContent = (
    <Box
      data-workspace-container
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        bgcolor: 'background.default',
        p: 0.75,
        pb: 0.25,
        gap: 0.25,
        cursor: resizingSidebar ? 'col-resize' : 'default',
        userSelect: resizingSidebar ? 'none' : 'auto',
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Main workspace grid */}
      <Box sx={workspaceStyles}>
        {/* Schema Sidebar */}
        <Collapse
          orientation="horizontal"
          in={schemaSidebarOpen}
          timeout={resizingSidebar ? 0 : SCHEMA_PANEL_MOTION.duration}
          collapsedSize={0}
          easing={SCHEMA_PANEL_MOTION.easing}
          mountOnEnter={false}
          unmountOnExit={false}
          sx={{
            flexShrink: 0,
            minHeight: 0,
            height: '100%',
            willChange: resizingSidebar ? 'auto' : 'width',
            contain: 'layout paint style',
            '& .MuiCollapse-wrapper': {
              height: '100%',
              width: schemaSidebarWidth,
            },
            '& .MuiCollapse-wrapperInner': {
              height: '100%',
              width: schemaSidebarWidth,
            },
          }}
        >
          <SchemaSidebar
            width={schemaSidebarWidth}
            isConnected={isConnected}
            currentDatabase={currentDatabase}
            onClose={() => setSchemaSidebarOpen(false)}
            onResizeStart={handleSidebarResizeStart}
            resizing={resizingSidebar}
          />
        </Collapse>

        {/* Query Workspace */}
        <QueryWorkspace
          tabs={tabs}
          activeTabId={activeTabId}
          activeTab={activeTab}
          isConnected={isConnected}
          currentDatabase={currentDatabase}
          isStreaming={isStreaming}
          onTabChange={setActiveTabId}
          onTabAdd={handleAddTab}
          onTabClose={handleCloseTab}
          onQueryChange={handleQueryChange}
          onQueryExecute={handleQueryExecute}
          onRunQuery={handleRunQueryViaRef}
          onToggleSidebar={() => setSchemaSidebarOpen((v) => !v)}
          schemaSidebarOpen={schemaSidebarOpen}
          onClearError={handleClearError}
        />
      </Box>

      {/* Status Bar */}
      <StatusBar
        isConnected={isConnected}
        currentDatabase={currentDatabase}
        activeTab={activeTab}
        onQueryExecute={handleQueryExecute}
        onRegisterRunQuery={handleRegisterRunQuery}
      />
    </Box>
  );

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
        title="Editor"
        chrome={chrome}
        onClose={onClose}
        onRequestClose={onRequestClose}
        isFullscreen={isFullscreen}
        onEnterFullscreen={onEnterFullscreen}
        onExitFullscreen={onExitFullscreen}
        onToggleFullscreen={onToggleFullscreen}
        workspaceContainerRef={workspaceContainerRef}
      >
        {workspaceContent}
      </ArtifactShell>
    </Box>
  );
}

export default memo(SqlWorkspace);
