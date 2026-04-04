import { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  CircularProgress,
  ButtonBase,
  Button,
  Menu,
  MenuItem,
  useMediaQuery,
} from '@mui/material';
import { styled, useTheme as useMuiTheme, alpha, keyframes } from '@mui/material/styles';
import { useTheme as useAppTheme } from '../contexts/ThemeContext';
import Editor from '@monaco-editor/react';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import SQLResultsTable from './SQLResultsTable';
import ChartVisualization from './ChartVisualization';
import { registerMonacoThemes, getMonacoThemeName } from '../theme';
import { getAccentEffects, TRANSITIONS } from '../styles/themeEffects';
import { getGlassmorphismStyles, getScrollbarStyles, UI_LAYOUT } from '../styles/shared';
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
  padding: { top: 18, bottom: 20 },
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

function resultsToCsv(results) {
  const columns = results?.columns || [];
  const rows = results?.result || [];
  if (!columns.length || !rows.length) return '';
  const header = columns.join(',');
  const body = rows.map((row) =>
    columns.map((col) => {
      const val = row[col];
      if (val === null || val === undefined) return '';
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    }).join(',')
  );
  return [header, ...body].join('\n');
}

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

const EmptyState = memo(function EmptyState({ icon: _Icon, title, subtitle, textColor, accent }) {
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
        gap: 2.25,
        animation: `${fadeIn} 0.4s cubic-bezier(0.22, 1, 0.36, 1)`,
      }}
    >
      <Box
        sx={{
          width: 80,
          height: 80,
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(145deg, ${alpha(accent, 0.12)} 0%, ${alpha(accent, 0.03)} 100%)`,
          border: '1px solid',
          borderColor: alpha(accent, 0.22),
          boxShadow: `0 1px 0 ${alpha(textColor, 0.06)} inset, 0 8px 32px ${alpha(accent, 0.08)}`,
        }}
      >
        <Icon sx={{ fontSize: 36, color: accent, opacity: 0.85 }} />
      </Box>
      <Typography
        variant="body1"
        sx={{
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: 'text.primary',
          opacity: 0.92,
        }}
      >
        {title}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          textAlign: 'center',
          px: 3,
          maxWidth: 320,
          lineHeight: 1.65,
          color: 'text.secondary',
          opacity: 0.85,
        }}
      >
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
  const [copyMenuAnchor, setCopyMenuAnchor] = useState(null);
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

  const handleCopyCsv = useCallback(() => {
    const csv = resultsToCsv(results);
    if (!csv) return;
    navigator.clipboard.writeText(csv);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    setCopyMenuAnchor(null);
  }, [results]);

  const openCopyMenu = useCallback((e) => {
    setCopyMenuAnchor(e.currentTarget);
  }, []);

  const closeCopyMenu = useCallback(() => setCopyMenuAnchor(null), []);

  const handleCopyMenuSql = useCallback(() => {
    handleCopy();
    setCopyMenuAnchor(null);
  }, [handleCopy]);

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
  const accentFx = useMemo(() => getAccentEffects(theme), [theme]);
  const artifactChromeBg = useMemo(
    () => theme.palette.background.paper,
    [theme.palette.background.paper]
  );
  const artifactBorder = useMemo(
    () => alpha(theme.palette.divider, isDark ? 0.85 : 0.95),
    [theme.palette.divider, isDark]
  );
  const segmentTrackBg = useMemo(
    () => alpha(theme.palette.text.primary, isDark ? 0.11 : 0.055),
    [theme.palette.text.primary, isDark]
  );
  const headerBarBg = useMemo(
    () => (isDark
      ? `linear-gradient(180deg, ${alpha(artifactChromeBg, 1)} 0%, ${alpha(artifactChromeBg, 0.94)} 100%)`
      : `linear-gradient(180deg, ${alpha(theme.palette.common.white, 1)} 0%, ${alpha(artifactChromeBg, 0.98)} 100%)`
    ),
    [artifactChromeBg, isDark, theme.palette.common.white]
  );
  const footerBarBg = useMemo(
    () => (isDark
      ? `linear-gradient(0deg, ${alpha(artifactChromeBg, 1)} 0%, ${alpha(artifactChromeBg, 0.92)} 100%)`
      : `linear-gradient(0deg, ${alpha(artifactChromeBg, 1)} 0%, ${alpha(theme.palette.common.white, 0.97)} 100%)`
    ),
    [artifactChromeBg, isDark, theme.palette.common.white]
  );

  const actionBarStyles = useMemo(() => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isCompactMobile ? 0.75 : 1.75,
    px: { xs: 1.5, sm: 2.5 },
    py: { xs: 1.1, sm: 1.35 },
    flexShrink: 0,
    borderTop: '1px solid',
    borderColor: artifactBorder,
    background: footerBarBg,
    boxShadow: isDark
      ? `0 -1px 0 ${alpha(theme.palette.common.white, 0.04)} inset, 0 -12px 40px ${alpha(theme.palette.common.black, 0.35)}`
      : `0 -1px 0 ${alpha(theme.palette.common.white, 0.9)} inset, 0 -8px 32px ${alpha(theme.palette.common.black, 0.04)}`,
  }), [artifactBorder, footerBarBg, isCompactMobile, isDark, theme.palette.common.black, theme.palette.common.white]);

  const runPrimaryStyles = useMemo(() => ({
    width: 44,
    height: 44,
    borderRadius: '12px',
    color: theme.palette.primary.contrastText,
    background: accentFx.gradient,
    border: 'none',
    boxShadow: `${accentFx.glow}, 0 1px 0 ${alpha(theme.palette.common.white, isDark ? 0.12 : 0.25)} inset`,
    transition: TRANSITIONS.smooth,
    '&:hover': {
      background: accentFx.gradient,
      filter: 'brightness(1.06)',
      boxShadow: `${accentFx.glow}, 0 2px 12px ${alpha(theme.palette.primary.main, isDark ? 0.35 : 0.22)}`,
    },
    '&:active': { transform: 'scale(0.97)' },
    '@media (prefers-reduced-motion: reduce)': {
      transition: TRANSITIONS.fade,
      '&:active': { transform: 'none' },
    },
    '&.Mui-disabled': {
      color: 'text.disabled',
      background: alpha(theme.palette.text.primary, isDark ? 0.12 : 0.08),
      boxShadow: 'none',
      filter: 'none',
    },
  }), [accentFx.glow, accentFx.gradient, isDark, theme.palette.common.white, theme.palette.primary.contrastText, theme.palette.primary.main, theme.palette.text.primary]);

  const toolbarGhostStyles = useMemo(() => ({
    width: 44,
    height: 44,
    borderRadius: '12px',
    color: 'text.secondary',
    bgcolor: alpha(textColor, isDark ? 0.06 : 0.04),
    border: '1px solid',
    borderColor: alpha(textColor, isDark ? 0.1 : 0.08),
    transition: TRANSITIONS.default,
    '&:hover': {
      color: 'text.primary',
      bgcolor: alpha(textColor, isDark ? 0.11 : 0.08),
      borderColor: alpha(textColor, isDark ? 0.16 : 0.12),
    },
    '&.Mui-disabled': {
      color: 'text.disabled',
      bgcolor: 'transparent',
      borderColor: 'transparent',
    },
  }), [isDark, textColor]);

  /** Fills canvas body; overflow stays inside table/chart (not this wrapper). */
  const artifactTabPaneStyles = useMemo(() => ({
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    bgcolor: artifactChromeBg,
    backgroundImage: `radial-gradient(ellipse 100% 60% at 50% 0%, ${alpha(theme.palette.primary.main, isDark ? 0.06 : 0.045)} 0%, transparent 52%)`,
  }), [artifactChromeBg, isDark, theme.palette.primary.main]);

  const centeredEmptyWrapStyles = useMemo(() => ({
    flex: 1,
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    px: { xs: 3, md: 5.5 },
    py: { xs: 3, md: 4 },
    maxWidth: UI_LAYOUT.chatInputMaxWidth,
    mx: 'auto',
    width: '100%',
    boxSizing: 'border-box',
    overflow: 'auto',
  }), []);
  const editorTabContent = useMemo(() => (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: artifactChromeBg,
        backgroundImage: `radial-gradient(ellipse 110% 70% at 50% -15%, ${alpha(theme.palette.primary.main, isDark ? 0.08 : 0.055)} 0%, transparent 50%)`,
      }}
    >
      {error && (
        <Box
          sx={{
            mx: 2,
            mt: 1.5,
            px: 2,
            py: 1.25,
            flexShrink: 0,
            borderRadius: 2,
            border: '1px solid',
            borderColor: alpha(theme.palette.error.main, 0.35),
            borderLeftWidth: 4,
            borderLeftColor: theme.palette.error.main,
            backgroundColor: alpha(theme.palette.error.main, isDark ? 0.12 : 0.06),
            animation: `${fadeIn} 0.25s cubic-bezier(0.22, 1, 0.36, 1)`,
          }}
        >
          <Typography
            variant="body2"
            color="error.main"
            sx={{ fontFamily: theme.typography.fontFamilyMono, fontSize: '0.8125rem', lineHeight: 1.55 }}
          >
            {error}
          </Typography>
        </Box>
      )}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          '& .monaco-editor, & .monaco-editor-background, & .monaco-editor .margin': {
            backgroundColor: `${alpha(artifactChromeBg, 1)} !important`,
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
  ), [artifactChromeBg, error, isDark, query, handleKeyDown, handleQueryChange, handleEditorDidMount, monacoOptions, theme]);

  const resultsTabContent = useMemo(() => (
    <Box sx={artifactTabPaneStyles}>
      {results ? (
        <SQLResultsTable data={results} onClose={handleCloseResults} embedded />
      ) : (
        <Box sx={centeredEmptyWrapStyles}>
          <EmptyState
            icon={TableChartOutlinedIcon}
            title="No results yet"
            subtitle="Run a query to see results here"
            textColor={textColor}
            accent={theme.palette.primary.main}
          />
        </Box>
      )}
    </Box>
  ), [artifactTabPaneStyles, centeredEmptyWrapStyles, handleCloseResults, results, textColor, theme.palette.primary.main]);

  const chartTabContent = useMemo(() => (
    <Box sx={artifactTabPaneStyles}>
      {results ? (
        <ChartVisualization data={results} embedded />
      ) : (
        <Box sx={centeredEmptyWrapStyles}>
          <EmptyState
            icon={BarChartRoundedIcon}
            title="No data to visualize"
            subtitle="Run a query to create charts"
            textColor={textColor}
            accent={theme.palette.info.main}
          />
        </Box>
      )}
    </Box>
  ), [artifactTabPaneStyles, centeredEmptyWrapStyles, results, textColor, theme.palette.info.main]);
  const tabContent = activeTab === 0 ? editorTabContent : activeTab === 1 ? resultsTabContent : chartTabContent;

  const tabTitleSuffix = ['SQL', 'Results', 'Chart'][activeTab];
  const headerTitle = currentDatabase
    ? `SQL workspace · ${tabTitleSuffix} · ${currentDatabase}`
    : `SQL workspace · ${tabTitleSuffix}`;

  const navSegments = useMemo(() => [
    { id: 0, ariaLabel: 'SQL editor', icon: TerminalRoundedIcon, disabled: false },
    { id: 1, ariaLabel: 'Query results', icon: TableChartOutlinedIcon, disabled: false },
    { id: 2, ariaLabel: 'Chart', icon: BarChartRoundedIcon, disabled: !results },
  ], [results]);

  const unifiedHeader = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
        px: { xs: 1, sm: 1.25 },
        py: { xs: 1, sm: 1.125 },
        flexShrink: 0,
        minHeight: { xs: 50, sm: 52 },
        borderBottom: '1px solid',
        borderColor: artifactBorder,
        background: headerBarBg,
        boxShadow: isDark
          ? `0 1px 0 ${alpha(theme.palette.common.white, 0.06)} inset`
          : `0 1px 0 ${alpha(theme.palette.common.white, 0.85)} inset`,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          pl: 1.5,
        }}
      >
        <Box
          role="tablist"
          aria-label="SQL workspace views"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.25,
            p: 0.5,
            height: 34,
            flexShrink: 0,
            borderRadius: '10px',
            bgcolor: segmentTrackBg,
            border: '1px solid',
            borderColor: alpha(theme.palette.text.primary, isDark ? 0.12 : 0.09),
            boxSizing: 'border-box',
            boxShadow: `0 1px 2px ${alpha(theme.palette.common.black, isDark ? 0.35 : 0.06)} inset`,
          }}
        >
          {navSegments.map((seg) => {
            const Icon = seg.icon;
            const selected = activeTab === seg.id;
            return (
              <ButtonBase
                key={seg.id}
                role="tab"
                aria-label={seg.ariaLabel}
                aria-selected={selected}
                aria-disabled={seg.disabled}
                disabled={seg.disabled}
                onClick={() => !seg.disabled && handleTabChange(seg.id)}
                sx={{
                  position: 'relative',
                  width: 34,
                  height: 28,
                  minWidth: 34,
                  borderRadius: '8px',
                  color: selected ? 'text.primary' : 'text.secondary',
                  transition: theme.transitions.create(['background-color', 'color', 'box-shadow', 'transform'], {
                    duration: 250,
                    easing: theme.transitions.easing.easeInOut,
                  }),
                  '@media (prefers-reduced-motion: reduce)': {
                    transition: 'none',
                  },
                  bgcolor: selected ? alpha(theme.palette.background.paper, isDark ? 0.96 : 1) : 'transparent',
                  boxShadow: selected
                    ? `0 0 0 1px ${alpha(theme.palette.primary.main, isDark ? 0.35 : 0.22)}, 0 1px 3px ${alpha(theme.palette.common.black, isDark ? 0.4 : 0.07)}`
                    : 'none',
                  '&:hover': {
                    color: 'text.primary',
                    bgcolor: selected
                      ? alpha(theme.palette.background.paper, 1)
                      : alpha(theme.palette.text.primary, 0.07),
                  },
                  '&:focus-visible': {
                    outline: `2px solid ${alpha(theme.palette.primary.main, 0.45)}`,
                    outlineOffset: 1,
                  },
                  '&.Mui-disabled': { opacity: 0.35 },
                }}
              >
                <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon sx={{ fontSize: 20 }} />
                  {seg.id === 1 && results?.row_count != null && (
                    <Box
                      component="span"
                      sx={{
                        position: 'absolute',
                        top: -3,
                        right: -2,
                        minWidth: 15,
                        height: 15,
                        px: 0.2,
                        borderRadius: 999,
                        fontSize: 8,
                        fontWeight: 700,
                        lineHeight: '15px',
                        textAlign: 'center',
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                      }}
                    >
                      {results.row_count > 99 ? '99+' : results.row_count}
                    </Box>
                  )}
                </Box>
              </ButtonBase>
            );
          })}
        </Box>

        <Typography
          component="h2"
          noWrap
          title={headerTitle}
          sx={{
            flex: 1,
            minWidth: 0,
            ...theme.typography.uiBodySm,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            lineHeight: 1.4,
            color: 'text.secondary',
          }}
        >
          <Box component="span" sx={{ color: 'text.primary' }}>SQL workspace</Box>
          <Box component="span" sx={{ color: 'text.disabled', opacity: 0.75 }}> · </Box>
          <Box component="span" sx={{ color: 'text.secondary' }}>{tabTitleSuffix}</Box>
          {currentDatabase ? (
            <>
              <Box component="span" sx={{ color: 'text.disabled', opacity: 0.75 }}> · </Box>
              <Box component="span" sx={{ color: 'text.secondary', opacity: 0.9 }}>{currentDatabase}</Box>
            </>
          ) : null}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'stretch',
            height: 34,
            borderRadius: '10px',
            overflow: 'hidden',
            border: '1px solid',
            borderColor: artifactBorder,
            boxShadow: `0 1px 2px ${alpha(theme.palette.common.black, isDark ? 0.25 : 0.05)}`,
            transition: TRANSITIONS.default,
            '&:hover': {
              borderColor: alpha(theme.palette.primary.main, isDark ? 0.35 : 0.25),
              boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, isDark ? 0.15 : 0.1)}`,
            },
          }}
        >
          <Button
            size="small"
            onClick={handleCopy}
            disabled={!query.trim()}
            sx={{
              px: 1.5,
              minWidth: 0,
              height: '100%',
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.02em',
              textTransform: 'none',
              borderRadius: 0,
              borderRight: '1px solid',
              borderColor: artifactBorder,
              bgcolor: alpha(artifactChromeBg, 1),
              color: copied ? 'success.main' : 'text.primary',
              transition: TRANSITIONS.default,
              '&:hover': { bgcolor: alpha(theme.palette.action.hover, 1) },
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <IconButton
            size="small"
            onClick={openCopyMenu}
            aria-label="More copy options"
            aria-haspopup="true"
            aria-expanded={Boolean(copyMenuAnchor)}
            sx={{
              width: 32,
              height: '100%',
              borderRadius: 0,
              bgcolor: alpha(artifactChromeBg, 1),
              color: 'text.secondary',
              transition: TRANSITIONS.default,
              '&:hover': { bgcolor: alpha(theme.palette.action.hover, 1), color: 'text.primary' },
            }}
          >
            <KeyboardArrowDownRoundedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
        <Menu
          anchorEl={copyMenuAnchor}
          open={Boolean(copyMenuAnchor)}
          onClose={closeCopyMenu}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{
            paper: {
              elevation: 0,
              sx: {
                minWidth: 208,
                mt: 0.75,
                borderRadius: '12px',
                border: '1px solid',
                borderColor: artifactBorder,
                boxShadow: isDark
                  ? `0 12px 40px ${alpha(theme.palette.common.black, 0.55)}`
                  : `0 12px 40px ${alpha(theme.palette.common.black, 0.1)}, 0 2px 8px ${alpha(theme.palette.common.black, 0.04)}`,
                overflow: 'hidden',
              },
            },
          }}
        >
          <MenuItem
            onClick={handleCopyMenuSql}
            disabled={!query.trim()}
            sx={{ fontSize: '0.8125rem', py: 1.1, borderRadius: 1, mx: 0.5, my: 0.25 }}
          >
            Copy SQL
          </MenuItem>
          <MenuItem
            onClick={handleCopyCsv}
            disabled={!results?.columns?.length}
            sx={{ fontSize: '0.8125rem', py: 1.1, borderRadius: 1, mx: 0.5, mb: 0.5 }}
          >
            Copy results as CSV
          </MenuItem>
        </Menu>

        <Tooltip title="Close panel">
          <IconButton
            size="small"
            onClick={onClose}
            aria-label="Close SQL editor"
            sx={{
              width: 38,
              height: 38,
              ml: 0.25,
              borderRadius: '10px',
              color: 'text.secondary',
              border: '1px solid',
              borderColor: 'transparent',
              transition: TRANSITIONS.default,
              '&:hover': {
                color: 'text.primary',
                bgcolor: alpha(theme.palette.text.primary, 0.06),
                borderColor: alpha(theme.palette.text.primary, isDark ? 0.14 : 0.1),
              },
            }}
          >
            <CloseRoundedIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );

  const actionBarComponent = (
    <Box sx={actionBarStyles}>
      <Tooltip title={activeTab !== 0 ? 'Switch to SQL tab to run' : (isRunning ? 'Running…' : 'Run query (Ctrl+Enter)')}>
        <span>
          <IconButton
            size="small"
            onClick={handleRunQuery}
            disabled={isRunning || !query.trim() || activeTab !== 0}
            sx={runPrimaryStyles}
            aria-label="Run query"
          >
            {isRunning ? <CircularProgress size={20} thickness={4} sx={{ color: 'inherit' }} /> : <PlayArrowRoundedIcon sx={{ fontSize: 24 }} />}
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Clear query and results">
        <IconButton size="small" onClick={handleClear} sx={toolbarGhostStyles} aria-label="Clear all">
          <DeleteOutlineRoundedIcon sx={{ fontSize: 21 }} />
        </IconButton>
      </Tooltip>
      <Box
        component="span"
        sx={{
          ml: { xs: 0, sm: 1.25 },
          display: { xs: 'none', sm: 'inline-flex' },
          alignItems: 'center',
          px: 1.25,
          py: 0.35,
          borderRadius: 999,
          border: '1px solid',
          borderColor: alpha(theme.palette.text.primary, isDark ? 0.12 : 0.08),
          bgcolor: alpha(theme.palette.text.primary, isDark ? 0.06 : 0.03),
        }}
      >
        <Typography
          component="span"
          variant="caption"
          sx={{
            color: 'text.secondary',
            fontWeight: 500,
            ...theme.typography.uiCaption2xs,
            letterSpacing: '0.04em',
          }}
        >
          Ctrl+Enter
        </Typography>
      </Box>
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
          backgroundImage: `radial-gradient(ellipse 90% 45% at 50% 0%, ${alpha(theme.palette.primary.main, isDark ? 0.07 : 0.04)} 0%, transparent 55%)`,
        }}
      >
        {unifiedHeader}
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {tabContent}
        </Box>
        {actionBarComponent}
      </Box>
    );
  }
  return (
    <StyledPanel open={isOpen} panelWidth={panelWidth}>
      {unifiedHeader}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'transparent',
        }}
      >
        {tabContent}
      </Box>
      {actionBarComponent}
    </StyledPanel>
  );
}

export default memo(SQLEditorCanvas);

