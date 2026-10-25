import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useQueryExecution } from './useQueryExecution';

const { runQuery } = vi.hoisted(() => ({ runQuery: vi.fn() }));
vi.mock('@/api', () => ({ runQuery }));
const success = { status: 'success', data: { columns: ['id'], rows: [[1]], row_count: 1 } };
const props = () => ({
  isDbConnected: true,
  sourceKey: 'db/public/1',
  sourceChanging: false,
  settings: {},
  setDbModalOpen: vi.fn(),
  showSnackbar: vi.fn(),
  onQueryResults: vi.fn(),
});
beforeEach(() => vi.clearAllMocks());

it.each([
  { sourceKey: 'db/other/1' },
  { sourceKey: 'db/public/2' },
  { isDbConnected: false },
  { sourceChanging: true },
  { resultContextKey: 'closed-artifact' },
])('discards pending results when source changes: %j', async (change) => {
  let resolve;
  runQuery.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const initial = props();
  const { result, rerender } = renderHook(useQueryExecution, { initialProps: initial });
  let pending;
  act(() => {
    pending = result.current.handleRunQuery('select 1');
  });
  const signal = runQuery.mock.calls[0][1];
  rerender({ ...initial, ...change });
  expect(signal.aborted).toBe(true);
  await act(async () => {
    resolve(success);
    await pending;
  });
  expect(initial.onQueryResults).not.toHaveBeenCalled();
});

it('does not execute a pending confirmation against a different source', async () => {
  const initial = { ...props(), settings: { confirmBeforeRun: true } };
  const { result, rerender } = renderHook(useQueryExecution, { initialProps: initial });
  let pending;
  act(() => {
    pending = result.current.handleRunQuery('select 1');
  });
  const confirm = result.current.confirmDialog.onConfirm;
  rerender({ ...initial, sourceKey: 'db/other/1' });
  await act(async () => {
    await confirm();
    await pending;
  });
  expect(runQuery).not.toHaveBeenCalled();
});

it('still publishes successful results from the current source', async () => {
  runQuery.mockResolvedValue(success);
  const initial = props();
  const { result } = renderHook(useQueryExecution, { initialProps: initial });
  await act(async () => {
    await result.current.handleRunQuery('select 1');
  });
  expect(initial.onQueryResults).toHaveBeenCalledTimes(1);
});
