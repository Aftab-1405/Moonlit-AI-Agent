import { useState, useMemo, useCallback, memo } from 'react';
import { Box, Typography, Collapse, useTheme, ButtonBase, useMediaQuery } from '@mui/material';
import { alpha } from '@mui/material/styles';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { TRANSITIONS } from '../../theme';
import {
  ThinkingStep,
  ToolStep,
  DoneIndicator,
} from './StepTimelineItems';
import { TIMELINE_LINE_X, slideIn } from './timelineShared';
import {
  normalizeSteps,
  buildStepsSummary,
  getCurrentStepIndex,
  areAllStepsComplete,
} from './stepUtils';

export const StepsAccordion = memo(function StepsAccordion({ steps, isStreaming }) {
  const [expanded, setExpanded] = useState(() => !!isStreaming);
  const theme = useTheme();
  const isCompactMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isDark = theme.palette.mode === 'dark';
  const effectiveExpanded = isStreaming || expanded;

  const normalizedSteps = useMemo(() => normalizeSteps(steps), [steps]);
  const summaryText = useMemo(() => buildStepsSummary(normalizedSteps), [normalizedSteps]);
  const currentStepIndex = useMemo(() => getCurrentStepIndex(normalizedSteps), [normalizedSteps]);
  const isAllComplete = useMemo(
    () => areAllStepsComplete(normalizedSteps, isStreaming),
    [normalizedSteps, isStreaming]
  );

  const handleToggle = useCallback(() => {
    if (isStreaming) return;
    setExpanded((prev) => !prev);
  }, [isStreaming]);

  if (normalizedSteps.length === 0) return null;

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
            color: alpha(theme.palette.text.secondary, isDark ? 0.72 : 0.62),
            ...theme.typography.uiBodySm,
            fontFamily: theme.typography.fontFamily,
            fontWeight: 500,
            flex: 1,
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
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 18,
            height: 18,
            px: 0.5,
            borderRadius: '9px',
            bgcolor: alpha(theme.palette.text.secondary, isDark ? 0.1 : 0.08),
            flexShrink: 0,
          }}
        >
          <Typography
            sx={{
              color: alpha(theme.palette.text.secondary, isDark ? 0.6 : 0.55),
              fontSize: '10px',
              fontWeight: 600,
              lineHeight: 1,
              fontFamily: theme.typography.fontFamilyMono,
            }}
          >
            {normalizedSteps.length}
          </Typography>
        </Box>
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
              background: `linear-gradient(180deg, transparent, ${alpha(theme.palette.border.subtle, isDark ? 0.95 : 1)} 10%, ${alpha(theme.palette.border.subtle, isDark ? 0.95 : 1)} 85%, transparent)`,
            },
          }}
        >
          {normalizedSteps.map((step, idx) => {
            if (step.type === 'thinking') {
              return (
                <ThinkingStep
                  key={step.id}
                  content={step.content}
                  isComplete={step.isComplete}
                  isCurrent={idx === currentStepIndex}
                />
              );
            }

            if (step.type === 'tool') {
              return (
                <ToolStep
                  key={step.id}
                  stepName={step.name}
                  actionText={step.actionText}
                  parsedArgs={step.parsedArgs}
                  parsedResult={step.parsedResult}
                  isError={step.isError}
                  isRunning={step.isRunning}
                  isCurrent={idx === currentStepIndex}
                  isCompactMobile={isCompactMobile}
                />
              );
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
