import { useState, useMemo, memo, lazy, Suspense } from 'react';
import { Box, Typography, Collapse, useTheme, ButtonBase, Link } from '@mui/material';
import { alpha, keyframes } from '@mui/material/styles';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded';
import { registerMonacoThemes, getMonacoThemeName, TRANSITIONS } from '../../theme';
import { getDetailedResult } from './stepUtils';
import { slideIn, TIMELINE_LINE_X } from './timelineShared';

const Editor = lazy(() => import('@monaco-editor/react'));

const spin = keyframes`
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;
const TIMELINE_CONTENT_PL = { xs: 3.5, sm: 4 };

let monacoThemesRegistered = false;

const MONACO_OPTIONS = {
  readOnly: true,
  minimap: { enabled: false },
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

const registerOpaqueMonacoThemes = (monaco) => {
  if (monacoThemesRegistered) return;
  registerMonacoThemes(monaco);
  monacoThemesRegistered = true;
};

const getTimelineNodeSx = ({
  isDark,
  color,
  isCurrent = false,
  shadowColor,
  shadowAlphaDark = 0.12,
  shadowAlphaLight = 0.16,
  animation,
}) => ({
  position: 'absolute',
  left: TIMELINE_LINE_X,
  top: '50%',
  transform: 'translate(-50%, -50%)',
  fontSize: { xs: 15, sm: 17 },
  zIndex: 1,
  backgroundColor: 'background.paper',
  borderRadius: '50%',
  color,
  boxShadow:
    isCurrent && shadowColor
      ? `0 0 0 4px ${alpha(shadowColor, isDark ? shadowAlphaDark : shadowAlphaLight)}`
      : 'none',
  ...(animation ? { animation } : {}),
});

export const ThinkingStep = memo(function ThinkingStep({ content = '', isComplete, isCurrent = false }) {
  const [showMore, setShowMore] = useState(false);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isActive = !isComplete;
  const lines = content.split('\n');
  const isLong = lines.length > 6 || content.length > 400;
  const displayContent = showMore ? content : lines.slice(0, 6).join('\n');
  const nodeColor = alpha(theme.palette.info.main, isDark ? 0.7 : 0.6);

  const thinkingNodeSx = useMemo(() => getTimelineNodeSx({
    isDark,
    color: nodeColor,
    isCurrent,
    shadowColor: theme.palette.info.main,
    shadowAlphaDark: 0.14,
    shadowAlphaLight: 0.16,
    animation: isActive ? `${pulse} 2s ease-in-out infinite` : undefined,
  }), [isActive, isCurrent, isDark, nodeColor, theme.palette.info.main]);

  return (
    <Box sx={{ animation: `${slideIn} 0.3s cubic-bezier(0.4, 0, 0.2, 1)`, position: 'relative', pl: TIMELINE_CONTENT_PL, py: { xs: 1, sm: 1.5 } }}>
      <AccessTimeRoundedIcon sx={thinkingNodeSx} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {content ? (
          <>
            <Typography
              component="div"
              sx={{
                color: alpha(theme.palette.text.primary, isDark ? 0.85 : 0.8),
                ...theme.typography.uiBodyMd,
                fontFamily: theme.typography.fontFamily,
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
                  ...theme.typography.uiCaptionSm,
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
              ...theme.typography.uiBodyMd,
              fontFamily: theme.typography.fontFamily,
              fontStyle: 'italic',
              ...(isActive ? { animation: `${pulse} 2s ease-in-out infinite` } : {}),
            }}
          >
            {isActive ? 'Thinking...' : 'Thought process'}
          </Typography>
        )}
      </Box>
    </Box>
  );
});

export const ToolStep = memo(function ToolStep({
  stepName,
  actionText,
  parsedArgs,
  parsedResult,
  isError,
  isRunning,
  isCurrent = false,
  isCompactMobile = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const hasDetails = Boolean(parsedArgs?.query || parsedResult);

  const monacoOptions = useMemo(
    () => ({ ...MONACO_OPTIONS, fontSize: theme.typography.uiCode.fontSizePx }),
    [theme.typography.uiCode.fontSizePx]
  );
  const queryHeight = useMemo(() => {
    const query = parsedArgs?.query;
    if (!query) return 80;
    const lineCount = query.split('\n').length;
    return Math.min(Math.max(80, (lineCount * 20) + 24), 300);
  }, [parsedArgs?.query]);

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

  const statusNodeSx = useMemo(() => getTimelineNodeSx({
    isDark,
    color: nodeColor,
    isCurrent,
    shadowColor: isRunning
      ? theme.palette.primary.main
      : isError
        ? theme.palette.error.main
        : theme.palette.success.main,
    animation: isRunning ? `${spin} 1s linear infinite` : undefined,
  }), [
    isCurrent,
    isDark,
    isError,
    isRunning,
    nodeColor,
    theme.palette.error.main,
    theme.palette.primary.main,
    theme.palette.success.main,
  ]);

  return (
    <Box sx={{ animation: `${slideIn} 0.3s cubic-bezier(0.4, 0, 0.2, 1)`, position: 'relative', pl: TIMELINE_CONTENT_PL, py: { xs: 0.75, sm: 1 } }}>
      <StatusIcon sx={statusNodeSx} />
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
          '&:hover .step-text': hasDetails ? { color: alpha(theme.palette.text.primary, isDark ? 0.95 : 0.85) } : {},
          '&:hover .step-arrow': hasDetails ? { color: alpha(theme.palette.text.secondary, 0.6) } : {},
        }}
        disableRipple
      >
        <Typography
          className="step-text"
          sx={{
            color: alpha(theme.palette.text.primary, isDark ? 0.78 : 0.7),
            ...theme.typography.uiBodySm,
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
              p: { xs: 1, sm: 1.5 },
              borderRadius: { xs: '8px', sm: '10px' },
              bgcolor: isDark ? alpha(theme.palette.background.elevated, 0.6) : alpha(theme.palette.background.elevated, 0.8),
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
                    ...theme.typography.uiMonoLabel,
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
                  <Suspense fallback={<Box sx={{ p: 1.5, color: 'text.secondary', ...theme.typography.uiCaptionSm }}>Loading editor...</Box>}>
                    <Editor
                      height="100%"
                      language="sql"
                      theme={getMonacoThemeName(theme.palette.mode)}
                      value={parsedArgs.query}
                      options={monacoOptions}
                      beforeMount={registerOpaqueMonacoThemes}
                      loading={<Box sx={{ p: 1.5, color: 'text.secondary', ...theme.typography.uiCaptionSm }}>Loading...</Box>}
                    />
                  </Suspense>
                </Box>
              </Box>
            )}
            {parsedResult && !isRunning && (
              <Box>
                <Typography
                  sx={{
                    fontFamily: theme.typography.fontFamilyMono,
                    ...theme.typography.uiMonoLabel,
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
                    color: isError ? alpha(theme.palette.error.main, 0.85) : alpha(theme.palette.text.secondary, 0.75),
                    ...theme.typography.uiBodySm,
                    fontFamily: theme.typography.fontFamily,
                    lineHeight: 1.6,
                  }}
                >
                  {getDetailedResult(stepName, parsedResult)}
                </Typography>
              </Box>
            )}
          </Box>
        </Collapse>
      )}
    </Box>
  );
});

export const DoneIndicator = memo(function DoneIndicator() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const doneNodeSx = useMemo(() => getTimelineNodeSx({
    isDark,
    color: alpha(theme.palette.success.main, isDark ? 0.6 : 0.5),
  }), [isDark, theme.palette.success.main]);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 }, position: 'relative', pl: TIMELINE_CONTENT_PL, py: { xs: 0.75, sm: 1 }, animation: `${slideIn} 0.3s cubic-bezier(0.4, 0, 0.2, 1)` }}>
      <CheckCircleOutlineRoundedIcon sx={doneNodeSx} />
      <Typography
        sx={{
          color: alpha(theme.palette.text.primary, isDark ? 0.7 : 0.6),
          ...theme.typography.uiBodySm,
          fontFamily: theme.typography.fontFamily,
          fontWeight: 500,
        }}
      >
        Done
      </Typography>
    </Box>
  );
});
