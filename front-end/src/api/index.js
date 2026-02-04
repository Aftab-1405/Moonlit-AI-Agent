/**
 * API Layer - Barrel Export
 * 
 * Centralizes all API module exports for clean imports.
 * 
 * @example
 * // Import specific functions
 * import { getConversations, sendMessage } from '@/api';
 * 
 * // Import entire modules
 * import { conversations, database, auth } from '@/api';
 * 
 * @module api
 */

// Client utilities
export { apiClient, get, post, put, del, postRaw, ApiError } from './client';

// Endpoint constants
export { AUTH, CONVERSATIONS, DATABASE, QUERY, USER, QUOTA } from './endpoints';

// Domain modules
export * as auth from './auth';
export * as conversations from './conversations';
export * as database from './database';
export * as query from './query';
export * as user from './user';
export * as quota from './quota';

// Named exports for common use cases
export {
  getFirebaseConfig,
  setSession,
  logout,
} from './auth';

export {
  getConversations,
  getConversation,
  createConversation,
  deleteConversation,
  sendMessage,
} from './conversations';

export {
  getStatus as getDbStatus,
  connect as connectDb,
  disconnect as disconnectDb,
  getDatabases,
  getTables,
  switchDatabase,
  selectDatabase,
  getSchemas,
  selectSchema,
} from './database';

export { runQuery } from './query';

export {
  getContext as getUserContext,
  saveSettings as saveUserSettings,
} from './user';

export { getQuotaStatus } from './quota';

