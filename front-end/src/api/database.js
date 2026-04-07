/**
 * Database API Module
 * 
 * Handles database connection management:
 * - Connection status
 * - Connect/disconnect
 * - List databases
 * - Switch database
 * - Schema management
 * 
 * @module api/database
 */

import { get, post } from './client';
import { DATABASE } from './endpoints';

/**
 * Get current database connection status.
 * 
 * @returns {Promise<{status: string, connected: boolean, database?: string, db_type?: string}>}
 */
export async function getStatus() {
  return get(DATABASE.STATUS);
}

/**
 * Connect to a database.
 * 
 * @param {Object} params - Connection parameters
 * @param {string} params.db_type - Database type (mysql, postgresql, etc.)
 * @param {string} [params.host] - Database host
 * @param {string} [params.port] - Database port
 * @param {string} [params.user] - Database user
 * @param {string} [params.password] - Database password
 * @param {string} [params.db_name] - Database name
 * @param {string} [params.connection_string] - Connection string (for remote DBs)
 * @returns {Promise<{status: string, message: string, schemas?: Array}>}
 */
export async function connect(params) {
  return post(DATABASE.CONNECT, params);
}

/**
 * Disconnect from current database.
 * 
 * @returns {Promise<{status: string}>}
 */
export async function disconnect() {
  return post(DATABASE.DISCONNECT);
}

/**
 * List available databases.
 * 
 * @returns {Promise<{status: string, databases: Array, is_remote?: boolean}>}
 */
export async function getDatabases() {
  return get(DATABASE.LIST_DATABASES);
}

/**
 * Switch to a different database (for remote connections).
 * 
 * @param {string} database - Target database name
 * @returns {Promise<{status: string, tables?: Array}>}
 */
export async function switchDatabase(database) {
  return post(DATABASE.SWITCH_DATABASE, { database });
}

/**
 * Select a database on existing local connection.
 * Uses session's db_config, no need to re-send credentials.
 * 
 * @param {string} database - Target database name
 * @returns {Promise<{status: string, db_config?: Object}>}
 */
export async function selectDatabase(database) {
  return post(DATABASE.SELECT_DATABASE, { database });
}

/**
 * Get available schemas.
 * 
 * @returns {Promise<{status: string, schemas: Array}>}
 */
export async function getSchemas() {
  return get(DATABASE.GET_SCHEMAS);
}

/**
 * Select a schema for AI context.
 * 
 * @param {string} schemaId - Schema identifier
 * @returns {Promise<{status: string}>}
 */
export async function selectSchema(schemaId) {
  return post(DATABASE.SELECT_SCHEMA, { schema_id: schemaId });
}
