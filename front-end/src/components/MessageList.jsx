import { Box, Typography, IconButton, Tooltip, Button, Skeleton, CircularProgress, useTheme, useMediaQuery } from '@mui/material';
import { alpha } from '@mui/material/styles';
import Fade from '@mui/material/Fade';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { StepsAccordion } from './AIResponseSteps';
import MarkdownRenderer from './MarkdownRenderer';
import { MESSAGE_STATUS, parseAssistantContent } from '../utils/chatMessages';
import { useCharacterPacing } from '../hooks/useCharacterPacing';
import {
  HOVER_CAPABLE_QUERY,
  REDUCED_MOTION_QUERY,
} from '../styles/mediaQueries';
import { UI_LAYOUT } from '../styles/shared';

const COPY_FEEDBACK_DURATION = 2000;

const messageActionsRowSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: 0.5,
  flexWrap: 'wrap',
  opacity: 0,
  transition: 'opacity 0.2s ease',
};

const turnGroupHoverSx = {
  [HOVER_CAPABLE_QUERY]: {
    '&:hover .msg-actions-row': { opacity: 1 },
    '&:focus-within .msg-actions-row': { opacity: 1 },
  },
  '@media (pointer: coarse)': {
    '& .msg-actions-row': { opacity: 1 },
  },
};

function fallbackCopyText(text) {
  if (typeof document === 'undefined') return false;
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  document.body.removeChild(textArea);
  return copied;
}

function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const setCopiedWithTimeout = useCallback(() => {
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION);
  }, []);

  const safeWriteText = useCallback(async (text) => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return fallbackCopyText(text);
      }
    }
    return fallbackCopyText(text);
  }, []);

  const copyText = useCallback((text) => {
    safeWriteText(text).then((didCopy) => {
      if (didCopy) setCopiedWithTimeout();
    });
  }, [safeWriteText, setCopiedWithTimeout]);

  const copyRich = useCallback((htmlContent, plainText) => {
    const fallbackToText = () => {
      safeWriteText(plainText).then((didCopy) => {
        if (didCopy) setCopiedWithTimeout();
      });
    };

    if (htmlContent && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
      const textBlob = new Blob([plainText], { type: 'text/plain' });
      navigator.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })])
        .then(setCopiedWithTimeout)
        .catch(fallbackToText);
    } else {
      fallbackToText();
    }
  }, [safeWriteText, setCopiedWithTimeout]);

  return { copied, copyText, copyRich };
}

const CopyButton = memo(function CopyButton({ copied, onClick, className = 'message-action-btn', sx = {}, 'data-testid': dataTestId }) {
  return (
    <Tooltip title={copied ? 'Copied!' : 'Copy'}>
      <IconButton
        className={className}
        aria-label="Copy"
        data-testid={dataTestId}
        size="small"
        onClick={onClick}
        sx={{
          width: 32,
          height: 32,
          color: copied ? 'text.primary' : 'text.secondary',
          transition: 'color 0.2s',
          [HOVER_CAPABLE_QUERY]: {
            '&:hover': { color: 'text.primary' },
          },
          ...sx,
        }}
      >
        {copied ? <CheckRoundedIcon sx={{ fontSize: 18 }} /> : <ContentCopyRoundedIcon sx={{ fontSize: 18 }} />}
      </IconButton>
    </Tooltip>
  );
});

