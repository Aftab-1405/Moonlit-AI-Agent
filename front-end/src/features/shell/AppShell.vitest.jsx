import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
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
  it('applies desktop dimensions immediately and retains artifact state through resizing and fullscreen', async () => {
    const user = userEvent.setup();
    const shell = (overrides = {}) => (
      <ThemeProvider theme={theme}>
        <AppShell
          sidebarSlot={<div>Sidebar</div>}
          chatSlot={<div>Chat</div>}
          workspaceSlot={<StatefulChatProbe />}
          sidebarOpen={false}
          canvasOpen
          canvasWidth={480}
          isNarrowLayout={false}
          isResizingCanvas={false}
          {...overrides}
        />
      </ThemeProvider>
    );
    const view = render(shell());
    const panel = screen.getByRole('region', { name: 'Workspace canvas' }).parentElement;
    const sidebar = screen.getByLabelText('Sidebar column').parentElement;
    const draft = screen.getByRole('textbox');
    await user.type(draft, 'select 1');
    view.rerender(shell({ sidebarOpen: true, canvasWidth: 520, isResizingCanvas: true }));
    expect(panel.style.width).toBe('520px');
    expect(sidebar.style.width).toBe('344px');
    view.rerender(shell({ sidebarOpen: true, canvasFullscreen: true }));
    expect(panel.style.width).toBe('calc(100% - 344px)');
    expect(screen.getByRole('textbox')).toBe(draft);
    expect(draft.value).toBe('select 1');
    view.rerender(shell({ canvasOpen: false }));
    expect(panel.style.width).toBe('0px');
    expect(panel.hasAttribute('inert')).toBe(true);
  });

  it('makes the covered mobile chat inert and restores its existing state on close', async () => {
    const user = userEvent.setup();
    const props = {
      sidebarSlot: <div>Sidebar</div>,
      chatSlot: <StatefulChatProbe />,
      workspaceSlot: <button type="button">Artifact action</button>,
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

it('keeps the application rail interactive while settings covers mounted chat and artifacts', async () => {
  const user = userEvent.setup();
  const navigation = vi.fn();
  const shell = (settingsOpen) => (
    <ThemeProvider theme={theme}>
      <AppShell
        settingsOpen={settingsOpen}
        sidebarOpen
        canvasOpen
        canvasWidth={480}
        sidebarSlot={
          <button type="button" onClick={navigation}>
            Home navigation
          </button>
        }
        chatSlot={<StatefulChatProbe />}
        workspaceSlot={<input aria-label="SQL draft" defaultValue="select 42" />}
      />
    </ThemeProvider>
  );
  const view = render(shell(false));
  const chat = screen.getByRole('textbox', { name: 'Chat state probe' });
  const sql = screen.getByRole('textbox', { name: 'SQL draft' });
  await user.type(chat, 'keep my draft');
  view.rerender(shell(true));
  expect(screen.getByLabelText('Sidebar column').parentElement.style.width).toBe('52px');
  expect(chat.closest('main').hasAttribute('inert')).toBe(true);
  expect(screen.queryByRole('textbox', { name: 'SQL draft' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Home navigation' }));
  expect(navigation).toHaveBeenCalledOnce();
  view.rerender(shell(false));
  expect(screen.getByRole('textbox', { name: 'Chat state probe' })).toBe(chat);
  expect(chat.value).toBe('keep my draft');
  expect(screen.getByRole('textbox', { name: 'SQL draft' })).toBe(sql);
  expect(screen.getByLabelText('Sidebar column').parentElement.style.width).toBe('344px');
});
