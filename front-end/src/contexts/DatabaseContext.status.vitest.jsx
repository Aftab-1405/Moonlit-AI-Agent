import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { syncConnectionState } from '@/api';
import { queryKeys } from '@/api/queryClient';
import { DatabaseProvider, useDatabaseConnection } from './DatabaseContext';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, user: { uid: 'alice' } }),
}));
vi.mock('@/api', () => ({
  syncConnectionState: vi.fn(),
  sessionActive: vi.fn().mockResolvedValue({}),
  disconnectDb: vi.fn().mockResolvedValue({}),
  getSchemas: vi.fn(),
  getTableSchema: vi.fn(),
  getTables: vi.fn(),
  selectDatabase: vi.fn(),
  selectSchema: vi.fn(),
  switchDatabase: vi.fn(),
}));
afterEach(() => vi.clearAllMocks());
function Probe() {
  const db = useDatabaseConnection();
  return (
    <>
      <span role="status">
        {db.databaseStatus}:{String(db.isConnected)}
      </span>
      <button type="button" onClick={db.refreshStatus}>
        Retry
      </button>
      <button
        type="button"
        onClick={() => db.connect({ database: 'sales', db_type: 'postgresql' })}
      >
        Connect
      </button>
      <button type="button" onClick={db.disconnect}>
        Disconnect
      </button>
    </>
  );
}
function setup(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={client}>
      <DatabaseProvider>
        <Probe />
      </DatabaseProvider>
    </QueryClientProvider>,
  );
}
it('settles unresolved status on failure, retry, connect and disconnect', async () => {
  let reject;
  vi.mocked(syncConnectionState)
    .mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    )
    .mockResolvedValue({ data: { connected: false } });
  setup();
  expect(screen.getByRole('status').textContent).toBe('loading:false');
  await act(async () => reject(new Error('offline')));
  expect(screen.getByRole('status').textContent).toBe('error:false');
  fireEvent.click(screen.getByText('Retry'));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('ready:false'));
  fireEvent.click(screen.getByText('Connect'));
  expect(screen.getByRole('status').textContent).toBe('ready:true');
  fireEvent.click(screen.getByText('Disconnect'));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('ready:false'));
});
it('reuses fresh status cache without a duplicate request or skeleton', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.dbStatus, { data: { connected: true, current_database: 'sales' } });
  setup(client);
  expect(screen.getByRole('status').textContent).toBe('ready:true');
  expect(syncConnectionState).not.toHaveBeenCalled();
});
