import { Box, Typography, useTheme } from '@mui/material';
import { alpha, keyframes } from '@mui/material/styles';
import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeViewer } from '@/components';
import {
  getMarkdownBoundarySx,
  markFirstMarkdownElement,
} from '@/features/chat/markdownRendererStyles';
import { HOVER_CAPABLE_QUERY } from '@/styles/mediaQueries';
import { TRANSITIONS } from '@/theme/themeEffects';

/**
 * MarkdownRenderer — renders AI message content with GitHub-flavoured Markdown.
 *
 * Responsibilities:
 *   - Strip canvas-language code blocks (e.g. `diagram-flow`) before remark
 *     parses them — these are rendered as artifact cards by `MessageList`.
 *   - Detect bare JSON `{"query": "..."}` payloads and pretty-print them as
 *     SQL code blocks with the rationale as a blockquote.
 *   - Map markdown primitives (code, table, links, etc.) to themed MUI
 *     components so typography & spacing stay consistent with the rest of
 *     the app.
 */

// Languages rendered as interactive canvas artifacts — never shown as code blocks.
const CANVAS_LANGUAGES = new Set(['diagram-flow']);
const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [markFirstMarkdownElement];

const streamingCaret = keyframes`
  0%, 45% { opacity: 0.72; }
  55%, 100% { opacity: 0.16; }
`;

const InlineCode = memo(function InlineCode({ children, theme }) {
  return (
    <Typography
      component="code"
      sx={{
        fontFamily: theme.typography.fontFamilyMono,
        fontSize: '0.84em',
        lineHeight: 1,
        backgroundColor: theme.palette.action.selected,
        px: '0.42em',
        py: '0.16em',
        borderRadius: '5px',
        fontWeight: 400,
        fontVariantLigatures: 'none',
        fontFeatureSettings: '"liga" 0, "calt" 0',
        overflowWrap: 'anywhere',
        color: theme.palette.text.primary,
      }}
    >
      {children}
    </Typography>
  );
});

