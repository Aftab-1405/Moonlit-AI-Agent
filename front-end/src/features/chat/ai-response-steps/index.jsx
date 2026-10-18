import { Box, ButtonBase, Collapse, Typography, useMediaQuery, useTheme } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { memo, useCallback, useMemo, useState } from 'react';
import { ExpandMoreIcon } from '@/components/icons';
import {
  DoneIndicator,
  SkillStep,
  ThinkingStep,
  ToolStep,
} from '@/features/chat/ai-response-steps/StepTimelineItems';
import {
  areAllStepsComplete,
  buildStepsSummary,
  getCurrentStepIndex,
  isAnyStepActive,
  normalizeSteps,
} from '@/features/chat/ai-response-steps/stepUtils';
import {
  getFlatStepControlSx,
  TIMELINE_LINE_X,
} from '@/features/chat/ai-response-steps/timelineShared';
import { getChatMotionVariants } from '@/features/chat/chatMotion';

/**
 * StepsAccordion — collapsible summary of the AI's reasoning steps.
 *
 * Renders a single-line summary that, when expanded, shows the full timeline
 * of thinking + tool steps (delegated to StepTimelineItems).
 *
 * Visual states:
 *   - Live (streaming + active step): summary text shimmers; small pulsing
 *     dot before the text signals "work in progress".
 *   - Idle (not streaming, all complete): static summary; subtle check mark
 *     before the text signals "done".
 *   - Single workflow step (e.g. summarization): not expandable, renders as
 *     a plain status line.
 *
 * The accordion starts collapsed and only opens when the user clicks it —
 * there is no auto-expand or auto-collapse behavior. The live shimmer and
 * status dot still update during streaming so the user can see progress is
 * happening, but the timeline details are hidden until the user opts in.
 */

