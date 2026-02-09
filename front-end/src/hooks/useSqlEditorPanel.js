/**
 * useSqlEditorPanel Hook
 * 
 * Manages SQL Editor panel state including open/close, resize, and content.
 * Handles both desktop panel and mobile fullscreen modes.
 * 
 * @module hooks/useSqlEditorPanel
 */

import { useState, useCallback } from 'react';
const MIN_EDITOR_WIDTH = 320;
const MAX_EDITOR_WIDTH_PERCENT = 0.6;
const DEFAULT_EDITOR_WIDTH = 450;

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
  }, []);
  const handleCloseSqlEditor = useCallback(() => {
    setSqlEditorOpen(false);
  }, []);
  const handlePanelResize = useCallback((deltaX) => {
    setSqlEditorWidth((prev) => {
      const newWidth = prev - deltaX;
      const availableWidth = window.innerWidth - sidebarWidth;
      const maxWidth = availableWidth * MAX_EDITOR_WIDTH_PERCENT;
      return Math.max(MIN_EDITOR_WIDTH, Math.min(maxWidth, newWidth));
    });
  }, [sidebarWidth]);

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

export default useSqlEditorPanel;
