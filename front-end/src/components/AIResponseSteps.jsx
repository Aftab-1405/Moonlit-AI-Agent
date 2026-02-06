import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { Box, Typography, Collapse, useTheme, ButtonBase, Link } from '@mui/material';
import { alpha, keyframes } from '@mui/material/styles';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded';
import Editor from '@monaco-editor/react';

// =============================================================================
// KEYFRAME ANIMATIONS
// =============================================================================

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

// =============================================================================
// STATIC CONFIGURATION
// =============================================================================

const MONACO_OPTIONS = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: 'off',
  folding: false,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  wordWrap: 'on',
  padding: { top: 12, bottom: 12 },
  renderLineHighlight: 'none',
  scrollbar: {
    vertical: 'auto',
    horizontal: 'hidden',
    verticalScrollbarSize: 6,
  },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  guides: { indentation: false },
  contextmenu: false,
};

// Custom Monaco theme definitions to match app theme colors
const defineMonacoThemes = (monaco) => {
  // Dark theme - transparent background
  monaco.editor.defineTheme('moonlit-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0c0c0e',
      'editor.lineHighlightBackground': '#ffffff08',
      'editorGutter.background': '#0c0c0e',
    },
  });
  
  // Light theme - cream/beige background matching app theme
  monaco.editor.defineTheme('moonlit-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#f5f2ee',
      'editor.lineHighlightBackground': '#00000008',
      'editorGutter.background': '#f5f2ee',
    },
  });
};

