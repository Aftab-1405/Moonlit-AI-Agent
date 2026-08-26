/**
 * MessageList — renders the conversation transcript.
 *
 * Composition:
 *   - ConversationLoadingSkeleton  (shown while the conversation is loading)
 *   - Error state                   (shown if load failed and there's no cache)
 *   - "Load older messages" button  (visible when total > visibleCount)
 *   - For each message: UserMessage | AIMessage
 *
 * AIMessage internally splits content into a timeline (interleaved
 * text + thinking/tool steps) OR a fallback of (steps + text). Canvas
 * code blocks (`diagram-flow`) are extracted and rendered as
 * DiagramArtifactCard entries below the text content.
 *
 * Performance:
 *   - `visibleCount` caps the number of rendered messages to keep DOM size
 *     bounded for very long conversations (default 60).
 *   - Each message component is memoised and uses stable callbacks.
 *   - `overflowAnchor: 'none'` is set on scroll containers to prevent the
 *     browser from auto-scrolling to keep older content in view.
 */

import {
  Box,
  Button,
  IconButton,
  Skeleton,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import Fade from '@mui/material/Fade';
import { alpha, keyframes } from '@mui/material/styles';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, CopyIcon, ErrorIcon, PauseIcon } from '@/components/icons';
import { StepsAccordion } from '@/features/chat/ai-response-steps';
import { slideIn } from '@/features/chat/ai-response-steps/timelineShared';
import {
  getDiagramArtifactCardPresentation,
  getDiagramArtifactPhase,
} from '@/features/chat/diagramArtifactModel';
import MarkdownRenderer from '@/features/chat/MarkdownRenderer';
import {
  getMobileEdgeControlSx,
  getResponsivePillIconButtonSx,
} from '@/features/styles/interfaceChrome';
import {
  HOVER_CAPABLE_QUERY,
  REDUCED_MOTION_QUERY,
  TOUCH_DEVICE_QUERY,
} from '@/styles/mediaQueries';
import { getInteractionColors, getSecondaryActionButtonSx, UI_LAYOUT } from '@/styles/shared';
import { MESSAGE_STATUS } from '@/utils/chatMessages';
import { copyToClipboard } from '@/utils/clipboard';
import InlineExecutionTable from './InlineExecutionTable';

const COPY_FEEDBACK_DURATION = 2000;
const CANVAS_CODE_LANGUAGES = new Set(['diagram-flow']);
const FENCED_CODE_BLOCK_PATTERN = /```([A-Za-z0-9_-]+)[^\n]*\n([\s\S]*?)```/g;
const MOBILE_ASSISTANT_ACTION_EDGE_SX = getMobileEdgeControlSx('left', 1.25);
const MOBILE_USER_ACTION_EDGE_SX = getMobileEdgeControlSx('right', 1.25);

const softPulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.76; }
`;

const diagramStatusDot = keyframes`
  0%, 100% { opacity: 0.34; }
  50% { opacity: 1; }
