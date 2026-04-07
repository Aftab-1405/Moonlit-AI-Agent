/**
 * SSE Stream Parser
 *
 * Parses Server-Sent Events (SSE) from a ReadableStream and dispatches
 * typed event objects to a callback.
 *
 * Event types emitted by the LangGraph agent:
 *   token          – LLM content token
 *   tool_start     – tool invocation begun
 *   tool_end       – tool invocation finished (includes UI result)
 *   thinking_token – reasoning / chain-of-thought token
 *   error          – recoverable error message
 *   done           – stream complete
 *
 * @module utils/streamParser
 */

/**
 * Read SSE events from a ReadableStream and invoke *onEvent* for each.
 *
 * @param {ReadableStreamDefaultReader} reader
 * @param {TextDecoder} decoder
 * @param {(event: object) => void} onEvent
 * @returns {Promise<void>} Resolves when the stream ends or a `done` event arrives.
 */
export async function parseSSEStream(reader, decoder, onEvent) {
  let buffer = '';

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE lines are delimited by newlines. Split and keep the last
    // (potentially incomplete) chunk in the buffer.
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const payload = trimmed.slice(6).trim();

      // Legacy sentinel — treat as done
      if (payload === '[DONE]') {
        onEvent({ type: 'done' });
        return;
      }

      try {
        const event = JSON.parse(payload);
        onEvent(event);
        if (event.type === 'done') return;
      } catch {
        // Skip malformed lines
      }
    }
  }
}
