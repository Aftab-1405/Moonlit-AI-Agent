/**
 * Logger Utility
 * 
 * Provides conditional logging that only outputs in development mode.
 * Replaces direct console.* calls throughout the codebase to prevent
 * console pollution in production.
 * 
 * @module utils/logger
 */

const IS_DEV = import.meta.env.DEV;

/**
 * Development-only logger.
 * All methods are no-ops in production.
 */
const logger = {
  /**
   * Log debug information (only in development)
   */
  debug: (...args) => {
    if (IS_DEV) {
      console.debug('[DEBUG]', ...args);
    }
  },

  /**
   * Log general information (only in development)
   */
  log: (...args) => {
    if (IS_DEV) {
      console.log(...args);
    }
  },

  /**
   * Log informational messages (only in development)
   */
  info: (...args) => {
    if (IS_DEV) {
      console.info('[INFO]', ...args);
    }
  },

  /**
   * Log warnings (only in development)
   */
  warn: (...args) => {
    if (IS_DEV) {
      console.warn('[WARN]', ...args);
    }
  },

  /**
   * Log errors (only in development)
   * For production error tracking, integrate with a service like Sentry
   */
  error: (...args) => {
    if (IS_DEV) {
      console.error('[ERROR]', ...args);
    }
    // TODO: In production, send to error tracking service
    // if (!IS_DEV) { sendToErrorService(args); }
  },

  /**
   * Log API-related messages (only in development)
   */
  api: (method, endpoint) => {
    if (IS_DEV) {
      console.debug(`[API] ${method} ${endpoint}`);
    }
  },

  /**
   * Log with a custom prefix (only in development)
   */
  tagged: (tag, ...args) => {
    if (IS_DEV) {
      console.log(`[${tag}]`, ...args);
    }
  },
};

export default logger;
