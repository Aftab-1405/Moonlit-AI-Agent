/**
 * API Layer - Barrel Export
 *
 * Centralizes all API module exports for clean imports.
 *
 * @example
 * import { getConversations, sendMessage } from '@/api';
 *
 * @module api
 */

export {
  getFirebaseConfigAndCsrfToken,
  logoutAuthenticatedUserSession,
  setAuthenticatedUserSession,
} from '@/api/auth';

export { del } from '@/api/client';
export {
  deleteConversation,
  getAllUserConversations,
  getConversation,
  renameConversation,
  resumeAgent,
  sendMessage,
} from '@/api/conversations';
export {
  connect as connectDb,
  disconnect as disconnectDb,
  getDatabases,
  getSchemas,
  getTableSchema,
  getTables,
  selectDatabase,
  selectSchema,
  switchDatabase,
  syncConnectionState,
} from '@/api/database';
export { USER } from '@/api/endpoints';
export { getLlmOptions } from '@/api/llm';

export { runQuery } from '@/api/query';

export {
  getContext as getUserContext,
  getDashboardOverview,
  getDashboardUsage,
  getQuotaStatus,
  getSettings as getUserSettings,
  deleteAccount,
  saveSettings as saveUserSettings,
  sessionActive,
} from '@/api/user';
