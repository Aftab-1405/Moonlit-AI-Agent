/**
 * SqlEditorSurface — CodeMirror 6 SQL editor (read/write).
 *
 * Uses the Shiki-matched theme from themeCodeMirror.js so SQL in the editor
 * looks identical to SQL in chat code blocks (both use the dark dracula-soft
 * color palette).
 *
 * Streaming mode: when `isStreaming` is true, the editor is read-only and
 * the query text arrives incrementally. CodeMirror's `dispatch` is used to
 * append each delta, so the user sees the query being "typed" by the agent
 * with live syntax highlighting.
 *
 * Props:
 *   query          {string}   current SQL text
 *   error          {string}   error message to show as a toast (falsy = hidden)
 *   isStreaming    {boolean}  true when the agent is actively writing the query
 *   onQueryChange  {fn}       called with new string on every keystroke
 *   onQueryExecute {fn}       fallback run handler (used if onRunQuery absent)
 *   onRunQuery     {fn}       primary run handler (tied to the Run button in StatusBar)
 *   onClearError   {fn}       called to dismiss the error toast
 */

import { StandardSQL, sql } from '@codemirror/lang-sql';
import { Prec } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { Box, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import CodeMirror from '@uiw/react-codemirror';
import { AnimatePresence, motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { memo, useEffect, useMemo, useRef } from 'react';
import Notification from '@/components/ui/toast';
import { getScrollbarStyles } from '@/styles/shared';
import { getCodeMirrorHighlighting, getCodeMirrorTheme } from '@/theme/themeCodeMirror';

function SqlEditorSurface({
  query,
  error,
  isStreaming = false,
  onQueryChange,
  onQueryExecute,
  onRunQuery,
  onClearError,
}) {
  const theme = useTheme();

  // Resolve the run handler from props. CodeMirror efficiently reconfigures
  // extensions when this reference changes, so no ref/effect indirection needed.
  const runQuery = onRunQuery ?? onQueryExecute;

  const codeMirrorTheme = useMemo(() => getCodeMirrorTheme(true), []);

  // Syntax highlighting — now uses Shiki-matched colors instead of empty array.
  const codeMirrorHighlighting = useMemo(() => getCodeMirrorHighlighting(), []);

  const extensions = useMemo(
    () => [
      sql({ dialect: StandardSQL, upperCaseKeywords: true }),
      EditorView.lineWrapping,
      placeholder('Write a SQL query'),
      // Ctrl+Enter / Cmd+Enter → same action as clicking the Run button
      Prec.high(
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              runQuery?.();
              return true;
            },
          },
        ]),
      ),
      codeMirrorHighlighting,
    ],
    [codeMirrorHighlighting, runQuery],
  );

  const scrollbarSx = useMemo(() => getScrollbarStyles(theme), [theme]);

  // ── Streaming: track the last-applied query length ─────────────────────
  // When `isStreaming` is true, the `query` prop grows incrementally as the
  // agent writes. We use a ref to track what we've already inserted into the
  // CodeMirror document, and dispatch only the delta. This avoids replacing
  // the entire document on every token (which would reset the cursor and
  // undo history).
  const lastStreamLengthRef = useRef(0);
  const editorViewRef = useRef(null);

  useEffect(() => {
    if (!isStreaming) {
      // Reset the stream-length tracker when streaming ends so the next
      // streaming session starts fresh.
      lastStreamLengthRef.current = 0;
      return;
    }

    const view = editorViewRef.current;
    if (!view) return;

    // If the query is shorter than what we've already inserted, the stream
    // was reset — replace the whole document.
    if (query.length < lastStreamLengthRef.current) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: query },
      });
      lastStreamLengthRef.current = query.length;
      return;
    }

    // Append only the delta (new characters since last update).
    const delta = query.slice(lastStreamLengthRef.current);
    if (delta) {
      view.dispatch({
        changes: { from: view.state.doc.length, insert: delta },
        scrollIntoView: true,
      });
      lastStreamLengthRef.current = query.length;
    }
  }, [query, isStreaming]);

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        bgcolor: 'background.default',
        borderRadius: '0 0 8px 8px',
      }}
    >
      {/* Editor */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          '& .cm-editor': {
            height: '100%',
            backgroundColor: 'transparent',
          },
          '& .cm-scroller': {
            ...scrollbarSx,
            fontFeatureSettings: '"liga" 0, "calt" 0',
          },
          '& .cm-content': {
            minHeight: '100%',
          },
          '& .cm-gutters': {
            borderRight: '0 !important',
            boxShadow: 'none',
            backgroundColor: theme.palette.layer.barely,
          },
          '& .cm-placeholder': {
            color: theme.palette.text.disabled,
            fontStyle: 'normal',
          },
          '& .cm-activeLine, & .cm-activeLineGutter': {
            backgroundColor: alpha(theme.palette.primary.main, theme.palette.opacity.subtle),
          },
        }}
      >
        <CodeMirror
          value={query}
          height="100%"
          style={{
            height: '100%',
            fontSize: theme.typography.uiCode.fontSizePx,
            fontFamily: theme.typography.fontFamilyMono,
          }}
          extensions={extensions}
          theme={codeMirrorTheme}
          onChange={onQueryChange}
          onCreateEditor={(view) => {
            editorViewRef.current = view;
          }}
          editable={!isStreaming}
          autoFocus={!isStreaming}
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            highlightActiveLine: !isStreaming,
            highlightActiveLineGutter: !isStreaming,
            autocompletion: true,
            bracketMatching: true,
            closeBrackets: true,
            syntaxHighlighting: false, // provided by our getCodeMirrorHighlighting
            tabSize: 2,
            indentOnInput: true,
            history: !isStreaming, // disable undo/redo during streaming
            drawSelection: true,
            rectangularSelection: false,
            crosshairCursor: false,
            highlightSelectionMatches: !isStreaming,
            searchKeymap: !isStreaming,
            historyKeymap: !isStreaming,
            defaultKeymap: true,
          }}
        />
      </Box>

      {/* Streaming indicator — shown when the agent is writing the query */}
      {isStreaming && (
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1.5,
            py: 0.5,
            borderRadius: '8px',
            backgroundColor: alpha(theme.palette.background.paper, 0.85),
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            border: '1px solid',
            borderColor: alpha(theme.palette.text.primary, 0.08),
            zIndex: 5,
            pointerEvents: 'none',
          }}
        >
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: 'primary.main',
              animation: 'pulse 1.4s ease-in-out infinite',
              '@keyframes pulse': {
                '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                '50%': { opacity: 0.4, transform: 'scale(0.8)' },
              },
            }}
          />
          <Typography
            sx={{
              ...theme.typography.uiCaptionSm,
              color: 'text.secondary',
              fontWeight: 400,
            }}
          >
            Agent is writing
          </Typography>
        </Box>
      )}

      {/* Error alert — auto-dismissed via parent after 5 s */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute',
              bottom: 18,
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 10,
              padding: '0 16px',
            }}
          >
            <div style={{ pointerEvents: 'auto', width: '100%', maxWidth: '420px' }}>
              <Notification
                type="error"
                title={
                  error.startsWith('Query blocked:') ? 'Query blocked' : 'Query Execution Error'
                }
                message={
                  error.startsWith('Query blocked:')
                    ? error.replace('Query blocked:', '').trim()
                    : error
                }
                onClose={onClearError}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
}

function areEditorPropsEqual(prev, next) {
  return (
    prev.query === next.query &&
    prev.error === next.error &&
    prev.isStreaming === next.isStreaming &&
    prev.onQueryChange === next.onQueryChange &&
    prev.onQueryExecute === next.onQueryExecute &&
    prev.onRunQuery === next.onRunQuery &&
    prev.onClearError === next.onClearError
  );
}

export default memo(SqlEditorSurface, areEditorPropsEqual);
