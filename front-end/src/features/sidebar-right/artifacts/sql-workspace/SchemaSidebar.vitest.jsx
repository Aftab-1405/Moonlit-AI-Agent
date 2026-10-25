import { ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { createDarkTheme } from '@/theme';
import SchemaSidebar from './SchemaSidebar';

const database = vi.hoisted(() => ({
  fetchSchemaTables: vi.fn(),
  fetchTableSchema: vi.fn(),
  invalidateSchemaTables: vi.fn(),
}));
vi.mock('@/contexts/DatabaseContext', () => ({ useDatabaseConnection: () => database }));
const theme = createDarkTheme();
const tables = Array.from({ length: 201 }, (_, i) => `table_${i + 1}`);
const content = (props = {}) => (
  <ThemeProvider theme={theme}>
    <SchemaSidebar width={300} isConnected currentDatabase="first" {...props} />
  </ThemeProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  database.fetchSchemaTables.mockResolvedValue({
    status: 'success',
    data: { schema: 'public', tables },
  });
  database.fetchTableSchema.mockResolvedValue({
    status: 'success',
    data: { columns: ['saved_column'] },
  });
});

it('bounds mounted table rows and navigates through the last page', async () => {
  render(content());
  await screen.findByRole('button', { name: 'table_1' });
  expect(screen.getAllByRole('button', { name: /^table_/ })).toHaveLength(25);
  expect(screen.queryByRole('button', { name: 'table_26' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
  expect(screen.getByRole('button', { name: 'table_26' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'table_1' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Go to page 9' }));
  expect(screen.getAllByRole('button', { name: /^table_/ })).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'table_201' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Go to next page' }).disabled).toBe(true);
});

it('preserves expanded tables and loaded columns across pages without refetching', async () => {
  render(content());
  fireEvent.click(await screen.findByRole('button', { name: 'table_1' }));
  await screen.findByText('saved_column');
  fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
  expect(screen.queryByText('saved_column')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Go to previous page' }));
  expect(screen.getByRole('button', { name: 'table_1' }).getAttribute('aria-expanded')).toBe(
    'true',
  );
  expect(screen.getByText('saved_column')).toBeTruthy();
  expect(database.fetchTableSchema).toHaveBeenCalledTimes(1);
});

it('resets page and table state across databases and keeps refresh and close available', async () => {
  const onClose = vi.fn();
  const view = render(content({ onClose }));
  fireEvent.click(await screen.findByRole('button', { name: 'table_1' }));
  await screen.findByText('saved_column');
  fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
  view.rerender(content({ currentDatabase: 'second', onClose }));
  const table = await screen.findByRole('button', { name: 'table_1' });
  expect(table.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByText('saved_column')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh schema' }));
  await waitFor(() =>
    expect(database.fetchSchemaTables).toHaveBeenLastCalledWith({
      database: 'second',
      force: true,
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Hide schema explorer' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('retains columns that finish loading while their table is on another page', async () => {
  let resolveColumns;
  database.fetchTableSchema.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveColumns = resolve;
    }),
  );
  render(content());
  fireEvent.click(await screen.findByRole('button', { name: 'table_1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
  await act(async () => resolveColumns({ status: 'success', data: { columns: ['late_column'] } }));
  fireEvent.click(screen.getByRole('button', { name: 'Go to previous page' }));
  expect(screen.getByText('late_column')).toBeTruthy();
  expect(database.fetchTableSchema).toHaveBeenCalledTimes(1);
});

it('clears table state when refresh returns a different schema identity', async () => {
  render(content());
  fireEvent.click(await screen.findByRole('button', { name: 'table_1' }));
  await screen.findByText('saved_column');
  database.fetchSchemaTables.mockResolvedValueOnce({
    status: 'success',
    data: { schema: 'other', tables },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh schema' }));
  await screen.findByRole('button', { name: 'other201' });
  expect(screen.getByRole('button', { name: 'table_1' }).getAttribute('aria-expanded')).toBe(
    'false',
  );
  expect(screen.queryByText('saved_column')).toBeNull();
});
