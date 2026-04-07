/**
 * Query API Module
 * 
 * Handles SQL query execution.
 * 
 * @module api/query
 */

import { post } from './client';
import { QUERY } from './endpoints';

/**
 * Execute a SQL query.
 * 
 * @param {Object} params - Query parameters
 * @param {string} params.sql - SQL query to execute
 * @param {number|null} [params.maxRows=1000] - Max rows to return (null = no limit)
 * @param {number} [params.timeout=30] - Query timeout in seconds
 * @param {AbortSignal} [signal] - Optional abort signal for cancellation
 * @returns {Promise<{status: string, result: Object, row_count: number, execution_time_ms: number}>}
 */
export async function runQuery({ sql, maxRows = 1000, timeout = 30 }, signal) {
  return post(QUERY.RUN, {
    sql_query: sql,
    max_rows: maxRows === 0 ? null : maxRows,
    timeout,
  }, { signal });
}
