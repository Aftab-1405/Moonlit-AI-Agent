/**
 * useQueryExecution Hook
 *
 * Manages SQL query execution, results, and confirmation dialogs.
 * Handles integration with database connection state.
 *
 * @module hooks/useQueryExecution
 */

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { runQuery } from '@/api';
import { normalizeQueryResult } from '@/utils/queryResult';

/**
 * Hook for query execution functionality
 * @param {Object} params - Hook parameters
 * @param {boolean} params.isDbConnected - Database connection status
 * @param {Object} params.settings - User settings object
 * @param {Function} params.setDbModalOpen - Function to open database modal
 * @param {Function} params.showSnackbar - Function to show snackbar notifications
 * @param {Function} params.onQueryResults - Function to show successful results
 * @returns {Object} Query execution state and handlers
 */
export function useQueryExecution({
  isDbConnected,
  sourceKey,
  resultContextKey,
  sourceChanging = false,
  settings,
  setDbModalOpen,
  showSnackbar,
  onQueryResults,
}) {
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    details: '',
    onConfirm: null,
    onCancel: null,
  });

  const queryResolverRef = useRef(null);
  const abortControllerRef = useRef(null);
  const sourceGeneration = useRef(0);
  useLayoutEffect(() => {
    sourceGeneration.current += 1;
    return () => {
      sourceGeneration.current += 1;
      queryResolverRef.current?.();
      queryResolverRef.current = null;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [onQueryResults, sourceKey, resultContextKey, sourceChanging, isDbConnected]);
  const executeQuery = useCallback(
    async (sql, maxRows, queryTimeout, generation) => {
      if (generation !== sourceGeneration.current || !isDbConnected || sourceChanging) return;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      try {
        const response = await runQuery({ sql, maxRows, timeout: queryTimeout }, signal);
        if (signal.aborted) return;
        if (response.status === 'success') {
          const queryData = response.data;
          onQueryResults?.(normalizeQueryResult(queryData), sql);
          showSnackbar(`Query returned ${queryData.row_count} rows`, 'success');
        } else {
          // Show the backend's descriptive message when available.
          showSnackbar(response.message || 'Query failed', 'error');
        }
      } catch (error) {
        if (signal.aborted || error.name === 'AbortError') return; // Ignore abort errors
        // Extract the most descriptive safe message available.
        const message =
          error?.data?.message ||
          error?.response?.data?.message ||
          error?.message ||
          'Failed to execute query';
        showSnackbar(message, 'error');
      }
    },
    [onQueryResults, showSnackbar, isDbConnected, sourceChanging],
  );
  const handleRunQuery = useCallback(
    (sql) => {
      if (!isDbConnected) {
        showSnackbar('Please connect to a database first', 'warning');
        setDbModalOpen(true);
        return Promise.resolve();
      }

      if (sourceChanging) {
        showSnackbar('Wait for the database connection to finish changing', 'info');
        return Promise.resolve();
      }
      const generation = sourceGeneration.current;
      const confirmBeforeRun = settings.confirmBeforeRun ?? false;
      const maxRows = settings.maxRows ?? 1000;
      const queryTimeout = settings.queryTimeout ?? 30;

      if (confirmBeforeRun) {
        return new Promise((resolve) => {
          queryResolverRef.current = resolve;
          setConfirmDialog({
            open: true,
            details: sql,
            onConfirm: async () => {
              await executeQuery(sql, maxRows, queryTimeout, generation);
              setConfirmDialog({ open: false, details: '', onConfirm: null, onCancel: null });
              queryResolverRef.current?.();
            },
            onCancel: () => {
              setConfirmDialog({ open: false, details: '', onConfirm: null, onCancel: null });
              queryResolverRef.current?.();
            },
          });
        });
      }

      return executeQuery(sql, maxRows, queryTimeout, generation);
    },
    [isDbConnected, sourceChanging, settings, executeQuery, setDbModalOpen, showSnackbar],
  );
  const handleConfirmDialogClose = useCallback(() => {
    confirmDialog.onCancel?.();
    setConfirmDialog({ open: false, details: '', onConfirm: null, onCancel: null });
  }, [confirmDialog]);

  return {
    confirmDialog,
    handleRunQuery,
    handleConfirmDialogClose,
  };
}
