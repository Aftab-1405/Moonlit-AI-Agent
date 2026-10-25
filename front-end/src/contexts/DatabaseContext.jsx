/**
 * DatabaseContext - Centralized State Management for Database Connections
 *
 * This context eliminates prop drilling for database-related state.
 * Instead of passing 10+ props through component hierarchy, components
 * can use the `useDatabaseConnection` hook to access and modify DB state.
 *
 * STATE MANAGED:
 * - isConnected: Whether a database connection is active
 * - currentDatabase: Name of the currently selected database
 * - dbType: Type of database (mysql, postgresql, sqlserver, oracle)
 * - isRemote: Whether connection is via connection string (remote)
 * - availableDatabases: List of databases available on the server
 * - isLoading: Whether a connection operation is in progress
 * - error: Any connection error message
 *
 * ACTIONS:
 * - connect: Establish database connection
 * - disconnect: Close database connection
 * - switchDatabase: Change to a different database on same server
 * - setError: Set connection error
 * - clearError: Clear connection error
 *
 * WHY useReducer INSTEAD OF useState:
 * - All related state updates happen atomically (1 dispatch = 1 render)
 * - Actions are logged for debugging
 * - State transitions are predictable and testable
 * - Easier to add new state without prop drilling
 *
 * @module DatabaseContext
 */

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import {
  disconnectDb,
  getSchemas as getSchemasApi,
  getTableSchema as getTableSchemaApi,
  getTables,
  selectDatabase,
  selectSchema as selectSchemaApi,
  sessionActive,
  switchDatabase as switchDatabaseApi,
  syncConnectionState,
} from '@/api';
import { queryKeys } from '@/api/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { getSelectedDatabase } from '@/utils/databaseResponse';
import logger from '@/utils/logger';

const SESSION_INSTANCE_KEY = 'moonlit-session-instance-id';

