import { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Chip,
  CircularProgress,
  ButtonBase,
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

  const handleTabChange = useCallback((index) => {
    setActiveTab(index);
  }, []);

  const handleQueryChange = useCallback((value) => {
    setQuery(value || '');
  }, []);

  const handleCloseResults = useCallback(() => {
    setResults(null);
  }, []);
  const actionBarStyles = useMemo(() => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isCompactMobile ? 0.75 : 1.25,
    px: { xs: 1.25, sm: 2 },
    py: { xs: 1, sm: 1.25 },
    borderTop: '1px solid',
    borderColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.1 : 0.08),
    background: theme.palette.mode === 'dark'
      ? `linear-gradient(0deg, ${alpha(theme.palette.background.paper, 0.45)} 0%, ${alpha(theme.palette.background.default, 0.2)} 100%)`
      : `linear-gradient(0deg, ${alpha(theme.palette.background.paper, 0.95)} 0%, ${alpha(theme.palette.background.default, 0.88)} 100%)`,
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

  const navSegments = useMemo(() => [
    {
      id: 0,
      label: 'Editor',
      shortLabel: 'SQL',
      icon: TerminalRoundedIcon,
      disabled: false,
    },
    {
      id: 1,
      label: 'Results',
      shortLabel: 'Rows',
      icon: TableChartOutlinedIcon,
      disabled: false,
      badge: results?.row_count,
    },
    {
      id: 2,
      label: 'Chart',
      shortLabel: 'Viz',
      icon: BarChartRoundedIcon,
      disabled: !results,
    },
  ], [results]);

  const unifiedHeader = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1, sm: 1.5 },
        px: { xs: 1, sm: 1.5 },
        py: { xs: 0.875, sm: 1 },
        minHeight: { xs: 52, sm: 56 },
        flexShrink: 0,
        borderBottom: '1px solid',
        borderColor: alpha(theme.palette.text.primary, isDark ? 0.1 : 0.08),
        background: isDark
          ? `linear-gradient(180deg, ${alpha(theme.palette.background.paper, 0.55)} 0%, ${alpha(theme.palette.background.default, 0.35)} 100%)`
          : `linear-gradient(180deg, ${alpha(theme.palette.background.paper, 0.98)} 0%, ${alpha(theme.palette.background.default, 0.92)} 100%)`,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, minWidth: 0 }}>
        <Box
          sx={{
            width: { xs: 30, sm: 34 },
            height: { xs: 30, sm: 34 },
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `linear-gradient(145deg, ${alpha(theme.palette.primary.main, 0.22)}, ${alpha(theme.palette.primary.main, 0.06)})`,
            border: '1px solid',
            borderColor: alpha(theme.palette.primary.main, 0.25),
            boxShadow: `0 1px 0 ${alpha(theme.palette.common.white, isDark ? 0.06 : 0.35)} inset`,
          }}
        >
          <TerminalRoundedIcon sx={{ fontSize: { xs: 17, sm: 18 }, color: 'primary.main' }} />
        </Box>
        <Box sx={{ minWidth: 0, display: { xs: 'none', sm: 'block' } }}>
          <Typography
            variant="subtitle2"
            sx={{
              ...theme.typography.uiPanelTitle,
              lineHeight: 1.2,
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}
          >
            SQL workspace
          </Typography>
          {currentDatabase && (
            <Typography variant="caption" sx={{ ...theme.typography.uiCaption2xs, color: 'text.secondary', display: 'block', mt: 0.125 }}>
              {currentDatabase}
            </Typography>
          )}
        </Box>
        {currentDatabase && (
          <Chip
            size="small"
            icon={<StorageRoundedIcon sx={{ fontSize: 11 }} />}
            label={currentDatabase}
            sx={{
              display: { xs: 'inline-flex', sm: 'none' },
              height: 24,
              maxWidth: 100,
              '& .MuiChip-label': { px: 0.75, ...theme.typography.uiCaption2xs },
              backgroundColor: alpha(theme.palette.text.primary, 0.07),
              border: '1px solid',
              borderColor: alpha(theme.palette.text.primary, 0.1),
            }}
          />
        )}
      </Box>

      <Box
        role="tablist"
        aria-label="SQL workspace views"
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 0,
          mx: { xs: 0, sm: 0.5 },
        }}
      >
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.25,
            p: 0.35,
            borderRadius: 999,
            maxWidth: '100%',
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
            border: '1px solid',
            borderColor: alpha(theme.palette.text.primary, isDark ? 0.12 : 0.1),
            backgroundColor: alpha(theme.palette.text.primary, isDark ? 0.06 : 0.04),
            boxShadow: `0 1px 2px ${alpha(theme.palette.common.black, isDark ? 0.25 : 0.06)} inset`,
          }}
        >
          {navSegments.map((seg) => {
            const Icon = seg.icon;
            const selected = activeTab === seg.id;
            const label = isCompactMobile ? seg.shortLabel : seg.label;
            return (
              <ButtonBase
                key={seg.id}
                role="tab"
                aria-selected={selected}
                aria-disabled={seg.disabled}
                disabled={seg.disabled}
                onClick={() => !seg.disabled && handleTabChange(seg.id)}
                sx={{
                  px: { xs: 1.1, sm: 1.5 },
                  py: 0.55,
                  borderRadius: 999,
                  minHeight: 34,
                  color: selected ? 'text.primary' : 'text.secondary',
                  fontWeight: selected ? 600 : 500,
                  fontSize: isCompactMobile ? 11.5 : 12.5,
                  letterSpacing: '0.01em',
                  textTransform: 'none',
                  transition: theme.transitions.create(['background-color', 'color', 'box-shadow', 'transform'], {
                    duration: theme.transitions.duration.shorter,
                  }),
                  backgroundColor: selected
                    ? alpha(theme.palette.background.paper, isDark ? 0.92 : 1)
                    : 'transparent',
                  boxShadow: selected
                    ? `0 1px 3px ${alpha(theme.palette.common.black, isDark ? 0.35 : 0.1)}, 0 0 0 1px ${alpha(theme.palette.text.primary, 0.08)}`
                    : 'none',
                  '&:hover': {
                    color: 'text.primary',
                    backgroundColor: selected
                      ? alpha(theme.palette.background.paper, isDark ? 0.95 : 1)
                      : alpha(theme.palette.text.primary, 0.06),
                  },
                  '&.Mui-disabled': { opacity: 0.38 },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.65 }}>
                  <Icon sx={{ fontSize: isCompactMobile ? 15 : 16, opacity: selected ? 1 : 0.85 }} />
                  <Box component="span" sx={{ whiteSpace: 'nowrap' }}>{label}</Box>
                  {seg.id === 1 && results?.row_count != null && (
                    <Box
                      component="span"
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 22,
                        height: 18,
                        px: 0.45,
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 700,
                        lineHeight: 1,
                        backgroundColor: selected
                          ? alpha(theme.palette.primary.main, 0.2)
                          : alpha(theme.palette.text.primary, 0.1),
                        color: 'text.primary',
                      }}
                    >
                      {results.row_count}
                    </Box>
                  )}
                </Box>
              </ButtonBase>
            );
          })}
        </Box>
      </Box>

      <Tooltip title="Close panel">
        <IconButton
          size="small"
          onClick={onClose}
          aria-label="Close SQL editor"
          sx={{
            flexShrink: 0,
            width: 40,
            height: 40,
            color: 'text.secondary',
            border: '1px solid',
            borderColor: alpha(theme.palette.text.primary, 0.1),
            backgroundColor: alpha(theme.palette.text.primary, 0.04),
            '&:hover': {
              backgroundColor: alpha(theme.palette.text.primary, 0.09),
              color: 'text.primary',
            },
          }}
        >
          <CloseRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );

  const actionBarComponent = (
    <Box sx={actionBarStyles}>
      <Tooltip title={activeTab !== 0 ? 'Switch to Editor to run' : (isRunning ? 'Running...' : 'Run Query (Ctrl+Enter)')}>
        <span>
          <IconButton
            size="small"
            onClick={handleRunQuery}
            disabled={isRunning || !query.trim() || activeTab !== 0}
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
        {unifiedHeader}
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{tabContent}</Box>
        {actionBarComponent}
      </Box>
    );
  }
  return (
    <StyledPanel open={isOpen} panelWidth={panelWidth}>
      {unifiedHeader}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: 'transparent' }}>
        {tabContent}
      </Box>
      {actionBarComponent}
    </StyledPanel>
  );
}

export default memo(SQLEditorCanvas);