const TOOL_ACTIONS = {
  'get_connection_status': { running: 'Checking connection status', done: 'Checked connection status' },
  'get_database_list': { running: 'Listing available databases', done: 'Listed available databases' },
  'get_database_schema': { running: 'Fetching database schema', done: 'Fetched database schema' },
  'get_table_columns': { running: 'Getting table structure', done: 'Got table structure' },
  'execute_query': { running: 'Executing SQL query', done: 'Executed SQL query' },
  'get_recent_queries': { running: 'Fetching query history', done: 'Fetched query history' },
  'get_sample_data': { running: 'Getting sample data', done: 'Got sample data' },
  'get_table_indexes': { running: 'Fetching indexes', done: 'Fetched indexes' },
  'get_table_constraints': { running: 'Fetching constraints', done: 'Fetched constraints' },
  'get_foreign_keys': { running: 'Fetching foreign keys', done: 'Fetched foreign keys' },
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function parseJSON(str) {
  if (!str || str === 'null' || str === '{}') return null;
  try {
    return typeof str === 'string' ? JSON.parse(str) : str;
  } catch {
    return null;
  }
}

function formatToolName(name) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function isSemanticFailure(name, result) {
  if (!result) return false;
  if (result.success === false || result.error) return true;
  switch (name) {
    case 'get_connection_status': return result.connected === false;
    case 'get_database_list': return (result.count ?? result.databases?.length ?? 0) === 0;
    case 'get_database_schema': return (result.table_count ?? result.tables?.length ?? 0) === 0;
    case 'get_table_columns': return (result.column_count ?? result.columns?.length ?? 0) === 0;
    case 'get_sample_data': return (result.row_count ?? 0) === 0;
    default: return false;
  }
}

function getDetailedResult(name, result) {
  if (!result) return 'No result';
  if (result.success === false || result.error) {
    return `Error: ${result.error || result.message || 'Unknown error'}`;
  }

  const details = {
    'get_connection_status': () => {
      if (!result.connected) return 'Not connected to any database';
      let msg = `Connected to ${result.database || 'database'}`;
      if (result.db_type) msg += ` (${result.db_type.toUpperCase()})`;
      return msg;
    },
    'get_database_list': () => {
      const count = result.count ?? result.databases?.length ?? 0;
      return `Found ${count} database${count !== 1 ? 's' : ''} available`;
    },
    'get_database_schema': () => {
      const count = result.table_count ?? result.tables?.length ?? 0;
      const tables = result.tables?.slice(0, 5).join(', ') || '';
      return `Retrieved ${count} tables${tables ? `: ${tables}${count > 5 ? '...' : ''}` : ''}`;
    },
    'get_table_columns': () => {
      const count = result.column_count ?? result.columns?.length ?? 0;
      return `Table has ${count} columns`;
    },
    'execute_query': () => {
      const rowCount = result.row_count ?? 0;
      const totalRows = result.total_rows ?? rowCount;
      let msg = `Query returned ${rowCount} rows`;
      if (result.truncated && totalRows > rowCount) {
        msg += ` (of ${totalRows.toLocaleString()} total)`;
      }
      return msg;
    },
    'get_recent_queries': () => `Found ${result.count ?? 0} recent queries`,
    'get_sample_data': () => `Retrieved ${result.row_count ?? 0} sample rows from ${result.table || 'table'}`,
    'get_table_indexes': () => `Found ${result.count ?? result.indexes?.length ?? 0} indexes`,
    'get_table_constraints': () => `Found ${result.count ?? result.constraints?.length ?? 0} constraints`,
    'get_foreign_keys': () => `Found ${result.count ?? result.foreign_keys?.length ?? 0} foreign key relationships`,
  };

  return details[name]?.() || 'Completed successfully';
}

// =============================================================================
// THINKING STEP COMPONENT (Claude-style)
// =============================================================================

const ThinkingStep = memo(({ step }) => {
  const [showMore, setShowMore] = useState(false);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  
  const isActive = !step.isComplete;
  const content = step.content || '';
  const lines = content.split('\n');
  const isLong = lines.length > 6 || content.length > 400;
  const displayContent = showMore ? content : lines.slice(0, 6).join('\n');

  return (
    <Box
      sx={{
        animation: `${fadeIn} 0.2s ease-out`,
        pl: 3,
        py: 1.5,
        borderLeft: '2px solid',
        borderColor: isDark 
          ? alpha(theme.palette.text.primary, 0.08)
          : alpha(theme.palette.text.primary, 0.06),
      }}
    >
      {/* Icon and content */}
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <AccessTimeRoundedIcon
          sx={{
            fontSize: 18,
            color: alpha(theme.palette.info.main, isDark ? 0.7 : 0.6),
            mt: 0.25,
            flexShrink: 0,
          }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {content ? (
            <>
              <Typography
                component="div"
                sx={{
                  color: alpha(theme.palette.text.primary, isDark ? 0.85 : 0.8),
                  fontSize: '0.9rem',
                  lineHeight: 1.65,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  '& strong': { fontWeight: 600 },
                  '& ul, & ol': { pl: 2.5, my: 1 },
                  '& li': { mb: 0.5 },
                }}
              >
                {displayContent}
                {!showMore && isLong && '...'}
              </Typography>
              {isLong && (
                <Link
                  component="button"
                  onClick={() => setShowMore(!showMore)}
                  sx={{
                    mt: 0.75,
                    fontSize: '0.85rem',
                    color: alpha(theme.palette.text.secondary, 0.6),
                    textDecoration: 'none',
                    cursor: 'pointer',
                    '&:hover': {
                      color: alpha(theme.palette.text.secondary, 0.8),
                      textDecoration: 'underline',
                    },
                  }}
                >
                  {showMore ? 'Show less' : 'Show more'}
                </Link>
              )}
            </>
          ) : (
            <Typography
              sx={{
                color: alpha(theme.palette.text.secondary, 0.5),
                fontSize: '0.9rem',
                fontStyle: 'italic',
              }}
            >
              {isActive ? 'Thinking...' : 'Thought process'}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
});
ThinkingStep.displayName = 'ThinkingStep';

// =============================================================================
// TOOL STEP COMPONENT (Claude-style)
// =============================================================================

const ToolStep = memo(({ step }) => {
  const [expanded, setExpanded] = useState(false);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const { parsedArgs, parsedResult, isError, isRunning } = useMemo(() => {
    const args = parseJSON(step.args);
    const result = parseJSON(step.result);
    const running = step.status === 'running';
    return {
      parsedArgs: args,
      parsedResult: result,
      isRunning: running,
      isError: step.status === 'error' || isSemanticFailure(step.name, result),
    };
  }, [step]);

  const actionText = useMemo(() => {
    const config = TOOL_ACTIONS[step.name];
    if (config) return isRunning ? config.running : config.done;
    return formatToolName(step.name);
  }, [step.name, isRunning]);

  const hasDetails = parsedArgs?.query || parsedResult;

  const queryHeight = useMemo(() => {
    const query = parsedArgs?.query;
    if (!query) return 80;
    const lineCount = query.split('\n').length;
    return Math.min(Math.max(80, (lineCount * 20) + 24), 300);
  }, [parsedArgs]);

  const StatusIcon = isRunning 
    ? AutorenewRoundedIcon 
    : isError 
      ? ErrorOutlineRoundedIcon 
      : CheckCircleOutlineRoundedIcon;

  return (
    <Box
      sx={{
        animation: `${fadeIn} 0.2s ease-out`,
        pl: 3,
        py: 1,
        borderLeft: '2px solid',
        borderColor: isDark 
          ? alpha(theme.palette.text.primary, 0.08)
          : alpha(theme.palette.text.primary, 0.06),
      }}
    >
      {/* Status row */}
      <ButtonBase
        onClick={() => hasDetails && setExpanded(!expanded)}
        disabled={!hasDetails}
        sx={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 1.5,
          py: 0.5,
          px: 0,
          cursor: hasDetails ? 'pointer' : 'default',
          borderRadius: 0,
          bgcolor: 'transparent',
          '&:hover .step-text': hasDetails ? {
            color: alpha(theme.palette.text.primary, isDark ? 0.95 : 0.85),
          } : {},
          '&:hover .step-arrow': hasDetails ? {
            color: alpha(theme.palette.text.secondary, 0.6),
          } : {},
        }}
        disableRipple
      >
        <StatusIcon
          sx={{
            fontSize: 18,
            flexShrink: 0,
            color: isRunning
              ? alpha(theme.palette.primary.main, 0.7)
              : isError
                ? alpha(theme.palette.error.main, 0.6)
                : alpha(theme.palette.success.main, isDark ? 0.6 : 0.5),
            ...(isRunning && {
              animation: `${spin} 1s linear infinite`,
            }),
          }}
        />
        <Typography
          className="step-text"
          sx={{
            color: alpha(theme.palette.text.primary, isDark ? 0.75 : 0.65),
            fontSize: '0.9rem',
            fontWeight: 500,
            transition: 'color 0.15s ease',
          }}
        >
          {actionText}
        </Typography>
        {hasDetails && (
          <KeyboardArrowDownIcon
            className="step-arrow"
            sx={{
              fontSize: 16,
              color: alpha(theme.palette.text.secondary, 0.35),
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease, color 0.15s ease',
              ml: 'auto',
            }}
          />
        )}
      </ButtonBase>

      {/* Expanded details */}
      {hasDetails && (
        <Collapse in={expanded} timeout={150} unmountOnExit>
          <Box sx={{ pt: 1.5, pl: 4.25 }}>
            {/* Query */}
            {parsedArgs?.query && (
              <Box sx={{ mb: 1.5 }}>
                <Typography
                  sx={{
                    color: alpha(theme.palette.text.secondary, 0.5),
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    mb: 0.75,
                  }}
                >
                  Query
                </Typography>
                <Box
                  sx={{
                    borderRadius: 2,
                    overflow: 'hidden',
                    height: queryHeight,
                    border: '1px solid',
                    borderColor: theme.palette.border?.subtle,
                    bgcolor: theme.palette.background.default,
                  }}
                >
                  <Editor
                    height="100%"
                    language="sql"
                    theme={isDark ? 'moonlit-dark' : 'moonlit-light'}
                    value={parsedArgs.query}
                    options={MONACO_OPTIONS}
                    beforeMount={defineMonacoThemes}
                    loading={
                      <Box sx={{ p: 1.5, color: 'text.secondary', fontSize: '0.8rem' }}>
                        Loading...
                      </Box>
                    }
                  />
                </Box>
              </Box>
            )}

            {/* Result */}
            {parsedResult && !isRunning && (
              <Box>
                <Typography
                  sx={{
                    color: alpha(theme.palette.text.secondary, 0.5),
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    mb: 0.5,
                  }}
                >
                  Result
                </Typography>
                <Typography
                  sx={{
                    color: isError
                      ? alpha(theme.palette.error.main, 0.8)
                      : alpha(theme.palette.text.secondary, 0.7),
                    fontSize: '0.875rem',
                    lineHeight: 1.5,
                  }}
                >
                  {getDetailedResult(step.name, parsedResult)}
                </Typography>
              </Box>
            )}
          </Box>
        </Collapse>
      )}
    </Box>
  );
});
ToolStep.displayName = 'ToolStep';

// =============================================================================
// DONE INDICATOR
// =============================================================================

const DoneIndicator = memo(() => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        pl: 3,
        py: 1,
        animation: `${fadeIn} 0.3s ease-out`,
      }}
    >
      <CheckCircleOutlineRoundedIcon
        sx={{
          fontSize: 18,
          color: alpha(theme.palette.success.main, isDark ? 0.6 : 0.5),
        }}
      />
      <Typography
        sx={{
          color: alpha(theme.palette.text.primary, isDark ? 0.7 : 0.6),
          fontSize: '0.9rem',
          fontWeight: 500,
        }}
      >
        Done
      </Typography>
    </Box>
  );
});
DoneIndicator.displayName = 'DoneIndicator';

