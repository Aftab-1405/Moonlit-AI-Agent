import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Box, Typography, Collapse, useTheme, ButtonBase } from '@mui/material';
import { alpha, keyframes } from '@mui/material/styles';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import BubbleChartRoundedIcon from '@mui/icons-material/BubbleChartRounded';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import TableChartRoundedIcon from '@mui/icons-material/TableChartRounded';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import DataArrayRoundedIcon from '@mui/icons-material/DataArrayRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import ViewColumnRoundedIcon from '@mui/icons-material/ViewColumnRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded';
import Editor from '@monaco-editor/react';

// --- Static Definitions ---

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const dotPulse = keyframes`
  0%, 80%, 100% { opacity: 0.3; }
  40% { opacity: 1; }
`;

// Shimmer effect for running steps - subtle left-to-right sweep
const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

// Fade and slide in for new steps
const fadeSlideIn = keyframes`
  0% { opacity: 0; transform: translateY(-4px); }
  100% { opacity: 1; transform: translateY(0); }
`;

// Gentle pulse for running state
const gentlePulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
`;

const MONACO_OPTIONS = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 12.5,
  lineNumbers: 'off',
  folding: false,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  wordWrap: 'on',
  padding: { top: 10, bottom: 10 },
  renderLineHighlight: 'none',
  scrollbar: {
    vertical: 'auto',
    horizontal: 'auto',
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  guides: { indentation: false },
  contextmenu: false,
};

const TOOL_CONFIG = {
  'get_connection_status': { action: 'Checking connection', pastAction: 'Checked connection', icon: LinkRoundedIcon },
  'get_database_list': { action: 'Listing databases', pastAction: 'Listed databases', icon: StorageRoundedIcon },
  'get_database_schema': { action: 'Fetching schema', pastAction: 'Fetched schema', icon: TableChartRoundedIcon },
  'get_table_columns': { action: 'Getting table structure', pastAction: 'Got table structure', icon: ViewColumnRoundedIcon },
  'execute_query': { action: 'Running query', pastAction: 'Executed query', icon: PlayArrowRoundedIcon },
  'get_recent_queries': { action: 'Fetching query history', pastAction: 'Fetched query history', icon: HistoryRoundedIcon },
  'get_sample_data': { action: 'Getting sample data', pastAction: 'Got sample data', icon: DataArrayRoundedIcon },
  'get_table_indexes': { action: 'Fetching indexes', pastAction: 'Fetched indexes', icon: DataArrayRoundedIcon },
  'get_table_constraints': { action: 'Fetching constraints', pastAction: 'Fetched constraints', icon: TableChartRoundedIcon },
  'get_foreign_keys': { action: 'Fetching foreign keys', pastAction: 'Fetched foreign keys', icon: LinkRoundedIcon },
};

const DOT_INDICES = [0, 1, 2];

// --- Helpers ---

/**
 * Section label styles using theme's labelSmall variant
 * Only adds color & textTransform (theme provides font, size, weight, letterSpacing)
 */
const getSectionLabelSx = (isDark) => ({
  color: isDark ? alpha('#fff', 0.35) : alpha('#000', 0.3),
  textTransform: 'uppercase',
  mb: 0.5,
  display: 'block',
});

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
/**
 * Check if a tool result represents a semantic failure/warning state.
 * Some tools return successfully but with negative outcomes (e.g., "not connected").
 * 
 * Note: Tools like get_table_indexes, get_table_constraints, get_foreign_keys
 * can legitimately return 0 results (table may have none), so those are NOT failures.
 */
function isSemanticFailure(name, result) {
  if (!result) return false;
  if (result.success === false || result.error) return true;

  // Tool-specific semantic failures
  switch (name) {
    case 'get_connection_status':
      // Not connected is a clear failure state
      return result.connected === false;
    case 'get_database_list':
      // No databases available is problematic
      return (result.count ?? result.databases?.length ?? 0) === 0;
    case 'get_database_schema':
      // No tables in a database usually indicates an issue
      return (result.table_count ?? result.tables?.length ?? 0) === 0;
    case 'get_table_columns':
      // A table with 0 columns is definitely wrong
      return (result.column_count ?? result.columns?.length ?? 0) === 0;
    case 'get_sample_data':
      // Explicitly requested sample data but got nothing
      return (result.row_count ?? 0) === 0;
    // Note: get_table_indexes, get_table_constraints, get_foreign_keys
    // can legitimately return 0 - a table may have no indexes/constraints/FKs
    default:
      return false;
  }
}
function getResultSummary(name, result) {
  if (!result) return '';
  if (result.success === false || result.error) return 'failed';

  const summaries = {
    'get_connection_status': () => result.connected ? `${result.database || 'connected'}` : 'not connected',
    'get_database_list': () => `${result.count ?? result.databases?.length ?? 0} found`,
    'get_database_schema': () => `${result.table_count ?? result.tables?.length ?? 0} tables`,
    'get_table_columns': () => `${result.column_count ?? result.columns?.length ?? 0} columns`,
    'execute_query': () => `${result.row_count ?? 0} rows`,
    'get_recent_queries': () => `${result.count ?? 0} queries`,
    'get_sample_data': () => `${result.row_count ?? 0} rows`,
    'get_table_indexes': () => `${result.count ?? result.indexes?.length ?? 0} indexes`,
    'get_table_constraints': () => `${result.count ?? result.constraints?.length ?? 0} constraints`,
    'get_foreign_keys': () => `${result.count ?? result.foreign_keys?.length ?? 0} relationships`,
  };

  return summaries[name]?.() || 'done';
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
      if (result.host) msg += ` on ${result.host}`;
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
      const cols = result.columns?.slice(0, 5).join(', ') || '';
      return `Table has ${count} columns${cols ? `: ${cols}${count > 5 ? '...' : ''}` : ''}`;
    },
    'execute_query': () => {
      const rowCount = result.row_count ?? 0;
      const totalRows = result.total_rows ?? rowCount;
      let msg = `Query returned ${rowCount} rows`;
      if (result.truncated && totalRows > rowCount) {
        msg += ` (of ${totalRows.toLocaleString()} total)`;
      }
      if (result.column_count) msg += ` with ${result.column_count} columns`;
      return msg;
    },
    'get_recent_queries': () => `Found ${result.count ?? 0} recent queries`,
    'get_sample_data': () => {
      const count = result.row_count ?? 0;
      return `Retrieved ${count} sample row${count !== 1 ? 's' : ''} from ${result.table || 'table'}`;
    },
    'get_table_indexes': () => {
      const count = result.count ?? result.indexes?.length ?? 0;
      const indexes = result.indexes?.slice(0, 3).map(i => i.index_name).join(', ') || '';
      return `Found ${count} index${count !== 1 ? 'es' : ''} on ${result.table || 'table'}${indexes ? `: ${indexes}${count > 3 ? '...' : ''}` : ''}`;
    },
    'get_table_constraints': () => {
      const count = result.count ?? result.constraints?.length ?? 0;
      return `Found ${count} constraint${count !== 1 ? 's' : ''} on ${result.table || 'table'}`;
    },
    'get_foreign_keys': () => {
      const count = result.count ?? result.foreign_keys?.length ?? 0;
      return `Found ${count} foreign key relationship${count !== 1 ? 's' : ''}${result.table ? ` for ${result.table}` : ''}`;
    },
  };

  return details[name]?.() || 'Completed successfully';
}

// --- Components ---

const AnimatedDots = memo(() => (
  <Box component="span" sx={{ display: 'inline-flex', gap: '2px', ml: 0.5 }}>
    {DOT_INDICES.map((i) => (
      <Box
        key={i}
        component="span"
        sx={{
          width: 3,
          height: 3,
          borderRadius: '50%',
          backgroundColor: 'currentColor',
          animation: `${dotPulse} 1.4s ease-in-out infinite`,
          animationDelay: `${i * 0.16}s`,
        }}
      />
    ))}
  </Box>
));
AnimatedDots.displayName = 'AnimatedDots';

/**
 * Individual step row (thinking or tool) - lightweight, no accordion chrome
 */
const StepRow = memo(({ step }) => {
  const [expanded, setExpanded] = useState(false);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  // Safely extract step properties (handle null/undefined)
  const stepType = step?.type || '';
  const isThinking = stepType === 'thinking';
  const isTool = stepType === 'tool';
  const isValid = isThinking || isTool;

  // Parse tool data (safe even if step is invalid)
  const { parsedArgs, parsedResult, isError, isRunning } = useMemo(() => {
    if (!isTool || !step) return { parsedArgs: null, parsedResult: null, isError: false, isRunning: false };
    const args = parseJSON(step.args);
    const result = parseJSON(step.result);
    const running = step.status === 'running';
    return {
      parsedArgs: args,
      parsedResult: result,
      isRunning: running,
      isError: step.status === 'error' || isSemanticFailure(step.name, result),
    };
  }, [isTool, step]);

  // Tool config (safe)
  const config = useMemo(() => {
    const name = step?.name;
    if (!isTool || !name) return { action: 'Processing', pastAction: 'Processed', icon: CodeRoundedIcon };
    return TOOL_CONFIG[name] || {
      action: formatToolName(name),
      pastAction: formatToolName(name),
      icon: CodeRoundedIcon,
    };
  }, [isTool, step]);

  // Thinking active state - use step.isComplete instead of parent isStreaming
  // (parent isStreaming may be false by the time steps are rendered)
  const isThinkingActive = isThinking && step && !step.isComplete;

  // Auto-expand thinking steps that are not yet complete
  useEffect(() => {
    if (isThinking && !step?.isComplete && step?.content) {
      setExpanded(true);
    }
  }, [isThinking, step?.isComplete, step?.content]);

  // Has expandable details?
  const hasDetails = useMemo(() => {
    if (!step) return false;
    if (isThinking) return step.content && step.content.trim();
    if (isTool) return parsedArgs?.query || parsedResult;
    return false;
  }, [isThinking, isTool, step, parsedArgs, parsedResult]);

  const handleToggle = useCallback(() => {
    if (hasDetails) setExpanded(prev => !prev);
  }, [hasDetails]);

  // Status icon for tools
  const statusIcon = useMemo(() => {
    if (isThinking) {
      return <BubbleChartRoundedIcon sx={{
        fontSize: 15,
        color: theme.palette.info.main,
        opacity: isThinkingActive ? 1 : 0.6,
        ...(isThinkingActive && { animation: `${gentlePulse} 1.5s ease-in-out infinite` }),
      }} />;
    }
    if (isRunning) {
      return <AutorenewRoundedIcon sx={{ fontSize: 15, color: theme.palette.info.main, animation: `${spin} 1s linear infinite` }} />;
    }
    if (isError) {
      return <ErrorRoundedIcon sx={{ fontSize: 15, color: theme.palette.error.main }} />;
    }
    return <CheckCircleRoundedIcon sx={{ fontSize: 15, color: theme.palette.success.main }} />;
  }, [isThinking, isThinkingActive, isRunning, isError, theme]);

  // Display text
  const displayText = useMemo(() => {
    if (isThinking) return isThinkingActive ? 'Thinking' : 'Thought process';
    if (isTool && config) {
      return isRunning ? config.action : config.pastAction;
    }
    return '';
  }, [isThinking, isThinkingActive, isTool, isRunning, config]);

  // Result summary badge for tools
  const resultBadge = useMemo(() => {
    const name = step?.name;
    if (!isTool || isRunning || !parsedResult || !name) return null;
    return getResultSummary(name, parsedResult);
  }, [isTool, isRunning, parsedResult, step]);

  // Query height for SQL editor
  const queryHeight = useMemo(() => {
    const query = parsedArgs?.query;
    if (!query) return 60;
    const lineCount = query.split('\n').length;
    return Math.min(Math.max(60, (lineCount * 19) + 20), 400);
  }, [parsedArgs]);

  // Filtered params (exclude query and rationale)
  const filteredParams = useMemo(() => {
    if (!parsedArgs) return [];
    return Object.entries(parsedArgs).filter(([key, value]) =>
      !['query', 'rationale'].includes(key) && value != null
    );
  }, [parsedArgs]);

  const ToolIcon = config?.icon;

  // Early return AFTER all hooks
  if (!isValid) return null;

  return (
    <Box
      sx={{
        borderBottom: `1px solid ${isDark ? alpha('#fff', 0.05) : alpha('#000', 0.04)}`,
        '&:last-child': { borderBottom: 'none' },
        // Entry animation for smooth appearance
        animation: `${fadeSlideIn} 0.2s ease-out`,
        // Shimmer effect for running state
        ...(isRunning && {
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(90deg, transparent, ${isDark ? alpha('#fff', 0.03) : alpha('#000', 0.02)}, transparent)`,
            backgroundSize: '200% 100%',
            animation: `${shimmer} 2s ease-in-out infinite`,
            pointerEvents: 'none',
            borderRadius: 'inherit',
          },
        }),
      }}
    >
      {/* Row header */}
      <ButtonBase
        onClick={handleToggle}
        sx={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.5,
          py: 1,
          cursor: hasDetails ? 'pointer' : 'default',
          transition: 'background-color 0.1s ease',
          '&:hover': hasDetails ? {
            backgroundColor: isDark ? alpha('#fff', 0.02) : alpha('#000', 0.02),
          } : {},
        }}
        disableRipple
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
          {statusIcon}
          {isTool && ToolIcon && (
            <ToolIcon sx={{ fontSize: 14, color: isDark ? alpha('#fff', 0.35) : alpha('#000', 0.3) }} />
          )}
          <Typography
            variant="body2"
            sx={{
              color: isDark ? alpha('#fff', 0.6) : alpha('#000', 0.55),
              fontSize: '0.8125rem',
              fontWeight: 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {displayText}
            {(isThinkingActive || isRunning) && <AnimatedDots />}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
          {resultBadge && !expanded && (
            <Typography
              variant="caption"
              sx={{
                color: isDark ? alpha('#fff', 0.35) : alpha('#000', 0.35),
                fontSize: '0.7rem',
              }}
            >
              {resultBadge}
            </Typography>
          )}
          {hasDetails && (
            <KeyboardArrowDownIcon
              sx={{
                fontSize: 18,
                color: isDark ? alpha('#fff', 0.3) : alpha('#000', 0.25),
                transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.15s ease',
              }}
            />
          )}
        </Box>
      </ButtonBase>

      {/* Expandable content */}
      {hasDetails && (
        <Collapse in={expanded} timeout={120} unmountOnExit>
          <Box sx={{ px: 1.5, pb: 1.5, pt: 0.5 }}>
            {/* Thinking content */}
            {isThinking && step.content && (
              <Typography
                variant="body2"
                sx={{
                  color: isDark ? alpha('#fff', 0.45) : alpha('#000', 0.45),
                  fontSize: '0.75rem',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  maxHeight: 150,
                  overflow: 'auto',
                }}
              >
                {step.content}
              </Typography>
            )}

            {/* Tool details */}
            {isTool && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {/* Rationale (LLM's reasoning) */}
                {parsedArgs?.rationale && (
                  <Typography
                    variant="body2"
                    sx={{
                      color: isDark ? alpha('#fff', 0.5) : alpha('#000', 0.5),
                      fontSize: '0.75rem',
                      fontStyle: 'italic',
                      lineHeight: 1.5,
                      pb: 0.5,
                      borderBottom: `1px dashed ${isDark ? alpha('#fff', 0.08) : alpha('#000', 0.06)}`,
                    }}
                  >
                    {parsedArgs.rationale}
                  </Typography>
                )}

                {/* Query */}
                {parsedArgs?.query && (
                  <Box>
                    <Typography variant="labelSmall" sx={getSectionLabelSx(isDark)}>
                      Query
                    </Typography>
                    <Box sx={{ borderRadius: '6px', overflow: 'hidden', border: `1px solid ${isDark ? alpha('#fff', 0.06) : alpha('#000', 0.06)}`, height: queryHeight }}>
                      <Editor
                        height="100%"
                        language="sql"
                        theme={isDark ? 'vs-dark' : 'light'}
                        value={parsedArgs.query}
                        options={MONACO_OPTIONS}
                        loading={<Box sx={{ p: 1, color: 'text.secondary', fontSize: '0.7rem' }}>Loading...</Box>}
                      />
                    </Box>
                  </Box>
                )}

                {/* Parameters */}
                {filteredParams.length > 0 && (
                  <Box>
                    <Typography variant="labelSmall" sx={getSectionLabelSx(isDark)}>
                      Parameters
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {filteredParams.map(([key, value]) => (
                        <Box key={key} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 0.75, py: 0.25, borderRadius: '4px', backgroundColor: isDark ? alpha('#fff', 0.04) : alpha('#000', 0.03) }}>
                          <Typography variant="caption" sx={{ color: isDark ? alpha('#fff', 0.4) : alpha('#000', 0.4), fontSize: '0.7rem' }}>
                            {key}:
                          </Typography>
                          <Typography variant="caption" sx={{ fontWeight: 500, fontSize: '0.7rem', color: isDark ? alpha('#fff', 0.65) : alpha('#000', 0.55) }}>
                            {String(value)}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}

                {/* Result */}
                {parsedResult && !isRunning && (
                  <Box>
                    <Typography variant="labelSmall" sx={getSectionLabelSx(isDark)}>
                      Result
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: isError ? 'error.main' : (isDark ? alpha('#fff', 0.55) : alpha('#000', 0.5)),
                        fontSize: '0.75rem',
                      }}
                    >
                      {getDetailedResult(step.name, parsedResult)}
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        </Collapse>
      )}
    </Box>
  );
});
StepRow.displayName = 'StepRow';

/**
 * Claude-style unified steps accordion
 * Single master toggle containing all thinking/tool steps as lightweight rows
 */
export const StepsAccordion = memo(({ steps, isStreaming }) => {
  const [expanded, setExpanded] = useState(true);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  // Defensive: ensure steps is valid array (memoized)
  const validSteps = useMemo(() =>
    Array.isArray(steps) ? steps.filter(s => s && s.type) : []
    , [steps]);

  // Auto-collapse when streaming ends (after a delay)
  useEffect(() => {
    if (!isStreaming && validSteps.length > 0) {
      const timer = setTimeout(() => setExpanded(false), 800);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, validSteps.length]);

  // Count steps
  const stepCount = validSteps.length;

  // Any step still running?
  const hasActiveStep = useMemo(() =>
    validSteps.some(s =>
      (s.type === 'thinking' && !s.isComplete) ||
      (s.type === 'tool' && s.status === 'running')
    ), [validSteps]);

  const handleToggle = useCallback(() => setExpanded(prev => !prev), []);

  if (stepCount === 0) return null;

  return (
    <Box sx={{ mb: 1.5 }}>
      {/* Master header */}
      <ButtonBase
        onClick={handleToggle}
        sx={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.5,
          py: 1,
          borderRadius: expanded ? '10px 10px 0 0' : '10px',
          backgroundColor: isDark
            ? alpha(theme.palette.common.white, 0.03)
            : alpha(theme.palette.common.black, 0.02),
          border: `1px solid ${isDark
            ? alpha(theme.palette.common.white, 0.08)
            : alpha(theme.palette.common.black, 0.06)}`,
          borderBottom: expanded ? 'none' : undefined,
          transition: 'all 0.15s ease',
          '&:hover': {
            backgroundColor: isDark
              ? alpha(theme.palette.common.white, 0.05)
              : alpha(theme.palette.common.black, 0.03),
          },
        }}
        disableRipple
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <KeyboardArrowDownIcon
            sx={{
              fontSize: 18,
              color: isDark ? alpha('#fff', 0.4) : alpha('#000', 0.35),
              transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.15s ease',
            }}
          />
          <Typography
            variant="body2"
            sx={{
              color: isDark ? alpha('#fff', 0.55) : alpha('#000', 0.5),
              fontSize: '0.8125rem',
              fontWeight: 500,
            }}
          >
            {expanded ? 'Hide steps' : 'Show steps'}
            {hasActiveStep && <AnimatedDots />}
          </Typography>
        </Box>
        <Typography
          variant="caption"
          sx={{
            color: isDark ? alpha('#fff', 0.35) : alpha('#000', 0.3),
            fontSize: '0.7rem',
          }}
        >
          {stepCount} step{stepCount !== 1 ? 's' : ''}
        </Typography>
      </ButtonBase>

      {/* Steps container */}
      <Collapse in={expanded} timeout={150}>
        <Box
          sx={{
            backgroundColor: isDark
              ? alpha(theme.palette.common.white, 0.02)
              : alpha(theme.palette.common.black, 0.01),
            borderLeft: `1px solid ${isDark
              ? alpha(theme.palette.common.white, 0.08)
              : alpha(theme.palette.common.black, 0.06)}`,
            borderRight: `1px solid ${isDark
              ? alpha(theme.palette.common.white, 0.08)
              : alpha(theme.palette.common.black, 0.06)}`,
            borderBottom: `1px solid ${isDark
              ? alpha(theme.palette.common.white, 0.08)
              : alpha(theme.palette.common.black, 0.06)}`,
            borderRadius: '0 0 10px 10px',
          }}
        >
          {validSteps.map((step, idx) => (
            <StepRow key={`${idx}-${step.type}`} step={step} />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
});
StepsAccordion.displayName = 'StepsAccordion';