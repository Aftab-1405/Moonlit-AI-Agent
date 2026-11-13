import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { queryClient, queryKeys } from '@/api/queryClient';
import { useSettings } from '@/contexts/SettingsContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import SettingsModal from './SettingsModal';
import { getLlmOptions } from '@/api/llm';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'settings-test' } }) }));
vi.mock('./UserDBContextManagerForAI', () => ({ default: () => <div>Context settings</div> }));
vi.mock('@/api/llm', () => ({ getLlmOptions: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  queryClient.clear();
  vi.mocked(getLlmOptions).mockReset().mockResolvedValue({ providers: [] });
});

it('loads capabilities on cold entry without a missing queryFn diagnostic', async () => {
  const warning = vi.spyOn(console, 'error');
  vi.mocked(getLlmOptions).mockResolvedValue({
    providers: [{ name: 'test', models: ['reasoning-model'] }],
    capabilities: { 'reasoning-model': { supports_reasoning: true } },
  });
  render(surface());
  await waitFor(() => expect(getLlmOptions).toHaveBeenCalledOnce());
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Reasoning effort' }).getAttribute('aria-disabled'),
    ).not.toBe('true'),
  );
  expect(warning.mock.calls.flat().join(' ')).not.toContain('queryFn');
});

afterEach(() => vi.restoreAllMocks());

it('does not reopen the mobile navigation after a desktop resize', async () => {
  let narrow = true;
  const listeners = new Set();
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    media: query,
    get matches() {
      return query.includes('max-width') && narrow;
    },
    addEventListener: (_event, listener) => listeners.add(listener),
    removeEventListener: (_event, listener) => listeners.delete(listener),
  }));
  const resize = (mobile) =>
    act(() => {
      narrow = mobile;
      for (const listener of listeners) listener();
    });
  const user = userEvent.setup();
  render(surface());
  await user.click(screen.getByRole('button', { name: 'Show settings navigation' }));
  expect(await screen.findByRole('navigation', { name: 'Settings sections' })).toBeTruthy();
  resize(false);
  resize(true);
  await waitFor(() =>
    expect(screen.queryByRole('navigation', { name: 'Settings sections' })).toBeNull(),
  );
  expect(
    screen.getByRole('button', { name: 'Show settings navigation' }).getAttribute('aria-expanded'),
  ).toBe('false');
});

function SettingsProbe() {
  const { settings } = useSettings();
  return <output data-testid="saved-settings">{JSON.stringify(settings)}</output>;
}

function surface(section = 'ai', onClose = vi.fn()) {
  return (
    <ThemeProvider>
      <SettingsProbe />
      <button type="button">Workspace navigation</button>
      <SettingsModal open initialSection={section} onClose={onClose} />
    </ThemeProvider>
  );
}

it('updates the section and close callback while already open', async () => {
  const user = userEvent.setup();
  const oldClose = vi.fn();
  const newClose = vi.fn();
  const view = render(surface('ai', oldClose));
  expect(await screen.findByRole('heading', { name: 'General', level: 1 })).toBeTruthy();
  view.rerender(surface('database', newClose));
  expect(await screen.findByRole('heading', { name: 'Database', level: 1 })).toBeTruthy();
  await user.keyboard('{Escape}');
  expect(newClose).toHaveBeenCalledOnce();
  expect(oldClose).not.toHaveBeenCalled();
});

it('labels selectors, persists a changed response style, and explains disabled reasoning', async () => {
  const user = userEvent.setup();
  const view = render(surface());
  const style = screen.getByRole('combobox', { name: 'Response style' });
  expect(
    screen.getByRole('combobox', { name: 'Reasoning effort' }).getAttribute('aria-disabled'),
  ).toBe('true');
  await user.click(style);
  await user.click(screen.getByRole('option', { name: 'Concise' }));
  expect(style.textContent).toContain('Concise');
  view.unmount();
  render(surface());
  expect(screen.getByRole('combobox', { name: 'Response style' }).textContent).toContain('Concise');
});

it('keeps numeric preferences numeric and supports an empty NULL display', async () => {
  const user = userEvent.setup();
  render(surface('database'));
  await user.click(await screen.findByRole('combobox', { name: 'Query timeout' }));
  await user.click(screen.getByRole('option', { name: '1 min' }));
  await user.click(screen.getByRole('combobox', { name: 'NULL display' }));
  await user.click(screen.getByRole('option', { name: '(empty)' }));
  const settings = JSON.parse(screen.getByTestId('saved-settings').textContent);
  expect(settings.queryTimeout).toBe(60);
  expect(settings.nullDisplay).toBe('');
  expect(screen.getByRole('combobox', { name: 'NULL display' }).textContent).toContain('(empty)');
});

