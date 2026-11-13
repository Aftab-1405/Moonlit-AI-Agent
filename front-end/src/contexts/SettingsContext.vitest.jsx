import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { SettingsProvider, useSettings } from '@/contexts/SettingsContext';
import { DEFAULT_APPEARANCE } from '@/theme/appearance';
import { getAccountStorageKey } from '@/features/dashboard/accountModel';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserSettingsSync } from '@/contexts/UserSettingsSync';
import { queryKeys } from '@/api/queryClient';
const auth = vi.hoisted(() => ({ user: { uid: 'a' } }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ ...auth, isAuthenticated: true, loading: false }),
}));
vi.mock('@/api', () => ({ getUserSettings: vi.fn(), saveUserSettings: vi.fn() }));
function Child() {
  const { settings, updateSettings } = useSettings();
  useEffect(() => {
    if (auth.user.uid === 'b') updateSettings({ responseStyle: 'detailed' });
  }, [updateSettings]);
  return <output>{settings.appearance.codeFontSize}</output>;
}
it('preserves account b appearance during child settings hydration', () => {
  localStorage.clear();
  localStorage.setItem(
    getAccountStorageKey('a', 'settings'),
    JSON.stringify({ appearance: { ...DEFAULT_APPEARANCE, codeFontSize: 20 } }),
  );
  localStorage.setItem(
    getAccountStorageKey('b', 'settings'),
    JSON.stringify({ appearance: { ...DEFAULT_APPEARANCE, codeFontSize: 9 } }),
  );
  const view = render(
    <SettingsProvider>
      <Child />
    </SettingsProvider>,
  );
  expect(screen.getByRole('status').textContent).toBe('20');
  auth.user = { uid: 'b' };
  view.rerender(
    <SettingsProvider>
      <Child />
    </SettingsProvider>,
  );
  expect(
    JSON.parse(localStorage.getItem(getAccountStorageKey('b', 'settings'))).appearance.codeFontSize,
  ).toBe(9);
});
it('preserves B with actual cached UserSettingsSync hydration', () => {
  localStorage.clear();
  auth.user = { uid: 'a' };
  localStorage.setItem(
    getAccountStorageKey('a', 'settings'),
    JSON.stringify({ appearance: { ...DEFAULT_APPEARANCE, codeFontSize: 20 } }),
  );
  localStorage.setItem(
    getAccountStorageKey('b', 'settings'),
    JSON.stringify({ appearance: { ...DEFAULT_APPEARANCE, codeFontSize: 9 } }),
  );
  const cache = new QueryClient();
  cache.setQueryData(queryKeys.userSettings('a'), { responseStyle: 'balanced' });
  cache.setQueryData(queryKeys.userSettings('b'), { responseStyle: 'detailed' });
  const tree = () => (
    <QueryClientProvider client={cache}>
      <SettingsProvider>
        <UserSettingsSync />
      </SettingsProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  auth.user = { uid: 'b' };
  view.rerender(tree());
  expect(
    JSON.parse(localStorage.getItem(getAccountStorageKey('b', 'settings'))).appearance.codeFontSize,
  ).toBe(9);
});
