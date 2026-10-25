/**
 * QueryWorkspace - Main query editor area
 *
 * Contains query tabs and the CodeMirror SQL editor.
 */

import { Box, Skeleton } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { lazy, memo, Suspense } from 'react';
import { ArtifactUtilityPanel } from '@/features/sidebar-right/artifact-loader';
import QueryTabs from '@/features/sidebar-right/artifacts/sql-workspace/QueryTabs';

const SqlEditorSurface = lazy(
  () => import('@/features/sidebar-right/artifacts/sql-workspace/SqlEditorSurface'),
);

function EditorFallback() {
  const theme = useTheme();
  const skeletonColor = theme.palette.layer.soft;

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: '52px minmax(0, 1fr)',
        overflow: 'hidden',
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          py: 1.75,
          px: 1,
        }}
      >
        {[0, 1, 2, 3, 4, 5].map((line) => (
          <Skeleton
            key={line}
            variant="text"
            width={line < 3 ? 18 : 24}
            height={18}
            sx={{ mx: 'auto', bgcolor: skeletonColor }}
          />
        ))}
      </Box>
      <Box sx={{ py: 1.75, px: 1.75 }}>
        {[0, 1, 2, 3, 4, 5].map((line) => (
          <Skeleton
            key={line}
            variant="text"
            width={`${74 - (line % 3) * 14}%`}
            height={18}
            sx={{ bgcolor: skeletonColor }}
          />
        ))}
      </Box>
    </Box>
  );
}

function QueryWorkspace({
  tabs,
  activeTabId,
  activeTab,
  isConnected,
  currentDatabase: _currentDatabase,
  onTabChange,
  onTabAdd,
  onTabClose,
  onQueryChange,
  onQueryExecute,
  onRunQuery,
  onToggleSidebar,
  schemaSidebarOpen,
  onClearError,
  isStreaming = false,
}) {
  return (
    <ArtifactUtilityPanel
      id={`sql-query-panel-${activeTabId}`}
      role="tabpanel"
      aria-labelledby={`sql-query-tab-${activeTabId}`}
      sx={{ flex: '1 1 0' }}
    >
      {/* Query Tabs */}
      <QueryTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onTabChange={onTabChange}
        onTabAdd={onTabAdd}
        onTabClose={onTabClose}
        onToggleSidebar={onToggleSidebar}
        schemaSidebarOpen={schemaSidebarOpen}
      />

      {/* SQL Editor (lazy — CodeMirror loaded on demand) */}
      <Suspense fallback={<EditorFallback />}>
        <SqlEditorSurface
          query={activeTab?.query || ''}
          error={activeTab?.error}
          isConnected={isConnected}
          isStreaming={isStreaming}
          onQueryChange={onQueryChange}
          onQueryExecute={onQueryExecute}
          onRunQuery={onRunQuery}
          onClearError={onClearError}
        />
      </Suspense>
    </ArtifactUtilityPanel>
  );
}

export default memo(QueryWorkspace);
