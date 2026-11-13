import { act, render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { ThemeProvider, useTheme } from './ThemeContext';
import { DEFAULT_APPEARANCE } from '@/theme/appearance';
import { getAccountStorageKey } from '@/features/dashboard/accountModel';
const auth = vi.hoisted(() => ({ user: null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
let queries;
beforeEach(() => {
  auth.user = null;
  localStorage.clear();
  queries = {};
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query) =>
        (queries[query] ||= {
          matches: false,
          listeners: new Set(),
          addEventListener(_, fn) {
            this.listeners.add(fn);
          },
          removeEventListener(_, fn) {
            this.listeners.delete(fn);
          },
        }),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());
function Probe() {
  const { settings, updateSetting, effectiveTheme, reducedMotion } = useTheme();
  const theme = useMuiTheme();
  return (
    <>
      <output data-testid="state">
        {JSON.stringify({
          mode: effectiveTheme,
          motion: reducedMotion,
          surface: theme.palette.background.default,
          size: settings.appearance.codeFontSize,
        })}
      </output>
      <button
        onClick={() =>
          updateSetting('appearance', { ...settings.appearance, mode: 'dark', codeFontSize: 18 })
        }
      >
        Customize
      </button>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId('state').textContent);
it('keeps pointer-origin text editing distinct from keyboard navigation and shortcuts', () => {
  render(
    <ThemeProvider>
      <input aria-label="Search draft" />
      <button>Action</button>
    </ThemeProvider>,
  );
  const input = screen.getByRole('textbox', { name: 'Search draft' });
  fireEvent.pointerDown(input);
  fireEvent.keyDown(input, { key: 'a' });
  fireEvent.keyDown(input, { key: 'ArrowLeft' });
  expect(document.documentElement.getAttribute('data-moonlit-input-modality')).toBe('pointer');
  fireEvent.keyDown(input, { key: 'Tab' });
  expect(document.documentElement.getAttribute('data-moonlit-input-modality')).toBe('keyboard');
  fireEvent.pointerDown(input);
  fireEvent.keyDown(input, { key: 'k', ctrlKey: true });
  expect(document.documentElement.getAttribute('data-moonlit-input-modality')).toBe('keyboard');
  fireEvent.pointerDown(input);
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(document.documentElement.getAttribute('data-moonlit-input-modality')).toBe('keyboard');
});
it('recognizes text editing inside an open shadow root', () => {
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  const host = document.createElement('div'),
    input = document.createElement('input');
  host.attachShadow({ mode: 'open' }).append(input);
  document.body.append(host);
  try {
    fireEvent.pointerDown(input, { composed: true });
    fireEvent.keyDown(input, { key: 'a', composed: true });
    expect(document.documentElement.getAttribute('data-moonlit-input-modality')).toBe('pointer');
  } finally {
    host.remove();
  }
});
it('responds to OS changes, explicit override, and cleans up media listeners', () => {
  const view = render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  expect(state().mode).toBe('light');
  act(() => {
    const q = queries['(prefers-color-scheme: dark)'];
    q.matches = true;
    q.listeners.forEach((fn) => fn());
  });
  expect(state().mode).toBe('dark');
  act(() => {
    const q = queries['(prefers-reduced-motion: reduce)'];
    q.matches = true;
    q.listeners.forEach((fn) => fn());
  });
  expect(state().motion).toBe(true);
  fireEvent.click(screen.getByText('Customize'));
  act(() => {
    const q = queries['(prefers-color-scheme: dark)'];
    q.matches = false;
    q.listeners.forEach((fn) => fn());
  });
  expect(state().mode).toBe('dark');
  expect(document.documentElement.style.getPropertyValue('--font-code-size')).toBe('18px');
  view.unmount();
  expect([...Object.values(queries)].every((q) => q.listeners.size === 0)).toBe(true);
});
it('isolates guest and accounts across login, switch, logout, and cross-tab events', () => {
  localStorage.setItem(
    getAccountStorageKey('a', 'settings'),
    JSON.stringify({ appearance: { ...DEFAULT_APPEARANCE, mode: 'dark', codeFontSize: 20 } }),
  );
  const view = render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  fireEvent.click(screen.getByText('Customize'));
  auth.user = { uid: 'a' };
  view.rerender(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  expect(state().size).toBe(20);
  auth.user = { uid: 'b' };
  view.rerender(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  expect(state().size).toBe(12);
  act(() =>
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: getAccountStorageKey('b', 'settings'),
        newValue: JSON.stringify({
          appearance: { ...DEFAULT_APPEARANCE, mode: 'light', codeFontSize: 22 },
        }),
      }),
    ),
  );
  expect(state().size).toBe(22);
  auth.user = null;
  view.rerender(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  expect(state().size).toBe(18);
});
it('allows in-memory changes when persistence is blocked', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Blocked', 'SecurityError');
  });
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  fireEvent.click(screen.getByText('Customize'));
  expect(state().size).toBe(18);
  vi.restoreAllMocks();
});
it('keeps the non-sensitive boot appearance while identifying the account, then reconciles', () => {
  localStorage.setItem(
    'moonlit-appearance-boot-v1',
    JSON.stringify({ version: 1, appearance: { ...DEFAULT_APPEARANCE, mode: 'dark' } }),
  );
  auth.loading = true;
  const view = render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  expect(state().mode).toBe('dark');
  auth.loading = false;
  view.rerender(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  expect(state().mode).toBe('light');
});
it('does not rebuild the MUI theme for motion and diff presentation changes', () => {
  const themes = [];
  function Record() {
    const t = useMuiTheme(),
      { settings, updateSetting } = useTheme();
    themes.push(t);
    return (
      <button
        onClick={() =>
          updateSetting('appearance', {
            ...settings.appearance,
            reducedMotion: 'on',
            diffMarkers: 'sign',
          })
        }
      >
        Presentation
      </button>
    );
  }
  render(
    <ThemeProvider>
      <Record />
    </ThemeProvider>,
  );
  const initial = themes.at(-1);
  fireEvent.click(screen.getByText('Presentation'));
  expect(themes.at(-1)).toBe(initial);
  expect(document.documentElement.getAttribute('data-moonlit-reduced-motion')).toBe('true');
  expect(document.documentElement.getAttribute('data-moonlit-diff-markers')).toBe('sign');
});