function getSessionInstanceId() {
  try {
    let id = sessionStorage.getItem(SESSION_INSTANCE_KEY);
    if (!id) {
      id = crypto.randomUUID
        ? crypto.randomUUID()
        : `sid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_INSTANCE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

const initialState = {
  databaseStatus: 'loading',
  isConnected: false,
  isLoading: false,
  error: null,
  currentDatabase: null,
  dbType: null,
  isRemote: false,
  availableDatabases: [],
  availableSchemas: [],
  currentSchema: null,
  lastConnectedAt: null,
};

const ActionTypes = {
  CONNECT_START: 'CONNECT_START',
  CONNECT_SUCCESS: 'CONNECT_SUCCESS',
  CONNECT_FAILURE: 'CONNECT_FAILURE',
  DISCONNECT: 'DISCONNECT',
  SWITCH_DATABASE: 'SWITCH_DATABASE',
  SELECT_SCHEMA: 'SELECT_SCHEMA',
  SET_AVAILABLE_DATABASES: 'SET_AVAILABLE_DATABASES',
  SYNC_STATUS: 'SYNC_STATUS',
  STATUS_LOADING: 'STATUS_LOADING',
  RESET_STATUS: 'RESET_STATUS',
  STATUS_FAILURE: 'STATUS_FAILURE',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
};

function databaseReducer(state, action) {
  switch (action.type) {
    case ActionTypes.RESET_STATUS:
      return { ...initialState };
    case ActionTypes.STATUS_LOADING:
      return { ...state, databaseStatus: state.databaseStatus === 'ready' ? 'ready' : 'loading' };
    case ActionTypes.STATUS_FAILURE:
      return { ...state, databaseStatus: state.databaseStatus === 'ready' ? 'ready' : 'error' };

    case ActionTypes.CONNECT_START:
      return {
        ...state,
        isLoading: true,
        error: null,
      };

    case ActionTypes.CONNECT_SUCCESS:
      return {
        ...state,
        databaseStatus: 'ready',
        isConnected: true,
        isLoading: false,
        error: null,
        currentDatabase: action.payload.database,
        dbType: action.payload.dbType,
        isRemote: action.payload.isRemote ?? false,
        availableDatabases: action.payload.databases ?? [],
        availableSchemas: action.payload.schemas ?? [],
        currentSchema: action.payload.currentSchema ?? null,
        lastConnectedAt: new Date().toISOString(),
      };

    case ActionTypes.CONNECT_FAILURE:
      return {
        ...state,
        isConnected: false,
        isLoading: false,
        error: action.payload.error,
      };

    case ActionTypes.DISCONNECT:
      return {
        ...initialState,
        databaseStatus: 'ready',
        error: action.payload?.error ?? null,
      };

    case ActionTypes.SWITCH_DATABASE:
      return {
        ...state,
        currentDatabase: action.payload.database,
        availableSchemas: action.payload.schemas ?? [],
        currentSchema: action.payload.currentSchema ?? null,
        error: null,
      };

    case ActionTypes.SELECT_SCHEMA:
      return {
        ...state,
        availableSchemas: action.payload.schemas ?? state.availableSchemas,
        currentSchema: action.payload.currentSchema,
        error: null,
      };

    case ActionTypes.SET_AVAILABLE_DATABASES:
      return {
        ...state,
        availableDatabases: action.payload.databases,
      };

    case ActionTypes.SYNC_STATUS:
      return {
        ...state,
        databaseStatus: 'ready',
        isConnected: action.payload.connected ?? false,
        currentDatabase: action.payload.current_database ?? action.payload.database ?? null,
        dbType: action.payload.db_type ?? null,
        isRemote: action.payload.is_remote ?? false,
        availableDatabases: action.payload.databases ?? [],
        availableSchemas: action.payload.schemas ?? [],
        currentSchema: action.payload.current_schema ?? null,
      };

    case ActionTypes.SET_ERROR:
      return {
        ...state,
        error: action.payload.error,
        isLoading: false,
      };

    case ActionTypes.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };

    default:
      logger.warn(`[DatabaseReducer] Unknown action type: ${action.type}`);
      return state;
  }
}

const DatabaseContext = createContext(null);

/**
 * Extract the list of available databases from a backend response.
 *
 * IMPORTANT: This must NOT fall back to `connectionData.schemas`. The
 * PostgreSQL connect handler historically returned the database list under
 * the `schemas` key (a backend bug), and the frontend's fallback masked it
 * by displaying PostgreSQL schemas (e.g. `public`, `information_schema`)
 * as if they were databases. After a page refresh, the `syncConnectionState`
 * endpoint returns the correct `databases` field — which is why the bug
 * only appeared immediately after connecting.
 *
 * Database engines and their hierarchy:
 *   - PostgreSQL / SQL Server:  Database → Schema → Tables  (schemas are
 *       a separate concept from databases)
 *   - MySQL / MariaDB:          Database (== Schema) → Tables  (the two
 *       terms are synonyms; the backend returns them under `databases`)
 *   - Oracle:                   Schema == User → Tables  (schemas are tied
 *       to user accounts; we don't expose a separate schema switcher)
 *
 * For PostgreSQL and SQL Server, schemas are surfaced separately via
 * `getSchemaList` and rendered in their own UI affordance — never mixed
 * into the database list.
 */
function getDatabaseList(connectionData = {}) {
  if (connectionData.databases?.length) return connectionData.databases;

  // No databases list provided — fall back to the single connected database
  // (e.g. for remote/connection-string scenarios where the server doesn't
  // expose a database list). Never fall back to `schemas`.
  const selectedDatabase = getSelectedDatabase(connectionData);
  return selectedDatabase ? [selectedDatabase] : [];
}

/**
 * Extract the list of schemas for the current database.
 *
 * Only PostgreSQL and SQL Server have schemas as a distinct concept. For
 * MySQL/MariaDB, "schema" is a synonym for "database" — so we deliberately
 * return an empty list to avoid showing databases twice (once in the
 * database switcher, once in a schema switcher). For Oracle, schemas are
 * tied to user accounts and not exposed as a switchable concept here.
 */
function getSchemaList(connectionData = {}) {
  const dbType = connectionData.db_type?.toLowerCase();
  if (dbType !== 'postgresql' && dbType !== 'sqlserver') return [];
  return connectionData.schemas ?? [];
}

function getCurrentSchema(connectionData = {}) {
  const dbType = connectionData.db_type?.toLowerCase();
  if (dbType !== 'postgresql' && dbType !== 'sqlserver') return null;
  return connectionData.current_schema || connectionData.db_config?.schema || null;
}

/**
 * Hook to access database connection state and actions.
 * Must be used within a DatabaseProvider.
 *
 * @example
 * const { isConnected, currentDatabase, connect, disconnect } = useDatabaseConnection();
 *
 * @returns {Object} Database state and actions
 */
// eslint-disable-next-line react-refresh/only-export-components -- Hook export alongside Provider is valid React pattern
export function useDatabaseConnection() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabaseConnection must be used within a DatabaseProvider');
  }
  return context;
}

/**
 * Provides database connection state to the component tree.
 * Wrap your app with this provider to enable useDatabaseConnection hook.
 *
 * @example
 * <DatabaseProvider>
 *   <App />
 * </DatabaseProvider>
 */
export function DatabaseProvider({ children }) {
  const [state, dispatch] = useReducer(databaseReducer, initialState);
  const { isAuthenticated, user } = useAuth();
  const accountId = user?.uid;
  const queryClient = useQueryClient();

  const invalidateSchemaTables = useCallback(
    (database) => {
      if (database) {
        queryClient.removeQueries({ queryKey: queryKeys.dbSchemas(database) });
        queryClient.removeQueries({ queryKey: queryKeys.dbTables(database) });
        queryClient.removeQueries({ queryKey: ['db', 'tableSchema', database] });
        return;
      }

      queryClient.removeQueries({ queryKey: ['db'] });
    },
    [queryClient],
  );

  const fetchSchemas = useCallback(
    async ({ database, force = false } = {}) => {
      const queryKey = queryKeys.dbSchemas(database);
      if (force) {
        await queryClient.invalidateQueries({ queryKey });
      }

      return queryClient.fetchQuery({
        queryKey,
        queryFn: getSchemasApi,
        staleTime: 5 * 60 * 1000,
      });
    },
    [queryClient],
  );

  const fetchSchemaTables = useCallback(
    async ({ database, force = false } = {}) => {
      const queryKey = queryKeys.dbTables(database);
      if (force) {
        await queryClient.invalidateQueries({ queryKey });
      }

      return queryClient.fetchQuery({
        queryKey,
        queryFn: getTables,
        staleTime: 5 * 60 * 1000,
      });
    },
    [queryClient],
  );

  const fetchTableSchema = useCallback(
    async ({ database, tableName, force = false } = {}) => {
      if (!tableName) {
        return {
          status: 'error',
          message: 'Table name is required',
        };
      }

      const queryKey = queryKeys.dbTableSchema(database, tableName);
      if (force) {
        await queryClient.invalidateQueries({ queryKey });
      }

      return queryClient.fetchQuery({
        queryKey,
        queryFn: () => getTableSchemaApi(tableName),
        staleTime: 5 * 60 * 1000,
      });
    },
    [queryClient],
  );

  useEffect(() => {
    dispatch({ type: ActionTypes.RESET_STATUS });
    if (!isAuthenticated) return;
    const cached = queryClient.getQueryData(queryKeys.dbStatus);
    if (cached?.data) dispatch({ type: ActionTypes.SYNC_STATUS, payload: cached.data });
    let cancelled = false;
    dispatch({ type: ActionTypes.STATUS_LOADING });

    const checkDbStatus = async () => {
      try {
        const sessionInstanceId = getSessionInstanceId();
        if (sessionInstanceId) {
          sessionActive(sessionInstanceId).catch((err) => {
            logger.warn('Failed to report active session:', err);
          });
        }
        const response = await queryClient.fetchQuery({
          queryKey: queryKeys.dbStatus,
          queryFn: syncConnectionState,
          staleTime: 30 * 1000,
        });
        if (!cancelled) dispatch({ type: ActionTypes.SYNC_STATUS, payload: response.data });
      } catch (error) {
        if (!cancelled) dispatch({ type: ActionTypes.STATUS_FAILURE });
        logger.error('Failed to check DB status:', error);
      }
    };

    checkDbStatus();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, accountId, queryClient]);

  const connect = useCallback(
    (connectionData) => {
      // Use centralized helper so all backend response shapes are supported.
      const database = getSelectedDatabase(connectionData);
      invalidateSchemaTables(database);
      queryClient.setQueryData(queryKeys.dbStatus, {
        status: 'success',
        data: {
          connected: true,
          db_type: connectionData.db_type,
          current_database: database,
          is_remote: connectionData.is_remote ?? false,
          databases: getDatabaseList(connectionData),
          schemas: getSchemaList(connectionData),
          current_schema: getCurrentSchema(connectionData),
        },
      });
      queryClient.setQueryData(queryKeys.dbDatabases, {
        status: 'success',
        data: {
          databases: getDatabaseList(connectionData),
          db_type: connectionData.db_type,
          is_remote: connectionData.is_remote ?? false,
        },
      });
      dispatch({
        type: ActionTypes.CONNECT_SUCCESS,
        payload: {
          database,
          dbType: connectionData.db_type,
          isRemote: connectionData.is_remote ?? false,
          databases: getDatabaseList(connectionData),
          schemas: getSchemaList(connectionData),
          currentSchema: getCurrentSchema(connectionData),
        },
      });
    },
    [invalidateSchemaTables, queryClient],
  );

  const disconnect = useCallback(async () => {
    try {
      await disconnectDb();
      invalidateSchemaTables();
      queryClient.removeQueries({ queryKey: ['db'] });
      dispatch({ type: ActionTypes.DISCONNECT, payload: {} });
    } catch (error) {
      logger.error('Disconnect failed:', error);
      invalidateSchemaTables();
      queryClient.removeQueries({ queryKey: ['db'] });
      dispatch({
        type: ActionTypes.DISCONNECT,
        payload: { error: 'Failed to disconnect' },
      });
    }
  }, [invalidateSchemaTables, queryClient]);

  const resetConnectionState = useCallback(() => {
    invalidateSchemaTables();
    queryClient.removeQueries({ queryKey: ['db'] });
    dispatch({ type: ActionTypes.DISCONNECT, payload: {} });
  }, [invalidateSchemaTables, queryClient]);

  const switchDatabase = useCallback(
    async (dbName) => {
      if (dbName === state.currentDatabase) return { success: true };

      try {
        const response = state.isRemote
          ? await switchDatabaseApi(dbName)
          : await selectDatabase(dbName);

        if (response.status === 'success') {
          // Use centralized helper to resolve DB name from switch response.
          const resolvedDb = getSelectedDatabase(response.data) || dbName;
          invalidateSchemaTables(resolvedDb);
          queryClient.invalidateQueries({ queryKey: queryKeys.dbStatus });
          queryClient.invalidateQueries({ queryKey: queryKeys.dbDatabases });
          dispatch({
            type: ActionTypes.SWITCH_DATABASE,
            payload: {
              database: resolvedDb,
              schemas: getSchemaList(response.data),
              currentSchema: getCurrentSchema(response.data),
            },
          });
          return { success: true };
        } else {
          dispatch({
            type: ActionTypes.SET_ERROR,
            payload: { error: response.message || 'Switch failed' },
          });
          return { success: false, error: response.message };
        }
      } catch {
        dispatch({
          type: ActionTypes.SET_ERROR,
          payload: { error: 'Failed to switch database' },
        });
        return { success: false, error: 'Failed to switch database' };
      }
    },
    [invalidateSchemaTables, queryClient, state.currentDatabase, state.isRemote],
  );

  const selectSchema = useCallback(
    async (schemaName) => {
      if (schemaName === state.currentSchema) return { success: true };

      try {
        const response = await selectSchemaApi(schemaName);

        if (response.status === 'success') {
          invalidateSchemaTables(state.currentDatabase);
          queryClient.invalidateQueries({ queryKey: queryKeys.dbStatus });
          dispatch({
            type: ActionTypes.SELECT_SCHEMA,
            payload: {
              schemas: response.data.schemas?.length
                ? response.data.schemas
                : state.availableSchemas,
              currentSchema: response.data.current_schema || response.data.schema || schemaName,
            },
          });
          return { success: true };
        }

        dispatch({
          type: ActionTypes.SET_ERROR,
          payload: { error: response.message || 'Schema switch failed' },
        });
        return { success: false, error: response.message };
      } catch {
        dispatch({
          type: ActionTypes.SET_ERROR,
          payload: { error: 'Failed to switch schema' },
        });
        return { success: false, error: 'Failed to switch schema' };
      }
    },
    [
      invalidateSchemaTables,
      queryClient,
      state.availableSchemas,
      state.currentDatabase,
      state.currentSchema,
    ],
  );

  const refreshStatus = useCallback(async () => {
    dispatch({ type: ActionTypes.STATUS_LOADING });
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.dbStatus });
      const response = await queryClient.fetchQuery({
        queryKey: queryKeys.dbStatus,
        queryFn: syncConnectionState,
        staleTime: 30 * 1000,
      });
      queryClient.setQueryData(queryKeys.dbStatus, response);
      dispatch({ type: ActionTypes.SYNC_STATUS, payload: response.data });
    } catch (error) {
      dispatch({ type: ActionTypes.STATUS_FAILURE });
      logger.error('Failed to refresh DB status:', error);
    }
  }, [queryClient]);

  const setError = useCallback((error) => {
    dispatch({ type: ActionTypes.SET_ERROR, payload: { error } });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: ActionTypes.CLEAR_ERROR });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      connect,
      disconnect,
      resetConnectionState,
      switchDatabase,
      selectSchema,
      refreshStatus,
      setError,
      clearError,
      fetchSchemas,
      fetchSchemaTables,
      fetchTableSchema,
      invalidateSchemaTables,
    }),
    [
      state,
      connect,
      disconnect,
      resetConnectionState,
      switchDatabase,
      selectSchema,
      refreshStatus,
      setError,
      clearError,
      fetchSchemas,
      fetchSchemaTables,
      fetchTableSchema,
      invalidateSchemaTables,
    ],
  );

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
}
