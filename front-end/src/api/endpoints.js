/**
 * Centralized API endpoint paths.
 * @module api/endpoints
 */

export const AUTH = {
  FIREBASE_CONFIG: '/firebase-config',
  SET_SESSION: '/set_session',
  CHECK_SESSION: '/check_session',
  LOGOUT: '/logout',
};

export const CONVERSATIONS = {
  LIST: '/api/v1/get_conversations',
  GET: (id) => `/api/v1/get_conversation/${id}`,
  CREATE: '/api/v1/new_conversation',
  DELETE: (id) => `/api/v1/delete_conversation/${id}`,
  SEND_MESSAGE: '/api/v1/pass_user_prompt_to_llm',
};

export const DATABASE = {
  STATUS: '/api/v1/db_status',
  CONNECT: '/api/v1/connect_db',
  DISCONNECT: '/api/v1/disconnect_db',
  LIST_DATABASES: '/api/v1/get_databases',
  LIST_TABLES: '/api/v1/get_tables',
  SWITCH_DATABASE: '/api/v1/switch_remote_database',
  SELECT_DATABASE: '/api/v1/select_database',
  GET_SCHEMAS: '/api/v1/get_schemas',
  SELECT_SCHEMA: '/api/v1/select_schema',
};

export const QUERY = {
  RUN: '/api/v1/run_sql_query',
};

export const USER = {
  CONTEXT: '/api/v1/user/context',
  CONTEXT_REFRESH: '/api/v1/user/context/refresh',
  CONTEXT_DELETE_SCHEMA: (name) => `/api/v1/user/context/schema/${encodeURIComponent(name)}`,
  CONTEXT_DELETE_ALL_SCHEMAS: '/api/v1/user/context/schemas',
  CONTEXT_DELETE_QUERIES: '/api/v1/user/context/queries',
  SETTINGS: '/api/v1/user/settings',
  SESSION_CLOSE: '/api/v1/user/session/close',
  SESSION_ACTIVE: '/api/v1/user/session/active',
};

export const QUOTA = {
  STATUS: '/api/v1/quota/status',
};
export default {
  AUTH,
  CONVERSATIONS,
  DATABASE,
  QUERY,
  USER,
  QUOTA,
};