const UserMessage = memo(function UserMessage({ message }) {
  const { copied, copyText } = useCopyToClipboard();
  const theme = useTheme();
  const handleCopy = useCallback(() => copyText(message), [copyText, message]);
  const bubbleBg = alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.08 : 0.06);

  return (
    <Fade in timeout={300}>
      <Box
        sx={{
          mt: 3,
          mb: 0.25,
          ...turnGroupHoverSx,
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
          <Box
            sx={{
              display: 'inline-flex',
              flexDirection: 'column',
              maxWidth: 'min(85%, 75ch)',
              borderRadius: '12px',
              px: 2,
              py: 1.25,
              bgcolor: bubbleBg,
              border: '1px solid',
              borderColor: alpha(theme.palette.divider, 0.85),
              color: 'text.primary',
            }}
          >
            <Typography
              component="div"
              data-testid="user-message"
              sx={{
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: { xs: '0.9375rem', sm: '1rem' },
              }}
            >
              {message}
            </Typography>
          </Box>
          <Box
            className="msg-actions-row"
            role="group"
            aria-label="Message actions"
            sx={messageActionsRowSx}
          >
            <CopyButton copied={copied} onClick={handleCopy} data-testid="action-bar-copy" />
          </Box>
        </Box>
      </Box>
    </Fade>
  );
});

function parseJSON(value) {
  if (!value || value === 'null') return null;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

const AIMessage = memo(function AIMessage({ id, text, steps, status, onRunQuery, onOpenSqlEditor }) {
  const { copied, copyRich } = useCopyToClipboard();
  const theme = useTheme();
  const prefersReducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const contentRef = useRef(null);
  const sqlEditorTimeoutRef = useRef(null);
  const openedToolsRef = useRef(new Set());

  const isStreaming = status === MESSAGE_STATUS.STREAMING;
  const isWaiting = status === MESSAGE_STATUS.WAITING;

  const displayText = useCharacterPacing(text || '', isStreaming);
  const displaySteps = useMemo(() => (Array.isArray(steps) ? steps : []), [steps]);

  useEffect(() => {
    return () => {
      if (sqlEditorTimeoutRef.current) clearTimeout(sqlEditorTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!onOpenSqlEditor || isWaiting || isStreaming) return;

    displaySteps.forEach((step, idx) => {
      if (step.type !== 'tool' || step.name !== 'execute_query' || step.status !== 'done') return;
      const stepKey = `${id}-${step.id || idx}`;
      if (openedToolsRef.current.has(stepKey)) return;

      const parsedArgs = parseJSON(step.args);
      const parsedResult = parseJSON(step.result);
      if (!parsedResult || parsedResult.success === false || parsedResult.error) return;

      openedToolsRef.current.add(stepKey);

      const query = parsedArgs?.query || '';
      const resultRows = Array.isArray(parsedResult?.data)
        ? parsedResult.data
        : (Array.isArray(parsedResult?.preview) ? parsedResult.preview : []);
      const normalizedResults = {
        columns: parsedResult?.columns || [],
        result: resultRows,
        row_count: parsedResult?.row_count || 0,
        total_rows: parsedResult?.total_rows || parsedResult?.row_count || 0,
        truncated: parsedResult?.truncated || false,
      };

      if (sqlEditorTimeoutRef.current) clearTimeout(sqlEditorTimeoutRef.current);
      sqlEditorTimeoutRef.current = setTimeout(() => {
        onOpenSqlEditor(query, normalizedResults);
      }, 100);
    });
  }, [displaySteps, id, isStreaming, isWaiting, onOpenSqlEditor]);

  const handleCopy = useCallback(() => {
    const container = contentRef.current;
    const htmlContent = container?.innerHTML;
    const plainTextContent = container?.innerText || displayText;
    copyRich(htmlContent, plainTextContent);
  }, [copyRich, displayText]);

  const showThinkingSpinner = isWaiting && displaySteps.length === 0 && !displayText.trim();

  return (
    <Fade in timeout={300}>
      <Box
        sx={{
          pb: 3,
          minWidth: 0,
          ...turnGroupHoverSx,
        }}
      >
        <Box sx={{ position: 'relative', lineHeight: 1.65, minWidth: 0 }}>
          {showThinkingSpinner && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 1, py: 0.75, color: 'text.secondary' }}>
              {prefersReducedMotion ? (
                <Typography component="span" variant="body2" color="text.secondary" aria-hidden>
                  …
                </Typography>
              ) : (
                <CircularProgress size={16} thickness={4} sx={{ color: 'primary.main' }} />
              )}
            </Box>
          )}

          {displaySteps.length > 0 && (
            <Box sx={{ pl: 1, py: 0.75, minWidth: 0 }}>
              <StepsAccordion steps={displaySteps} isStreaming={isWaiting || isStreaming} />
            </Box>
          )}

          {displayText.trim() && (
            <Box sx={{ pl: 1, pr: { xs: 2, sm: 4 }, minWidth: 0, py: 0.5 }}>
              <MarkdownRenderer content={displayText} onRunQuery={onRunQuery} />
            </Box>
          )}

          <Box ref={contentRef} sx={{ display: 'none' }} aria-hidden>
            <MarkdownRenderer content={displayText} onRunQuery={onRunQuery} />
          </Box>
        </Box>

        <Box
          className="msg-actions-row"
          role="group"
          aria-label="Message actions"
          sx={{
            ...messageActionsRowSx,
            width: '100%',
            mt: 0.25,
          }}
        >
          <CopyButton copied={copied} onClick={handleCopy} data-testid="action-bar-copy" />
        </Box>
      </Box>
    </Fade>
  );
});

