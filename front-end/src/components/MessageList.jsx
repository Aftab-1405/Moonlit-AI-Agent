import { Box, Typography, Avatar, IconButton, Tooltip, useTheme } from '@mui/material';
import { alpha, keyframes } from '@mui/material/styles';
import Fade from '@mui/material/Fade';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { StepsAccordion } from './AIResponseSteps';
import MarkdownRenderer from './MarkdownRenderer';
import { MESSAGE_STATUS, parseAssistantContent } from '../utils/chatMessages';

const COPY_FEEDBACK_DURATION = 2000;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const copyText = useCallback((text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION);
  }, []);

  const copyRich = useCallback((htmlContent, plainText) => {
    const setCopiedWithTimeout = () => {
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION);
    };

    if (htmlContent && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
      const textBlob = new Blob([plainText], { type: 'text/plain' });
      navigator.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })])
        .then(setCopiedWithTimeout)
        .catch(() => {
          navigator.clipboard.writeText(plainText);
          setCopiedWithTimeout();
        });
    } else {
      navigator.clipboard.writeText(plainText);
      setCopiedWithTimeout();
    }
  }, []);

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
          '&:hover': { color: 'text.primary' },
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
  const handleCopy = useCallback(() => copyText(message), [copyText, message]);

  return (
    <Fade in timeout={300}>
      <Box sx={{ py: 1.5, px: { xs: 2, sm: 4, md: 6 } }}>
        <Box sx={{ maxWidth: 800, mx: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
          <Box sx={{ display: 'flex', gap: 1.5, maxWidth: '80%', flexDirection: 'row-reverse', '&:hover .copy-btn': { opacity: 1 } }}>
            <Avatar src={userAvatar} sx={{ width: 24, height: 24, bgcolor: 'primary.main', fontWeight: 600, alignSelf: 'flex-start', mt: 0.5 }}>
              {!userAvatar && (userName?.charAt(0).toUpperCase() || 'U')}
            </Avatar>
            <Box sx={{ px: 2, py: 1.25, borderRadius: '16px 16px 4px 16px', backgroundColor: alpha(theme.palette.text.primary, 0.05), border: '1px solid', borderColor: alpha(theme.palette.text.primary, 0.1) }}>
              <Typography sx={{ lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'text.primary' }}>
                {message}
              </Typography>
            </Box>
            <CopyButton copied={copied} onClick={handleCopy} sx={{ alignSelf: 'center' }} />
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
      const normalizedResults = {
        columns: parsedResult?.columns || [],
        result: parsedResult?.data || parsedResult?.preview || [],
        row_count: parsedResult?.row_count || 0,
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
      <Box sx={{ py: 1.5, px: { xs: 2, sm: 4, md: 6 }, '&:hover .copy-btn': { opacity: 1 } }}>
        <Box sx={{ maxWidth: 800, mx: 'auto', display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          <Avatar
            src="/product-logo.png"
            sx={{
              width: 24, height: 24, bgcolor: 'transparent', flexShrink: 0, alignSelf: 'flex-start', mt: 0,
              border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
              animation: isWaiting ? `${spin} 1s linear infinite` : 'none',
            }}
          />
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
          <CopyButton copied={copied} onClick={handleCopy} sx={{ alignSelf: 'flex-start', mt: 0.5 }} />
        </Box>
      </Box>
    </Fade>
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

const MessageList = memo(function MessageList({ messages = [], user, onRunQuery, onOpenSqlEditor }) {
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

  return (
    <Box sx={{
      flex: 1,
      py: 2,
      pb: 2,
      // Prevent browser scroll anchoring from fighting stream updates
      overflowAnchor: 'none',
    }}>
      {normalizedMessages.map((message) => (
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
