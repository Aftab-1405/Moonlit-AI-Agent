/**
 * Query API Module
 *
 * Handles SQL query execution.
 *
 * @module api/query
 */

import { post } from '@/api/client';
import { QUERY } from '@/api/endpoints';

/**
 * Execute a SQL query.
 *
 * @param {Object} params - Query parameters
 * @param {string} params.sql - SQL query to execute
 * @param {number|null} [params.maxRows=1000] - Max rows to return (null = server default cap)
 * @param {number} [params.timeout=30] - Query timeout in seconds
 * @param {AbortSignal} [signal] - Optional abort signal for cancellation
 * @returns {Promise<{status: 'success', data: Object, message?: string}>}
 */
export async function runQuery({ sql, maxRows = 1000, timeout = 30 }, signal) {
  let clientMetrics;
  const response = await post(
    QUERY.RUN,
    {
      sql_query: sql,
      max_rows: maxRows === 0 ? null : maxRows,
      timeout,
    },
    {
      signal,
      onMetrics: (metrics) => {
        clientMetrics = metrics;
      },
    },
  );
  if (response?.data)
    return { ...response, data: { ...response.data, client_metrics: clientMetrics } };
  return response;
}
