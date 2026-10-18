import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  user: { uid: 'user-1' },
  settings: { llmModel: 'model-one' },
  updateSettings: vi.fn(),
}));

const api = vi.hoisted(() => ({
  getUserSettings: vi.fn(),
  saveUserSettings: vi.fn(),
}));

vi.mock('@/api', () => api);
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, loading: false, user: state.user }),
}));
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: state.settings, updateSettings: state.updateSettings }),
}));

const { UserSettingsSync } = await import('@/contexts/UserSettingsSync');

describe('UserSettingsSync account isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.user = { uid: 'user-1' };
    state.settings = { llmModel: 'model-one' };
    api.getUserSettings.mockResolvedValueOnce({ llmModel: 'server-model-one' });
  });

  it('does not persist local settings while a newly selected account is hydrating', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <UserSettingsSync />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(state.updateSettings).toHaveBeenCalled());
    state.settings = { llmModel: 'server-model-one' };
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <UserSettingsSync />
      </QueryClientProvider>,
    );
    await act(async () => Promise.resolve());

    api.getUserSettings.mockImplementationOnce(() => new Promise(() => {}));
    state.user = { uid: 'user-2' };
    state.settings = { llmModel: 'model-two-local' };

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <UserSettingsSync />
      </QueryClientProvider>,
    );
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 850));
    });

    expect(api.saveUserSettings).not.toHaveBeenCalled();
  });
});
