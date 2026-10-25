import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { runQuery } from '@/api';
import { createDarkTheme } from '@/theme';
import SqlWorkspace from './index';

vi.mock('@/api', () => ({ runQuery: vi.fn() }));
const databaseState = vi.hoisted(() => ({
  currentSchema: 'public',
  lastConnectedAt: 1,
  isLoading: false,
}));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ settings: {} }) }));
vi.mock('@/contexts/DatabaseContext', () => ({
  useDatabaseConnection: () => ({
    ...databaseState,
    fetchSchemaTables: async () => ({ status: 'success', data: { tables: [], schema: 'public' } }),
    fetchTableSchema: vi.fn(),
    invalidateSchemaTables: vi.fn(),
  }),
}));
vi.mock('./SqlEditorSurface', () => ({
  default: ({ query, onQueryChange }) => (
    <textarea
      aria-label="SQL draft"
      value={query}
      onChange={(event) => onQueryChange(event.target.value)}
    />
  ),
}));

it('uses one header while preserving query tabs, draft and execution through fullscreen', async () => {
  const user = userEvent.setup();
  const onOpenArtifact = vi.fn();
  runQuery.mockResolvedValue({
    status: 'success',
    data: { result: { columns: ['answer'], rows: [[42]] }, row_count: 1 },
  });
  const show = (isFullscreen) => (
    <ThemeProvider theme={createDarkTheme()}>
      <SqlWorkspace
        title="Customer query"
        outputsSlot={<button type="button">Outputs</button>}
        isConnected
        currentDatabase="sales"
        isFullscreen={isFullscreen}
        onOpenArtifact={onOpenArtifact}
      />
    </ThemeProvider>
  );
  const view = render(show(false));
  const editor = await screen.findByRole('textbox', { name: 'SQL draft' });
  fireEvent.change(editor, { target: { value: 'select 42' } });
  await user.click(screen.getByRole('button', { name: 'Create new query' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'SQL draft' }), {
    target: { value: 'select 7' },
  });
  await user.click(screen.getByRole('tab', { name: 'Query 1' }));
  expect(screen.getByRole('textbox', { name: 'SQL draft' }).value).toBe('select 42');
  view.rerender(show(true));
  expect(screen.getByRole('textbox', { name: 'SQL draft' })).toBe(editor);
  expect(editor.value).toBe('select 42');
  expect(view.container.querySelectorAll('[data-artifact-header]')).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'Customer query' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Run query' }));
  await waitFor(() => expect(onOpenArtifact).toHaveBeenCalledOnce());
  expect(runQuery).toHaveBeenCalledWith(
    { sql: 'select 42', maxRows: 1000, timeout: 30 },
    expect.any(AbortSignal),
  );
});

it.each([
  'currentSchema',
  'lastConnectedAt',
])('ignores pending results after %s changes', async (field) => {
  let finish;
  runQuery.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const open = vi.fn();
  // Fresh callback makes the memoized child observe our context test double.
  const show = () => (
    <ThemeProvider theme={createDarkTheme()}>
      <SqlWorkspace
        isConnected
        currentDatabase="sales"
        initialQuery="select 1"
        onOpenArtifact={(artifact) => open(artifact)}
      />
    </ThemeProvider>
  );
  const view = render(show());
  await screen.findByRole('textbox', { name: 'SQL draft' });
  await userEvent.click(screen.getByRole('button', { name: 'Run query' }));
  const signal = runQuery.mock.calls.at(-1)[1];
  const previous = databaseState[field];
  databaseState[field] = field === 'currentSchema' ? 'other_schema' : 2;
  view.rerender(show());
  expect(signal.aborted).toBe(true);
  finish({ status: 'success', data: { result: { columns: ['a'], rows: [[1]] } } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(open).not.toHaveBeenCalled();
  databaseState[field] = previous;
});

it('does not reopen an artifact after the editor closes with a pending query', async () => {
  let finish;
  runQuery.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const open = vi.fn();
  const view = render(
    <ThemeProvider theme={createDarkTheme()}>
      <SqlWorkspace isConnected initialQuery="select 1" onOpenArtifact={open} />
    </ThemeProvider>,
  );
  await screen.findByRole('textbox', { name: 'SQL draft' });
  await userEvent.click(screen.getByRole('button', { name: 'Run query' }));
  const signal = runQuery.mock.calls.at(-1)[1];
  view.unmount();
  expect(signal.aborted).toBe(true);
  finish({ status: 'success', data: { result: { columns: ['a'], rows: [[1]] } } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(open).not.toHaveBeenCalled();
});
