import { memo, useMemo, useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Box, Typography, IconButton, Tooltip, CircularProgress, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import WrapTextRoundedIcon from '@mui/icons-material/WrapTextRounded';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import MermaidDiagram from './MermaidDiagram';

const SQL_LANGUAGES = new Set([
  'sql', 'mysql', 'postgresql', 'sqlite', 'sqlserver', 'oracle', 'tsql', 'plsql'
]);

const REMARK_PLUGINS = [remarkGfm];

const CodeBlock = memo(function CodeBlock({ children, className, onRunQuery, isDarkMode, theme }) {
  const [copied, setCopied] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [wrapLongLines, setWrapLongLines] = useState(false);
  const copyTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const language = className?.replace('language-', '') || '';
  const code = useMemo(() => {
    return Array.isArray(children) ? children.join('') : String(children || '').replace(/\n$/, '');
  }, [children]);

  const isSQL = SQL_LANGUAGES.has(language.toLowerCase());
  const isMermaid = language.toLowerCase() === 'mermaid';
  const lineCount = code.split('\n').length;
  const showLineNumbers = lineCount >= 4;

  // Use the same surface level as the page — no dark pit, consistent with tables
  const codeBg = theme.palette.background.elevated;
  const headerBg = isDarkMode
    ? alpha(theme.palette.background.elevated, 0.9)
    : alpha(theme.palette.background.paper, 0.95);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const handleRun = useCallback(async () => {
    if (onRunQuery && isSQL && !isRunning) {
      setIsRunning(true);
      try {
        await onRunQuery(code);
      } finally {
        setIsRunning(false);
      }
    }
  }, [onRunQuery, isSQL, isRunning, code]);

  const containerStyles = useMemo(() => ({
    my: { xs: 1.5, sm: 2 },
    borderRadius: { xs: '8px', sm: '10px' },
    overflow: 'hidden',
    backgroundColor: codeBg,
    border: '1px solid',
    borderColor: theme.palette.border.subtle,
    minWidth: 0, // CRITICAL: Prevents flexbox overflow issues during streaming
    width: '100%',
    transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
    '&:hover': {
      borderColor: alpha(theme.palette.primary.main, isDarkMode ? 0.35 : 0.3),
      boxShadow: `0 0 0 1px ${alpha(theme.palette.primary.main, isDarkMode ? 0.1 : 0.07)}`,
    },
  }), [theme, codeBg, isDarkMode]);

  if (isMermaid) {
    return <MermaidDiagram code={code} />;
  }

  return (
    <Box sx={containerStyles}>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: { xs: 1.25, sm: 1.75 },
        minHeight: { xs: 38, sm: 42 },
        borderBottom: '1px solid',
        borderColor: theme.palette.border.subtle,
        backgroundColor: headerBg,
        gap: 1,
      }}>
        {/* Language label */}
        <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
          <Typography sx={{
            color: theme.palette.text.secondary,
            fontWeight: 500,
            fontFamily: theme.typography.fontFamilyMono,
            ...theme.typography.uiCaption2xs,
            textTransform: 'lowercase',
            letterSpacing: '0.03em',
          }}>
            {language || 'code'}
          </Typography>
        </Box>

        {/* Action buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
          <Tooltip title={wrapLongLines ? 'Unwrap long lines' : 'Wrap long lines'} arrow>
            <IconButton
              size="small"
              onClick={() => setWrapLongLines((v) => !v)}
              sx={{
                width: 30,
                height: 30,
                borderRadius: '6px',
                color: wrapLongLines ? theme.palette.primary.main : theme.palette.text.secondary,
                bgcolor: wrapLongLines ? alpha(theme.palette.primary.main, isDarkMode ? 0.12 : 0.08) : 'transparent',
                transition: 'color 0.15s ease, background-color 0.15s ease',
                '&:hover': {
                  color: wrapLongLines ? theme.palette.primary.light : theme.palette.text.primary,
                  bgcolor: alpha(theme.palette.text.primary, 0.06),
                },
              }}
            >
              <WrapTextRoundedIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          {isSQL && (
            <Tooltip title={isRunning ? 'Running…' : 'Run query'} arrow>
              <span>
                <IconButton
                  size="small"
                  onClick={handleRun}
                  disabled={isRunning}
                  sx={{
                    width: 30,
                    height: 30,
                    color: isRunning ? 'text.disabled' : theme.palette.success.main,
                    borderRadius: '6px',
                    '&:hover': {
                      color: theme.palette.success.light,
                      bgcolor: alpha(theme.palette.success.main, isDarkMode ? 0.12 : 0.08),
                    },
                  }}
                >
                  {isRunning
                    ? <CircularProgress size={13} color="inherit" />
                    : <PlayArrowRoundedIcon sx={{ fontSize: 16 }} />}
                </IconButton>
              </span>
            </Tooltip>
          )}
          <Tooltip title={copied ? 'Copied!' : 'Copy'} arrow>
            <IconButton
              size="small"
              onClick={handleCopy}
              sx={{
                width: 30,
                height: 30,
                borderRadius: '6px',
                color: copied ? theme.palette.success.main : theme.palette.text.secondary,
                transition: 'color 0.15s ease, background-color 0.15s ease',
                '&:hover': {
                  color: theme.palette.text.primary,
                  bgcolor: alpha(theme.palette.text.primary, 0.06),
                },
              }}
            >
              {copied
                ? <CheckRoundedIcon sx={{ fontSize: 14 }} />
                : <ContentCopyRoundedIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Code body */}
      <Box sx={{ overflowX: 'auto' }}>
        <SyntaxHighlighter
          language={language || 'text'}
          style={isDarkMode ? vscDarkPlus : vs}
          showLineNumbers={showLineNumbers}
          lineNumberStyle={{
            minWidth: '2.5em',
            paddingRight: '1em',
            color: isDarkMode
              ? alpha('#ffffff', 0.18)
              : alpha('#000000', 0.22),
            fontSize: '0.78em',
            userSelect: 'none',
          }}
          customStyle={{
            margin: 0,
            padding: '14px 16px',
            fontSize: theme.typography.uiCodeBlock.fontSize,
            lineHeight: theme.typography.uiCodeBlock.lineHeight,
            background: 'transparent',
          }}
          wrapLines={wrapLongLines}
          wrapLongLines={wrapLongLines}
        >
          {code}
        </SyntaxHighlighter>
      </Box>
    </Box>
  );
});

