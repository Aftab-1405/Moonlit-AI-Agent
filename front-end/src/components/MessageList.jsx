import { Box, Typography, Avatar, IconButton, Tooltip, Button, Skeleton, useTheme, useMediaQuery } from '@mui/material';
import { alpha, keyframes } from '@mui/material/styles';
import Fade from '@mui/material/Fade';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { StepsAccordion } from './AIResponseSteps';
import MarkdownRenderer from './MarkdownRenderer';
import { MESSAGE_STATUS, parseAssistantContent } from '../utils/chatMessages';
import {
  HOVER_CAPABLE_QUERY,
  REDUCED_MOTION_QUERY,
} from '../styles/mediaQueries';

const COPY_FEEDBACK_DURATION = 2000;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

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

const CopyButton = memo(function CopyButton({ copied, onClick, className = 'copy-btn', sx = {} }) {
  return (
    <Tooltip title={copied ? 'Copied!' : 'Copy'}>
      <IconButton
        className={className}
        size="small"
        onClick={onClick}
        sx={{
          opacity: 0,
          color: copied ? 'text.primary' : 'text.secondary',
          transition: 'opacity 0.2s',
          [HOVER_CAPABLE_QUERY]: {
            '&:hover': { color: 'text.primary' },
          },
          ...sx,
        }}
      >
        {copied ? <CheckRoundedIcon sx={{ fontSize: 16 }} /> : <ContentCopyRoundedIcon sx={{ fontSize: 16 }} />}
      </IconButton>
    </Tooltip>
  );
});

const UserMessage = memo(function UserMessage({ message, userAvatar, userName }) {
  const { copied, copyText } = useCopyToClipboard();
  const theme = useTheme();
  const isCompactMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const handleCopy = useCallback(() => copyText(message), [copyText, message]);

  return (
    <Fade in timeout={300}>
      <Box sx={{ py: { xs: 1, sm: 1.5 }, px: { xs: 2, sm: 4, md: 6 } }}>
        <Box sx={{ maxWidth: 800, mx: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
          <Box
            sx={{
              display: 'flex',
              gap: { xs: 0.75, sm: 1.5 },
              width: { xs: '100%', md: '70%' },
              maxWidth: '100%',
              flexDirection: 'row-reverse',
              [HOVER_CAPABLE_QUERY]: {
                '&:hover .copy-btn': { opacity: 1 },
              },
            }}
          >
            {!isCompactMobile && (
              <Avatar src={userAvatar} sx={{ width: { xs: 24, sm: 28 }, height: { xs: 24, sm: 28 }, bgcolor: 'primary.main', fontWeight: 600, alignSelf: 'flex-start', mt: 0.5 }}>
                {!userAvatar && (userName?.charAt(0).toUpperCase() || 'U')}
              </Avatar>
            )}
            <Box sx={{ px: { xs: 1.4, sm: 2 }, py: { xs: 1, sm: 1.25 }, borderRadius: '16px 16px 4px 16px', backgroundColor: theme.palette.action.hover, border: '1px solid', borderColor: theme.palette.divider }}>
              <Typography sx={{ lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'text.primary' }}>
                {message}
              </Typography>
            </Box>
            <CopyButton copied={copied} onClick={handleCopy} sx={{ alignSelf: 'center', display: isCompactMobile ? 'none' : 'inline-flex' }} />
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
  const isCompactMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const contentRef = useRef(null);
  const sqlEditorTimeoutRef = useRef(null);
  const openedToolsRef = useRef(new Set());

  const isStreaming = status === MESSAGE_STATUS.STREAMING;
  const isWaiting = status === MESSAGE_STATUS.WAITING;

  const displayText = text || '';
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

  return (
    <Fade in timeout={300}>
      <Box
        sx={{
          py: { xs: 1, sm: 1.5 },
          px: { xs: 2, sm: 4, md: 6 },
          [HOVER_CAPABLE_QUERY]: {
            '&:hover .copy-btn': { opacity: 1 },
          },
        }}
      >
        <Box sx={{ width: { xs: '100%', md: '70%' }, maxWidth: { xs: '100%', sm: 800 }, mx: { xs: 0, sm: 'auto' }, display: 'flex', gap: { xs: 1, sm: 2 }, alignItems: 'flex-start' }}>
          {!isCompactMobile && (
            <Avatar
              src="/product-logo.png"
              sx={{
                width: { xs: 24, sm: 28 }, height: { xs: 24, sm: 28 }, bgcolor: 'transparent', flexShrink: 0, alignSelf: 'flex-start', mt: 0,
                border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
                animation: isWaiting ? `${spin} 1s linear infinite` : 'none',
                [REDUCED_MOTION_QUERY]: {
                  animation: 'none',
                },
              }}
            />
          )}
          <Box sx={{ flex: 1, minWidth: 0, pt: 0 }}>
            {displaySteps.length > 0 && (
              <StepsAccordion steps={displaySteps} isStreaming={isWaiting || isStreaming} />
            )}

            {displayText.trim() && (
              <MarkdownRenderer content={displayText} onRunQuery={onRunQuery} />
            )}

            <Box ref={contentRef} sx={{ display: 'none' }} aria-hidden>
              <MarkdownRenderer content={displayText} onRunQuery={onRunQuery} />
            </Box>
          </Box>
          <CopyButton copied={copied} onClick={handleCopy} sx={{ alignSelf: 'flex-start', mt: 0.5, display: isCompactMobile ? 'none' : 'inline-flex' }} />
        </Box>
      </Box>
    </Fade>
  );
});

const ConversationLoadingSkeleton = memo(function ConversationLoadingSkeleton() {
  const theme = useTheme();
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
      <Box sx={{ px: { xs: 2, sm: 4, md: 6 } }}>
        <Box sx={{ maxWidth: 800, mx: 'auto' }}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: { xs: 1.5, sm: 2.25 } }}>
            <Skeleton
              variant="rounded"
              animation={animation}
              sx={{
                width: { xs: 112, sm: 168 },
                height: { xs: 26, sm: 34 },
                borderRadius: 2,
                bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.12),
              }}
            />
          </Box>

          <Box sx={{ width: { xs: '100%', md: '70%' }, maxWidth: { xs: '100%', sm: 800 }, mx: { xs: 0, sm: 'auto' } }}>
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
                  bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.13 : 0.1),
                }}
              />
            ))}
          </Box>
        </Box>
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
  user,
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
    <Box sx={{
      flex: 1,
      py: 2,
      // Prevent browser scroll anchoring from fighting stream updates
      overflowAnchor: 'none',
    }}>
      {hiddenCount > 0 && (
        <Box sx={{ px: { xs: 2, sm: 4, md: 6 }, pb: 1 }}>
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
          ? (
            <UserMessage
              key={message.id}
              message={message.text}
              userAvatar={user?.photoURL}
              userName={user?.displayName}
            />
          )
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
  );
});

export default MessageList;
