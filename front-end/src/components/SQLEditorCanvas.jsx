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
  useMediaQuery,
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
import { registerMonacoThemes, getMonacoThemeName } from '../theme';
import { getGlassmorphismStyles, getScrollbarStyles } from '../styles/shared';
import { runQuery } from '../api';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;
const MONACO_OPTIONS = {
  minimap: { enabled: false },
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  automaticLayout: true,
  wordWrap: 'on',
  wrappingIndent: 'same',
  padding: { top: 16, bottom: 16 },
  renderLineHighlight: 'line',
  lineHeight: 22,
  scrollbar: {
    verticalScrollbarSize: 6,
    horizontalScrollbarSize: 6,
    useShadows: false,
  },
  suggest: {
    showKeywords: true,
  },
};
const openedMixin = (theme, width) => ({
  width: typeof width === 'number' ? width : width,
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  overflowX: 'hidden',
  ...getGlassmorphismStyles(theme),
});

const closedMixin = (theme) => ({
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  overflowX: 'hidden',
  width: 0,
  ...getGlassmorphismStyles(theme),
});

const StyledPanel = styled(Box, {
  shouldForwardProp: (prop) => !['open', 'panelWidth'].includes(prop),
})(({ theme, open, panelWidth }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  flexShrink: 0,
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
  ...(open && openedMixin(theme, panelWidth)),
  ...(!open && closedMixin(theme)),
}));

