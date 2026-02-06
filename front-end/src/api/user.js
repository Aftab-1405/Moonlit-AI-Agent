/**
 * User API Module
 * 
 * Handles user-specific API calls:
 * - User context (database schemas, etc.)
 * - User settings
 * 
 * @module api/user
 */

import { get, post } from './client';
import { USER } from './endpoints';

/**
 * Get user's database context (schemas, tables, columns).
 * 
 * @returns {Promise<{status: string, schemas?: Array}>}
 */
export async function getContext() {
  return get(USER.CONTEXT);
}

/**
 * Save user settings.
 * 
 * @param {Object} settings - Settings object to save
 * @returns {Promise<{status: string}>}
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

export default {
  getContext,
  saveSettings,
  sessionActive,
};

