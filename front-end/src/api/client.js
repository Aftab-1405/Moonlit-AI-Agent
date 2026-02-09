/**
 * Shared fetch wrapper for API requests.
 * @module api/client
 */

const IS_DEV = import.meta.env.DEV;

import logger from '../utils/logger';

/** API error with HTTP status and optional response payload. */
export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Base fetch wrapper with consistent error handling.
 * 
 * @param {string} endpoint - API endpoint path
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<any>} Parsed JSON response
 * @throws {ApiError} On non-2xx responses
 */
export async function apiClient(endpoint, options = {}) {
  const config = {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  if (IS_DEV) {
    logger.api(config.method || 'GET', endpoint);
  }

  try {
    const response = await fetch(endpoint, config);

    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('application/json')) {
      if (!response.ok) {
        throw new ApiError(
          `Request failed: ${response.statusText}`,
          response.status
        );
      }
      return response;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        data.message || `Request failed: ${response.statusText}`,
        response.status,
        data
      );
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error.name === 'AbortError') {
      throw error;
    }

    throw new ApiError(
      error.message || 'Network error',
      0,
      null
    );
  }
}

/** GET wrapper. */
export function get(endpoint, options = {}) {
  return apiClient(endpoint, { ...options, method: 'GET' });
}

/** POST wrapper. */
export function post(endpoint, body, options = {}) {
  return apiClient(endpoint, {
    ...options,
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** PUT wrapper. */
export function put(endpoint, body, options = {}) {
  return apiClient(endpoint, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** DELETE wrapper. */
export function del(endpoint, options = {}) {
  return apiClient(endpoint, { ...options, method: 'DELETE' });
}

/** POST wrapper that returns raw Response (for streaming). */
export async function postRaw(endpoint, body, options = {}) {
  const config = {
    method: 'POST',
    credentials: 'include',
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
