import { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Chip,
  CircularProgress,
  Tab,
  Tabs,
} from '@mui/material';
import { styled, useTheme as useMuiTheme, alpha, keyframes } from '@mui/material/styles';
import { useTheme as useAppTheme } from '../contexts/ThemeContext';
import Editor from '@monaco-editor/react';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import SQLResultsTable from './SQLResultsTable';
import ChartVisualization from './ChartVisualization';

// Centralized API layer
import { runQuery } from '../api';

// ============================================================================
// STATIC DEFINITIONS - Outside component to prevent recreation
// ============================================================================

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

// Static Monaco editor options
const MONACO_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 13,
  fontFamily: '"JetBrains Mono", "Fira Code", "Monaco", "Consolas", monospace',
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  automaticLayout: true,
  wordWrap: 'on',
  padding: { top: 16, bottom: 16 },
  renderLineHighlight: 'line',
  lineHeight: 22,
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
  suggest: {
    showKeywords: true,
  },
};

// Glassmorphism styles helper
const getGlassmorphismStyles = (theme, isDark) => ({
  background: isDark
    ? alpha(theme.palette.background.paper, 0.05)
    : theme.palette.background.default,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderLeft: '1px solid',
  borderColor: theme.palette.divider,
});

const openedMixin = (theme, width, isDark) => ({
  width: typeof width === 'number' ? width : width,
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  overflowX: 'hidden',
  ...getGlassmorphismStyles(theme, isDark),
});

const closedMixin = (theme, isDark) => ({
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  overflowX: 'hidden',
  width: 0,
  ...getGlassmorphismStyles(theme, isDark),
});

const StyledPanel = styled(Box, {
  shouldForwardProp: (prop) => !['open', 'panelWidth', 'isDark'].includes(prop),
})(({ theme, open, panelWidth, isDark }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  flexShrink: 0,
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
  ...(open && openedMixin(theme, panelWidth, isDark)),
  ...(!open && closedMixin(theme, isDark)),
}));

// ============================================================================
// EXTRACTED COMPONENTS - Memoized and outside main component
// ============================================================================

