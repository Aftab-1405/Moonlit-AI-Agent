/**
 * useSqlEditorPanel Hook
 *
 * Manages SQL Editor panel state including open/close, resize, and content.
 * Handles both desktop panel and mobile fullscreen modes.
 *
 * Width rules (desktop): the panel lives in the area to the right of the sidebar
 * (`workspace = window.innerWidth - sidebarWidth`). The editor is clamped to at least
 * 50% of that workspace so the tab bar stays usable; max is ~88% so the chat column
 * still has room.
 *
 * @module hooks/useSqlEditorPanel
 */

import { useState, useCallback, useEffect } from 'react';

const MIN_EDITOR_WIDTH_FLOOR = 320;
/** Minimum share of workspace width (sidebar already subtracted) */
const MIN_EDITOR_WIDTH_RATIO = 0.5;
const MAX_EDITOR_WIDTH_RATIO = 0.88;
const DEFAULT_EDITOR_WIDTH = 450;

function getWorkspaceWidth(sidebarWidth) {
  if (typeof window === 'undefined') return 1200;
  return Math.max(0, window.innerWidth - sidebarWidth);
}

function getSqlEditorWidthBounds(sidebarWidth) {
  const workspace = getWorkspaceWidth(sidebarWidth);
  const minFromRatio = Math.floor(workspace * MIN_EDITOR_WIDTH_RATIO);
  const minWidth = Math.min(
    Math.max(0, workspace - 8),
    Math.max(MIN_EDITOR_WIDTH_FLOOR, minFromRatio),
  );
  let maxWidth = Math.floor(workspace * MAX_EDITOR_WIDTH_RATIO);
  maxWidth = Math.max(minWidth + 1, Math.min(maxWidth, workspace - 4));
  if (maxWidth <= minWidth) {
    maxWidth = Math.min(workspace - 4, minWidth + 120);
  }
  return { minWidth, maxWidth, workspace };
}

function clampSqlEditorWidth(width, sidebarWidth) {
  const { minWidth, maxWidth } = getSqlEditorWidthBounds(sidebarWidth);
  return Math.min(maxWidth, Math.max(minWidth, Math.round(width)));
}

/**
 * Hook for SQL Editor panel management
 * @param {Object} params - Hook parameters
 * @param {number} params.sidebarWidth - Current sidebar width for resize calculations
 * @returns {Object} SQL Editor state and handlers
 */
export function useSqlEditorPanel({ sidebarWidth = 260 } = {}) {
  const [sqlEditorOpen, setSqlEditorOpen] = useState(false);
  const [sqlEditorQuery, setSqlEditorQuery] = useState('');
  const [sqlEditorResults, setSqlEditorResults] = useState(null);
  const [sqlEditorWidth, setSqlEditorWidth] = useState(DEFAULT_EDITOR_WIDTH);

  const handleOpenSqlEditor = useCallback((query = '', results = null) => {
    setSqlEditorQuery(query);
    setSqlEditorResults(results);
    setSqlEditorOpen(true);
    setSqlEditorWidth((prev) => {
      const { minWidth, maxWidth } = getSqlEditorWidthBounds(sidebarWidth);
      const preferred = Math.max(DEFAULT_EDITOR_WIDTH, prev);
      return Math.min(maxWidth, Math.max(minWidth, preferred));
    });
  }, [sidebarWidth]);

  const handleCloseSqlEditor = useCallback(() => {
    setSqlEditorOpen(false);
  }, []);

  const handlePanelResize = useCallback((deltaX) => {
    setSqlEditorWidth((prev) => {
      const next = prev - deltaX;
      return clampSqlEditorWidth(next, sidebarWidth);
    });
  }, [sidebarWidth]);

  useEffect(() => {
    if (!sqlEditorOpen) return undefined;
    const sync = () => {
      setSqlEditorWidth((prev) => clampSqlEditorWidth(prev, sidebarWidth));
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [sqlEditorOpen, sidebarWidth]);

  return {
    sqlEditorOpen,
    sqlEditorQuery,
    sqlEditorResults,
    sqlEditorWidth,
    handleOpenSqlEditor,
    handleCloseSqlEditor,
    handlePanelResize,
  };
}
