/**
 * useQueryExecution Hook
 * 
 * Manages SQL query execution, results, and confirmation dialogs.
 * Handles integration with database connection state.
 * 
 * @module hooks/useQueryExecution
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { runQuery } from '../api';

/**
 * Hook for query execution functionality
 * @param {Object} params - Hook parameters
 * @param {boolean} params.isDbConnected - Database connection status
 * @param {Object} params.settings - User settings object
 * @param {Function} params.setDbModalOpen - Function to open database modal
 * @param {Function} params.showSnackbar - Function to show snackbar notifications
 * @returns {Object} Query execution state and handlers
 */
export function useQueryExecution({
  isDbConnected,
  settings,
  setDbModalOpen,
  showSnackbar,
}) {
  const [queryResults, setQueryResults] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ 
    open: false, 
    sql: '', 
    onConfirm: null,
    onCancel: null,
  });
  
  const queryResolverRef = useRef(null);
  
  // AbortController ref for cancelling in-flight queries
  const abortControllerRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Close query results
  const handleCloseQueryResults = useCallback(() => setQueryResults(null), []);

  // Execute query against database
  const executeQuery = useCallback(async (sql, maxRows, queryTimeout) => {
    // Cancel any previous query
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const data = await runQuery({ sql, maxRows, timeout: queryTimeout }, signal);
      if (data.status === 'success') {
        const columns = data.result?.fields || [];
        const rows = data.result?.rows || [];

        const transformedResult = rows.map(row => {
          const obj = {};
          columns.forEach((col, idx) => {
            obj[col] = row[idx];
          });
          return obj;
        });

        setQueryResults({
          columns,
          result: transformedResult,
          row_count: data.row_count,
          total_rows: data.total_rows,
          truncated: data.truncated,
          execution_time: data.execution_time_ms ? data.execution_time_ms / 1000 : null,
        });
        showSnackbar(`Query returned ${data.row_count} rows`, 'success');
      } else {
        showSnackbar(data.message || 'Query failed', 'error');
      }
    } catch (error) {
      if (error.name === 'AbortError') return; // Ignore abort errors
      showSnackbar('Failed to execute query', 'error');
    }
  }, [showSnackbar]);

  // Run query with optional confirmation
  const handleRunQuery = useCallback((sql) => {
    if (!isDbConnected) {
      showSnackbar('Please connect to a database first', 'warning');
      setDbModalOpen(true);
      return Promise.resolve();
    }

    const confirmBeforeRun = settings.confirmBeforeRun ?? false;
    const maxRows = settings.maxRows ?? 1000;
    const queryTimeout = settings.queryTimeout ?? 30;

    if (confirmBeforeRun) {
      return new Promise((resolve) => {
        queryResolverRef.current = resolve;
        setConfirmDialog({
          open: true,
          sql: sql,
          onConfirm: async () => {
            await executeQuery(sql, maxRows, queryTimeout);
            setConfirmDialog({ open: false, sql: '', onConfirm: null, onCancel: null });
            queryResolverRef.current?.();
          },
          onCancel: () => {
            setConfirmDialog({ open: false, sql: '', onConfirm: null, onCancel: null });
            queryResolverRef.current?.();
          },
        });
      });
    }

    return executeQuery(sql, maxRows, queryTimeout);
  }, [isDbConnected, settings, executeQuery, setDbModalOpen, showSnackbar]);

  // Handle confirm dialog close
  const handleConfirmDialogClose = useCallback(() => {
    confirmDialog.onCancel?.();
    setConfirmDialog({ open: false, sql: '', onConfirm: null, onCancel: null });
  }, [confirmDialog]);

  return {
    // State
    queryResults,
    confirmDialog,
    
    // Handlers
    handleRunQuery,
    handleCloseQueryResults,
    handleConfirmDialogClose,
  };
}

export default useQueryExecution;

