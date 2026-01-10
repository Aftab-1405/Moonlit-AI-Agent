import { Box, Typography, Avatar, IconButton, Tooltip, useTheme } from '@mui/material';
import { alpha, keyframes } from '@mui/material/styles';
import Fade from '@mui/material/Fade';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { StepsAccordion } from './AIResponseSteps';
import MarkdownRenderer from './MarkdownRenderer';
import { useCharacterPacing } from '../hooks';

// ============================================================================
// CONSTANTS & ANIMATIONS
// ============================================================================

const COPY_FEEDBACK_DURATION = 2000;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

// ============================================================================
// HOOKS
// ============================================================================

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

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

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
          '&:hover': { color: 'primary.main' },
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

const AIMessage = memo(function AIMessage({ message, thinking, tools, onRunQuery, onOpenSqlEditor, isStreaming, isWaiting }) {
  const { copied, copyRich } = useCopyToClipboard();
  const theme = useTheme();
  const contentRef = useRef(null);
  const sqlEditorTimeoutRef = useRef(null);
  const openedToolsRef = useRef(new Set());
  const wasStreamingRef = useRef(false);

  // Apply character pacing (120 chars/sec)
  const pacedMessage = useCharacterPacing(message, isStreaming, 120);

  useEffect(() => {
    return () => {
      if (sqlEditorTimeoutRef.current) clearTimeout(sqlEditorTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (isStreaming) wasStreamingRef.current = true;
  }, [isStreaming]);

  const getCleanContent = useCallback(() => message
    .replace(/\[\[THINKING:start\]\]/g, '')
    .replace(/\[\[THINKING:chunk:.*?\]\]/g, '')
    .replace(/\[\[THINKING:end\]\]/g, '')
    .replace(/\[\[TOOL:[^\]]*\]\]/g, ''), [message]);

  const segments = useMemo(() => parseMessageSegments(pacedMessage, thinking, tools), [pacedMessage, thinking, tools]);

  const textOnlySegments = useMemo(
    () => segments.filter((segment) => segment.type === 'text' && segment.content.trim()),
    [segments]
  );

  // Auto-open SQL editor logic (preserved from original)
  useEffect(() => {
    if (!onOpenSqlEditor || isStreaming || !wasStreamingRef.current) return;

    segments.forEach((segment, idx) => {
      if (segment.type === 'tool' && segment.name === 'execute_query' && segment.status === 'done' && !openedToolsRef.current.has(idx)) {
        openedToolsRef.current.add(idx);
        let parsedArgs = null;
        let parsedResult = null;
        try {
          parsedArgs = segment.args && segment.args !== 'null' ? JSON.parse(segment.args) : null;
          parsedResult = segment.result && segment.result !== 'null' ? JSON.parse(segment.result) : null;
        } catch { /* ignore parse errors */ }

        if (parsedResult && parsedResult.success !== false && !parsedResult.error) {
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
        }
      }
    });
  }, [segments, isStreaming, onOpenSqlEditor]);

  const handleCopy = useCallback(() => {
    const container = contentRef.current;
    const htmlContent = container?.innerHTML;
    const cleanContent = getCleanContent();
    const plainTextContent = container?.innerText || cleanContent;
    copyRich(htmlContent, plainTextContent);
  }, [getCleanContent, copyRich]);

  return (
    <Fade in timeout={300}>
      <Box sx={{ py: 1.5, px: { xs: 2, sm: 4, md: 6 }, '&:hover .copy-btn': { opacity: 1 } }}>
        <Box sx={{ maxWidth: 800, mx: 'auto', display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          <Avatar
            src="/product-logo.png"
            sx={{
              width: 24, height: 24, bgcolor: 'transparent', flexShrink: 0, alignSelf: 'flex-start', mt: 0.5,
              border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
              animation: isWaiting ? `${spin} 1s linear infinite` : 'none',
            }}
          />
          <Box sx={{ flex: 1, minWidth: 0, pt: 0 }}>
            {/* Render Steps */}
            {segments.filter(s => s.type === 'thinking' || s.type === 'tool').length > 0 && (
              <StepsAccordion steps={segments.filter(s => s.type === 'thinking' || s.type === 'tool')} isStreaming={isStreaming} />
            )}

            {/* Render Text */}
            {segments.filter(s => s.type === 'text' && s.content.trim()).map((segment, idx) => (
              <MarkdownRenderer key={`text-${idx}`} content={segment.content} onRunQuery={onRunQuery} />
            ))}

            {/* Hidden content for copy */}
            <Box ref={contentRef} sx={{ display: 'none' }} aria-hidden>
              {textOnlySegments.map((segment, idx) => (
                <MarkdownRenderer key={`copy-${idx}`} content={segment.content} onRunQuery={onRunQuery} />
              ))}
            </Box>
          </Box>
          <CopyButton copied={copied} onClick={handleCopy} sx={{ alignSelf: 'flex-start', mt: 0.5 }} />
        </Box>
      </Box>
    </Fade>
  );
});

// ============================================================================
// MAIN COMPONENT & UTILS
// ============================================================================

const MessageList = memo(function MessageList({ messages = [], user, onRunQuery, onOpenSqlEditor }) {
  return (
    <Box sx={{
      flex: 1,
      py: 2,
      // CRITICAL: prevents browser scroll anchoring from fighting with the typing animation
      overflowAnchor: 'none'
    }}>
      {messages.map((msg, index) => (
        msg.sender === 'user'
          ? <UserMessage key={index} message={msg.content} userAvatar={user?.photoURL} userName={user?.displayName} />
          : <AIMessage key={index} message={msg.content} thinking={msg.thinking} tools={msg.tools} onRunQuery={onRunQuery} onOpenSqlEditor={onOpenSqlEditor} isStreaming={msg.isStreaming} isWaiting={msg.isWaiting} />
      ))}
    </Box>
  );
});

// --- PARSER UTILITIES (Preserved from your original code) ---

function stripJsonFromText(text) {
  if (!text || typeof text !== 'string') return text;
  let result = text;
  let changed = true;
  while (changed && result.length > 0) {
    changed = false;
    const trimmed = result.trim();
    if (trimmed.startsWith('{')) {
      const endIdx = findJsonObjectEnd(trimmed, 0);
      if (endIdx !== -1) {
        try { JSON.parse(trimmed.slice(0, endIdx + 1)); result = trimmed.slice(endIdx + 1).trim(); changed = true; continue; } catch { /* ignore */ }
      }
    }
    const lastBrace = trimmed.lastIndexOf('}');
    if (lastBrace !== -1) {
      const startIdx = findJsonObjectStart(trimmed, lastBrace);
      if (startIdx !== -1 && startIdx > 0) {
        try { JSON.parse(trimmed.slice(startIdx, lastBrace + 1)); result = trimmed.slice(0, startIdx).trim(); changed = true; } catch { /* ignore */ }
      }
    }
  }
  return result;
}

function findJsonObjectEnd(text, startIdx) {
  if (text[startIdx] !== '{') return -1;
  let depth = 0; let inString = false; let escapeNext = false;
  for (let i = startIdx; i < text.length; i++) {
    const char = text[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (char === '\\' && inString) { escapeNext = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (!inString) { if (char === '{') depth++; else if (char === '}') { depth--; if (depth === 0) return i; } }
  }
  return -1;
}

function findJsonObjectStart(text, endIdx) {
  let depth = 0; let inString = false;
  for (let i = endIdx; i >= 0; i--) {
    const char = text[i];
    if (char === '"') {
      let backslashes = 0; for (let j = i - 1; j >= 0 && text[j] === '\\'; j--) backslashes++;
      if (backslashes % 2 === 0) inString = !inString; continue;
    }
    if (!inString) { if (char === '}') depth++; else if (char === '{') { depth--; if (depth === 0) return i; } }
  }
  return -1;
}

function stripThinkingMarkers(text) {
  if (!text) return text;
  return text.replace(/\[\[THINKING:start\]\]/g, '').replace(/\[\[THINKING:chunk:.*?\]\]/g, '').replace(/\[\[THINKING:end\]\]/g, '');
}

function parseMessageSegments(text, thinkingField = null, toolsField = null) {
  const segments = [];
  if (thinkingField && thinkingField.trim()) {
    segments.push({ type: 'thinking', content: thinkingField, isComplete: true });
  }
  const hasToolMarkers = text.includes('[[TOOL:');
  const hasThinkingMarkers = text.includes('[[THINKING:');

  if (hasToolMarkers || hasThinkingMarkers) {
    parseMarkersInline(text, segments, thinkingField);
  } else {
    if (Array.isArray(toolsField)) {
      toolsField.forEach(tool => {
        segments.push({ type: 'tool', name: tool.name, status: tool.status || 'done', args: tool.args, result: tool.result });
      });
    }
    const cleanText = text.trim();
    if (cleanText) segments.push({ type: 'text', content: cleanText });
  }
  return segments;
}

function parseMarkersInline(text, segments, thinkingField) {
  let currentIndex = 0;
  while (currentIndex < text.length) {
    const toolStart = text.indexOf('[[TOOL:', currentIndex);
    const thinkingStart = text.indexOf('[[THINKING:start]]', currentIndex);
    let nextMarkerStart = -1;
    let markerType = null;

    if (toolStart !== -1 && thinkingStart !== -1) {
      nextMarkerStart = toolStart < thinkingStart ? toolStart : thinkingStart;
      markerType = toolStart < thinkingStart ? 'tool' : 'thinking';
    } else if (toolStart !== -1) {
      nextMarkerStart = toolStart; markerType = 'tool';
    } else if (thinkingStart !== -1) { nextMarkerStart = thinkingStart; markerType = 'thinking'; }

    if (nextMarkerStart === -1) {
      const remainingText = text.slice(currentIndex);
      const cleanedText = stripThinkingMarkers(stripJsonFromText(remainingText));
      if (cleanedText && cleanedText.trim()) segments.push({ type: 'text', content: cleanedText });
      break;
    }

    if (nextMarkerStart > currentIndex) {
      const textContent = text.slice(currentIndex, nextMarkerStart);
      const cleanedText = stripThinkingMarkers(stripJsonFromText(textContent));
      if (cleanedText && cleanedText.trim()) segments.push({ type: 'text', content: cleanedText });
    }

    if (markerType === 'thinking') {
      currentIndex = nextMarkerStart + '[[THINKING:start]]'.length;
      let thinkingContent = '';
      let isThinkingComplete = false;
      while (currentIndex < text.length) {
        const chunkStart = text.indexOf('[[THINKING:chunk:', currentIndex);
        const endStart = text.indexOf('[[THINKING:end]]', currentIndex);
        if (endStart !== -1 && (chunkStart === -1 || endStart < chunkStart)) {
          isThinkingComplete = true; currentIndex = endStart + '[[THINKING:end]]'.length; break;
        }
        if (chunkStart !== -1) {
          const chunkEnd = text.indexOf(']]', chunkStart);
          if (chunkEnd === -1) break;
          thinkingContent += text.slice(chunkStart + 17, chunkEnd); currentIndex = chunkEnd + 2; continue;
        }
        break;
      }
      if (!isThinkingComplete && thinkingContent === '') {
        const nextEnd = text.indexOf('[[THINKING:end]]', currentIndex);
        currentIndex = nextEnd !== -1 ? nextEnd + '[[THINKING:end]]'.length : text.length;
      }
      if (!thinkingField || thinkingField.trim() === '') {
        segments.push({ type: 'thinking', content: thinkingContent, isComplete: isThinkingComplete });
      }
    } else if (markerType === 'tool') {
      const parsed = parseToolMarker(text, nextMarkerStart);
      if (parsed) {
        const newSeg = parsed.segment;
        if (newSeg.status === 'done') {
          const runningIdx = segments.findIndex(s => s.type === 'tool' && s.name === newSeg.name && s.status === 'running');
          if (runningIdx !== -1) segments[runningIdx] = newSeg; else segments.push(newSeg);
        } else segments.push(newSeg);
        currentIndex = parsed.endIndex;
      } else {
        const failEnd = text.indexOf(']]', nextMarkerStart);
        currentIndex = failEnd !== -1 ? failEnd + 2 : text.length;
      }
    }
  }
}

function parseToolMarker(text, markerStart) {
  const afterPrefix = markerStart + 7;
  const nameEnd = text.indexOf(':', afterPrefix);
  if (nameEnd === -1) return null;
  const toolName = text.slice(afterPrefix, nameEnd);
  const statusEnd = text.indexOf(':', nameEnd + 1);
  if (statusEnd === -1) return null;
  const status = text.slice(nameEnd + 1, statusEnd);
  const argsStart = statusEnd + 1;
  let argsEnd;
  if (text.slice(argsStart, argsStart + 4) === 'null') argsEnd = argsStart + 3;
  else if (text[argsStart] === '{') { argsEnd = findJsonObjectEnd(text, argsStart); if (argsEnd === -1) return null; }
  else return null;
  if (text[argsEnd + 1] !== ':') return null;
  const resultStart = argsEnd + 2;
  let resultEnd, resultValue;
  if (text.slice(resultStart, resultStart + 2) === ']]') { resultEnd = resultStart - 1; resultValue = null; }
  else if (text.slice(resultStart, resultStart + 4) === 'null') { resultEnd = resultStart + 3; resultValue = 'null'; }
  else if (text[resultStart] === '{') { resultEnd = findJsonObjectEnd(text, resultStart); if (resultEnd === -1) return null; resultValue = text.slice(resultStart, resultEnd + 1); }
  else return null;
  const markerEnd = resultValue === null ? resultStart + 2 : resultEnd + 3;
  return { segment: { type: 'tool', name: toolName, status, args: text.slice(argsStart, argsEnd + 1), result: resultValue }, endIndex: markerEnd };
}

export default MessageList;