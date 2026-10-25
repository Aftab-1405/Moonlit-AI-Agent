import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useImperativeHandle, useState } from 'react';
import { expect, it, vi } from 'vitest';
import { createDarkTheme } from '@/theme';
import DataVisualizationPanel from './DataVisualizationPanel';

const commands = vi.hoisted(() => ({
  save: vi.fn(),
  copy: vi.fn(),
  download: vi.fn(),
  exportVisualization: vi.fn(),
  reset: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'test' } }) }));
vi.mock('./PerspectiveDashboard', () => ({
  default: function Viewer({ ref, onReadyChange, onNotices }) {
    const [choice, setChoice] = useState('User theme');
    useImperativeHandle(ref, () => commands, []);
    useEffect(() => {
      onReadyChange(true);
      onNotices?.(['Approximate columns can round totals.']);
    }, [onReadyChange, onNotices]);
    return (
      <input
        aria-label="Viewer configuration"
        value={choice}
        onChange={(event) => setChoice(event.target.value)}
      />
    );
  },
}));

it('keeps primary actions visible and viewer state intact while overflow actions remain usable', async () => {
  const user = userEvent.setup();
  const onOpenArtifact = vi.fn();
  const data = { columns: ['total'], rows: [[42]], truncated: true, row_count: 1 };
  const show = (isFullscreen) => (
    <ThemeProvider theme={createDarkTheme()}>
      <DataVisualizationPanel
        data={data}
        title="Customer spending"
        sourceQuery="select total"
        onOpenArtifact={onOpenArtifact}
        isFullscreen={isFullscreen}
        outputsSlot={<button type="button">Outputs</button>}
      />
    </ThemeProvider>
  );
  const view = render(show(false));
  const configuration = screen.getByRole('textbox', { name: 'Viewer configuration' });
  await user.type(configuration, ' preserved');
  await user.click(screen.getByRole('button', { name: 'Save analysis' }));
  expect(commands.save).toHaveBeenCalledOnce();
  expect(screen.getByRole('alert').textContent).toContain('1 row · Truncated');
  for (const [label, command] of [
    ['Copy current view with metadata', 'copy'],
    ['Download current view as CSV', 'download'],
    ['Export visualization', 'exportVisualization'],
    ['Reset analysis', 'reset'],
  ]) {
    await user.click(screen.getByRole('button', { name: 'More artifact actions' }));
    await user.click(screen.getByRole('menuitem', { name: label }));
    expect(commands[command]).toHaveBeenCalledOnce();
  }
  view.rerender(show(true));
  expect(screen.getByRole('textbox', { name: 'Viewer configuration' })).toBe(configuration);
  expect(configuration.value).toBe('User theme preserved');
  await user.click(screen.getByRole('button', { name: 'View SQL' }));
  expect(onOpenArtifact).toHaveBeenCalledWith(expect.objectContaining({ type: 'sql-editor' }), {
    preserveFullscreen: true,
  });
  expect(view.container.querySelectorAll('[data-artifact-header]')).toHaveLength(1);
});

it('keeps result diagnostics collapsed while scope and precision remain visible', async () => {
  render(
    <ThemeProvider theme={createDarkTheme()}>
      <DataVisualizationPanel
        data={{
          columns: ['value'],
          rows: [['1.00000000000000001']],
          column_metadata: [{ key: 'value', encoding: 'decimal-string' }],
          result_metadata: {
            completeness: 'complete',
            effective_limit: 100,
            returned_rows: 1,
            execution_id: 'execution-fixture',
            executed_at: '2026-10-22T18:52:46Z',
          },
        }}
      />
    </ThemeProvider>,
  );
  expect(screen.getByRole('status').textContent).toContain('1 row · Complete');
  expect(screen.getByText('Approximate values')).toBeTruthy();
  expect(screen.queryByText(/execution-fixture/)).toBeNull();
  expect(screen.queryByText('Approximate columns can round totals.')).toBeNull();
  const toggle = screen.getByRole('button', { name: 'Result details' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  await userEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText(/execution-fixture/)).toBeTruthy();
  expect(screen.getByText('Approximate columns can round totals.')).toBeTruthy();
  expect(screen.getByText(/Limit 100/)).toBeTruthy();
});

it('does not report successful persistence when the dashboard returns false', async () => {
  const notify = vi.fn();
  commands.save.mockResolvedValueOnce(false);
  render(
    <ThemeProvider theme={createDarkTheme()}>
      <DataVisualizationPanel data={{ columns: ['a'], rows: [[1]] }} onNotify={notify} />
    </ThemeProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Save analysis' }));
  expect(notify).toHaveBeenCalledWith('The analysis action could not be completed.', 'error');
});
