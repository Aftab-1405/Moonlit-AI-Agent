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
export { USER } from './endpoints';

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

export { getLlmOptions } from './llm';

export {
  getStatus as getDbStatus,
  connect as connectDb,
  disconnect as disconnectDb,
  getDatabases,
  switchDatabase,
  selectDatabase,
  getSchemas,
  selectSchema,
} from './database';

export { runQuery } from './query';

export {
  getContext as getUserContext,
  saveSettings as saveUserSettings,
  sessionActive,
} from './user';