it('labels switches and allows their labels to toggle each preference once', async () => {
  const user = userEvent.setup();
  render(surface('database'));
  const control = await screen.findByRole('switch', { name: 'Confirm before running' });
  expect(control.checked).toBe(false);
  await user.click(screen.getByText('Confirm before running', { selector: 'label' }));
  expect(control.checked).toBe(true);
  await user.click(control);
  expect(control.checked).toBe(false);
});

it('updates supported reasoning without losing its enabled state', async () => {
  queryClient.setQueryData(queryKeys.llmOptions, {
    providers: [{ name: 'test', models: ['reasoning-model'] }],
    capabilities: { 'reasoning-model': { supports_reasoning: true } },
  });
  const user = userEvent.setup();
  render(surface());
  await user.click(screen.getByRole('combobox', { name: 'Reasoning effort' }));
  expect(getLlmOptions).not.toHaveBeenCalled();
  await user.click(screen.getByRole('option', { name: 'High' }));
  const settings = JSON.parse(screen.getByTestId('saved-settings').textContent);
  expect(settings.reasoningEffort).toBe('high');
  expect(settings.enableReasoning).toBe(true);
});

it('makes the global reset scope explicit and does not offer it for context data', async () => {
  const user = userEvent.setup();
  render(surface());
  await user.click(screen.getByRole('combobox', { name: 'Response style' }));
  await user.click(screen.getByRole('option', { name: 'Concise' }));
  await user.click(
    within(screen.getByRole('navigation', { name: 'Settings sections' })).getByRole('button', {
      name: 'Database',
    }),
  );
  await user.click(screen.getByRole('button', { name: 'Reset all settings' }));
  expect(JSON.parse(screen.getByTestId('saved-settings').textContent).responseStyle).toBe(
    'balanced',
  );
  await user.click(screen.getByRole('button', { name: 'AI context' }));
  expect(await screen.findByText('Context settings')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Reset all settings' })).toBeNull();
});

it('falls back from an unknown initial section and closes on Escape', async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(surface('missing', onClose));
  const heading = await screen.findByRole('heading', { name: 'General', level: 1 });
  await waitFor(() => expect(document.activeElement).toBe(heading));
  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledOnce();
});

it('leaves application navigation accessible and does not create a modal dialog', () => {
  render(surface());
  expect(screen.getByRole('button', { name: 'Workspace navigation' })).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('searches individual controls, reveals Advanced with Enter, retains query and clears results', async () => {
  const user = userEvent.setup();
  render(surface('ai'));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 })));
  const search = screen.getByRole('searchbox', { name: 'Search settings' });
  await user.type(search, 'font');
  expect(screen.getByRole('heading', { name: 'General', level: 1 })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Font Appearance' })).toBeTruthy();
  await user.keyboard('{Enter}');
  expect(await screen.findByRole('spinbutton', { name: 'UI font size' })).toBeTruthy();
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('spinbutton', { name: 'UI font size' })),
  );
  expect(search.value).toBe('font');
  await user.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(screen.getByRole('navigation', { name: 'Settings sections' })).toBeTruthy();
  await user.type(search, 'no such preference');
  expect(screen.getByText('No results found')).toBeTruthy();
});

it('focuses the visible selector after a setting search without changing its value', async () => {
  const user = userEvent.setup();
  render(surface('ai'));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 })));
  await user.type(screen.getByRole('searchbox', { name: 'Search settings' }), 'timeout{Enter}');
  const selector = await screen.findByRole('combobox', { name: 'Query timeout' });
  await waitFor(() => expect(document.activeElement).toBe(selector));
  expect(JSON.parse(screen.getByTestId('saved-settings').textContent).queryTimeout).toBe(30);
});
it('does not steal focus when the user continues searching during disclosure', async () => {
  const user = userEvent.setup();
  render(surface());
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 })));
  const search = screen.getByRole('searchbox', { name: 'Search settings' });
  await user.type(search, 'font{Enter}');
  await user.type(search, 'x');
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(document.activeElement).toBe(search);
});