const ConversationLoadingSkeleton = memo(function ConversationLoadingSkeleton() {
  const prefersReducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const animation = prefersReducedMotion ? false : 'wave';
  const lineWidths = [
    '100%',
    '91%',
    '100%',
    '82%',
    '91%',
    '100%',
    '73%',
    '91%',
    '82%',
    '73%',
    '35%',
  ];

  return (
    <Box sx={{ flex: 1, py: { xs: 1.5, sm: 2 }, overflowAnchor: 'none' }}>
      <Box
        sx={{
          width: '100%',
          maxWidth: UI_LAYOUT.chatInputMaxWidth,
          mx: 'auto',
          px: 2,
          pt: 0.5,
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: { xs: 1.5, sm: 2.25 } }}>
          <Skeleton
            variant="rounded"
            animation={animation}
            sx={{
              width: { xs: 112, sm: 168 },
              height: { xs: 26, sm: 34 },
              borderRadius: '12px',
            }}
          />
        </Box>

        {lineWidths.map((width, idx) => (
          <Skeleton
            key={`line-skeleton-${idx}`}
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
  );
});

function normalizeAssistantMessage(message) {
  const status = message.status || (
    message.isWaiting ? MESSAGE_STATUS.WAITING :
      message.isStreaming ? MESSAGE_STATUS.STREAMING :
        message.isError ? MESSAGE_STATUS.ERROR :
          message.wasStopped ? MESSAGE_STATUS.STOPPED :
            MESSAGE_STATUS.DONE
  );

  if (Array.isArray(message.steps) && typeof message.text === 'string') {
    return {
      id: message.id,
      text: message.text,
      steps: message.steps,
      status,
    };
  }

  const fallbackContent = message.rawContent || message.content || '';
  const parsed = parseAssistantContent(fallbackContent, message.thinking, message.tools);
  return {
    id: message.id,
    text: message.text ?? parsed.text,
    steps: parsed.steps,
    status,
  };
}

const MessageList = memo(function MessageList({
  messages = [],
  isLoadingConversation = false,
  onRunQuery,
  onOpenSqlEditor,
}) {
  const [visibleCount, setVisibleCount] = useState(60);
  const normalizedMessages = useMemo(() => (
    messages.map((message, index) => {
      const role = message.role || (message.sender === 'user' ? 'user' : 'assistant');
      const id = message.id || `message-${index}`;
      if (role === 'user') {
        return {
          id,
          role,
          text: message.text ?? message.content ?? '',
        };
      }
      return {
        id,
        role,
        ...normalizeAssistantMessage(message),
      };
    })
  ), [messages]);
  const effectiveVisibleCount = normalizedMessages.length <= 50 ? 60 : visibleCount;
  const hiddenCount = Math.max(0, normalizedMessages.length - effectiveVisibleCount);
  const visibleMessages = hiddenCount > 0
    ? normalizedMessages.slice(-effectiveVisibleCount)
    : normalizedMessages;

  if (isLoadingConversation) {
    return <ConversationLoadingSkeleton />;
  }

  return (
    <Box
      sx={{
        flex: 1,
        py: 2,
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
          px: 2,
          pt: 0.5,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        {hiddenCount > 0 && (
          <Box sx={{ pb: 1 }}>
            <Button
              size="small"
              onClick={() => setVisibleCount((c) => c + 50)}
              sx={{ minHeight: { xs: 36, sm: 'auto' } }}
            >
              Load {Math.min(50, hiddenCount)} older messages
            </Button>
          </Box>
        )}
        {visibleMessages.map((message) => (
          message.role === 'user'
            ? <UserMessage key={message.id} message={message.text} />
            : (
              <AIMessage
                key={message.id}
                id={message.id}
                text={message.text}
                steps={message.steps}
                status={message.status}
                onRunQuery={onRunQuery}
                onOpenSqlEditor={onOpenSqlEditor}
              />
            )
        ))}
      </Box>
    </Box>
  );
});

export default MessageList;