import { beforeEach, expect, it, vi } from 'vitest';
import { get } from './client';
import { getExecutionResult } from './conversations';

vi.mock('./client', () => ({ get: vi.fn(), del: vi.fn(), patch: vi.fn(), postRaw: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
it('does not retain completed result bodies in a process-wide cache', async () => {
  get.mockResolvedValue({ status: 'success', data: { data: [{ value: 1 }] } });
  await getExecutionResult('conversation', 'execution');
  await getExecutionResult('conversation', 'execution');
  expect(get).toHaveBeenCalledTimes(2);
});
it('passes cancellation to result reads and skips already-cancelled queued work', async () => {
  const controller = new AbortController();
  get.mockResolvedValue({ status: 'success', data: {} });
  await getExecutionResult('c', 'e', controller.signal);
  expect(get).toHaveBeenLastCalledWith(expect.any(String), {
    signal: controller.signal,
    onMetrics: expect.any(Function),
  });
  controller.abort();
  await expect(getExecutionResult('c', 'e2', controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(get).toHaveBeenCalledTimes(1);
});
it('encodes bounded history requests and forwards cancellation', async () => {
  const { getConversation } = await import('./conversations');
  const request = new AbortController();
  get.mockResolvedValue({ status: 'success' });
  await getConversation('conversation', request.signal, { limit: 30, before: 'cursor+/=' });
  expect(get).toHaveBeenCalledWith(
    '/api/v1/get_conversation/conversation?limit=30&before=cursor%2B%2F%3D',
    { signal: request.signal },
  );
});
