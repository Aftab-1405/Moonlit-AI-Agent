import { Box, ButtonBase, Collapse, Link, Typography, useTheme } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { memo, useId, useMemo, useState } from 'react';
import { CodeViewer } from '@/components';
import {
  AiSparkleIcon,
  CancelIcon,
  CheckIcon,
  ExpandMoreIcon,
  ProcessingIcon,
  TimeIcon,
} from '@/components/icons';
import { MarkdownRenderer } from '@/features/chat';
import {
  DetailLabel,
  ToolResultDetails,
} from '@/features/chat/ai-response-steps/ToolResultDetails';
import {
  getFlatStepControlSx,
  getTimelineNodeTopSx,
  slideIn,
  TIMELINE_LINE_X,
} from '@/features/chat/ai-response-steps/timelineShared';
import { HOVER_CAPABLE_QUERY } from '@/styles/mediaQueries';
import { getInteractionColors } from '@/styles/shared';
import { TRANSITIONS } from '@/theme/index';

/**
 * AI reasoning-step timeline primitives.
 *
 * Each step type renders as a vertical-timeline row with a node icon on the
 * left (anchored to the timeline line) and content on the right.
 *
 * Step types & their semantic iconography:
 *   - ThinkingStep (active) → TimeIcon — "AI is reasoning"
 *   - ThinkingStep (done)   → CheckIcon — "reasoning completed"
 *   - SkillStep             → AiSparkleIcon — "skill activated"
 *   - ToolStep (running)    → ProcessingIcon — "tool executing"
 *   - ToolStep (done)       → CheckIcon — "tool succeeded"
 *   - ToolStep (error)      → CancelIcon — "tool failed"
 *   - DoneIndicator         → CheckIcon — "workflow complete"
 *
 * The thinking/skill icons are outline style (in-progress states). The
 * done/error icons are filled (terminal states) — filled reads as "this is
 * finished", outline reads as provisional.
 */

const spin = keyframes`
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to   { transform: translate(-50%, -50%) rotate(360deg); }
`;

