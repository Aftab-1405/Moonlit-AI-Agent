import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDarkTheme } from '@/theme';

const api = vi.hoisted(() => ({
  getDashboardOverview: vi.fn(),
  getDashboardUsage: vi.fn(),
  getQuotaStatus: vi.fn(),
}));

const authActions = vi.hoisted(() => ({
  updateDisplayName: vi.fn().mockResolvedValue(undefined),
  requestEmailChange: vi.fn().mockResolvedValue(undefined),
  changePassword: vi.fn().mockResolvedValue(undefined),
  sendCurrentUserPasswordReset: vi.fn().mockResolvedValue(undefined),
  linkAuthProvider: vi.fn().mockResolvedValue(undefined),
  unlinkAuthProvider: vi.fn().mockResolvedValue(undefined),
  reauthenticateCurrentUser: vi.fn().mockResolvedValue({ redirected: false }),
  deleteCurrentAccount: vi.fn().mockResolvedValue(undefined),
}));

const authUser = vi.hoisted(() => ({
  uid: 'user-1',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  emailVerified: true,
  providers: ['Google'],
  providerIds: ['google.com'],
  createdAt: '2025-01-02T00:00:00.000Z',
  lastSignInAt: '2026-09-01T00:00:00.000Z',
}));

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal()),
  ...api,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: authUser,
    ...authActions,
  }),
}));

vi.mock('@/contexts/DatabaseContext', () => ({
  useDatabaseConnection: () => ({
    isConnected: true,
    dbType: 'postgresql',
    currentDatabase: 'analytics',
    currentSchema: 'public',
  }),
}));

vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    settings: {
      provider: 'bedrock',
      model: 'claude-sonnet',
      responseStyle: 'balanced',
      taskMode: 'auto',
    },
  }),
}));

const dashboardModule = await import('@/pages/DashboardPage').catch(() => ({}));
const DashboardPage = dashboardModule.default;
const theme = createDarkTheme();

