import { ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { createDarkTheme } from '@/theme';
import DatabasePreview from './DatabasePreview';

const base = {
  isConnected: true,
  currentDatabase: 'sales',
  dbType: 'postgresql',
  currentSchema: 'public',
  availableDatabases: ['sales', 'analytics'],
  onDatabaseSwitch: vi.fn(),
};
const show = (props = {}) => (
  <ThemeProvider theme={createDarkTheme()}>
    <DatabasePreview {...base} {...props} />
  </ThemeProvider>
);

it('shows setup without stale names when disconnected and opens the connection dialog', () => {
  const onOpenDatabase = vi.fn();
  render(show({ isConnected: false, onOpenDatabase }));
  expect(screen.getByText('Not connected')).toBeTruthy();
  expect(screen.queryByText('sales')).toBeNull();
  expect(screen.queryByText('public')).toBeNull();
  expect(screen.getByText('PostgreSQL')).toBeTruthy();
  expect(screen.queryByRole('group', { name: 'Available databases' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Connect database' }));
  expect(onOpenDatabase).toHaveBeenCalledOnce();
});

it.each([
  ['postgresql', 'PostgreSQL', true],
  ['sqlserver', 'SQL Server', true],
  ['mysql', 'MySQL', false],
  ['oracle', 'Oracle', false],
])('renders %s summary with engine-appropriate schema information', (dbType, label, hasSchema) => {
  const onDatabaseSwitch = vi.fn();
  const onOpenDatabase = vi.fn();
  render(show({ dbType, onDatabaseSwitch, onOpenDatabase }));
  expect(screen.getByText(label)).toBeTruthy();
  expect(Boolean(screen.queryByText('Current schema'))).toBe(hasSchema);
  expect(screen.getByRole('button', { name: 'sales' }).getAttribute('aria-pressed')).toBe('true');
  expect(onDatabaseSwitch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'sales' }));
  expect(onDatabaseSwitch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Manage connection' }));
  expect(onOpenDatabase).toHaveBeenCalledOnce();
});

it('retains selection during pending and failed switches, then reflects successful state', async () => {
  let finish;
  const onDatabaseSwitch = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(show({ onDatabaseSwitch }));
  fireEvent.click(screen.getByRole('button', { name: 'analytics' }));
  expect(screen.getByRole('progressbar', { name: 'Switching to analytics' })).toBeTruthy();
  expect(screen.getByRole('button', { name: /analytics/ }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'sales' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: /analytics/ }));
  expect(onDatabaseSwitch).toHaveBeenCalledTimes(1);
  await act(async () => finish({ success: false, error: 'Permission denied' }));
  expect(screen.getByRole('alert').textContent).toBe('Permission denied');
  fireEvent.click(screen.getByRole('button', { name: 'analytics' }));
  await act(async () => finish({ success: true }));
  view.rerender(show({ currentDatabase: 'analytics', onDatabaseSwitch }));
  expect(screen.getByRole('button', { name: 'analytics' }).getAttribute('aria-pressed')).toBe(
    'true',
  );
  expect(screen.queryByRole('alert')).toBeNull();
});

it('handles a rejected switch and disables switching during streaming or a controller operation', async () => {
  const onDatabaseSwitch = vi.fn().mockRejectedValue(new Error('offline'));
  const view = render(show({ onDatabaseSwitch }));
  fireEvent.click(screen.getByRole('button', { name: 'analytics' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  view.rerender(show({ isStreaming: true, onDatabaseSwitch }));
  expect(screen.getByRole('button', { name: 'analytics' }).disabled).toBe(true);
  view.rerender(show({ isDatabaseBusy: true, onDatabaseSwitch }));
  expect(screen.getByRole('button', { name: 'analytics' }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Manage connection' }).disabled).toBe(true);
});

it('falls back to the current database and shows missing schema without inventing values', () => {
  render(show({ availableDatabases: [], currentSchema: null }));
  expect(screen.getByRole('button', { name: 'sales' })).toBeTruthy();
  expect(screen.getByText('Not selected')).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();
});

it('filters large lists case-insensitively and hides them immediately on disconnect', () => {
  const availableDatabases = Array.from({ length: 12 }, (_, i) => `workspace_${i}`);
  const view = render(show({ availableDatabases }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Filter databases' }), {
    target: { value: 'WORKSPACE_11' },
  });
  expect(screen.getByRole('button', { name: 'workspace_11' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'workspace_1' })).toBeNull();
  fireEvent.change(screen.getByRole('textbox', { name: 'Filter databases' }), {
    target: { value: 'missing' },
  });
  expect(screen.getByText('No matching databases.')).toBeTruthy();
  view.rerender(show({ isConnected: false, availableDatabases }));
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.getByRole('button', { name: 'Connect database' })).toBeTruthy();
});

it('distinguishes unresolved status from disconnected and offers retry after failure', () => {
  const onRetryDatabaseStatus = vi.fn();
  const view = render(
    show({ isConnected: false, databaseStatus: 'loading', onRetryDatabaseStatus }),
  );
  expect(screen.getByRole('status').textContent).toContain('Loading database');
  expect(screen.queryByText('Not connected')).toBeNull();
  expect(screen.getByRole('button', { name: 'Connect database' }).disabled).toBe(true);
  view.rerender(show({ isConnected: false, databaseStatus: 'error', onRetryDatabaseStatus }));
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByText('Connection status unavailable')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry connection status' }));
  expect(onRetryDatabaseStatus).toHaveBeenCalledOnce();
  view.rerender(show({ isConnected: false, databaseStatus: 'ready' }));
  expect(screen.getByText('Not connected')).toBeTruthy();
});
