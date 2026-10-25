import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { queryKeys } from '@/api/queryClient';
import { getDashboardOverview } from '@/api/user';
import { createDarkTheme } from '@/theme';
import DashboardPreview from './DashboardPreview';

vi.mock('@/api/user', () => ({ getDashboardOverview: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const overview = {
  data: {
    conversation_count: 42,
    cached_database_count: 3,
    cached_table_count: 17,
    saved_recent_query_count: 0,
  },
};

function setup(
  props = {},
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const show = (extra = {}) => (
    <QueryClientProvider client={client}>
      <ThemeProvider theme={createDarkTheme()}>
        <DashboardPreview userId="alice" {...props} {...extra} />
      </ThemeProvider>
    </QueryClientProvider>
  );
  return { ...render(show()), show };
}

it('renders a compact real overview, including zero counts, without navigating on load', async () => {
  let resolve;
  vi.mocked(getDashboardOverview).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const onOpenDashboard = vi.fn();
  setup({ isConnected: true, currentDatabase: 'analytics', onOpenDashboard });
  expect(screen.getByRole('status').textContent).toContain('Loading overview');
  expect(screen.getByText('Connected to analytics')).toBeTruthy();
  expect(onOpenDashboard).not.toHaveBeenCalled();
  expect(screen.getAllByRole('term')).toHaveLength(4);
  expect(screen.queryByText('Current connection')).toBeNull();
  await act(async () => resolve(overview));
  expect(await screen.findByText('42')).toBeTruthy();
  expect(screen.getByText('0')).toBeTruthy();
  expect(screen.getAllByRole('term')).toHaveLength(4);
  fireEvent.click(screen.getByRole('button', { name: 'Open full dashboard' }));
  expect(onOpenDashboard).toHaveBeenCalledOnce();
});

it('offers retry and full navigation on overview failure instead of fake zero metrics', async () => {
  vi.mocked(getDashboardOverview)
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce(overview);
  setup();
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getAllByRole('term')).toHaveLength(4);
  expect(screen.getByRole('button', { name: 'Open full dashboard' }).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Retry overview' }));
  expect(await screen.findByText('42')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('reuses fresh dashboard cache and never shows a previous account’s overview', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.dashboardOverview('alice'), overview);
  vi.mocked(getDashboardOverview).mockResolvedValue({ data: { conversation_count: 7 } });
  const view = setup({}, client);
  expect(screen.getByText('42')).toBeTruthy();
  expect(getDashboardOverview).not.toHaveBeenCalled();
  view.rerender(view.show({ userId: 'bob' }));
  expect(screen.queryByText('42')).toBeNull();
  expect(await screen.findByText('7')).toBeTruthy();
  expect(screen.getAllByText('—')).toHaveLength(3);
  await waitFor(() => expect(getDashboardOverview).toHaveBeenCalledOnce());
});