function renderDashboard(section) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={[`/dashboard/${section}`]}>
          <Routes>
            <Route path="/dashboard/:section" element={<DashboardPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('DashboardPage', () => {
  beforeEach(() => {
    Object.values(authActions).forEach((action) => action.mockClear());
    authUser.email = 'ada@example.com';
    api.getDashboardOverview.mockResolvedValue({
      status: 'success',
      data: {
        conversation_count: 12,
        last_activity_at: '2026-08-31T10:00:00.000Z',
        recent_conversations: [
          { id: 'conversation-1', title: 'Quarterly analysis', updated_at: '2026-08-31T10:00:00.000Z' },
        ],
        cached_database_count: 2,
        cached_table_count: 18,
        saved_recent_query_count: 4,
        usage_tracking_started_at: '2026-09-01T00:00:00.000Z',
      },
    });
    api.getDashboardUsage.mockResolvedValue({
      status: 'success',
      data: {
        days: 30,
        tracking_started_at: '2026-09-01T00:00:00.000Z',
        totals: {
          ai_requests: 7,
          input_tokens: 120,
          output_tokens: 80,
          total_tokens: 200,
          sql_executions: 3,
          sql_successes: 2,
          sql_failures: 1,
          rows_returned: 42,
        },
        daily: [],
        models: [],
        task_modes: [],
      },
    });
    api.getQuotaStatus.mockResolvedValue({
      status: 'success',
      enabled: true,
      quota: {
        minute: { used: 1, limit: 10, resets_in: 30 },
        hour: { used: 2, limit: 100, resets_in: 600 },
        day: { used: 3, limit: 500, resets_in: 3600 },
      },
    });
  });

  it('shows an authenticated user overview without sensitive connection fields', async () => {
    expect(typeof DashboardPage).toBe('function');
    renderDashboard('overview');

    expect(await screen.findByText('Welcome back, Ada')).not.toBeNull();
    expect(await screen.findByText('12')).not.toBeNull();
    expect(screen.getByText('analytics')).not.toBeNull();
    expect(screen.queryByText(/host|password|firebase uid/i)).toBeNull();
  });

  it('shows privacy-safe usage totals for the selected range', async () => {
    renderDashboard('usage');

    expect(await screen.findByText('200')).not.toBeNull();
    expect(screen.getByText('AI requests')).not.toBeNull();
    expect(screen.getByText('SQL executions')).not.toBeNull();
    expect(screen.getByText(/Tracking since/i)).not.toBeNull();
  });

  it('shows the empty daily trend when the API returns only zero-filled days', async () => {
    api.getDashboardUsage.mockResolvedValue({
      status: 'success',
      data: {
        days: 7,
        tracking_started_at: null,
        totals: {
          ai_requests: 0,
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          sql_executions: 0,
          sql_successes: 0,
          sql_failures: 0,
          rows_returned: 0,
        },
        daily: [
          { date: '2026-09-02', total_tokens: 0 },
          { date: '2026-09-03', total_tokens: 0 },
        ],
        models: [],
        task_modes: [],
      },
    });
    renderDashboard('usage');

    expect(await screen.findByText(/No daily usage has been recorded/i)).not.toBeNull();
    expect(screen.queryByRole('img', { name: /daily total tokens/i })).toBeNull();
  });

  it('shows account identity and management actions', () => {
    renderDashboard('account');

    expect(screen.getByText('ada@example.com')).not.toBeNull();
    expect(screen.getByRole('button', { name: /edit display name/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /delete account/i })).not.toBeNull();
  });

  it('edits the display name through an accessible account dialog', async () => {
    const browserUser = userEvent.setup();
    renderDashboard('account');

    await browserUser.click(screen.getByRole('button', { name: /edit display name/i }));
    const input = screen.getByRole('textbox', { name: /display name/i });
    await browserUser.clear(input);
    await browserUser.type(input, 'Grace Hopper');
    await browserUser.click(screen.getByRole('button', { name: /save name/i }));

    expect(authActions.updateDisplayName).toHaveBeenCalledWith('Grace Hopper');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const notification = await screen.findByRole('status');
    expect(notification.textContent).toContain('Display name updated.');
    await browserUser.click(within(notification).getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('keeps email confirmation open and prevents duplicate submission while working', async () => {
    let resolveRequest;
    authActions.requestEmailChange.mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve; }));
    const browserUser = userEvent.setup();
    renderDashboard('account');

    await browserUser.click(screen.getByRole('button', { name: 'Change email' }));
    const dialog = screen.getByRole('dialog', { name: 'Change email' });
    const email = within(dialog).getByRole('textbox', { name: 'New email' });
    await browserUser.clear(email);
    await browserUser.type(email, 'new@example.com');
    await browserUser.click(within(dialog).getByRole('button', { name: 'Send verification' }));
    expect((await screen.findByRole('button', { name: 'Sending' })).disabled).toBe(true);
    expect(within(dialog).getByRole('button', { name: 'Cancel' }).disabled).toBe(true);
    await browserUser.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Change email' })).not.toBeNull();

    await act(async () => resolveRequest());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await screen.findByRole('status')).textContent).toContain('Verification email sent.');
    expect(authActions.requestEmailChange).toHaveBeenCalledExactlyOnceWith('new@example.com');
  });

  it('keeps failed form input available for retry and reports reset failures through notifications', async () => {
    authActions.requestEmailChange.mockRejectedValueOnce(new Error('Email change unavailable.'));
    authActions.sendCurrentUserPasswordReset.mockRejectedValueOnce(new Error('Reset unavailable.'));
    const browserUser = userEvent.setup();
    renderDashboard('account');

    await browserUser.click(screen.getByRole('button', { name: 'Change email' }));
    await browserUser.click(screen.getByRole('button', { name: 'Send verification' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Email change unavailable.');
    expect(screen.getByRole('textbox', { name: 'New email' }).value).toBe('ada@example.com');
    await browserUser.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await browserUser.click(screen.getByRole('button', { name: 'Send password reset' }));
    const notification = await screen.findByRole('alert');
    expect(notification.textContent).toContain('Reset unavailable.');
    expect(within(notification).getByRole('button', { name: 'Dismiss notification' })).not.toBeNull();
  });

  it('announces linked sign-in methods while their management dialog remains open', async () => {
    const browserUser = userEvent.setup();
    renderDashboard('account');

    await browserUser.click(screen.getByRole('button', { name: 'Manage sign-in methods' }));
    const dialog = screen.getByRole('dialog', { name: 'Manage sign-in methods' });
    await browserUser.click(within(dialog).getByRole('button', { name: 'Link' }));

    expect((await screen.findByRole('status')).textContent).toContain('GitHub linked.');
    expect(screen.getByRole('dialog', { name: 'Manage sign-in methods' })).not.toBeNull();
  });

  it('requires typed identity and recent reauthentication before account deletion', async () => {
    const browserUser = userEvent.setup();
    renderDashboard('account');

    await browserUser.click(screen.getByRole('button', { name: /delete account/i }));
    const confirmButton = screen.getByRole('button', { name: /permanently delete/i });
    expect(confirmButton.disabled).toBe(true);
    await browserUser.type(screen.getByRole('textbox', { name: /type your email/i }), 'ada@example.com');
    await browserUser.click(confirmButton);

    expect(authActions.reauthenticateCurrentUser).toHaveBeenCalledWith({
      providerId: 'google.com',
      password: '',
    });
    expect(authActions.deleteCurrentAccount).toHaveBeenCalledOnce();
  });

  it('allows email-less users to confirm account deletion with DELETE', async () => {
    authUser.email = null;
    const browserUser = userEvent.setup();
    renderDashboard('account');

    await browserUser.click(screen.getByRole('button', { name: /delete account/i }));
    const confirmButton = screen.getByRole('button', { name: /permanently delete/i });
    await browserUser.type(screen.getByRole('textbox', { name: /type delete/i }), 'DELETE');
    await browserUser.click(confirmButton);

    expect(authActions.reauthenticateCurrentUser).toHaveBeenCalledWith({
      providerId: 'google.com',
      password: '',
    });
    expect(authActions.deleteCurrentAccount).toHaveBeenCalledOnce();
  });
});
