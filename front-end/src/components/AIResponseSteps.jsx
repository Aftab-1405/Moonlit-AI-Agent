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

// =============================================================================
// KEYFRAME ANIMATIONS (MUI keyframes)
// =============================================================================

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const dotPulse = keyframes`
  0%, 80%, 100% { opacity: 0.3; }
  40% { opacity: 1; }
`;

const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

const fadeSlideIn = keyframes`
  0% { opacity: 0; transform: translateY(-4px); }
  100% { opacity: 1; transform: translateY(0); }
`;

const gentlePulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

// =============================================================================
// STATIC CONFIGURATION
// =============================================================================

const MONACO_OPTIONS = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 12,
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
    verticalScrollbarSize: 6,
    horizontalScrollbarSize: 6,
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
    case 'get_connection_status':
      return result.connected === false;
    case 'get_database_list':
      return (result.count ?? result.databases?.length ?? 0) === 0;
    case 'get_database_schema':
      return (result.table_count ?? result.tables?.length ?? 0) === 0;
    case 'get_table_columns':
      return (result.column_count ?? result.columns?.length ?? 0) === 0;
    case 'get_sample_data':
      return (result.row_count ?? 0) === 0;
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

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

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
          bgcolor: 'currentColor',
          animation: `${dotPulse} 1.4s ease-in-out infinite`,
          animationDelay: `${i * 0.16}s`,
        }}
      />
    ))}
  </Box>
));
AnimatedDots.displayName = 'AnimatedDots';

/**
 * Individual step row
 */
