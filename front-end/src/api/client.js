/**
 * API Client - Base Fetch Wrapper
 * 
 * Provides a consistent interface for all API calls with:
 * - Automatic JSON parsing for responses
 * - Consistent error handling
 * - Request logging in development
 * - Default headers (Content-Type)
 * 
 * @module api/client
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const IS_DEV = import.meta.env.DEV;

import logger from '../utils/logger';

// =============================================================================
// ERROR CLASSES
// =============================================================================

/**
 * Custom API error with response details.
 */
export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// =============================================================================
// BASE CLIENT
// =============================================================================

/**
 * Base fetch wrapper with consistent error handling.
 * 
 * @param {string} endpoint - API endpoint path
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<any>} Parsed JSON response
 * @throws {ApiError} On non-2xx responses
 * 
 * @example
 * const data = await apiClient('/api/users', { method: 'GET' });
 */
export async function apiClient(endpoint, options = {}) {
  const config = {
    ...options,
    credentials: 'include', // Send cookies for session-based auth
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  // Log requests in development
  if (IS_DEV) {
    logger.api(config.method || 'GET', endpoint);
  }

  try {
    const response = await fetch(endpoint, config);

    // Handle non-JSON responses (e.g., streaming)
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('application/json')) {
      if (!response.ok) {
        throw new ApiError(
          `Request failed: ${response.statusText}`,
          response.status
        );
      }
      return response; // Return raw response for streaming
    }

    // Parse JSON response
    const data = await response.json();

    // Check for API-level errors
    if (!response.ok) {
      throw new ApiError(
        data.message || `Request failed: ${response.statusText}`,
        response.status,
        data
      );
    }

    return data;
  } catch (error) {
    // Re-throw ApiError as-is
    if (error instanceof ApiError) {
      throw error;
    }

    // Wrap other errors
    throw new ApiError(
      error.message || 'Network error',
      0,
      null
    );
  }
}

// =============================================================================
// CONVENIENCE METHODS
// =============================================================================

/**
 * GET request wrapper.
 */
export function get(endpoint, options = {}) {
  return apiClient(endpoint, { ...options, method: 'GET' });
}

/**
 * POST request wrapper.
 */
export function post(endpoint, body, options = {}) {
  return apiClient(endpoint, {
    ...options,
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT request wrapper.
 */
export function put(endpoint, body, options = {}) {
  return apiClient(endpoint, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * DELETE request wrapper.
 */
export function del(endpoint, options = {}) {
  return apiClient(endpoint, { ...options, method: 'DELETE' });
}

/**
 * POST request that returns raw Response (for streaming).
 * Does NOT auto-parse JSON.
 */
export async function postRaw(endpoint, body, options = {}) {
  const config = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    ...options,
  };

  if (IS_DEV) {
    logger.api('POST (raw)', endpoint);
  }

  const response = await fetch(endpoint, config);
  
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(
      text || `Request failed: ${response.statusText}`,
      response.status
    );
  }

  return response;
}

export default {
  apiClient,
  get,
  post,
  put,
  del,
  postRaw,
  ApiError,
};