const InlineCode = memo(function InlineCode({ children, theme }) {
  return (
    <Typography
      component="code"
      sx={{
        fontFamily: theme.typography.fontFamilyMono,
        fontSize: theme.typography.uiCodeBlock.fontSize,
        backgroundColor: theme.palette.code.background,
        color: theme.palette.code.text,
        px: 0.6,
        py: 0.2,
        borderRadius: 1,
        border: '1px solid',
        borderColor: theme.palette.code.border,
        fontWeight: 500,
        wordBreak: 'break-word', // CRITICAL: Prevents inline code from causing horizontal overflow
      }}
    >
      {children}
    </Typography>
  );
});

const MarkdownRenderer = memo(function MarkdownRenderer({ content, onRunQuery }) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const components = useMemo(() => ({
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const isBlock = match || String(children).includes('\n');

      if (isBlock) {
        return (
          <CodeBlock
            className={className}
            onRunQuery={onRunQuery}
            isDarkMode={isDarkMode}
            theme={theme}
          >
            {children}
          </CodeBlock>
        );
      }
      return <InlineCode theme={theme} {...props}>{children}</InlineCode>;
    },
    pre: ({ children }) => <>{children}</>,
    table: ({ children }) => (
      <Box sx={{ overflowX: 'auto', my: 2, borderRadius: '12px', border: '1px solid', borderColor: theme.palette.border.subtle, transition: 'border-color 0.18s ease, box-shadow 0.18s ease', '&:hover': { borderColor: alpha(theme.palette.primary.main, isDarkMode ? 0.35 : 0.3), boxShadow: `0 0 0 1px ${alpha(theme.palette.primary.main, isDarkMode ? 0.1 : 0.07)}` } }}>
        <Box component="table" sx={{ minWidth: 'max-content', width: '100%', borderCollapse: 'collapse' }}>
          {children}
        </Box>
      </Box>
    ),
  }), [onRunQuery, isDarkMode, theme]);
  const containerSx = useMemo(() => ({
    overflowWrap: 'anywhere', // CRITICAL: Breaks long strings (URLs/tokens) to prevent layout shifting
    wordBreak: 'break-word',

    '& p': { my: 1.5, lineHeight: 1.7 },
    '& p:first-of-type': { mt: 0 },
    '& ul, & ol': { pl: 3, my: 1.5 },
    '& li': { mb: 0.5 },
    '& a': { color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
    '& img': {
      maxWidth: '100%',
      height: 'auto',
      display: 'block',
      borderRadius: 1,
    },
    '& blockquote': {
      borderLeft: `3px solid ${theme.palette.border.default}`,
      margin: 0,
      my: 2,
      pl: 2,
      pr: 1.5,
      py: 1,
      color: theme.palette.text.secondary,
      backgroundColor: theme.palette.action.hover,
      borderRadius: 6,
    },
    '& hr': {
      border: 'none',
      borderTop: `1px solid ${theme.palette.border.subtle}`,
      my: 2,
    },
    '& table': {
      overflowWrap: 'normal',  // Override global setting for tables
      wordBreak: 'normal',
      ...theme.typography.uiBodyTable,
    },
    '& th': {
      bgcolor: theme.palette.action.hover,
      fontWeight: 600,
      textAlign: 'left',
      px: { xs: 1.25, sm: 2 },
      py: { xs: 1, sm: 1.25 },
      borderBottom: `1px solid ${theme.palette.divider}`,
      whiteSpace: 'nowrap',
      ...theme.typography.uiCaptionMd,
    },
    '& td': {
      px: { xs: 1.25, sm: 2 },
      py: { xs: 1, sm: 1.25 },
      borderBottom: `1px solid ${theme.palette.border.subtle}`,
      whiteSpace: 'nowrap',
    },
    '& tr:last-child td': { borderBottom: 'none' },
    '& tr:hover td': {
      bgcolor: theme.palette.action.hover,
    },
  }), [theme]);

  return (
    <Box sx={containerSx}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
        {content}
      </ReactMarkdown>
    </Box>
  );
});

export default MarkdownRenderer;