const StepRow = memo(({ step }) => {
  const [expanded, setExpanded] = useState(false);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const stepType = step?.type || '';
  const isThinking = stepType === 'thinking';
  const isTool = stepType === 'tool';
  const isValid = isThinking || isTool;

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

  const config = useMemo(() => {
    const name = step?.name;
    if (!isTool || !name) return { action: 'Processing', pastAction: 'Processed', icon: CodeRoundedIcon };
    return TOOL_CONFIG[name] || {
      action: formatToolName(name),
      pastAction: formatToolName(name),
      icon: CodeRoundedIcon,
    };
  }, [isTool, step]);

  const isThinkingActive = isThinking && step && !step.isComplete;

  useEffect(() => {
    if (isThinking && !step?.isComplete && step?.content) {
      setExpanded(true);
    }
  }, [isThinking, step?.isComplete, step?.content]);

  const hasDetails = useMemo(() => {
    if (!step) return false;
    if (isThinking) return step.content && step.content.trim();
    if (isTool) return parsedArgs?.query || parsedResult;
    return false;
  }, [isThinking, isTool, step, parsedArgs, parsedResult]);

  const handleToggle = useCallback(() => {
    if (hasDetails) setExpanded(prev => !prev);
  }, [hasDetails]);

  const statusIcon = useMemo(() => {
    if (isThinking) {
      return (
        <BubbleChartRoundedIcon
          sx={{
            fontSize: 14,
            color: (theme) => alpha(theme.palette.info.main, isDark ? 0.7 : 0.6),
            opacity: isThinkingActive ? 1 : 0.6,
            ...(isThinkingActive && { animation: `${gentlePulse} 1.5s ease-in-out infinite` }),
          }}
        />
      );
    }
    if (isRunning) {
      return (
        <AutorenewRoundedIcon
          sx={{
            fontSize: 14,
            color: (theme) => alpha(theme.palette.primary.main, 0.7),
            animation: `${spin} 1s linear infinite`,
          }}
        />
      );
    }
    if (isError) {
      return (
        <ErrorRoundedIcon
          sx={{ fontSize: 14, color: (theme) => alpha(theme.palette.error.main, 0.7) }}
        />
      );
    }
    return (
      <CheckCircleRoundedIcon
        sx={{ fontSize: 14, color: (theme) => alpha(theme.palette.success.main, isDark ? 0.6 : 0.5) }}
      />
    );
  }, [isThinking, isThinkingActive, isRunning, isError, isDark]);

  const displayText = useMemo(() => {
    if (isThinking) return isThinkingActive ? 'Thinking' : 'Thought process';
    if (isTool && config) {
      return isRunning ? config.action : config.pastAction;
    }
    return '';
  }, [isThinking, isThinkingActive, isTool, isRunning, config]);

  const resultBadge = useMemo(() => {
    const name = step?.name;
    if (!isTool || isRunning || !parsedResult || !name) return null;
    return getResultSummary(name, parsedResult);
  }, [isTool, isRunning, parsedResult, step]);

  const queryHeight = useMemo(() => {
    const query = parsedArgs?.query;
    if (!query) return 60;
    const lineCount = query.split('\n').length;
    return Math.min(Math.max(60, (lineCount * 18) + 20), 350);
  }, [parsedArgs]);

  const filteredParams = useMemo(() => {
    if (!parsedArgs) return [];
    return Object.entries(parsedArgs).filter(([key, value]) =>
      !['query', 'rationale'].includes(key) && value != null
    );
  }, [parsedArgs]);

  const ToolIcon = config?.icon;

  if (!isValid) return null;

  return (
    <Box
      sx={{
        borderBottom: (theme) => `1px solid ${alpha(theme.palette.divider, 0.5)}`,
        '&:last-child': { borderBottom: 'none' },
        animation: `${fadeSlideIn} 0.2s ease-out`,
        ...(isRunning && {
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            background: (theme) => `linear-gradient(90deg, transparent, ${alpha(theme.palette.primary.main, 0.03)}, transparent)`,
            backgroundSize: '200% 100%',
            animation: `${shimmer} 2s ease-in-out infinite`,
            pointerEvents: 'none',
          },
        }),
      }}
    >
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
          transition: (theme) => theme.transitions.create(['background-color'], { duration: 200 }),
          '&:hover': hasDetails ? {
            bgcolor: (theme) => alpha(theme.palette.text.primary, 0.02),
          } : {},
        }}
        disableRipple
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
          {statusIcon}
          {isTool && ToolIcon && (
            <ToolIcon sx={{ fontSize: 13, color: (theme) => alpha(theme.palette.text.secondary, 0.4) }} />
          )}
          <Typography
            variant="body2"
            sx={{
              color: (theme) => alpha(theme.palette.text.secondary, 0.7),
              fontSize: '0.8rem',
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
                color: (theme) => isError 
                  ? alpha(theme.palette.error.main, 0.6)
                  : alpha(theme.palette.text.secondary, 0.45),
                fontSize: '0.65rem',
              }}
            >
              {resultBadge}
            </Typography>
          )}
          {hasDetails && (
            <KeyboardArrowDownIcon
              sx={{
                fontSize: 16,
                color: (theme) => alpha(theme.palette.text.secondary, 0.35),
                transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.15s ease',
              }}
            />
          )}
        </Box>
      </ButtonBase>

      {hasDetails && (
        <Collapse in={expanded} timeout={120} unmountOnExit>
          <Box sx={{ px: 1.5, pb: 1.5, pt: 0.5 }}>
            {isThinking && step.content && (
              <Typography
                variant="body2"
                sx={{
                  color: (theme) => alpha(theme.palette.text.secondary, 0.6),
                  fontSize: '0.75rem',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  maxHeight: 150,
                  overflow: 'auto',
                  fontStyle: 'italic',
                }}
              >
                {step.content}
              </Typography>
            )}

            {isTool && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {parsedArgs?.rationale && (
                  <Typography
                    variant="body2"
                    sx={{
                      color: (theme) => alpha(theme.palette.text.secondary, 0.55),
                      fontSize: '0.75rem',
                      fontStyle: 'italic',
                      lineHeight: 1.5,
                      pb: 0.5,
                      borderBottom: (theme) => `1px dashed ${alpha(theme.palette.divider, 0.5)}`,
                    }}
                  >
                    {parsedArgs.rationale}
                  </Typography>
                )}

                {parsedArgs?.query && (
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{
                        color: (theme) => alpha(theme.palette.text.secondary, 0.5),
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        fontSize: '0.6rem',
                        fontWeight: 500,
                        mb: 0.5,
                        display: 'block',
                      }}
                    >
                      Query
                    </Typography>
                    <Box
                      sx={{
                        borderRadius: 0.5,
                        overflow: 'hidden',
                        border: (theme) => `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                        height: queryHeight,
                      }}
                    >
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

                {filteredParams.length > 0 && (
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{
                        color: (theme) => alpha(theme.palette.text.secondary, 0.5),
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        fontSize: '0.6rem',
                        fontWeight: 500,
                        mb: 0.5,
                        display: 'block',
                      }}
                    >
                      Parameters
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {filteredParams.map(([key, value]) => (
                        <Box
                          key={key}
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.5,
                            px: 0.75,
                            py: 0.25,
                            borderRadius: 0.5,
                            bgcolor: (theme) => alpha(theme.palette.text.primary, 0.04),
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{ color: (theme) => alpha(theme.palette.text.secondary, 0.5), fontSize: '0.65rem' }}
                          >
                            {key}:
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 500, fontSize: '0.65rem', color: (theme) => alpha(theme.palette.text.primary, 0.65) }}
                          >
                            {String(value)}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}

                {parsedResult && !isRunning && (
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{
                        color: (theme) => alpha(theme.palette.text.secondary, 0.5),
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        fontSize: '0.6rem',
                        fontWeight: 500,
                        mb: 0.5,
                        display: 'block',
                      }}
                    >
                      Result
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: (theme) => isError 
                          ? alpha(theme.palette.error.main, 0.75)
                          : alpha(theme.palette.text.secondary, 0.65),
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

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const StepsAccordion = memo(({ steps, isStreaming }) => {
  const [expanded, setExpanded] = useState(true);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const validSteps = useMemo(() =>
    Array.isArray(steps) ? steps.filter(s => s && s.type) : []
  , [steps]);

  useEffect(() => {
    if (!isStreaming && validSteps.length > 0) {
      const timer = setTimeout(() => setExpanded(false), 800);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, validSteps.length]);

  const stepCount = validSteps.length;

  const hasActiveStep = useMemo(() =>
    validSteps.some(s =>
      (s.type === 'thinking' && !s.isComplete) ||
      (s.type === 'tool' && s.status === 'running')
    ), [validSteps]);

  const handleToggle = useCallback(() => setExpanded(prev => !prev), []);

  if (stepCount === 0) return null;

  return (
    <Box sx={{ mb: 1.5 }}>
      <ButtonBase
        onClick={handleToggle}
        sx={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.5,
          py: 0.75,
          borderRadius: expanded ? '4px 4px 0 0' : 1,
          bgcolor: (theme) => alpha(theme.palette.text.primary, isDark ? 0.03 : 0.02),
          border: (theme) => `1px solid ${alpha(theme.palette.divider, 0.5)}`,
          borderBottom: expanded ? 'none' : undefined,
          transition: (theme) => theme.transitions.create(['background-color'], { duration: 200 }),
          '&:hover': {
            bgcolor: (theme) => alpha(theme.palette.text.primary, isDark ? 0.05 : 0.03),
          },
        }}
        disableRipple
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <KeyboardArrowDownIcon
            sx={{
              fontSize: 16,
              color: (theme) => alpha(theme.palette.text.secondary, 0.45),
              transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.15s ease',
            }}
          />
          <Typography
            variant="body2"
            sx={{
              color: (theme) => alpha(theme.palette.text.secondary, 0.65),
              fontSize: '0.8rem',
              fontWeight: 450,
            }}
          >
            {expanded ? 'Steps' : 'Show steps'}
            {hasActiveStep && <AnimatedDots />}
          </Typography>
        </Box>
        <Typography
          variant="caption"
          sx={{
            color: (theme) => alpha(theme.palette.text.secondary, 0.4),
            fontSize: '0.65rem',
          }}
        >
          {stepCount}
        </Typography>
      </ButtonBase>

      <Collapse in={expanded} timeout={150}>
        <Box
          sx={{
            bgcolor: (theme) => alpha(theme.palette.text.primary, isDark ? 0.015 : 0.01),
            border: (theme) => `1px solid ${alpha(theme.palette.divider, 0.5)}`,
            borderTop: 'none',
            borderRadius: '0 0 4px 4px',
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