`;

const getMessageActionsRowSx = (theme) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: 0.5,
  flexWrap: 'wrap',
  minHeight: { xs: 44, md: 30 },
  opacity: 0,
  transition: theme.transitions.create('opacity', {
    duration: theme.transitions.duration.shorter,
  }),
  [REDUCED_MOTION_QUERY]: { transition: 'none' },
});

const turnGroupHoverSx = {
  [HOVER_CAPABLE_QUERY]: {
    '&:hover .msg-actions-row': { opacity: 1 },
  },
  '&:focus-within .msg-actions-row': { opacity: 1 },
  [TOUCH_DEVICE_QUERY]: {
    '& .msg-actions-row': { opacity: 1 },
  },
};

const getMessageActionButtonSx = (theme, copied = false) => {
  const interaction = getInteractionColors(theme);

  return {
    ...getResponsivePillIconButtonSx(theme, { desktopSize: 30 }),
    color: copied ? theme.palette.success.main : theme.palette.text.disabled,
    transition: theme.transitions.create(['background-color', 'color'], {
      duration: theme.transitions.duration.shorter,
    }),
    [HOVER_CAPABLE_QUERY]: {
      '&:hover': {
        color: copied ? theme.palette.success.main : interaction.hoverColor,
        bgcolor: interaction.hoverBackground,
      },
    },
    '&:focus-visible': {
      color: copied ? theme.palette.success.main : interaction.hoverColor,
      bgcolor: interaction.hoverBackground,
      outline: `2px solid ${interaction.focusRing}`,
      outlineOffset: 2,
    },
  };
};

function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const setCopiedWithTimeout = useCallback(() => {
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION);
  }, []);

  const copyText = useCallback(
    (text) => {
      copyToClipboard(text).then((ok) => {
        if (ok) setCopiedWithTimeout();
      });
    },
    [setCopiedWithTimeout],
  );

  const copyRich = useCallback(
    (htmlContent, plainText) => {
      const fallbackToText = () => {
        copyToClipboard(plainText).then((ok) => {
          if (ok) setCopiedWithTimeout();
        });
      };

      if (htmlContent && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const textBlob = new Blob([plainText], { type: 'text/plain' });
        navigator.clipboard
          .write([
            new ClipboardItem({
              'text/html': htmlBlob,
              'text/plain': textBlob,
            }),
          ])
          .then(setCopiedWithTimeout)
          .catch(fallbackToText);
      } else {
        fallbackToText();
      }
    },
    [setCopiedWithTimeout],
  );

  return { copied, copyText, copyRich };
}

const CopyButton = memo(function CopyButton({
  copied,
  onClick,
  className = 'message-action-btn',
  sx = {},
  'data-testid': dataTestId,
}) {
  const theme = useTheme();

  return (
    <Tooltip title={copied ? 'Copied!' : 'Copy'}>
      <IconButton
        className={className}
        aria-label="Copy"
        data-testid={dataTestId}
        size="small"
        onClick={onClick}
        color="inherit"
        sx={{ ...getMessageActionButtonSx(theme, copied), ...sx }}
      >
        {copied ? <CheckIcon sx={{ fontSize: 18 }} /> : <CopyIcon sx={{ fontSize: 18 }} />}
      </IconButton>
    </Tooltip>
  );
});

const UserMessage = memo(function UserMessage({ message }) {
  const { copied, copyText } = useCopyToClipboard();
  const theme = useTheme();
  const handleCopy = useCallback(() => copyText(message), [copyText, message]);
  const bubbleBg = theme.palette.layer.subtle;

  return (
    <Fade in timeout={180}>
      <Box
        component="article"
        aria-label="Your message"
        sx={{
          mt: { xs: 2, md: 2.5 },
          mb: 0,
          ...turnGroupHoverSx,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 0.5,
          }}
        >
          <Box
            sx={{
              display: 'inline-flex',
              flexDirection: 'column',
              maxWidth: { xs: 'min(90%, 72ch)', md: 'min(78%, 75ch)' },
              borderRadius: '8px',
              px: { xs: 1.5, md: 2 },
              py: { xs: 1, md: 1.5 },
              bgcolor: bubbleBg,
              color: 'text.primary',
            }}
          >
            <Typography
              component="div"
              data-testid="user-message"
              sx={{
                ...theme.typography.uiResponseBody,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {message}
            </Typography>
          </Box>
          <Box
            className="msg-actions-row"
            role="group"
            aria-label="Message actions"
            sx={{ ...getMessageActionsRowSx(theme), ...MOBILE_USER_ACTION_EDGE_SX }}
          >
            <CopyButton copied={copied} onClick={handleCopy} data-testid="action-bar-copy" />
          </Box>
        </Box>
      </Box>
    </Fade>
  );
});

function getQueryExecutionMeta(step, fallbackConversationId = null) {
  if (step?.name !== 'execute_query' || step?.status !== 'done' || !step?.result) {
    return null;
  }

  const parsedResult = step.result;
  const result = parsedResult && typeof parsedResult === 'object' ? parsedResult : {};
  const nestedResult =
    result.data && typeof result.data === 'object' && !Array.isArray(result.data)
      ? result.data
      : {};
  const executionId =
    result.execution_id ||
    result.executionId ||
    nestedResult.execution_id ||
    nestedResult.executionId;

  if (!executionId) return null;

  return {
    executionId,
    conversationId:
      result.conversation_id ||
      result.conversationId ||
      nestedResult.conversation_id ||
      nestedResult.conversationId ||
      fallbackConversationId,
  };
}

/**
 * Extracts completed canvas code blocks (both fences present) from markdown.
 * Used to populate DiagramArtifactCard.
 */
function extractCanvasCodeArtifacts(markdown) {
  const artifacts = [];
  String(markdown || '').replace(FENCED_CODE_BLOCK_PATTERN, (match, rawLanguage, code, offset) => {
    const language = String(rawLanguage || '').toLowerCase();
    if (CANVAS_CODE_LANGUAGES.has(language)) {
      artifacts.push({
        key: `${language}-${offset}`,
        type: 'react-flow',
        title: 'Diagram',
        props: {
          code: String(code || '').trim(),
        },
      });
    }
    return match;
  });
  return artifacts;
}

/**
 * Diagram artifact card — shown in the AI message for react-flow diagrams.
 * Renders two states:
 *   - isGenerating=true  → passive status row
 *   - isGenerating=false → full-row interactive artifact
 */
const DiagramArtifactCard = memo(function DiagramArtifactCard({
  artifact,
  isGenerating = false,
  onOpen,
}) {
  const theme = useTheme();
  const presentation = getDiagramArtifactCardPresentation({ isGenerating });

  return (
    <Box
      component={presentation.isInteractive ? 'button' : 'div'}
      type={presentation.isInteractive ? 'button' : undefined}
      role={isGenerating ? 'status' : undefined}
      aria-live={isGenerating ? 'polite' : undefined}
      aria-busy={isGenerating || undefined}
      aria-label={presentation.ariaLabel}
      onClick={presentation.isInteractive ? () => onOpen?.(artifact) : undefined}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        minWidth: 0,
        height: { xs: 68, sm: 70 },
        px: { xs: 1.5, sm: 2 },
        py: 0,
        borderRadius: '8px',
        border: '1px solid',
        borderColor: isGenerating
          ? alpha(theme.palette.info.main, 0.28)
          : theme.palette.border.subtle,
        bgcolor: 'transparent',
        color: 'text.primary',
        font: 'inherit',
        textAlign: 'left',
        appearance: 'none',
        cursor: presentation.isInteractive ? 'pointer' : 'default',
        transition: theme.transitions.create(['background-color', 'border-color', 'box-shadow'], {
          duration: theme.transitions.duration.shorter,
        }),
        '&:focus-visible': {
          outline: 'none',
          boxShadow: `inset 0 0 0 2px ${theme.palette.border.focus}`,
        },
        ...(presentation.isInteractive && {
          [HOVER_CAPABLE_QUERY]: {
            '&:hover': {
              bgcolor: alpha(theme.palette.text.primary, 0.025),
              borderColor: theme.palette.border.hover,
            },
            '&:hover .diagram-card-preview': {
              transform: 'translateY(12px) rotate(2.5deg) scale(1.025)',
            },
          },
        }),
      }}
    >
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          pr: 1.5,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 0.55,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, gap: 0.8 }}>
          {isGenerating && (
            <Box
              aria-hidden
              sx={{
                width: 5,
                height: 5,
                flexShrink: 0,
                borderRadius: '50%',
                bgcolor: 'info.main',
                animation: `${diagramStatusDot} 1.25s ease-in-out infinite`,
                [REDUCED_MOTION_QUERY]: { animation: 'none', opacity: 0.72 },
              }}
            />
          )}
          <Typography
            sx={{
              ...theme.typography.uiBodySm,
              minWidth: 0,
              fontFamily: theme.typography.fontFamily,
              fontWeight: 400,
              lineHeight: 1.2,
              color: isGenerating ? 'info.main' : 'text.primary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {presentation.title}
          </Typography>
        </Box>

        {presentation.metadata ? (
          <Typography
            sx={{
              ...theme.typography.uiCaptionMd,
              fontFamily: theme.typography.fontFamily,
              lineHeight: 1.25,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: theme.palette.text.secondary,
            }}
          >
            {presentation.metadata}
          </Typography>
        ) : null}
      </Box>

      <Box
        aria-hidden
        sx={{
          position: 'relative',
          alignSelf: 'stretch',
          width: { xs: 58, sm: 68 },
          flexShrink: 0,
          pointerEvents: 'none',
        }}
      >
        <Box
          className="diagram-card-preview"
          sx={{
            position: 'absolute',
            right: { xs: 0, sm: 0.5 },
            top: 0,
            width: { xs: 48, sm: 52 },
            height: { xs: 62, sm: 66 },
            p: 0.75,
            overflow: 'hidden',
            borderRadius: '8px 8px 0 0',
            border: '1px solid',
            borderColor: isGenerating
              ? alpha(theme.palette.info.main, 0.25)
              : theme.palette.border.hover,
            bgcolor: theme.palette.background.paper,
            color: isGenerating ? 'info.main' : 'text.secondary',
            transform: 'translateY(13px) rotate(4.5deg)',
            transformOrigin: 'center bottom',
            transition: theme.transitions.create('transform', {
              duration: theme.transitions.duration.short,
              easing: theme.transitions.easing.easeOut,
            }),
            [REDUCED_MOTION_QUERY]: { transition: 'none' },
          }}
        >
          <Box
            component="svg"
            viewBox="0 0 44 54"
            focusable="false"
            sx={{ display: 'block', width: '100%', height: '100%' }}
          >
            <path
              d="M13 13 L30 20 M30 20 L17 38"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              opacity="0.5"
            />
            <rect x="4" y="7" width="14" height="11" rx="2" fill="currentColor" opacity="0.34" />
            <rect x="27" y="15" width="13" height="11" rx="2" fill="currentColor" opacity="0.68" />
            <rect x="9" y="34" width="16" height="11" rx="2" fill="currentColor" opacity="0.48" />
          </Box>
        </Box>
      </Box>
    </Box>
  );
});

const AIMessage = memo(function AIMessage({
  id,
  text,
  steps,
  timeline,
  status,
  onRunQuery,
  onOpenCanvasArtifact,
  conversationId,
}) {
  const { copied, copyRich } = useCopyToClipboard();
  const contentRef = useRef(null);
  const openedArtifactsRef = useRef(new Set());

  const isStreaming = status === MESSAGE_STATUS.STREAMING;
  const isWaiting = status === MESSAGE_STATUS.WAITING;
  const isPaused = status === MESSAGE_STATUS.PAUSED;

  const wasStreamingOrWaitingRef = useRef(false);
  useEffect(() => {
    if (isStreaming || isWaiting) {
      wasStreamingOrWaitingRef.current = true;
    }
  }, [isStreaming, isWaiting]);

  const displayText = text || '';
  const displaySteps = useMemo(() => (Array.isArray(steps) ? steps : []), [steps]);
  // Simple filter — no pre-stripping needed since MarkdownRenderer suppresses
  // canvas blocks itself.
  const displayTimeline = useMemo(() => {
    if (!Array.isArray(timeline)) return [];
    return timeline.filter((item) => {
      if (!item?.type) return false;
      // Hide bypassed context summarization and checkpointing messages from the UI
      if (
        (item.type === 'thinking' &&
          (item.content === 'Context summarization bypassed.' ||
            (item.id === 'workflow-summarizing_context' && item.content?.includes('bypassed')))) ||
        item.id === 'workflow-checkpointing_task'
      ) {
        return false;
      }
      return true;
    });
  }, [timeline]);
  const hasTimeline = displayTimeline.length > 0;
  const showThinkingSpinner = useMemo(
    () =>
      (isWaiting || isStreaming) &&
      displaySteps.length === 0 &&
      !displayText.trim() &&
      !hasTimeline,
    [isWaiting, isStreaming, displaySteps, displayText, hasTimeline],
  );

  const effectiveTimeline = useMemo(() => {
    if (hasTimeline) return displayTimeline;
    return [];
  }, [hasTimeline, displayTimeline]);

  const hasEffectiveTimeline = effectiveTimeline.length > 0;
  // Complete canvas code artifacts (both fences present)
  const artifacts = useMemo(() => extractCanvasCodeArtifacts(displayText), [displayText]);

  const diagramArtifactPhase = useMemo(
    () =>
      getDiagramArtifactPhase({
        isActive: isStreaming || isWaiting,
        markdown: displayText,
        steps: displaySteps,
        timeline: displayTimeline,
      }),
    [displaySteps, displayText, displayTimeline, isStreaming, isWaiting],
  );

  // The generating card starts as soon as the diagram skill activates, rather
  // than waiting for the first streamed code-fence token to arrive.
  const generatingArtifacts = useMemo(() => {
    if (artifacts.length > 0) return [];
    if (diagramArtifactPhase !== 'generating') return [];
    return Array.from(CANVAS_CODE_LANGUAGES).map((lang) => ({
      key: `partial-${lang}`,
      type: 'react-flow',
      title: 'Diagram',
      isGenerating: true,
      props: { code: '' },
    }));
  }, [artifacts, diagramArtifactPhase]);

  // Union: partial (generating) artifacts always precede complete ones.
  // In practice exactly one side is non-empty at any given moment.
  const allArtifacts = useMemo(
    () => [...generatingArtifacts, ...artifacts],
    [generatingArtifacts, artifacts],
  );
  const showMessageActions =
    !isWaiting &&
    !isStreaming &&
    Boolean(
      displayText.trim() || displaySteps.length || effectiveTimeline.length || allArtifacts.length,
    );

  // The execute_query trigger has been removed since results are now displayed inline.

  useEffect(() => {
    if (!onOpenCanvasArtifact || isWaiting || isStreaming) return;

    // Only auto-trigger the artifact loader if the message was actively streamed/generated in this session
    if (!wasStreamingOrWaitingRef.current) return;

    const artifactsList = extractCanvasCodeArtifacts(text);
    artifactsList.forEach((artifact) => {
      const artifactKey = `${id}-${artifact.key}`;
      if (openedArtifactsRef.current.has(artifactKey)) return;
      openedArtifactsRef.current.add(artifactKey);
      onOpenCanvasArtifact(artifact);
    });
  }, [id, isStreaming, isWaiting, onOpenCanvasArtifact, text]);

  const handleCopy = useCallback(() => {
    const container = contentRef.current;
    const htmlContent = container?.innerHTML;
    const plainTextContent = container?.innerText || displayText;
    copyRich(htmlContent, plainTextContent);
  }, [copyRich, displayText]);

  const renderTextBlock = useCallback(
    (content, key, streamThisBlock = false) => {
      if (!content || !String(content).trim()) return null;
      return (
        <Box
          key={key}
          data-testid="assistant-text-chunk"
          sx={{
            // Symmetric horizontal padding so text blocks align with step
            // blocks. The previous version used `pr: 3` on the right which
            // pushed content visually off-centre and made wrapped lines look
            // misaligned.
            pl: { xs: 0, sm: 0.5 },
            pr: { xs: 0, sm: 0.5 },
            minWidth: 0,
            py: 0.1,
            overflowAnchor: 'none',
            // Same entry spec as StepsAccordion and timeline items — one
            // consistent fade-in for every piece of content that materialises.
            animation: `${slideIn} 0.22s ease-out both`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        >
          <MarkdownRenderer
            content={content}
            onRunQuery={onRunQuery}
            isStreaming={streamThisBlock}
          />
        </Box>
      );
    },
    [onRunQuery],
  );

  const renderStepBlock = useCallback(
    (step, key) => {
      const executionMeta = getQueryExecutionMeta(step, conversationId);

      return (
        <Box
          key={key}
          data-testid={`assistant-${step.type}-step`}
          sx={{
            pl: { xs: 0, sm: 0.5 },
            pr: { xs: 0, sm: 0.5 },
            py: 0.5,
            minWidth: 0,
          }}
        >
          <StepsAccordion steps={[step]} isStreaming={isWaiting || isStreaming} />
          {executionMeta?.executionId && (
            <InlineExecutionTable
              conversationId={executionMeta.conversationId}
              executionId={executionMeta.executionId}
            />
          )}
        </Box>
      );
    },
    [isStreaming, isWaiting, conversationId],
  );

  /**
   * ENH [ANTI-FLOOD]: Render a GROUP of consecutive non-text timeline items
   * (tool / thinking / skill) as a SINGLE StepsAccordion instead of one
   * accordion per step. This is the core anti-flood change: when the agent
   * runs 9 tools in a row, the user sees ONE collapsed accordion ("Analyzed
   * 6 tables · 9 tools used") instead of 9 separate accordions flooding the
   * response.
   *
   * execute_query steps that produced an executionId still render their
   * InlineExecutionTable BELOW the accordion, so query result tables stay
   * visible inline — they're the user's actual data, not chrome.
   *
   * Alternating behavior (text → tools → text → tools) naturally produces
   * one accordion per phase, because the grouping logic in the caller
   * flushes the buffer whenever it hits a text item.
   */
  const renderStepGroupBlock = useCallback(
    (groupedSteps, key) => {
      if (!Array.isArray(groupedSteps) || groupedSteps.length === 0) return null;

      // Single step → fall back to the per-step renderer (preserves the
      // exact per-step layout for the single-step case, including the
      // InlineExecutionTable placement).
      if (groupedSteps.length === 1) {
        return renderStepBlock(groupedSteps[0], key);
      }

      // Multiple steps → one accordion for the whole group, with any
      // execute_query result tables rendered below.
      const streamFlag = isWaiting || isStreaming;
      return (
        <Box
          key={key}
          data-testid="assistant-step-group"
          sx={{
            pl: { xs: 0, sm: 0.5 },
            pr: { xs: 0, sm: 0.5 },
            py: 0.5,
            minWidth: 0,
          }}
        >
          <StepsAccordion steps={groupedSteps} isStreaming={streamFlag} />
          {groupedSteps.map((step, idx) => {
            const executionMeta = getQueryExecutionMeta(step, conversationId);
            if (!executionMeta?.executionId) return null;
            return (
              <InlineExecutionTable
                key={`exec-${executionMeta.executionId}-${idx}`}
                conversationId={executionMeta.conversationId}
                executionId={executionMeta.executionId}
              />
            );
          })}
        </Box>
      );
    },
    [isStreaming, isWaiting, conversationId, renderStepBlock],
  );

  /**
   * ENH [ANTI-FLOOD]: Group consecutive non-text timeline items into batches,
   * preserving the original order. Each batch becomes ONE StepsAccordion.
   * Text items break the chain — so alternating text → tools → text → tools
   * produces one accordion per tool-calling phase.
   *
   * Returns an array of renderable nodes (text blocks + step-group blocks).
   */
  const renderGroupedTimeline = useCallback(
    (timelineItems) => {
      const nodes = [];
      let stepBuffer = [];
      let groupIndex = 0;
      const lastTextIndex = timelineItems.reduce(
        (lastIndex, item, index) => (item.type === 'text' ? index : lastIndex),
        -1,
      );

      const flushStepBuffer = () => {
        if (stepBuffer.length === 0) return;
        const groupKey = `step-group-${groupIndex}`;
        groupIndex += 1;
        nodes.push(renderStepGroupBlock(stepBuffer, groupKey));
        stepBuffer = [];
      };

      timelineItems.forEach((item, index) => {
        if (item.type === 'text') {
          // Text breaks the step chain — flush the accumulated steps as a
          // single accordion, then render the text block.
          flushStepBuffer();
          nodes.push(
            renderTextBlock(
              item.content || '',
              item.id || `text-${index}`,
              (isWaiting || isStreaming) && index === lastTextIndex,
            ),
          );
        } else if (item.type === 'thinking' || item.type === 'tool' || item.type === 'skill') {
          stepBuffer.push(item);
        }
        // Unknown types are silently skipped (same as the old behavior).
      });

      // Flush any trailing steps (timeline ended with a tool, no text after).
      flushStepBuffer();

      return nodes;
    },
    [isStreaming, isWaiting, renderStepGroupBlock, renderTextBlock],
  );

  return (
    <Fade in timeout={180}>
      <Box
        component="article"
        aria-label="Moonlit response"
        aria-busy={isWaiting || isStreaming || undefined}
        data-response-state={isWaiting ? 'waiting' : isStreaming ? 'streaming' : 'complete'}
        sx={{
          pb: { xs: 2.25, sm: 2.5 },
          minWidth: 0,
          ...turnGroupHoverSx,
        }}
      >
        <Box ref={contentRef} sx={{ position: 'relative', minWidth: 0 }}>
          {/* Fade in+out so it cross-fades with the first arriving step
               rather than instantly popping out when the accordion mounts. */}
          {/* ENH [ANTI-FLOOD]: Consecutive non-text timeline items are
              grouped into a single StepsAccordion per phase. Text items
              break the chain so alternating text → tools → text → tools
              produces one accordion per phase. The fallback path (no
              timeline, only legacy steps + text) also groups the steps. */}
          {hasEffectiveTimeline
            ? renderGroupedTimeline(effectiveTimeline)
            : renderGroupedTimeline([
                ...(Array.isArray(displaySteps) ? displaySteps : []),
                ...(displayText.trim()
                  ? [{ type: 'text', content: displayText, id: 'fallback-text' }]
                  : []),
              ])}

          {showThinkingSpinner && (
            <Box
              role="status"
              aria-label="Moonlit is thinking"
              sx={{
                width: 'max-content',
                py: 0.65,
                pl: { xs: 0, sm: 0.5 },
              }}
            >
              <Typography
                component="span"
                sx={{
                  fontSize: { xs: '0.75rem', sm: '0.8125rem' },
                  lineHeight: 1.45,
                  fontWeight: 400,
                  color: 'text.secondary',
                  animation: `${softPulse} 1.8s ease-in-out infinite`,
                  [REDUCED_MOTION_QUERY]: {
                    animation: 'none',
                  },
                }}
              >
                Thinking
              </Typography>
            </Box>
          )}

          {allArtifacts.length > 0 && (
            <Box
              sx={{
                pl: { xs: 0, sm: 0.5 },
                pr: { xs: 0, sm: 0.5 },
                mt: 1,
                mb: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
              }}
            >
              {allArtifacts.map((artifact) => (
                <DiagramArtifactCard
                  key={artifact.key}
                  artifact={artifact}
                  isGenerating={!!artifact.isGenerating}
                  onOpen={onOpenCanvasArtifact}
                />
              ))}
            </Box>
          )}
        </Box>

        {isPaused && (
          <Box
            role="status"
            aria-label="Task paused"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              mt: 1,
              ml: { xs: 0, sm: 0.5 },
              py: 0.9,
              px: 1.5,
              borderRadius: '8px',
              bgcolor: (th) => alpha(th.palette.warning.main, th.palette.opacity.soft),
              border: '1px solid',
              borderColor: (th) =>
                alpha(th.palette.warning.main, th.palette.opacity.statusBorderHover),
              maxWidth: 'max-content',
            }}
          >
            <PauseIcon sx={{ fontSize: 16, color: 'warning.main', flexShrink: 0 }} />
            <Typography
              variant="caption"
              sx={{
                color: 'warning.main',
                fontWeight: 400,
                letterSpacing: 0.1,
              }}
            >
              Agent paused — step limit reached.
            </Typography>
          </Box>
        )}

        {showMessageActions && (
          <Box
            className="msg-actions-row"
            role="group"
            aria-label="Message actions"
            sx={(theme) => ({
              ...getMessageActionsRowSx(theme),
              ...MOBILE_ASSISTANT_ACTION_EDGE_SX,
              width: '100%',
              mt: 0.15,
              pl: { xs: 0, sm: 0.5 },
              pr: { xs: 0, sm: 0.5 },
            })}
          >
            <CopyButton copied={copied} onClick={handleCopy} data-testid="action-bar-copy" />
          </Box>
        )}
      </Box>
    </Fade>
  );
});

const ConversationLoadingSkeleton = memo(function ConversationLoadingSkeleton() {
  const prefersReducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  // `animation` is passed to each Skeleton; respects user motion preference.
  // We no longer override `bgcolor` on individual skeletons — the centralized
  // MuiSkeleton theme override provides the shared layered fill and highlight.
  const animation = prefersReducedMotion ? false : 'wave';

  return (
    <Box
      role="status"
      aria-label="Loading conversation"
      sx={{ flex: 1, py: { xs: 1.25, sm: 1.75 }, overflowAnchor: 'none' }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: UI_LAYOUT.chatInputMaxWidth,
          mx: 'auto',
          px: { xs: 1.25, sm: 2 },
          pt: 0.25,
          display: 'flex',
          flexDirection: 'column',
          gap: { xs: 2.25, sm: 2.75 },
        }}
      >
        {/* First exchange — user bubble */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Skeleton
            variant="rounded"
            animation={animation}
            sx={{
              width: { xs: 148, sm: 210 },
              height: { xs: 30, sm: 38 },
              borderRadius: '8px',
            }}
          />
        </Box>

        {/* First exchange — AI response with fake step row */}
        <Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              pl: { xs: 0, sm: 0.5 },
              mb: 1.5,
            }}
          >
            <Skeleton
              variant="circular"
              animation={animation}
              width={13}
              height={13}
              sx={{ flexShrink: 0 }}
            />
            <Skeleton
              variant="rounded"
              animation={animation}
              sx={{
                width: '38%',
                maxWidth: 196,
                height: 9,
                borderRadius: 999,
              }}
            />
          </Box>
          {['100%', '92%', '100%', '84%', '100%', '76%', '46%'].map((width, idx) => (
            <Skeleton
              key={idx}
              variant="rounded"
              animation={animation}
              sx={{
                width,
                height: { xs: 10, sm: 12 },
                mb: { xs: 0.85, sm: 1 },
                borderRadius: 999,
              }}
            />
          ))}
        </Box>

        {/* Second exchange — shorter user bubble */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Skeleton
            variant="rounded"
            animation={animation}
            sx={{
              width: { xs: 100, sm: 148 },
              height: { xs: 30, sm: 38 },
              borderRadius: '8px',
            }}
          />
        </Box>

        {/* Second exchange — AI response text lines */}
        <Box>
          {['100%', '90%', '68%'].map((width, idx) => (
            <Skeleton
              key={idx}
              variant="rounded"
              animation={animation}
              sx={{
                width,
                height: { xs: 10, sm: 12 },
                mb: { xs: 0.85, sm: 1 },
                borderRadius: 999,
              }}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
});

function normalizeAssistantMessage(message) {
  return {
    id: message.id,
    text: message.text || '',
    steps: message.steps || [],
    timeline: message.timeline || [],
    status: message.status || MESSAGE_STATUS.DONE,
  };
}

const MessageList = memo(function MessageList({
  messages = [],
  isLoadingConversation = false,
  loadError = false,
  conversationId = null,
  onRunQuery,
  onOpenCanvasArtifact,
}) {
  // FIX [THEME-UNBOUND]: theme is used at line 1010 in
  // getSecondaryActionButtonSx(theme) for the "Load older messages" button.
  // Without this declaration, theme is undefined and throws
  // ReferenceError when hiddenCount > 0 (conversation has >60 messages).
  const theme = useTheme();
  const [visibleCount, setVisibleCount] = useState(60);
  const normalizedMessages = useMemo(
    () =>
      messages.map((message, index) => {
        const id = message.id || `message-${index}`;
        if (message.role === 'user') {
          return { id, role: 'user', text: message.text };
        }
        return { id, role: 'assistant', ...normalizeAssistantMessage(message) };
      }),
    [messages],
  );
  const effectiveVisibleCount = normalizedMessages.length <= 50 ? 60 : visibleCount;
  const hiddenCount = Math.max(0, normalizedMessages.length - effectiveVisibleCount);
  const visibleMessages =
    hiddenCount > 0 ? normalizedMessages.slice(-effectiveVisibleCount) : normalizedMessages;

  if (isLoadingConversation) {
    return <ConversationLoadingSkeleton />;
  }

  if (loadError && messages.length === 0) {
    return (
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 2,
          py: 4,
          textAlign: 'center',
        }}
      >
        <Box
          role="status"
          aria-live="polite"
          sx={{
            maxWidth: 380,
            px: { xs: 2, sm: 2.5 },
            py: { xs: 2, sm: 2.5 },
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.75,
            textAlign: 'center',
            bgcolor: 'transparent',
          }}
        >
          <ErrorIcon sx={{ fontSize: 20, color: 'text.secondary', mb: 0.25 }} />
          <Typography
            sx={(th) => ({
              ...th.typography.uiBodySm,
              color: 'text.primary',
              fontWeight: 400,
            })}
          >
            Couldn&apos;t load conversation
          </Typography>
          <Typography
            sx={(th) => ({
              ...th.typography.uiCaptionMd,
              color: 'text.secondary',
            })}
          >
            Select it again from the sidebar.
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      role="log"
      aria-label="Conversation transcript"
      aria-live="polite"
      aria-relevant="additions text"
      sx={{
        flex: 1,
        py: { xs: 1.25, sm: 1.75 },
        overflowAnchor: 'none',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: UI_LAYOUT.chatInputMaxWidth,
          mx: 'auto',
          px: { xs: 1.25, sm: 2 },
          pt: 0.25,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        {hiddenCount > 0 && (
          <Box sx={{ pb: 1.5, display: 'flex', justifyContent: 'center' }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setVisibleCount((c) => c + 50)}
              sx={getSecondaryActionButtonSx(theme)}
            >
              Load {Math.min(50, hiddenCount)} older messages
            </Button>
          </Box>
        )}
        {visibleMessages.map((message) =>
          message.role === 'user' ? (
            <UserMessage key={message.id} message={message.text} />
          ) : (
            <AIMessage
              key={message.id}
              id={message.id}
              text={message.text}
              steps={message.steps}
              timeline={message.timeline}
              status={message.status}
              onRunQuery={onRunQuery}
              onOpenCanvasArtifact={onOpenCanvasArtifact}
              conversationId={conversationId}
            />
          ),
        )}
      </Box>
    </Box>
  );
});

export default MessageList;