// Gentle opacity oscillation — softer nadir keeps it from feeling too aggressive
// during long thinking sequences.
const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.82; }
`;

const TIMELINE_CONTENT_PL = { xs: 3.5, md: 4 };
const TIMELINE_ITEM_PADDING_PX = 4;
const TIMELINE_ITEM_PY = `${TIMELINE_ITEM_PADDING_PX}px`;
const STEP_TITLE_MIN_HEIGHT = { xs: 44, md: 32 };
const TIMELINE_NODE_TOP = getTimelineNodeTopSx({
  mobileTitleMinHeight: STEP_TITLE_MIN_HEIGHT.xs,
  desktopTitleMinHeight: STEP_TITLE_MIN_HEIGHT.md,
  itemPadding: TIMELINE_ITEM_PADDING_PX,
});
const REASONING_MAX_WIDTH = '72ch';

const getTimelineNodeSx = ({ color, animation, theme, top = TIMELINE_NODE_TOP }) => ({
  position: 'absolute',
  left: TIMELINE_LINE_X,
  top,
  transform: 'translate(-50%, -50%)',
  fontSize: { xs: 18, sm: 20 },
  zIndex: 1,
  // Background matches the page so the node "punches through" the timeline
  // line cleanly — the line appears to flow behind the node, not through it.
  backgroundColor: theme.palette.background.default,
  borderRadius: '50%',
  color,
  padding: 0,
  border: 0,
  opacity: 1,
  transition: theme.transitions.create('color', {
    duration: theme.transitions.duration.shorter,
  }),
  ...(animation
    ? {
        animation,
        // Stop continuous animation for users who prefer reduced motion.
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }
    : {}),
});

const getStepButtonSx = (theme, { interactive = false } = {}) => {
  return {
    ...(interactive
      ? getFlatStepControlSx(theme)
      : {
          minHeight: STEP_TITLE_MIN_HEIGHT,
          color: theme.palette.text.secondary,
          borderRadius: 0,
        }),
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 1,
    py: 0,
    px: 0,
    cursor: interactive ? 'pointer' : 'default',
  };
};

export const ThinkingStep = memo(function ThinkingStep({
  content = '',
  isComplete,
  isCurrent = false,
  animDelay = 0,
}) {
  const [showMore, setShowMore] = useState(false);
  const theme = useTheme();
  const isActive = !isComplete;
  const interaction = getInteractionColors(theme);

  const lines = content.split('\n');
  const isLong = lines.length > 6 || content.length > 400;
  const displayContent = showMore ? content : lines.slice(0, 6).join('\n');

  const StatusIcon = isComplete ? CheckIcon : TimeIcon;
  const nodeColor = isActive ? theme.palette.info.main : theme.palette.success.main;

  const thinkingNodeSx = useMemo(
    () =>
      getTimelineNodeSx({
        color: nodeColor,
        animation: isActive ? `${pulse} 2s ease-in-out infinite` : undefined,
        theme,
      }),
    [isActive, nodeColor, theme],
  );

  return (
    <Box
      sx={{
        animation: `${slideIn} 0.22s ease-out ${animDelay}ms both`,
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        position: 'relative',
        pl: TIMELINE_CONTENT_PL,
        py: TIMELINE_ITEM_PY,
      }}
    >
      <StatusIcon sx={thinkingNodeSx} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          sx={{
            minHeight: STEP_TITLE_MIN_HEIGHT,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Typography
            sx={{
              color: theme.palette.text.primary,
              ...theme.typography.uiBodyMd,
              fontFamily: theme.typography.fontFamily,
              fontWeight: theme.typography.fontWeightMedium,
              ...(!content && isActive ? { color: theme.palette.text.secondary } : {}),
            }}
          >
            {isActive ? (content ? 'Thinking' : 'Thinking\u2026') : 'Reasoning'}
          </Typography>
        </Box>

        {content && (
          <>
            <Box
              sx={{
                color: theme.palette.text.secondary,
                ...theme.typography.uiResponseCompact,
                maxWidth: REASONING_MAX_WIDTH,
                overflowWrap: 'anywhere',
              }}
            >
              <MarkdownRenderer
                content={showMore || !isLong ? displayContent : `${displayContent}\u2026`}
                variant="compact"
                isStreaming={isCurrent}
              />
            </Box>
            {isLong && (
              <Link
                component="button"
                onClick={() => setShowMore(!showMore)}
                aria-expanded={showMore}
                sx={{
                  mt: 0.6,
                  ...theme.typography.uiCaptionSm,
                  fontFamily: theme.typography.fontFamily,
                  fontWeight: theme.typography.fontWeightMedium,
                  color: interaction.restingColor,
                  textDecoration: 'none',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  p: 0,
                  border: 0,
                  backgroundColor: 'transparent',
                  transition: TRANSITIONS.default,
                  [HOVER_CAPABLE_QUERY]: {
                    '&:hover': {
                      color: interaction.hoverColor,
                      textDecoration: 'underline',
                      backgroundColor: 'transparent',
                    },
                  },
                  '&:focus-visible': {
                    color: interaction.hoverColor,
                    outline: `2px solid ${interaction.focusRing}`,
                    outlineOffset: 2,
                  },
                }}
              >
                {showMore ? 'Show less' : 'Show more'}
              </Link>
            )}
          </>
        )}
      </Box>
    </Box>
  );
});

// ─── SkillStep ─────────────────────────────────────────────────────────────────

function humanizeSkillName(name) {
  return name.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Renders an activated skill as a completed timeline event. */
export const SkillStep = memo(function SkillStep({ skills = [], animDelay = 0 }) {
  const theme = useTheme();

  const SKILL_LABELS = {
    database_querying: 'Database',
    'database-querying': 'Database',
    react_flow_diagram: 'Diagram',
    'react-flow-diagram': 'Diagram',
    web_research: 'Web Research',
    'web-research': 'Web Research',
    query_history: 'Query History',
    'query-history': 'Query History',
  };

  const label = skills.map((s) => SKILL_LABELS[s] || humanizeSkillName(s)).join(', ');

  const nodeColor = theme.palette.success.main;

  const skillNodeSx = useMemo(
    () =>
      getTimelineNodeSx({
        color: nodeColor,
        theme,
      }),
    [nodeColor, theme],
  );

  if (!skills.length) return null;

  return (
    <Box
      sx={{
        animation: `${slideIn} 0.22s ease-out ${animDelay}ms both`,
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        position: 'relative',
        pl: TIMELINE_CONTENT_PL,
        py: TIMELINE_ITEM_PY,
      }}
    >
      <AiSparkleIcon sx={skillNodeSx} />
      <Box
        sx={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 1,
          py: 0,
          px: 0,
          minHeight: STEP_TITLE_MIN_HEIGHT,
          minWidth: 0,
        }}
      >
        <Typography
          sx={{
            color: theme.palette.text.secondary,
            ...theme.typography.uiBodyMd,
            fontFamily: theme.typography.fontFamily,
            fontWeight: theme.typography.fontWeightMedium,
            flex: 1,
            minWidth: 0,
            textAlign: 'left',
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
            lineHeight: 1.4,
          }}
        >
          {`Using ${label} skill${skills.length > 1 ? 's' : ''}`}
        </Typography>
      </Box>
    </Box>
  );
});

// ─── ToolStep ─────────────────────────────────────────────────────────────────

export const ToolStep = memo(function ToolStep({
  stepName,
  actionText,
  parsedArgs,
  parsedResult,
  isError,
  isRunning,
  isCompactMobile = false,
  animDelay = 0,
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const theme = useTheme();
  const isSqlTool = stepName === 'execute_query';
  const hasDetails = Boolean((isSqlTool && parsedArgs?.query) || parsedResult);

  const queryHeight = useMemo(() => {
    const query = parsedArgs?.query;
    if (!query) return 80;
    const lineCount = query.split('\n').length;
    return Math.min(Math.max(80, lineCount * 20 + 24), 300);
  }, [parsedArgs?.query]);

  // Status iconography — filled icons for terminal states (done/error),
  // outline + spin for in-progress. Filled reads as "this is finished";
  // outline reads as "this is in progress".
  const StatusIcon = isRunning ? ProcessingIcon : isError ? CancelIcon : CheckIcon;

  // Semantic node colors:
  //   - running → info.main (active work)
  //   - error   → error.main (red, "failed")
  //   - done    → success.main (green, "succeeded")
  // Done uses GREEN instead of primary because green is the universal
  // "success" semantic color. The previous version used primary (monochrome)
  // which made success and running states look identical.
  const nodeColor = isRunning
    ? theme.palette.info.main
    : isError
      ? theme.palette.error.main
      : theme.palette.success.main;

  const statusNodeSx = useMemo(
    () =>
      getTimelineNodeSx({
        color: nodeColor,
        animation: isRunning ? `${spin} 1s linear infinite` : undefined,
        theme,
      }),
    [isRunning, nodeColor, theme],
  );

  return (
    <Box
      sx={{
        animation: `${slideIn} 0.22s ease-out ${animDelay}ms both`,
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        position: 'relative',
        pl: TIMELINE_CONTENT_PL,
        py: TIMELINE_ITEM_PY,
      }}
    >
      <StatusIcon sx={statusNodeSx} />

      <ButtonBase
        onClick={() => hasDetails && setExpanded(!expanded)}
        disabled={!hasDetails}
        aria-expanded={hasDetails ? expanded : undefined}
        aria-controls={hasDetails ? detailsId : undefined}
        aria-label={
          hasDetails ? `${expanded ? 'Collapse' : 'Expand'} details for ${actionText}` : undefined
        }
        sx={{
          ...getStepButtonSx(theme, { interactive: hasDetails }),
        }}
        disableRipple
      >
        <Typography
          className="step-text"
          sx={{
            color: 'inherit',
            ...theme.typography.uiBodyMd,
            fontFamily: theme.typography.fontFamily,
            fontWeight: theme.typography.fontWeightMedium,
            lineHeight: 1.4,
            minWidth: 0,
            overflowWrap: 'anywhere',
            transition: TRANSITIONS.default,
          }}
        >
          {actionText}
        </Typography>
        {hasDetails && (
          <ExpandMoreIcon
            className="step-arrow"
            sx={{
              fontSize: { xs: 13, sm: 15 },
              color: 'inherit',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s',
              ml: 'auto',
            }}
          />
        )}
      </ButtonBase>

      {hasDetails && (
        <Collapse in={expanded} timeout={200} unmountOnExit>
          <Box
            id={detailsId}
            sx={{
              mt: 0.5,
              pl: { xs: 1, sm: 1.5 },
              pr: 0,
              pb: 0.5,
              bgcolor: 'transparent',
            }}
          >
            {isSqlTool && parsedArgs?.query && (
              <Box sx={{ mb: parsedResult && !isRunning ? 1.25 : 0 }}>
                <DetailLabel>Query</DetailLabel>
                <Box
                  sx={{
                    overflow: 'hidden',
                    height: isCompactMobile ? Math.min(queryHeight, 220) : queryHeight,
                  }}
                >
                  <CodeViewer value={parsedArgs.query} height="100%" transparent simple />
                </Box>
              </Box>
            )}
            {parsedResult && !isRunning && (
              <Box>
                <DetailLabel>Result</DetailLabel>
                <ToolResultDetails
                  stepName={stepName}
                  result={parsedResult}
                  args={parsedArgs}
                  isError={isError}
                />
              </Box>
            )}
          </Box>
        </Collapse>
      )}
    </Box>
  );
});

// ─── DoneIndicator ────────────────────────────────────────────────────────────

export const DoneIndicator = memo(function DoneIndicator() {
  const theme = useTheme();

  // Done = green check. Universal "success" semantic color.
  const doneNodeSx = useMemo(
    () =>
      getTimelineNodeSx({
        color: theme.palette.success.main,
        theme,
        top: '50%',
      }),
    [theme],
  );

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        pl: TIMELINE_CONTENT_PL,
        py: TIMELINE_ITEM_PY,
        minHeight: { xs: 40, sm: 42 },
        animation: `${slideIn} 0.22s ease-out both`,
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    >
      <CheckIcon sx={doneNodeSx} />
      <Typography
        sx={{
          color: theme.palette.text.secondary,
          ...theme.typography.uiCaptionSm,
          fontFamily: theme.typography.fontFamily,
          fontWeight: 400,
          letterSpacing: '0.02em',
        }}
      >
        Done
      </Typography>
    </Box>
  );
});
