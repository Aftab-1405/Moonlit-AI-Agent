/**
 * Centralized API endpoint paths.
 * @module api/endpoints
 */

export const AUTH = {
  FIREBASE_CONFIG: '/firebase-config-and-csrf-token',
  SET_SESSION: '/set_authenticated_user_session',
  CHECK_SESSION: '/check_authenticated_user_session',
  LOGOUT: '/logout_authenticated_user_session',
};

export const CONVERSATIONS = {
  LIST: '/api/v1/get_all_user_conversations',
  GET: (id) => `/api/v1/get_conversation/${id}`,
  RENAME: (id) => `/api/v1/rename_conversation/${id}`,
  DELETE: (id) => `/api/v1/delete_conversation/${id}`,
  SEND_MESSAGE: '/api/v1/pass_user_prompt_to_llm',
  RESUME_AGENT: '/api/v1/resume_agent',
  GET_EXECUTION_RESULT: (conversationId, executionId) =>
    `/api/v1/get_execution_result/${conversationId}/${executionId}`,
};

export const LLM = {
  OPTIONS: '/api/v1/llm/options',
};

export const DATABASE = {
  STATUS: '/api/v1/sync_connection_state',
  CONNECT: '/api/v1/connect_db',
  DISCONNECT: '/api/v1/disconnect_db',
  LIST_DATABASES: '/api/v1/get_databases',
  SWITCH_DATABASE: '/api/v1/switch_remote_database',
  SELECT_DATABASE: '/api/v1/select_database',
  GET_SCHEMAS: '/api/v1/get_schemas',
  SELECT_SCHEMA: '/api/v1/select_schema',
  GET_TABLES: '/api/v1/get_tables',
  GET_TABLE_SCHEMA: '/api/v1/get_table_schema',
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
  CONTEXT_METRICS: '/api/v1/context/metrics',
  CONTEXT_METRICS_STREAM: '/api/v1/context/metrics/stream',
  SETTINGS: '/api/v1/user/settings',
  SESSION_CLOSE: '/api/v1/user/session/close',
  SESSION_ACTIVE: '/api/v1/user/session/active',
  DASHBOARD_OVERVIEW: '/api/v1/user/dashboard/overview',
  DASHBOARD_USAGE: '/api/v1/user/dashboard/usage',
  QUOTA_STATUS: '/api/v1/quota/status',
  ACCOUNT: '/api/v1/user/account',
};