const EmptyState = memo(function EmptyState({ icon: _Icon, title, subtitle, textColor }) {
  const Icon = _Icon;
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
  const isCompactMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState(initialResults);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const editorRef = useRef(null);
  const copyTimeoutRef = useRef(null);
  const textColor = useMemo(() => theme.palette.text.primary, [theme.palette.text.primary]);
  const monacoOptions = useMemo(
    () => ({
      ...MONACO_OPTIONS,
      fontFamily: theme.typography.fontFamilyMono,
      fontSize: theme.typography.uiCode.fontSizePx,
    }),
    [theme.typography.fontFamilyMono, theme.typography.uiCode.fontSizePx]
  );
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);
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
    registerMonacoThemes(monaco, { transparent: true });
    monaco.editor.setTheme(getMonacoThemeName(theme.palette.mode, true));
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
  const headerStyles = useMemo(() => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    px: { xs: 1.25, sm: 2 },
    py: { xs: 1, sm: 1.25 },
    borderBottom: '1px solid',
    borderColor: theme.palette.border.subtle,
    backgroundColor: 'transparent',
    flexShrink: 0,
  }), [theme]);

  const tabsStyles = useMemo(() => ({
    minHeight: 44,
    '& .MuiTabs-indicator': {
      height: 2,
      borderRadius: '2px 2px 0 0',
      backgroundColor: theme.palette.text.primary,
    },
    '& .MuiTab-root': {
      minHeight: 44,
      minWidth: isCompactMobile ? 82 : 100,
      px: isCompactMobile ? 1.5 : 2.5,
      py: 0,
      fontWeight: 500,
      textTransform: 'none',
      fontSize: isCompactMobile
        ? theme.typography.uiBodySm.fontSize.xs
        : theme.typography.body2.fontSize,
      color: 'text.secondary',
      transition: 'transform 0.2s ease',
      '&.Mui-selected': { color: 'text.primary' },
      '&:hover': {
        color: 'text.primary',
        backgroundColor: theme.palette.action.hover,
      },
    },
  }), [theme, isCompactMobile]);

  const actionBarStyles = useMemo(() => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isCompactMobile ? 0.6 : 1,
    px: { xs: 1.25, sm: 2 },
    py: { xs: 1, sm: 1.5 },
    borderTop: '1px solid',
    borderColor: theme.palette.border.subtle,
    backgroundColor: theme.palette.background.default,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    flexShrink: 0,
  }), [theme, isCompactMobile]);

  const runButtonStyles = useMemo(() => ({
    width: 44,
    height: 44,
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

  const embeddedContentShellStyles = useMemo(() => ({
    height: '100%',
    minHeight: 0,
    boxSizing: 'border-box',
    px: { xs: 0.5, sm: 1.5 },
    pt: { xs: 0.5, sm: 1.5 },
    pb: { xs: 0.5, sm: 1.5 },
    overflow: 'hidden',
    backgroundColor: 'transparent',
  }), []);

  const embeddedContentFrameStyles = useMemo(() => ({
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    borderRadius: 2,
    border: '1px solid',
    borderColor: theme.palette.border.subtle,
    backgroundColor: alpha(theme.palette.background.paper, isDark ? 0.14 : 0.75),
    overflow: 'hidden',
  }), [theme, isDark]);
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
          <Typography variant="body2" color="error.main" sx={{ fontFamily: theme.typography.fontFamilyMono }}>
            ⚠ {error}
          </Typography>
        </Box>
      )}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          backgroundColor: 'transparent',
          ...getScrollbarStyles(theme, { size: 6 }),
          '& .monaco-editor, & .monaco-editor-background, & .monaco-editor .margin': {
            backgroundColor: 'transparent !important',
          },
        }}
        onKeyDown={handleKeyDown}
      >
        <Editor
          height="100%"
          language="sql"
          theme={getMonacoThemeName(theme.palette.mode, true)}
          value={query}
          onChange={handleQueryChange}
          onMount={handleEditorDidMount}
          options={monacoOptions}
        />
      </Box>
    </Box>
  ), [error, isDark, query, handleKeyDown, handleQueryChange, handleEditorDidMount, monacoOptions, theme]);

  const resultsTabContent = useMemo(() => (
    <Box sx={embeddedContentShellStyles}>
      {results ? (
        <Box sx={embeddedContentFrameStyles}>
          <SQLResultsTable data={results} onClose={handleCloseResults} embedded />
        </Box>
      ) : (
        <EmptyState
          icon={TableChartOutlinedIcon}
          title="No results yet"
          subtitle="Run a query to see results here"
          textColor={textColor}
        />
      )}
    </Box>
  ), [results, handleCloseResults, textColor, embeddedContentShellStyles, embeddedContentFrameStyles]);

  const chartTabContent = useMemo(() => (
    <Box sx={embeddedContentShellStyles}>
      {results ? (
        <Box sx={embeddedContentFrameStyles}>
          <ChartVisualization data={results} embedded />
        </Box>
      ) : (
        <EmptyState
          icon={BarChartRoundedIcon}
          title="No data to visualize"
          subtitle="Run a query to create charts"
          textColor={textColor}
        />
      )}
    </Box>
  ), [results, textColor, embeddedContentShellStyles, embeddedContentFrameStyles]);
  const tabContent = activeTab === 0 ? editorTabContent : activeTab === 1 ? resultsTabContent : chartTabContent;
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
            backgroundColor: theme.palette.action.hover,
            border: '1px solid',
            borderColor: theme.palette.border.subtle,
          }}
        >
          <TerminalRoundedIcon sx={{ fontSize: 18, color: 'text.primary' }} />
        </Box>
        <Typography variant="subtitle2" sx={{ ...theme.typography.uiPanelTitle }}>
          SQL Editor
        </Typography>
        {currentDatabase && (
          <Chip
            size="small"
            icon={<StorageRoundedIcon sx={{ fontSize: 12 }} />}
            label={currentDatabase}
            sx={{
              display: { xs: 'none', sm: 'inline-flex' },
              height: 22,
              backgroundColor: theme.palette.action.hover,
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
            width: 44,
            height: 44,
            color: 'text.secondary',
            '&:hover': {
              backgroundColor: theme.palette.action.hover,
            },
          }}
        >
          <CloseRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
  const tabBarComponent = (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        px: { xs: 0.5, sm: 0 },
        borderBottom: '1px solid',
        borderColor: theme.palette.border.subtle,
        backgroundColor: 'transparent',
        flexShrink: 0,
      }}
    >
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        centered={!isCompactMobile}
        variant={isCompactMobile ? 'scrollable' : 'standard'}
        allowScrollButtonsMobile
        sx={tabsStyles}
      >
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
                    backgroundColor: theme.palette.action.selected,
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
          <IconButton size="small" onClick={handleCopy} disabled={!query.trim()} sx={{ width: 44, height: 44 }}>
            {copied ? <CheckRoundedIcon sx={{ fontSize: 18 }} /> : <ContentCopyRoundedIcon sx={{ fontSize: 18 }} />}
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Clear all">
        <IconButton size="small" onClick={handleClear} sx={{ width: 44, height: 44 }}>
          <DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
  if (fullscreen) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100dvh',
          '@supports not (height: 100dvh)': {
            height: '100vh',
          },
          width: '100%',
          bgcolor: 'background.default',
        }}
      >
        {headerComponent}
        {tabBarComponent}
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{tabContent}</Box>
        {activeTab === 0 && actionBarComponent}
      </Box>
    );
  }
  return (
    <StyledPanel open={isOpen} panelWidth={panelWidth}>
      {headerComponent}
      {tabBarComponent}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: 'transparent' }}>
        {tabContent}
      </Box>
      {activeTab === 0 && actionBarComponent}
    </StyledPanel>
  );
}

export default memo(SQLEditorCanvas);