// =============================================================================
// MAIN COMPONENT - StepsAccordion (Claude-style)
// =============================================================================

export const StepsAccordion = memo(({ steps, isStreaming }) => {
  const [expanded, setExpanded] = useState(() => !!isStreaming);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const prevStreamingRef = useRef(isStreaming);

  const validSteps = useMemo(() =>
    Array.isArray(steps) ? steps.filter(s => s && s.type) : []
  , [steps]);

  // Generate summary text from steps
  const summaryText = useMemo(() => {
    if (validSteps.length === 0) return '';
    
    // Get unique completed tool actions
    const toolSteps = validSteps.filter(s => s.type === 'tool' && s.status !== 'running');
    const actions = toolSteps.map(s => {
      const config = TOOL_ACTIONS[s.name];
      return config?.done || formatToolName(s.name);
    });
    
    // Create short summary
    if (actions.length === 0) return 'Processing...';
    if (actions.length === 1) return actions[0];
    if (actions.length === 2) return actions.join(', ');
    return `${actions.slice(0, 2).join(', ')}, and more`;
  }, [validSteps]);

  const isAllComplete = useMemo(() => 
    !isStreaming && validSteps.every(s => 
      (s.type === 'thinking' && s.isComplete) || 
      (s.type === 'tool' && s.status !== 'running')
    )
  , [isStreaming, validSteps]);

  // Auto-expand when streaming starts
  useEffect(() => {
    if (isStreaming) {
      setExpanded(true);
    }
  }, [isStreaming]);

  // Auto-collapse only when streaming transitions from true -> false
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    if (wasStreaming && !isStreaming && validSteps.length > 0) {
      const timer = setTimeout(() => setExpanded(false), 800);
      prevStreamingRef.current = isStreaming;
      return () => clearTimeout(timer);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, validSteps.length]);

  const handleToggle = useCallback(() => setExpanded(prev => !prev), []);

  if (validSteps.length === 0) return null;

  return (
    <Box
      sx={{
        mb: 2,
        animation: `${fadeIn} 0.2s ease-out`,
      }}
    >
      {/* Header - Claude style with summary */}
      <ButtonBase
        onClick={handleToggle}
        sx={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          py: 0.5,
          px: 0,
          borderRadius: 0,
          justifyContent: 'flex-start',
          bgcolor: 'transparent',
          '&:hover .summary-text': {
            color: alpha(theme.palette.text.primary, isDark ? 0.9 : 0.8),
          },
          '&:hover .summary-arrow': {
            color: alpha(theme.palette.text.secondary, 0.6),
          },
        }}
        disableRipple
      >
        <Typography
          className="summary-text"
          sx={{
            color: alpha(theme.palette.text.secondary, isDark ? 0.65 : 0.55),
            fontSize: '0.9rem',
            fontWeight: 500,
            transition: 'color 0.15s ease',
          }}
        >
          {summaryText}
        </Typography>
        <KeyboardArrowDownIcon
          className="summary-arrow"
          sx={{
            fontSize: 18,
            color: alpha(theme.palette.text.secondary, 0.35),
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease, color 0.15s ease',
          }}
        />
      </ButtonBase>

      {/* Steps content */}
      <Collapse in={expanded} timeout={150}>
        <Box sx={{ pt: 0.5 }}>
          {validSteps.map((step, idx) => {
            if (step.type === 'thinking') {
              return <ThinkingStep key={`thinking-${idx}`} step={step} />;
            }
            if (step.type === 'tool') {
              return <ToolStep key={`tool-${idx}-${step.name}`} step={step} />;
            }
            return null;
          })}
          
          {/* Done indicator */}
          {isAllComplete && <DoneIndicator />}
        </Box>
      </Collapse>
    </Box>
  );
});
StepsAccordion.displayName = 'StepsAccordion';
