/**
 * CodeMirror theme + syntax highlighting that matches Moonlit's Shiki theme.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 * The app uses Shiki for all code blocks in chat messages (CodeViewer.jsx)
 * with the local Vercel-style dark palette.
 * The SQL editor uses CodeMirror 6 — which has its own theming system.
 *
 * This file maps Shiki's exact token colors to CodeMirror's highlight tags
 * so the two surfaces are visually identical.
 *
 * ── How it works ──────────────────────────────────────────────────────────
 * 1. `getCodeMirrorTheme(transparent)` returns an Extension[] that:
 *    - Sets the editor background (transparent for inline use)
 *    - Sets gutter, selection, cursor, active-line, whitespace colors
 *    - Maps to the same editor.* colors from the Shiki theme's `colors` object
 *
 * 2. `getCodeMirrorHighlighting()` returns a syntaxHighlighting Extension
 *    that uses HighlightTags → Shiki token colors. This replaces the
 *    @uiw theme packages entirely.
 */

import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { getSyntaxPalette } from '@/theme/syntaxPalettes';
import { primitives } from '@/theme/tokens/primitives';

/**
 * Returns a CodeMirror EditorView theme Extension that matches the Shiki
 * theme's editor chrome (background, gutter, cursor, selection, etc.).
 *
 * @param {boolean} transparent use transparent bg (for inline viewers)
 * @returns {Extension} CodeMirror theme extension
 */
export function getCodeMirrorTheme(transparent = false, themeName = 'moonlit-vercel') {
  const p = getSyntaxPalette(themeName);
  const bg = transparent ? 'transparent' : p.editorBackground;

  return EditorView.theme(
    {
      '&': {
        color: p.editorForeground,
        backgroundColor: bg,
        fontSize: 'var(--font-code-size, 12px)',
        fontFamily: 'var(--font-code-family, "Geist Mono", monospace)',
      },
      '&.cm-focused': {
        // Override CodeMirror's default focus outline; the caret and active line
        // identify the editing position without framing the entire surface.
        outline: 'none',
      },
      '.cm-content': {
        caretColor: 'var(--color-border-focus)',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--color-border-focus)',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: p.selectionBackground,
      },
      '.cm-content ::selection': { color: 'currentColor' },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: p.lineNumberForeground,
        border: 'none',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'transparent',
        color: p.lineNumberActiveForeground,
      },
      '.cm-activeLine': {
        backgroundColor: p.lineHighlightBackground,
      },
      '.cm-whitespace::before, .cm-tab::before': {
        color: p.whitespaceForeground,
      },
      '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
        backgroundColor: p.selectionBackground,
      },
      '.cm-placeholder': {
        color: p.lineNumberForeground,
        fontStyle: 'normal',
      },
      // Search panel (if enabled)
      '.cm-panels': {
        backgroundColor: p.editorBackground,
        color: p.editorForeground,
        borderTop: `1px solid ${primitives.code.panelBorder}`,
      },
      '.cm-searchMatch': {
        backgroundColor: primitives.code.searchMatch,
      },
      '.cm-searchMatch-selected': {
        backgroundColor: primitives.code.searchMatchSelected,
      },
    },
    { dark: themeName !== 'moonlit-light' },
  );
}

/**
 * Returns a syntaxHighlighting Extension whose HighlightStyle maps
 * CodeMirror's Lezer highlight tags to the EXACT Shiki token colors.
 *
 * This is what makes SQL in the editor look identical to SQL in chat
 * code blocks — both use the same color values from the Shiki theme.
 *
 * @returns {Extension} syntaxHighlighting extension
 */
export function getCodeMirrorHighlighting(themeName = 'moonlit-vercel') {
  const p = getSyntaxPalette(themeName);

  return syntaxHighlighting(
    HighlightStyle.define([
      // Comments
      { tag: t.comment, color: p.comment },
      { tag: t.lineComment, color: p.comment },
      { tag: t.blockComment, color: p.comment },

      // Keywords (SQL: SELECT, FROM, WHERE, etc.)
      { tag: t.keyword, color: p.keyword },
      { tag: t.controlKeyword, color: p.keyword },
      { tag: t.operatorKeyword, color: p.keyword },
      { tag: t.modifier, color: p.storage },

      // Storage / type keywords (SQL: TABLE, INDEX, VIEW, etc.)
      { tag: t.typeName, color: p.entity },
      { tag: t.standard(t.typeName), color: p.support },

      // Strings
      { tag: t.string, color: p.string },
      { tag: t.special(t.string), color: p.string },

      // Numbers and constants
      { tag: t.number, color: p.constant },
      { tag: t.bool, color: p.constant },
      { tag: t.null, color: p.constant },
      { tag: t.literal, color: p.constant },
      { tag: t.constant(t.variableName), color: p.constant },

      // Variables
      { tag: t.variableName, color: p.variableOther },
      { tag: t.local(t.variableName), color: p.variableOther },
      { tag: t.special(t.variableName), color: p.variable },
      { tag: t.definition(t.variableName), color: p.variable },

      // Function names
      { tag: t.function(t.variableName), color: p.functionCall },
      { tag: t.function(t.propertyName), color: p.functionCall },

      // Property / column names
      { tag: t.propertyName, color: p.propertyName },

      // Operators and punctuation
      { tag: t.operator, color: p.operator },
      { tag: t.derefOperator, color: p.operator },
      { tag: t.arithmeticOperator, color: p.operator },
      { tag: t.logicOperator, color: p.operator },
      { tag: t.bitwiseOperator, color: p.operator },
      { tag: t.compareOperator, color: p.operator },
      { tag: t.updateOperator, color: p.operator },
      { tag: t.definitionOperator, color: p.operator },
      { tag: t.typeOperator, color: p.operator },
      { tag: t.punctuation, color: p.punctuation },
      { tag: t.separator, color: p.punctuation },

      // Brackets and matching
      { tag: t.bracket, color: p.punctuation },
      { tag: t.brace, color: p.punctuation },
      { tag: t.paren, color: p.punctuation },
      { tag: t.squareBracket, color: p.punctuation },
      { tag: t.angleBracket, color: p.punctuation },

      // Tags and attributes (for HTML/XML — not SQL but kept for completeness)
      { tag: t.tagName, color: p.tagName },
      { tag: t.attributeName, color: p.attributeName },
      { tag: t.attributeValue, color: p.string },

      // Regular expressions and escapes
      { tag: t.regexp, color: p.regex },
      { tag: t.escape, color: p.escape },

      // Invalid / error
      { tag: t.invalid, color: p.invalid },

      // Meta and headings
      { tag: t.meta, color: p.punctuation },
      { tag: t.heading, color: p.entity },
    ]),
  );
}