const EmptyState = memo(function EmptyState({ icon: Icon, title, subtitle, textColor }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'text.secondary',
        gap: 2,
        animation: `${fadeIn} 0.3s ease-out`,
      }}
    >
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: alpha(textColor, 0.03),
          border: '2px dashed',
          borderColor: alpha(textColor, 0.1),
        }}
      >
        <Icon sx={{ fontSize: 32, opacity: 0.3 }} />
      </Box>
      <Typography variant="body1" sx={{ opacity: 0.6, fontWeight: 500 }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ opacity: 0.4, textAlign: 'center', px: 4 }}>
        {subtitle}
      </Typography>
    </Box>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function SQLEditorCanvas({
  onClose,
  initialQuery = '',
  initialResults = null,
  isConnected = false,
  currentDatabase = null,
  isOpen = true,
  panelWidth = 450,
  fullscreen = false,
}) {
  const theme = useMuiTheme();
  const { settings } = useAppTheme();
  const isDark = theme.palette.mode === 'dark';

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState(initialResults);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const editorRef = useRef(null);
  const copyTimeoutRef = useRef(null);

  // Memoized values
  const textColor = useMemo(() => theme.palette.text.primary, [theme.palette.text.primary]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  // Update query when component mounts with new data
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  useEffect(() => {
    if (initialResults) {
      setResults(initialResults);
      setError(null);
      setActiveTab(1);
    }
  }, [initialResults]);

  const handleEditorDidMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    editor.focus();

    if (theme.palette.mode === 'dark') {
      monaco.editor.defineTheme('transparent-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#00000000',
          'editor.lineHighlightBackground': '#ffffff08',
          'editorGutter.background': '#00000000',
        }
      });
      monaco.editor.setTheme('transparent-dark');
    }
  }, [theme.palette.mode]);

  const handleRunQuery = useCallback(async () => {
    if (!query.trim() || isRunning) return;

    if (!isConnected) {
      setError('Please connect to a database first');
      return;
    }

    setIsRunning(true);
    setError(null);

    try {
      const maxRows = settings.maxRows ?? 1000;
      const queryTimeout = settings.queryTimeout ?? 30;

      const data = await runQuery({ sql: query, maxRows, timeout: queryTimeout });

      if (data.status === 'success') {
        const columns = data.result?.fields || [];
        const rows = data.result?.rows || [];

        const transformedResult = rows.map(row => {
          const obj = {};
          columns.forEach((col, idx) => {
            obj[col] = row[idx];
          });
          return obj;
        });

        setResults({
          columns,
          result: transformedResult,
          row_count: data.row_count,
          total_rows: data.total_rows,
          truncated: data.truncated,
          execution_time: data.execution_time_ms ? data.execution_time_ms / 1000 : null,
        });
        setError(null);
        setActiveTab(1);
      } else {
        setError(data.message || 'Query execution failed');
        setResults(null);
      }
    } catch (err) {
      setError('Failed to execute query: ' + err.message);
      setResults(null);
    } finally {
      setIsRunning(false);
    }
  }, [query, isConnected, isRunning, settings.maxRows, settings.queryTimeout]);

  const handleClear = useCallback(() => {
    setQuery('');
    setResults(null);
    setError(null);
    setActiveTab(0);
    editorRef.current?.focus();
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(query);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }, [query]);

  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRunQuery();
    }
  }, [handleRunQuery]);

  const handleTabChange = useCallback((event, newValue) => {
    setActiveTab(newValue);
  }, []);

  const handleQueryChange = useCallback((value) => {
    setQuery(value || '');
  }, []);

  const handleCloseResults = useCallback(() => {
    setResults(null);
  }, []);

  // Memoized styles
  const headerStyles = useMemo(() => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    px: 2,
    py: 1.25,
    borderBottom: '1px solid',
    borderColor: isDark ? alpha('#fff', 0.06) : alpha('#000', 0.06),
    backgroundColor: 'transparent',
    flexShrink: 0,
  }), [isDark]);

  const tabsStyles = useMemo(() => ({
    minHeight: 44,
    '& .MuiTabs-indicator': {
      height: 2,
      borderRadius: '2px 2px 0 0',
      backgroundColor: isDark ? '#FFFFFF' : '#000000',
    },
    '& .MuiTab-root': {
      minHeight: 44,
      minWidth: 100,
      px: 2.5,
      py: 0,
      fontWeight: 500,
      textTransform: 'none',
      color: 'text.secondary',
      transition: 'transform 0.2s ease',
      '&.Mui-selected': { color: 'text.primary' },
      '&:hover': {
        color: 'text.primary',
        backgroundColor: isDark ? alpha('#fff', 0.05) : alpha('#000', 0.04),
      },
    },
  }), [isDark]);

  const actionBarStyles = useMemo(() => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    px: 2,
    py: 1.5,
    borderTop: '1px solid',
    borderColor: alpha(theme.palette.divider, isDark ? 0.1 : 0.15),
    background: isDark
      ? alpha(theme.palette.background.paper, 0.05)
      : alpha(theme.palette.background.paper, 0.8),
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    flexShrink: 0,
  }), [isDark, theme]);

  const runButtonStyles = useMemo(() => ({
    width: 36,
    height: 36,
    color: isRunning ? 'text.secondary' : 'text.primary',
    backgroundColor: alpha(textColor, isDark ? 0.1 : 0.08),
    border: '1px solid',
    borderColor: alpha(textColor, isDark ? 0.15 : 0.12),
    '&:hover': {
      backgroundColor: alpha(textColor, isDark ? 0.15 : 0.12),
    },
    '&.Mui-disabled': {
      color: 'text.disabled',
      backgroundColor: 'transparent',
      borderColor: 'transparent',
    },
  }), [isDark, isRunning, textColor]);

  // Memoized tab content renderer
  const editorTabContent = useMemo(() => (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'transparent',
      }}
    >
      {error && (
        <Box
          sx={{
            px: 2.5,
            py: 1.5,
            backgroundColor: alpha(theme.palette.error.main, isDark ? 0.15 : 0.08),
            borderBottom: '1px solid',
            borderColor: alpha(theme.palette.error.main, 0.3),
            animation: `${fadeIn} 0.2s ease-out`,
          }}
        >
          <Typography variant="body2" color="error.main" sx={{ fontFamily: 'monospace' }}>
            ⚠ {error}
          </Typography>
        </Box>
      )}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          backgroundColor: 'transparent',
          '& .monaco-editor, & .monaco-editor-background, & .monaco-editor .margin': {
            backgroundColor: 'transparent !important',
          },
        }}
        onKeyDown={handleKeyDown}
      >
        <Editor
          height="100%"
          language="sql"
          theme={isDark ? 'vs-dark' : 'light'}
          value={query}
          onChange={handleQueryChange}
          onMount={handleEditorDidMount}
          options={MONACO_OPTIONS}
        />
      </Box>
    </Box>
  ), [error, isDark, query, handleKeyDown, handleQueryChange, handleEditorDidMount, theme]);

  const resultsTabContent = useMemo(() => (
    <Box sx={{ height: '100%', overflow: 'auto', backgroundColor: 'transparent' }}>
      {results ? (
        <SQLResultsTable data={results} onClose={handleCloseResults} embedded />
      ) : (
        <EmptyState
          icon={TableChartOutlinedIcon}
          title="No results yet"
          subtitle="Run a query to see results here"
          textColor={textColor}
        />
      )}
    </Box>
  ), [results, handleCloseResults, textColor]);

  const chartTabContent = useMemo(() => (
    <Box sx={{ height: '100%', overflow: 'auto', backgroundColor: 'transparent' }}>
      {results ? (
        <ChartVisualization data={results} embedded />
      ) : (
        <EmptyState
          icon={BarChartRoundedIcon}
          title="No data to visualize"
          subtitle="Run a query to create charts"
          textColor={textColor}
        />
      )}
    </Box>
  ), [results, textColor]);

  // Tab content based on active tab
  const tabContent = activeTab === 0 ? editorTabContent : activeTab === 1 ? resultsTabContent : chartTabContent;

  // Header component (shared between fullscreen and panel)
  const headerComponent = (
    <Box sx={headerStyles}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDark ? alpha('#fff', 0.08) : alpha('#000', 0.06),
            border: '1px solid',
            borderColor: isDark ? alpha('#fff', 0.12) : alpha('#000', 0.1),
          }}
        >
          <TerminalRoundedIcon sx={{ fontSize: 18, color: 'text.primary' }} />
        </Box>
        <Typography variant="subtitle2" fontWeight={600}>
          SQL Editor
        </Typography>
        {currentDatabase && (
          <Chip
            size="small"
            icon={<StorageRoundedIcon sx={{ fontSize: 12 }} />}
            label={currentDatabase}
            sx={{
              height: 22,
              backgroundColor: isDark ? alpha('#fff', 0.08) : alpha('#000', 0.06),
              color: 'text.primary',
              '& .MuiChip-icon': { ml: 0.5, color: 'inherit' },
            }}
          />
        )}
      </Box>
      <Tooltip title="Close">
        <IconButton
          size="small"
          onClick={onClose}
          sx={{
            color: 'text.secondary',
            '&:hover': {
              backgroundColor: isDark ? alpha('#fff', 0.08) : alpha('#000', 0.06),
            },
          }}
        >
          <CloseRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );

  // Tab bar component (shared)
  const tabBarComponent = (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        borderBottom: '1px solid',
        borderColor: isDark ? alpha('#fff', 0.05) : alpha('#000', 0.05),
        backgroundColor: 'transparent',
        flexShrink: 0,
      }}
    >
      <Tabs value={activeTab} onChange={handleTabChange} centered sx={tabsStyles}>
        <Tab icon={<TerminalRoundedIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Editor" />
        <Tab
          icon={<TableChartOutlinedIcon sx={{ fontSize: 16 }} />}
          iconPosition="start"
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              Results
              {results && (
                <Chip
                  size="small"
                  label={results.row_count}
                  sx={{
                    height: 18,
                    fontWeight: 600,
                    backgroundColor: isDark ? alpha('#fff', 0.12) : alpha('#000', 0.08),
                    color: 'text.primary',
                  }}
                />
              )}
            </Box>
          }
        />
        <Tab
          icon={<BarChartRoundedIcon sx={{ fontSize: 16 }} />}
          iconPosition="start"
          label="Chart"
          disabled={!results}
        />
      </Tabs>
    </Box>
  );

  // Action bar component (shared)
  const actionBarComponent = (
    <Box sx={actionBarStyles}>
      <Tooltip title={isRunning ? 'Running...' : 'Run Query (Ctrl+Enter)'}>
        <span>
          <IconButton
            size="small"
            onClick={handleRunQuery}
            disabled={isRunning || !query.trim()}
            sx={runButtonStyles}
          >
            {isRunning ? <CircularProgress size={18} color="inherit" /> : <PlayArrowRoundedIcon sx={{ fontSize: 20 }} />}
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={copied ? 'Copied!' : 'Copy query'}>
        <span>
          <IconButton size="small" onClick={handleCopy} disabled={!query.trim()}>
            {copied ? <CheckRoundedIcon sx={{ fontSize: 18 }} /> : <ContentCopyRoundedIcon sx={{ fontSize: 18 }} />}
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Clear all">
        <IconButton size="small" onClick={handleClear}>
          <DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );

  // Fullscreen mode
  if (fullscreen) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          bgcolor: 'background.default',
        }}
      >
        {headerComponent}
        {tabBarComponent}
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{tabContent}</Box>
        {actionBarComponent}
      </Box>
    );
  }

  // Desktop panel mode
  return (
    <StyledPanel open={isOpen} panelWidth={panelWidth} isDark={isDark}>
      {headerComponent}
      {tabBarComponent}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: 'transparent' }}>
        {tabContent}
      </Box>
      {actionBarComponent}
    </StyledPanel>
  );
}

export default memo(SQLEditorCanvas);
