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

import { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import logger from '../utils/logger';
import {
  getDbStatus,
  disconnectDb,
  switchDatabase as switchDatabaseApi,
  selectDatabase,
  sessionActive,
} from '../api';

const SESSION_INSTANCE_KEY = 'moonlit-session-instance-id';

function getSessionInstanceId() {
  try {
    let id = sessionStorage.getItem(SESSION_INSTANCE_KEY);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `sid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_INSTANCE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

const initialState = {
  isConnected: false,
  isLoading: false,
  error: null,
  currentDatabase: null,
  dbType: null,
  isRemote: false,
  availableDatabases: [],
  lastConnectedAt: null,
};

const ActionTypes = {
  CONNECT_START: 'CONNECT_START',
  CONNECT_SUCCESS: 'CONNECT_SUCCESS',
  CONNECT_FAILURE: 'CONNECT_FAILURE',
  DISCONNECT: 'DISCONNECT',
  SWITCH_DATABASE: 'SWITCH_DATABASE',
  SET_AVAILABLE_DATABASES: 'SET_AVAILABLE_DATABASES',
  SYNC_STATUS: 'SYNC_STATUS',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
};

function databaseReducer(state, action) {
  switch (action.type) {
    case ActionTypes.CONNECT_START:
      return {
        ...state,
        isLoading: true,
        error: null,
      };

    case ActionTypes.CONNECT_SUCCESS:
      return {
        ...state,
        isConnected: true,
        isLoading: false,
        error: null,
        currentDatabase: action.payload.database,
        dbType: action.payload.dbType,
        isRemote: action.payload.isRemote ?? false,
        availableDatabases: action.payload.databases ?? [],
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
        error: action.payload?.error ?? null,
      };

    case ActionTypes.SWITCH_DATABASE:
      return {
        ...state,
        currentDatabase: action.payload.database,
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
        isConnected: action.payload.connected ?? false,
        currentDatabase: action.payload.current_database ?? action.payload.database ?? null,
        dbType: action.payload.db_type ?? null,
        isRemote: action.payload.is_remote ?? false,
        availableDatabases: action.payload.databases ?? [],
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

  useEffect(() => {
    const checkDbStatus = async () => {
      try {
        const sessionInstanceId = getSessionInstanceId();
        if (sessionInstanceId) {
          await sessionActive(sessionInstanceId);
        }
        const data = await getDbStatus();
        dispatch({ type: ActionTypes.SYNC_STATUS, payload: data });
      } catch (error) {
        logger.error('Failed to check DB status:', error);
      }
    };

    checkDbStatus();
  }, []);

  const connect = useCallback((connectionData) => {
    dispatch({
      type: ActionTypes.CONNECT_SUCCESS,
      payload: {
        database: connectionData.selectedDatabase || connectionData.database,
        dbType: connectionData.db_type || connectionData.dbType,
        isRemote: connectionData.is_remote ?? false,
        databases: connectionData.schemas || connectionData.databases || [],
      },
    });
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await disconnectDb();
      dispatch({ type: ActionTypes.DISCONNECT, payload: {} });
    } catch (error) {
      logger.error('Disconnect failed:', error);
      dispatch({
        type: ActionTypes.DISCONNECT,
        payload: { error: 'Failed to disconnect' }
      });
    }
  }, []);

  const resetConnectionState = useCallback(() => {
    dispatch({ type: ActionTypes.DISCONNECT, payload: {} });
  }, []);

  const switchDatabase = useCallback(async (dbName) => {
    if (dbName === state.currentDatabase) return { success: true };

    try {
      const data = state.isRemote
        ? await switchDatabaseApi(dbName)
        : await selectDatabase(dbName);

      if (data.status === 'connected' || data.status === 'success') {
        dispatch({
          type: ActionTypes.SWITCH_DATABASE,
          payload: { database: dbName }
        });
        return { success: true };
      } else {
        dispatch({
          type: ActionTypes.SET_ERROR,
          payload: { error: data.message || 'Switch failed' }
        });
        return { success: false, error: data.message };
      }
    } catch {
      dispatch({
        type: ActionTypes.SET_ERROR,
        payload: { error: 'Failed to switch database' }
      });
      return { success: false, error: 'Failed to switch database' };
    }
  }, [state.currentDatabase, state.isRemote]);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await getDbStatus();
      dispatch({ type: ActionTypes.SYNC_STATUS, payload: data });
    } catch (error) {
      logger.error('Failed to refresh DB status:', error);
    }
  }, []);

  const setError = useCallback((error) => {
    dispatch({ type: ActionTypes.SET_ERROR, payload: { error } });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: ActionTypes.CLEAR_ERROR });
  }, []);

  const value = {
    ...state,
    connect,
    disconnect,
    resetConnectionState,
    switchDatabase,
    refreshStatus,
    setError,
    clearError,
  };

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
}

export default DatabaseContext;
