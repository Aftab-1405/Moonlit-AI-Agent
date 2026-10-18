import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { createDarkTheme } from '@/theme';
import ArtifactLoader from './ArtifactLoader';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'test' } }) }));

it('reopening a manual result links to the same SQL output and preserves its source', async () => {
  const onOpenArtifact = vi.fn();
  const user = userEvent.setup();
  const data = { columns: ['total'], rows: [], row_count: 0 };
  render(
    <ThemeProvider theme={createDarkTheme()}>
      <ArtifactLoader
        artifact={{
          id: 'manual-result',
          type: 'visualization',
          source: { database: 'original' },
          props: { data, sourceQuery: 'select 1 where false' },
        }}
        onOpenArtifact={onOpenArtifact}
        isOpen
        currentDatabase="different"
      />
    </ThemeProvider>,
  );
  await user.click(await screen.findByRole('button', { name: 'View SQL' }));
  await user.click(screen.getByRole('button', { name: 'View SQL' }));
  expect(onOpenArtifact).toHaveBeenCalledTimes(2);
  for (const [output] of onOpenArtifact.mock.calls) {
    expect(output).toMatchObject({
      id: 'manual-result:sql',
      type: 'sql-editor',
      source: { database: 'original' },
      props: { initialQuery: 'select 1 where false', initialResults: data },
    });
  }
});

it('keeps different executions distinct when they have the same unknown source', async () => {
  const onOpenArtifact = vi.fn();
  const user = userEvent.setup();
  const show = (id) => (
    <ThemeProvider theme={createDarkTheme()}>
      <ArtifactLoader
        artifact={{
          id,
          type: 'visualization',
          source: null,
          props: { data: { columns: [], rows: [] }, sourceQuery: 'select 1' },
        }}
        onOpenArtifact={onOpenArtifact}
        isOpen
      />
    </ThemeProvider>
  );
  const view = render(show('execution-a'));
  await user.click(await screen.findByRole('button', { name: 'View SQL' }));
  view.rerender(show('execution-b'));
  await user.click(await screen.findByRole('button', { name: 'View SQL' }));
  expect(onOpenArtifact.mock.calls.map(([output]) => output.id)).toEqual([
    'execution-a:sql',
    'execution-b:sql',
  ]);
});