// Soft pulse for the "live" status dot. Kept subtle so it doesn't compete
// with the shimmer on the summary text.
const dotPulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.5; transform: scale(0.85); }
`;

const MotionBox = motion.create(Box);

export const StepsAccordion = memo(function StepsAccordion({
  steps,
  isStreaming,
  animateLiveUpdates = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const theme = useTheme();
  const isCompactMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const prefersReducedMotion = useReducedMotion();
  const contentMotion = useMemo(
    () => getChatMotionVariants(prefersReducedMotion).content,
    [prefersReducedMotion],
  );

  // Skill items are filtered out upstream (MessageList renders them directly).
  // normalizedSteps here will only ever contain thinking + tool steps.
  const normalizedSteps = useMemo(() => normalizeSteps(steps), [steps]);
  const summaryText = useMemo(() => buildStepsSummary(normalizedSteps), [normalizedSteps]);
  const currentStepIndex = useMemo(() => getCurrentStepIndex(normalizedSteps), [normalizedSteps]);
  const isAllComplete = useMemo(
    () => areAllStepsComplete(normalizedSteps, isStreaming),
    [normalizedSteps, isStreaming],
  );
  // Shimmer is "live" when the outer turn is streaming AND this accordion
  // still has active work (a running tool or an incomplete thinking step).
  const hasActiveStep = useMemo(() => isAnyStepActive(normalizedSteps), [normalizedSteps]);
  const isLive = isStreaming && hasActiveStep;
  // Error state — if any tool step errored, the summary dot turns red.
  const hasError = useMemo(
    () => normalizedSteps.some((s) => s.type === 'tool' && s.isError),
    [normalizedSteps],
  );

  const isSingleWorkflowStep =
    normalizedSteps.length === 1 && normalizedSteps[0].id?.startsWith('workflow-');
  const isExpandable = normalizedSteps.length > 0 && !isSingleWorkflowStep;

  const handleToggle = useCallback(() => {
    if (isExpandable) {
      setExpanded((prev) => !prev);
    }
  }, [isExpandable]);

  if (normalizedSteps.length === 0) return null;

  const summaryColor = theme.palette.text.secondary;

  // Status dot color reflects the accordion's overall state.
  //   - Live (streaming + active)  → info.main (active work)
  //   - Error                      → error.main (red, "failed")
  //   - Done (all complete)        → success.main (green, "succeeded")
  //   - Default                    → text.secondary (muted)
  const statusDotColor = hasError
    ? theme.palette.error.main
    : isLive
      ? theme.palette.info.main
      : isAllComplete
        ? theme.palette.success.main
        : theme.palette.text.secondary;

  return (
    <Box
      sx={{
        width: '100%',
        textAlign: 'left',
        mb: 1.5,
      }}
    >
      <ButtonBase
        onClick={isExpandable ? handleToggle : undefined}
        disabled={!isExpandable}
        aria-expanded={isExpandable ? expanded : undefined}
        aria-label={
          isExpandable
            ? expanded
              ? 'Collapse reasoning steps'
              : 'Expand reasoning steps'
            : undefined
        }
        sx={{
          ...(isExpandable
            ? {
                ...getFlatStepControlSx(theme),
                transition: theme.transitions.create('color', {
                  duration: theme.transitions.duration.shorter,
                }),
              }
            : {
                minHeight: { xs: 44, md: 32 },
                color: theme.palette.text.secondary,
                borderRadius: 0,
              }),
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          px: 0,
          py: 0.5,
          minWidth: 0,
          textAlign: 'left',
          cursor: isExpandable ? 'pointer' : 'default',
        }}
        disableRipple
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flex: 1,
            minWidth: 0,
          }}
        >
          {/* Status dot — small (6px) indicator before the summary text.
              Color reflects the overall state (live/error/done/idle).
              Pulses when live. */}
          <Box
            aria-hidden
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: statusDotColor,
              flexShrink: 0,
              transition: 'background-color 200ms ease',
              ...(isLive && {
                animation: `${dotPulse} 1.8s ease-in-out infinite`,
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              }),
            }}
          />
          <Typography
            className="summary-text"
            title={summaryText}
            sx={{
              color: isLive ? summaryColor : 'inherit',
              ...theme.typography.uiBodySm,
              fontFamily: theme.typography.fontFamily,
              fontWeight: 400,
              flex: 1,
              minWidth: 0,
              textAlign: 'left',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.4,
              transition: 'color 140ms ease',
            }}
          >
            {summaryText}
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            flexShrink: 0,
          }}
        >
          {isExpandable && (
            <>
              {/* Step count badge — small monospace pill. Shows the number
                  of steps inside the accordion so users know what they're
                  expanding. */}
              <Typography
                aria-hidden
                sx={{
                  color: theme.palette.text.disabled,
                  ...theme.typography.uiCaption2xs,
                  fontWeight: 400,
                  lineHeight: 1,
                  fontFamily: theme.typography.fontFamilyMono,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {normalizedSteps.length}
              </Typography>

              <ExpandMoreIcon
                className="summary-arrow"
                sx={{
                  fontSize: { xs: 15, sm: 16 },
                  flexShrink: 0,
                  color: 'inherit',
                  transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 140ms cubic-bezier(0.4, 0, 0.2, 1), color 140ms',
                }}
              />
            </>
          )}
        </Box>
      </ButtonBase>

      {/* Expanded content */}
      {isExpandable && (
        <Collapse in={expanded} timeout={160} unmountOnExit>
          <Box
            sx={{
              pt: 0.5,
              position: 'relative',
              '&::before': {
                content: '""',
                position: 'absolute',
                left: TIMELINE_LINE_X,
                transform: 'translateX(-50%)',
                top: 16,
                bottom: 16,
                width: '1px',
                backgroundColor: theme.palette.border.separator,
              },
            }}
          >
            <AnimatePresence initial={false}>
              {normalizedSteps.map((step, idx) => {
                let content = null;
                if (step.type === 'thinking') {
                  content = (
                    <ThinkingStep
                      content={step.content}
                      isComplete={step.isComplete}
                      isCurrent={idx === currentStepIndex}
                    />
                  );
                } else if (step.type === 'tool') {
                  content = (
                    <ToolStep
                      stepName={step.name}
                      actionText={step.actionText}
                      parsedArgs={step.parsedArgs}
                      parsedResult={step.parsedResult}
                      isError={step.isError}
                      isRunning={step.isRunning}
                      isCompactMobile={isCompactMobile}
                    />
                  );
                } else if (step.type === 'skill') {
                  content = <SkillStep skills={step.skills} />;
                }
                if (!content) return null;

                return (
                  <MotionBox
                    key={step.id}
                    initial={animateLiveUpdates ? contentMotion.initial : false}
                    animate={contentMotion.animate}
                  >
                    {content}
                  </MotionBox>
                );
              })}
              {isAllComplete && (
                <MotionBox
                  key="done"
                  initial={animateLiveUpdates ? contentMotion.initial : false}
                  animate={contentMotion.animate}
                >
                  <DoneIndicator />
                </MotionBox>
              )}
            </AnimatePresence>
          </Box>
        </Collapse>
      )}
    </Box>
  );
});

StepsAccordion.displayName = 'StepsAccordion';
