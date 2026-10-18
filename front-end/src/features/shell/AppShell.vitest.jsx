import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import AppShell from '@/features/shell/AppShell';
import { createDarkTheme } from '@/theme';

const theme = createDarkTheme();

function StatefulChatProbe() {
  const [value, setValue] = useState('');
  return (
    <input
      aria-label="Chat state probe"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}

describe('AppShell responsive lifecycle', () => {
  it('makes the covered mobile chat inert and restores its existing state on close', async () => {
    const user = userEvent.setup();
    const props = {
      sidebarSlot: <div>Sidebar</div>,
      chatSlot: <StatefulChatProbe />,
      workspaceSlot: <button>Artifact action</button>,
      sidebarOpen: false,
      canvasWidth: 480,
      isNarrowLayout: true,
      isResizingCanvas: false,
    };
    const shell = (canvasOpen) => (
      <ThemeProvider theme={theme}>
        <AppShell {...props} canvasOpen={canvasOpen} />
      </ThemeProvider>
    );
    const view = render(shell(false));
    const probe = screen.getByRole('textbox', { name: 'Chat state probe' });
    await user.type(probe, 'keep this draft');

    view.rerender(shell(true));
    expect(screen.queryByRole('textbox', { name: 'Chat state probe' })).toBeNull();
    expect(probe.closest('main').hasAttribute('inert')).toBe(true);
    expect(screen.getByRole('button', { name: 'Artifact action' })).toBeTruthy();

    view.rerender(shell(false));
    expect(screen.getByRole('textbox', { name: 'Chat state probe' })).toBe(probe);
    expect(probe.value).toBe('keep this draft');
    expect(probe.closest('main').hasAttribute('inert')).toBe(false);
  });

  it('preserves the chat subtree when crossing the narrow breakpoint', async () => {
    const user = userEvent.setup();
    const commonProps = {
      sidebarSlot: <div>Sidebar</div>,
      chatSlot: <StatefulChatProbe />,
      workspaceSlot: <div>Workspace</div>,
      sidebarOpen: true,
      canvasOpen: false,
      canvasWidth: 480,
      isResizingCanvas: false,
    };
    const view = render(
      <ThemeProvider theme={theme}>
        <AppShell {...commonProps} isNarrowLayout={false} />
      </ThemeProvider>,
    );
    const probe = screen.getByRole('textbox', { name: 'Chat state probe' });
    await user.type(probe, 'preserved');

    view.rerender(
      <ThemeProvider theme={theme}>
        <AppShell {...commonProps} isNarrowLayout />
      </ThemeProvider>,
    );

    expect(screen.getByRole('textbox', { name: 'Chat state probe' })).toBe(probe);
    expect(probe.value).toBe('preserved');
  });
});
