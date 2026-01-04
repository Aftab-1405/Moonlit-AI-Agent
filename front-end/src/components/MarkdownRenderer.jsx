import React, { memo, useMemo, useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Box, Typography, IconButton, Tooltip, CircularProgress, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
// import MermaidDiagram from './MermaidDiagram'; // Uncomment if you have this component

// ============================================================================
// CONSTANTS
// ============================================================================

const SQL_LANGUAGES = new Set([
  'sql', 'mysql', 'postgresql', 'sqlite', 'sqlserver', 'oracle', 'tsql', 'plsql'
]);

const REMARK_PLUGINS = [remarkGfm];

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const CodeBlock = memo(function CodeBlock({ children, className, onRunQuery, isDarkMode, theme }) {
  const [copied, setCopied] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const copyTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  // Defensive parsing: Handle cases where children is an array or incomplete during stream
  const language = className?.replace('language-', '') || '';
  const code = useMemo(() => {
    return Array.isArray(children) ? children.join('') : String(children || '').replace(/\n$/, '');
  }, [children]);

  const isSQL = SQL_LANGUAGES.has(language.toLowerCase());
  const isMermaid = language.toLowerCase() === 'mermaid';

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
    my: 2,
    borderRadius: '12px',
    overflow: 'hidden',
    backgroundColor: isDarkMode ? theme.palette.background.paper : alpha(theme.palette.text.primary, 0.03),
    border: '1px solid',
    borderColor: theme.palette.divider,
    minWidth: 0, // CRITICAL: Prevents flexbox overflow issues during streaming
    width: '100%',
  }), [isDarkMode, theme]);

  // if (isMermaid) return <MermaidDiagram code={code} />; // Uncomment if using Mermaid

  return (
    <Box sx={containerStyles}>
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 1.5, py: 0.5, borderBottom: '1px solid', borderColor: theme.palette.divider
      }}>
        <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 500, textTransform: 'uppercase' }}>
          {language || 'code'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {isSQL && (
            <Tooltip title={isRunning ? "Running..." : "Run"} arrow>
              <span>
                <IconButton
                  size="small"
                  onClick={handleRun}
                  disabled={isRunning}
                  sx={{
                    p: 0.5,
                    color: isRunning ? 'text.disabled' : 'success.main',
                    '&:hover': { color: 'success.light', bgcolor: alpha(theme.palette.success.main, 0.1) },
                  }}
                >
                  {isRunning ? <CircularProgress size={14} color="inherit" /> : <PlayArrowRoundedIcon sx={{ fontSize: 16 }} />}
                </IconButton>
              </span>
            </Tooltip>
          )}
          <Tooltip title={copied ? 'Copied!' : 'Copy'} arrow>
            <IconButton
              size="small"
              onClick={handleCopy}
              sx={{
                p: 0.5,
                color: copied ? 'success.main' : 'text.disabled',
                '&:hover': { color: 'text.primary', bgcolor: alpha(theme.palette.text.primary, 0.05) },
              }}
            >
              {copied ? <CheckRoundedIcon sx={{ fontSize: 14 }} /> : <ContentCopyRoundedIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ overflowX: 'auto' }}>
        <SyntaxHighlighter
          language={language || 'text'}
          style={isDarkMode ? vscDarkPlus : vs}
          customStyle={{ margin: 0, padding: '16px', fontSize: '0.85rem', lineHeight: 1.5 }}
          wrapLines={false} // CRITICAL: Disabling wrapLines stabilizes height during typing
        >
          {code}
        </SyntaxHighlighter>
      </Box>
    </Box>
  );
});

const InlineCode = memo(function InlineCode({ children, theme, isDarkMode }) {
  return (
    <Typography
      component="code"
      sx={{
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: '0.85em',
        backgroundColor: alpha(theme.palette.text.primary, isDarkMode ? 0.15 : 0.06),
        color: theme.palette.text.primary,
        px: 0.6,
        py: 0.2,
        borderRadius: 1,
        fontWeight: 500,
        wordBreak: 'break-word', // CRITICAL: Prevents inline code from causing horizontal overflow
      }}
    >
      {children}
    </Typography>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function MarkdownRenderer({ content, onRunQuery }) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const components = useMemo(() => ({
    code({ node, className, children, ...props }) {
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
      return <InlineCode theme={theme} isDarkMode={isDarkMode} {...props}>{children}</InlineCode>;
    },
    pre: ({ children }) => <>{children}</>,
    table: ({ children }) => (
      <Box sx={{ overflowX: 'auto', my: 2, borderRadius: '12px', border: `1px solid ${theme.palette.divider}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>{children}</table>
      </Box>
    ),
  }), [onRunQuery, isDarkMode, theme]);

  return (
    <Box sx={{
      // GLOBAL STABILITY STYLES
      overflowWrap: 'anywhere', // CRITICAL: Breaks long strings (URLs/tokens) to prevent layout shifting
      wordBreak: 'break-word',
      
      '& p': { my: 1.5, lineHeight: 1.7 },
      '& ul, & ol': { pl: 3, my: 1.5 },
      '& li': { mb: 0.5 },
      '& a': { color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
      
      // Table Styles
      '& th': { bgcolor: alpha(theme.palette.text.primary, 0.04), fontWeight: 600, textAlign: 'left', p: 1.5, borderBottom: `1px solid ${theme.palette.divider}` },
      '& td': { p: 1.5, borderBottom: `1px solid ${theme.palette.divider}` },
      '& tr:last-child td': { borderBottom: 'none' },
    }}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
        {content}
      </ReactMarkdown>
    </Box>
  );
}

export default MarkdownRenderer;