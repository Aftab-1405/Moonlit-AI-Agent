/**
 * User API Module
 *
 * Handles user-specific API calls:
 * - User context (database schemas, etc.)
 * - User settings
 *
 * @module api/user
 */

import { del, get, post } from '@/api/client';
import { USER } from '@/api/endpoints';

/**
 * Get user's database context (schemas, tables, columns).
 *
 * @returns {Promise<{status: string, schemas?: Array}>}
 */
export async function getContext() {
  return get(USER.CONTEXT);
}

/**
 * Load per-user settings (Firestore-backed, synced across browsers).
 *
 * @returns {Promise<{ status: string, settings: Object, connectionPersistenceMinutes?: number }>}
 */
export async function getSettings() {
  return get(USER.SETTINGS);
}

/**
 * Save per-user settings (partial update).
 *
 * @param {Object} settings - Syncable preference fields
 * @returns {Promise<{ status: string, settings?: Object }>}
 */
export async function saveSettings(settings) {
  return post(USER.SETTINGS, settings);
}

/**
 * Mark session as active (heartbeat).
 *
 * @returns {Promise<{status: string}>}
 */
export async function sessionActive(sessionInstanceId) {
  return post(USER.SESSION_ACTIVE, {
    sessionInstanceId,
  });
}

/**
 * Get context cache metrics for admin dashboard.
 * @returns {Promise<{status: string, metrics: Object}>}
 */
export async function getContextMetrics() {
  return get(USER.CONTEXT_METRICS);
}

export async function getDashboardOverview() {
  return get(USER.DASHBOARD_OVERVIEW);
}

export async function getDashboardUsage(days = 30) {
  return get(`${USER.DASHBOARD_USAGE}?days=${encodeURIComponent(days)}`);
}

export async function getQuotaStatus() {
  return get(USER.QUOTA_STATUS);
}

export async function deleteAccount() {
  return del(USER.ACCOUNT);
}
