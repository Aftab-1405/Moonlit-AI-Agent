/**
 * Shared fetch wrapper for API requests.
 * @module api/client
 */

const IS_DEV = import.meta.env.DEV;
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

import logger from '@/utils/logger';

/** API error with HTTP status and optional response payload. */
class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

function readCookie(name) {
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function csrfHeaders(method) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return {};
  }

  const token = readCookie(CSRF_COOKIE_NAME);
  return token ? { [CSRF_HEADER_NAME]: token } : {};
}

/**
 * Base fetch wrapper with consistent error handling.
 *
 * @param {string} endpoint - API endpoint path
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<any>} Parsed JSON response
 * @throws {ApiError} On non-2xx responses
 */
async function apiClient(endpoint, options = {}) {
  const method = options.method || 'GET';
  const { body, headers: customHeaders, onMetrics, ...restOptions } = options;
  const hasBody = body !== undefined;

  const headers = {
    ...csrfHeaders(method),
    ...customHeaders,
  };

  // Only set Content-Type for requests that carry a body and are not FormData
  // (FormData sets its own multipart boundary).
  if (hasBody && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const config = {
    ...restOptions,
    method,
    credentials: 'include',
    headers,
    body: hasBody ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  };

  if (IS_DEV) {
    logger.api(method, endpoint);
  }

  try {
    const started = performance.now();
    const response = await fetch(endpoint, config);
    const headersReceived = performance.now();

    const contentType = response.headers.get('content-type');
    if (response.status === 204) {
      if (!response.ok) {
        throw new ApiError(`Request failed: ${response.statusText}`, response.status);
      }
      return null;
    }

    if (contentType && !contentType.includes('application/json')) {
      if (!response.ok) {
        throw new ApiError(`Request failed: ${response.statusText}`, response.status);
      }
      return response;
    }

    if (!contentType) {
      if (!response.ok) {
        throw new ApiError(`Request failed: ${response.statusText}`, response.status);
      }
      return response;
    }

    let data;
    if (onMetrics) {
      const text = await response.text();
      const bodyReceived = performance.now();
      data = JSON.parse(text);
      const parsed = performance.now();
      onMetrics({
        request_to_headers_ms: headersReceived - started,
        transfer_ms: bodyReceived - headersReceived,
        parse_ms: parsed - bodyReceived,
        request_total_ms: parsed - started,
        payload_bytes: new TextEncoder().encode(text).byteLength,
      });
    } else {
      data = await response.json();
    }

    if (!response.ok) {
      throw new ApiError(
        data.message || `Request failed: ${response.statusText}`,
        response.status,
        data,
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

    throw new ApiError(error.message || 'Network error', 0, null);
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
    body: body !== undefined ? body : undefined,
  });
}

/** PATCH wrapper. */
export function patch(endpoint, body, options = {}) {
  return apiClient(endpoint, {
    ...options,
    method: 'PATCH',
    body: body !== undefined ? body : undefined,
  });
}

/** DELETE wrapper. */
export function del(endpoint, options = {}) {
  return apiClient(endpoint, { ...options, method: 'DELETE' });
}

/** POST wrapper that returns raw Response (for streaming). */
export async function postRaw(endpoint, body, options = {}) {
  const hasBody = body !== undefined;
  // Destructure headers out before spreading the rest of options into config.
  // Without this, `...options` on line ~192 would overwrite the computed
  // `headers` object (which carries the CSRF token and Content-Type) with
  // just `options.headers`, silently dropping the CSRF token and causing 403s.
  const { headers: optHeaders, ...restOptions } = options;

  const headers = {
    ...csrfHeaders('POST'),
    ...optHeaders,
  };

  if (hasBody && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const config = {
    method: 'POST',
    credentials: 'include',
    headers,
    body: hasBody ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    ...restOptions,
  };

  if (IS_DEV) {
    logger.api('POST (raw)', endpoint);
  }

  try {
    const response = await fetch(endpoint, config);

    if (!response.ok) {
      const text = await response.text();
      throw new ApiError(text || `Request failed: ${response.statusText}`, response.status);
    }

    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error.name === 'AbortError') {
      throw error;
    }

    throw new ApiError(error.message || 'Network error', 0, null);
  }
}