const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  onRunQuery,
  isStreaming = false,
  variant = 'response',
}) {
  const theme = useTheme();
  const isCompact = variant === 'compact';

  const processedContent = useMemo(() => {
    if (typeof content !== 'string') return content;
    let text = content;

    // Strip canvas-language code blocks before remark parses them.
    // This covers:
    //   1. Complete blocks  — both fences present (non-greedy match)
    //   2. Partial/streaming blocks — opening fence arrived, closing fence
    //      not yet streamed in (match to end of string).
    for (const lang of CANVAS_LANGUAGES) {
      // Complete block (non-greedy so multiple blocks don't merge)
      text = text.replace(new RegExp(`\`\`\`${lang}[^\\n]*\\n[\\s\\S]*?\`\`\``, 'gi'), '');
      // Partial/open block — opening fence with no matching closing fence
      text = text.replace(new RegExp(`\`\`\`${lang}[^\\n]*(?:\\n[\\s\\S]*)?$`, 'gi'), '');
    }

    const trimmed = text.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed.query === 'string') {
          let header = '';
          if (parsed.rationale) {
            header = `> **Rationale**: ${parsed.rationale}\n\n`;
          }
          return `${header}\`\`\`sql\n${parsed.query}\n\`\`\``;
        }
      } catch {
        // ignore
      }
    }
    return text;
  }, [content]);

  const components = useMemo(
    () => ({
      code({ className, children, ...props }) {
        const match = /language-([A-Za-z0-9_-]+)/.exec(className || '');
        const language = match ? match[1].toLowerCase() : '';

        // Canvas languages (e.g. diagram-flow) are rendered as artifact cards
        // by MessageList — never as code blocks here.
        if (CANVAS_LANGUAGES.has(language)) return null;

        const isBlock = match || String(children).includes('\n');

        if (isBlock) {
          return (
            <CodeViewer
              value={Array.isArray(children) ? children.join('') : String(children || '')}
              language={language}
              onRunQuery={onRunQuery}
              isStreaming={isStreaming}
            />
          );
        }
        return (
          <InlineCode theme={theme} {...props}>
            {children}
          </InlineCode>
        );
      },
      pre: ({ children, className }) => <Box className={className}>{children}</Box>,
      table: ({ children, className }) => (
        <Box
          className={className}
          sx={{
            overflowX: 'auto',
            my: isCompact ? 1 : 2,
            borderRadius: '8px',
            border: '1px solid',
            borderColor: theme.palette.border.subtle,
            backgroundColor: theme.palette.background.paper,
            scrollbarWidth: 'thin',
            scrollbarColor: `${alpha(theme.palette.text.primary, 0.2)} transparent`,
          }}
        >
          <Box
            component="table"
            sx={{
              minWidth: 'max-content',
              width: '100%',
              borderCollapse: 'collapse',
            }}
          >
            {children}
          </Box>
        </Box>
      ),
    }),
    [isCompact, onRunQuery, isStreaming, theme],
  );

  const containerSx = useMemo(
    () => ({
      overflowWrap: 'anywhere',
      wordBreak: 'break-word',
      color: theme.palette.text.primary,
      ...(isCompact ? theme.typography.uiResponseCompact : theme.typography.uiResponseBody),

      '& p': { m: 0, lineHeight: 'inherit' },
      '& p + p': { mt: isCompact ? 0.8 : 1.05 },
      '& strong': {
        color: 'inherit',
        fontWeight: 400,
      },
      '& em': { color: 'inherit' },
      '& del': {
        color: theme.palette.text.secondary,
        textDecorationThickness: '1px',
      },
      '& ul, & ol': {
        pl: isCompact ? 2.15 : 2.5,
        my: isCompact ? 0.8 : 1.05,
      },
      '& ul ul, & ul ol, & ol ul, & ol ol': {
        mt: 0.4,
        mb: 0.25,
      },
      '& li': {
        mb: isCompact ? 0.28 : 0.42,
        minHeight: '1.45em',
        lineHeight: 'inherit',
        pl: 0.15,
      },
      '& li:last-child': { mb: 0 },
      '& li::marker': {
        color: theme.palette.layer.secondaryContent,
        fontWeight: 400,
      },
      '& .contains-task-list': {
        listStyle: 'none',
        pl: 0.25,
      },
      '& .task-list-item': {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0.75,
      },
      '& .task-list-item > input': {
        flexShrink: 0,
        width: 14,
        height: 14,
        mt: '0.38em',
        accentColor: theme.palette.text.primary,
      },
      '& a': {
        color: 'text.primary',
        textDecorationLine: 'underline',
        textDecorationColor: alpha(theme.palette.text.primary, 0.28),
        textDecorationThickness: '1px',
        textUnderlineOffset: '0.18em',
        transition: TRANSITIONS.default,
        [HOVER_CAPABLE_QUERY]: {
          '&:hover': {
            color: 'text.primary',
            textDecorationColor: theme.palette.text.primary,
          },
        },
        '&:focus-visible': {
          outline: `2px solid ${theme.palette.border.focus}`,
          outlineOffset: 3,
          borderRadius: '2px',
        },
      },
      '& img': {
        maxWidth: '100%',
        height: 'auto',
        display: 'block',
        my: isCompact ? 1 : 1.5,
        borderRadius: '8px',
        border: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
      },
      '& blockquote': {
        borderLeft: `2px solid ${alpha(theme.palette.text.primary, 0.18)}`,
        margin: 0,
        my: isCompact ? 0.9 : 1.35,
        pl: isCompact ? 1.15 : 1.4,
        pr: isCompact ? 0.75 : 1,
        py: isCompact ? 0.55 : 0.7,
        borderRadius: '0 8px 8px 0',
        backgroundColor: theme.palette.layer.barely,
        color: theme.palette.text.secondary,
      },
      '& blockquote p + p': { mt: 0.65 },
      '& hr': {
        border: 'none',
        borderTop: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
        my: isCompact ? 1.15 : 1.8,
      },
      '& h1, & h2, & h3': {
        color: theme.palette.text.primary,
        scrollMarginTop: 88,
      },
      '& h1': {
        ...(isCompact
          ? { ...theme.typography.uiResponseCompact, fontWeight: 400 }
          : theme.typography.uiResponseHeading1),
        mt: isCompact ? 1.35 : 2.15,
        mb: isCompact ? 0.55 : 0.85,
      },
      '& h2': {
        ...(isCompact
          ? { ...theme.typography.uiResponseCompact, fontWeight: 400 }
          : theme.typography.uiResponseHeading2),
        mt: isCompact ? 1.2 : 1.9,
        mb: isCompact ? 0.5 : 0.75,
      },
      '& h3': {
        ...(isCompact
          ? { ...theme.typography.uiResponseCompact, fontWeight: 400 }
          : theme.typography.uiResponseHeading3),
        mt: isCompact ? 1.05 : 1.55,
        mb: isCompact ? 0.4 : 0.6,
      },
      '& h4, & h5, & h6': {
        fontFamily: theme.typography.fontFamily,
        fontSize: isCompact ? 'inherit' : { xs: '0.9375rem', sm: '0.975rem' },
        fontWeight: 400,
        color: theme.palette.text.primary,
        mt: isCompact ? 1 : 1.4,
        mb: 0.45,
        lineHeight: 1.4,
        letterSpacing: '-0.008em',
      },
      ...getMarkdownBoundarySx(),
      '& table': {
        overflowWrap: 'normal',
        wordBreak: 'normal',
        ...(isCompact ? theme.typography.uiResponseCompact : theme.typography.uiBodyTable),
      },
      '& th': {
        bgcolor: theme.palette.layer.faint,
        fontWeight: 400,
        textAlign: 'left',
        px: { xs: 1, md: 2 },
        py: 1,
        borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.075)}`,
        // Headers wrap to a max of 2 lines before truncating with an ellipsis.
        // `whiteSpace: nowrap` (the previous value) forced every table to
        // overflow horizontally even when the content was short.
        whiteSpace: 'normal',
        ...(isCompact ? theme.typography.uiCaptionSm : theme.typography.uiCaptionMd),
      },
      '& td': {
        px: { xs: 1, md: 2 },
        py: 1,
        borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.06)}`,
        // Allow cell content to wrap by default. Long strings (URLs, code,
        // hashes) still break via `word-break: break-word` set on the root.
        whiteSpace: 'normal',
        verticalAlign: 'top',
      },
      '& tr:last-child td': { borderBottom: 'none' },
      // Subtle row hover — only on hover-capable devices.
      [HOVER_CAPABLE_QUERY]: {
        '& tbody tr:hover td': {
          bgcolor: theme.palette.action.hover,
        },
      },
      '&.is-streaming > p:last-child::after, &.is-streaming > ul:last-child li:last-child::after, &.is-streaming > ol:last-child li:last-child::after, &.is-streaming > blockquote:last-child p:last-child::after':
        {
          content: '""',
          display: 'inline-block',
          width: '2px',
          height: '0.95em',
          ml: '0.2em',
          borderRadius: '1px',
          verticalAlign: '-0.1em',
          backgroundColor: alpha(theme.palette.text.primary, 0.82),
          animation: `${streamingCaret} 1s ease-in-out infinite`,
        },
      '@media (prefers-reduced-motion: reduce)': {
        '&.is-streaming > p:last-child::after, &.is-streaming > ul:last-child li:last-child::after, &.is-streaming > ol:last-child li:last-child::after, &.is-streaming > blockquote:last-child p:last-child::after':
          {
            animation: 'none',
            opacity: 0.55,
          },
      },
    }),
    [isCompact, theme],
  );

  return (
    <Box
      className={isStreaming && String(processedContent || '').trim() ? 'is-streaming' : undefined}
      aria-busy={isStreaming || undefined}
      sx={containerSx}
    >
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components}
      >
        {processedContent || ''}
      </ReactMarkdown>
    </Box>
  );
});

export default MarkdownRenderer;
