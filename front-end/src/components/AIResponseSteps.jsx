import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { Box, Typography, Collapse, useTheme, ButtonBase, Link, useMediaQuery } from '@mui/material';
import { alpha, keyframes } from '@mui/material/styles';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded';
import Editor from '@monaco-editor/react';
import { registerMonacoThemes, getMonacoThemeName, TRANSITIONS } from '../theme';
import { TOOL_ACTIONS } from '../config/toolActions';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const slideIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;
const TIMELINE_LINE_X = { xs: 10, sm: 11 };
const TIMELINE_CONTENT_PL = { xs: 3.5, sm: 4 };

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

const registerOpaqueMonacoThemes = (monaco) => registerMonacoThemes(monaco);

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



const ThinkingStep = memo(({ step, isCurrent = false }) => {
  const [showMore, setShowMore] = useState(false);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  
  const isActive = !step.isComplete;
  const content = step.content || '';
  const lines = content.split('\n');
  const isLong = lines.length > 6 || content.length > 400;
  const displayContent = showMore ? content : lines.slice(0, 6).join('\n');

  const nodeColor = alpha(theme.palette.info.main, isDark ? 0.7 : 0.6);

  return (
    <Box
      sx={{
        animation: `${slideIn} 0.3s cubic-bezier(0.4, 0, 0.2, 1)`,
        position: 'relative',
        pl: TIMELINE_CONTENT_PL,
        py: { xs: 1, sm: 1.5 },
      }}
    >
      <AccessTimeRoundedIcon
        sx={{
          position: 'absolute',
          left: TIMELINE_LINE_X,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: { xs: 15, sm: 17 },
          color: nodeColor,
          zIndex: 1,
          backgroundColor: 'background.paper',
          borderRadius: '50%',
          boxShadow: isCurrent
            ? `0 0 0 4px ${alpha(theme.palette.info.main, isDark ? 0.14 : 0.16)}`
            : 'none',
          ...(isActive && {
            animation: `${pulse} 2s ease-in-out infinite`,
          }),
        }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {content ? (
          <>
            <Typography
              component="div"
              sx={{
                color: alpha(theme.palette.text.primary, isDark ? 0.85 : 0.8),
                fontSize: { xs: '0.82rem', sm: '0.9rem' },
                fontFamily: '"Merriweather", "Georgia", serif',
                lineHeight: { xs: 1.6, sm: 1.75 },
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                letterSpacing: '0.008em',
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
                  fontSize: { xs: '0.72rem', sm: '0.8rem' },
                  fontFamily: theme.typography.fontFamily,
                  fontWeight: 500,
                  color: alpha(theme.palette.text.secondary, 0.55),
                  textDecoration: 'none',
                  cursor: 'pointer',
                  transition: TRANSITIONS.default,
                  '&:hover': {
                    color: alpha(theme.palette.text.secondary, 0.85),
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
              fontSize: { xs: '0.82rem', sm: '0.9rem' },
              fontFamily: '"Merriweather", "Georgia", serif',
              fontStyle: 'italic',
              ...(isActive && {
                animation: `${pulse} 2s ease-in-out infinite`,
              }),
            }}
          >
            {isActive ? 'Thinking...' : 'Thought process'}
          </Typography>
        )}
      </Box>
    </Box>
  );
});
ThinkingStep.displayName = 'ThinkingStep';

const ToolStep = memo(({ step, isCurrent = false }) => {
  const [expanded, setExpanded] = useState(false);
  const theme = useTheme();
  const isCompactMobile = useMediaQuery(theme.breakpoints.down('sm'));
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

  const nodeColor = isRunning
    ? alpha(theme.palette.primary.main, 0.7)
    : isError
      ? alpha(theme.palette.error.main, 0.6)
      : alpha(theme.palette.success.main, isDark ? 0.6 : 0.5);

  return (
    <Box
      sx={{
        animation: `${slideIn} 0.3s cubic-bezier(0.4, 0, 0.2, 1)`,
        position: 'relative',
        pl: TIMELINE_CONTENT_PL,
        py: { xs: 0.75, sm: 1 },
      }}
      >
      <StatusIcon
        sx={{
          position: 'absolute',
          left: TIMELINE_LINE_X,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: { xs: 15, sm: 17 },
          zIndex: 1,
          backgroundColor: 'background.paper',
          borderRadius: '50%',
          color: nodeColor,
          boxShadow: isCurrent
            ? `0 0 0 4px ${alpha(
              isRunning ? theme.palette.primary.main : isError ? theme.palette.error.main : theme.palette.success.main,
              isDark ? 0.12 : 0.16
            )}`
            : 'none',
          ...(isRunning && {
            animation: `${spin} 1s linear infinite`,
          }),
        }}
      />
        <ButtonBase
        onClick={() => hasDetails && setExpanded(!expanded)}
        disabled={!hasDetails}
        sx={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: { xs: 1, sm: 1.5 },
          py: { xs: 0.35, sm: 0.5 },
          minHeight: 44,
          px: 0,
          cursor: hasDetails ? 'pointer' : 'default',
          borderRadius: 0,
          bgcolor: 'transparent',
          transition: TRANSITIONS.default,
          '&:hover .step-text': hasDetails ? {
            color: alpha(theme.palette.text.primary, isDark ? 0.95 : 0.85),
          } : {},
          '&:hover .step-arrow': hasDetails ? {
            color: alpha(theme.palette.text.secondary, 0.6),
          } : {},
        }}
        disableRipple
      >
        <Typography
          className="step-text"
          sx={{
            color: alpha(theme.palette.text.primary, isDark ? 0.75 : 0.65),
            fontSize: { xs: '0.8rem', sm: '0.875rem' },
            fontFamily: theme.typography.fontFamily,
            fontWeight: 500,
            transition: TRANSITIONS.default,
          }}
        >
          {actionText}
        </Typography>
        {hasDetails && (
          <KeyboardArrowDownIcon
            className="step-arrow"
            sx={{
              fontSize: { xs: 14, sm: 16 },
              color: alpha(theme.palette.text.secondary, 0.35),
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: TRANSITIONS.default,
              ml: 'auto',
            }}
          />
        )}
      </ButtonBase>
      {hasDetails && (
        <Collapse in={expanded} timeout={200} unmountOnExit>
          <Box
            sx={{
              mt: 0.75,
              ml: 0,
              p: { xs: 1, sm: 1.5 },
              borderRadius: { xs: '8px', sm: '10px' },
              bgcolor: isDark
                ? alpha(theme.palette.background.elevated, 0.6)
                : alpha(theme.palette.background.elevated, 0.8),
              border: '1px solid',
              borderColor: theme.palette.border.subtle,
              backgroundImage: isDark
                ? `linear-gradient(180deg, ${alpha(theme.palette.text.primary, 0.02)}, transparent)`
                : `linear-gradient(180deg, ${alpha(theme.palette.text.primary, 0.015)}, transparent)`,
            }}
          >
            {parsedArgs?.query && (
              <Box sx={{ mb: parsedResult && !isRunning ? 1.5 : 0 }}>
                <Typography
                  sx={{
                    fontFamily: theme.typography.fontFamilyMono,
                    fontSize: { xs: '0.62rem', sm: '0.6875rem' },
                    fontWeight: 500,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: theme.palette.text?.hint,
                    mb: 0.75,
                  }}
                >
                  Query
                </Typography>
                <Box
                  sx={{
                    borderRadius: '8px',
                    overflow: 'hidden',
                    height: isCompactMobile ? Math.min(queryHeight, 220) : queryHeight,
                    border: '1px solid',
                    borderColor: theme.palette.border.subtle,
                    bgcolor: theme.palette.background.default,
                  }}
                >
                  <Editor
                    height="100%"
                    language="sql"
                    theme={getMonacoThemeName(theme.palette.mode)}
                    value={parsedArgs.query}
                    options={MONACO_OPTIONS}
                    beforeMount={registerOpaqueMonacoThemes}
                    loading={
                      <Box sx={{ p: 1.5, color: 'text.secondary', fontSize: { xs: '0.72rem', sm: '0.8rem' } }}>
                        Loading...
                      </Box>
                    }
                  />
                </Box>
              </Box>
            )}
            {parsedResult && !isRunning && (
              <Box>
                <Typography
                  sx={{
                    fontFamily: theme.typography.fontFamilyMono,
                    fontSize: { xs: '0.62rem', sm: '0.6875rem' },
                    fontWeight: 500,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: theme.palette.text?.hint,
                    mb: 0.5,
                  }}
                >
                  Result
                </Typography>
                <Typography
                  sx={{
                    color: isError
                      ? alpha(theme.palette.error.main, 0.85)
                      : alpha(theme.palette.text.secondary, 0.75),
                    fontSize: { xs: '0.8rem', sm: '0.875rem' },
                    fontFamily: theme.typography.fontFamily,
                    lineHeight: 1.6,
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

const DoneIndicator = memo(() => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1, sm: 1.5 },
        position: 'relative',
        pl: TIMELINE_CONTENT_PL,
        py: { xs: 0.75, sm: 1 },
        animation: `${slideIn} 0.3s cubic-bezier(0.4, 0, 0.2, 1)`,
      }}
      >
        <CheckCircleOutlineRoundedIcon
        sx={{
          position: 'absolute',
          left: TIMELINE_LINE_X,
          top: { xs: 8, sm: 10 },
          transform: 'translateX(-50%)',
          fontSize: { xs: 15, sm: 17 },
          zIndex: 1,
          backgroundColor: 'background.paper',
          borderRadius: '50%',
          color: alpha(theme.palette.success.main, isDark ? 0.6 : 0.5),
        }}
      />
      <Typography
        sx={{
          color: alpha(theme.palette.text.primary, isDark ? 0.7 : 0.6),
          fontSize: { xs: '0.8rem', sm: '0.875rem' },
          fontFamily: theme.typography.fontFamily,
          fontWeight: 500,
        }}
      >
        Done
      </Typography>
    </Box>
  );
});
DoneIndicator.displayName = 'DoneIndicator';

export const StepsAccordion = memo(({ steps, isStreaming }) => {
  const [expanded, setExpanded] = useState(() => !!isStreaming);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const prevStreamingRef = useRef(isStreaming);
  const effectiveExpanded = isStreaming || expanded;

  const validSteps = useMemo(() =>
    Array.isArray(steps) ? steps.filter(s => s && s.type) : []
  , [steps]);
  const summaryText = useMemo(() => {
    if (validSteps.length === 0) return '';
    const toolSteps = validSteps.filter(s => s.type === 'tool' && s.status !== 'running');
    const actions = toolSteps.map(s => {
      const config = TOOL_ACTIONS[s.name];
      return config?.done || formatToolName(s.name);
    });
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
  const currentStepIndex = useMemo(() => {
    const runningIdx = validSteps.findIndex((s) =>
      (s.type === 'thinking' && !s.isComplete) ||
      (s.type === 'tool' && s.status === 'running')
    );
    return runningIdx;
  }, [validSteps]);
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    if (wasStreaming && !isStreaming && validSteps.length > 0) {
      const timer = setTimeout(() => setExpanded(false), 800);
      prevStreamingRef.current = isStreaming;
      return () => clearTimeout(timer);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, validSteps.length]);

  const handleToggle = useCallback(() => {
    if (isStreaming) return;
    setExpanded(prev => !prev);
  }, [isStreaming]);

  if (validSteps.length === 0) return null;

  return (
    <Box
      sx={{
        width: '100%',
        textAlign: 'left',
        mb: 2,
        animation: `${slideIn} 0.3s cubic-bezier(0.4, 0, 0.2, 1)`,
      }}
    >
      <ButtonBase
        onClick={handleToggle}
        sx={{
          width: '100%',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: { xs: 0.75, sm: 1 },
          py: { xs: 0.35, sm: 0.5 },
          minHeight: 44,
          px: 0,
          borderRadius: 0,
          bgcolor: 'transparent',
          textAlign: 'left',
          transition: TRANSITIONS.default,
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
            fontSize: { xs: '0.8rem', sm: '0.875rem' },
            fontFamily: theme.typography.fontFamily,
            fontWeight: 500,
            width: '100%',
            minWidth: 0,
            textAlign: 'left',
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
            lineHeight: 1.35,
            transition: TRANSITIONS.default,
          }}
        >
          {summaryText}
        </Typography>
        <KeyboardArrowDownIcon
          className="summary-arrow"
          sx={{
            fontSize: { xs: 16, sm: 18 },
            alignSelf: 'flex-start',
            mt: '1px',
            flexShrink: 0,
            ml: 0.5,
            color: alpha(theme.palette.text.secondary, 0.35),
            transform: effectiveExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: TRANSITIONS.default,
          }}
        />
      </ButtonBase>
      <Collapse in={effectiveExpanded} timeout={200}>
        <Box
          sx={{
            pt: 0.5,
            position: 'relative',
            '&::before': {
              content: '""',
              position: 'absolute',
              left: TIMELINE_LINE_X,
              top: 8,
              bottom: 8,
              width: '1px',
              backgroundColor: alpha(theme.palette.border.subtle, isDark ? 0.95 : 1),
            },
          }}
        >
          {validSteps.map((step, idx) => {
            if (step.type === 'thinking') {
              return <ThinkingStep key={`thinking-${idx}`} step={step} isCurrent={idx === currentStepIndex} />;
            }
            if (step.type === 'tool') {
              return <ToolStep key={`tool-${idx}-${step.name}`} step={step} isCurrent={idx === currentStepIndex} />;
            }
            return null;
          })}
          {isAllComplete && <DoneIndicator />}
        </Box>
      </Collapse>
    </Box>
  );
});
StepsAccordion.displayName = 'StepsAccordion';

