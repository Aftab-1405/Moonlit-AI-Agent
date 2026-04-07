/**
 * LLM API Module
 *
 * Fetches available provider/model options for chat runtime selection.
 *
 * @module api/llm
 */

import { get } from './client';
import { LLM } from './endpoints';

/**
 * Get provider/model options available in the backend deployment.
 *
 * @param {AbortSignal} [signal] - Optional abort signal
 * @returns {Promise<{status: string, default_provider: string, default_model: string, providers: Array}>}
 */
export async function getLlmOptions(signal) {
  return get(LLM.OPTIONS, { signal });
}
