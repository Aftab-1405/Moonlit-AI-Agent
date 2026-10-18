import { useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import AppShell from './AppShell';
import ArtifactLoader from '@/features/sidebar-right/artifact-loader/ArtifactLoader';
import { createDarkTheme } from '@/theme';

vi.mock('@/features/sidebar-right/artifacts/sql-workspace', () => ({
  default: function Editor({ isFullscreen, onToggleFullscreen }) {
    const [draft, setDraft] = useState('');
    return (
      <>
        <input aria-label="SQL draft" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button onClick={onToggleFullscreen}>{isFullscreen ? 'Restore' : 'Expand'}</button>
      </>
    );
  },
}));
const artifact = { id: 'sql', type: 'sql-editor', props: {} };
function Workspace() {
  const [expanded, setExpanded] = useState(false);
  return (
    <ThemeProvider theme={createDarkTheme()}>
      <AppShell
        sidebarOpen
        canvasOpen
        canvasWidth={520}
        canvasFullscreen={expanded}
        sidebarSlot={<button>Navigation</button>}
        chatSlot={<input aria-label="Chat draft" defaultValue="Preserved chat" />}
        workspaceSlot={
          <ArtifactLoader
            artifact={artifact}
            fullscreen={expanded}
            onFullscreenChange={setExpanded}
          />
        }
      />
    </ThemeProvider>
  );
}
it('expands in flow, preserves both drafts, and restores split view with Escape', async () => {
  const user = userEvent.setup();
  render(<Workspace />);
  const editor = await screen.findByRole('textbox', { name: 'SQL draft' });
  const chat = screen.getByRole('textbox', { name: 'Chat draft' });
  await user.type(editor, 'select 42');
  await user.click(screen.getByRole('button', { name: 'Expand' }));
  const expanded = screen.getByRole('region', { name: 'Fullscreen artifact' });
  expect(getComputedStyle(expanded).position).toBe('relative');
  expect(screen.getByRole('textbox', { name: 'SQL draft' })).toBe(editor);
  expect(editor.value).toBe('select 42');
  expect(screen.queryByRole('textbox', { name: 'Chat draft' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Navigation' })).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(expanded));
  await user.keyboard('{Escape}');
  expect(screen.getByRole('textbox', { name: 'Chat draft' })).toBe(chat);
  expect(chat.value).toBe('Preserved chat');
  expect(screen.getByRole('textbox', { name: 'SQL draft' })).toBe(editor);
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Expand' })),
  );
});
