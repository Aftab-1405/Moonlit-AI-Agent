import { useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { createDarkTheme } from '@/theme';
import Sidebar from './index';

const props = {
  conversations: [
    { id: 'revenue', title: 'Monthly revenue' },
    { id: 'cost', title: 'Costs' },
  ],
  currentConversationId: 'revenue',
  user: { displayName: 'Demo User' },
};
const show = (extra = {}) => (
  <ThemeProvider theme={createDarkTheme()}>
    <Sidebar {...props} {...extra} />
  </ThemeProvider>
);
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('switches search, history and account actions inside one persistent panel', async () => {
  const user = userEvent.setup();
  const onSelectConversation = vi.fn();
  const onOpenSettings = vi.fn();
  render(show({ onSelectConversation, onOpenSettings }));
  const panel = screen.getByRole('region', { name: 'Sidebar panel' });
  const rail = screen.getByRole('group', { name: 'Navigation rail' });
  await user.click(within(rail).getByRole('button', { name: 'Search chats' }));
  const search = within(panel).getByRole('textbox', { name: 'Search chats' });
  expect(document.activeElement).toBe(search);
  await user.type(search, 'revenue');
  expect(within(panel).queryByRole('button', { name: 'Open Costs', exact: true })).toBeNull();
  await user.click(
    within(panel).getByRole('button', { name: 'Open Monthly revenue', exact: true }),
  );
  expect(onSelectConversation).toHaveBeenCalledWith('revenue');
  await user.click(within(rail).getByRole('button', { name: 'History' }));
  expect(within(panel).getByRole('button', { name: 'Open Costs', exact: true })).toBeTruthy();
  await user.click(within(rail).getByRole('button', { name: 'Open Demo User profile' }));
  await user.click(within(panel).getByRole('menuitem', { name: 'Settings' }));
  expect(onOpenSettings).toHaveBeenCalledOnce();
  expect(screen.getByRole('region', { name: 'Sidebar panel' })).toBe(panel);
  expect(screen.queryByRole('button', { name: 'New chat' })).toBeNull();
});

it('previews on fine-pointer hover without pinning or stealing focus, and closes on Escape', () => {
  vi.useFakeTimers();
  const original = window.matchMedia;
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...original(query),
    matches: query.includes('pointer: fine'),
  }));
  const onToggleOpen = vi.fn();
  render(show({ open: false, onToggleOpen }));
  const trigger = screen.getByRole('button', { name: 'Search chats' });
  trigger.focus();
  fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
  act(() => vi.advanceTimersByTime(100));
  const panel = screen.getByRole('region', { name: 'Sidebar panel' });
  expect(document.activeElement).toBe(trigger);
  expect(onToggleOpen).not.toHaveBeenCalled();
  fireEvent.pointerLeave(trigger);
  fireEvent.pointerEnter(panel);
  act(() => vi.advanceTimersByTime(200));
  expect(screen.getByRole('textbox', { name: 'Search chats' })).toBeTruthy();
  fireEvent.keyDown(trigger, { key: 'Escape' });
  expect(screen.queryByRole('region', { name: 'Sidebar panel' })).toBeNull();
});

it('restores focus to Home when closing an initially expanded panel', async () => {
  const user = userEvent.setup();
  const view = render(show());
  await user.click(screen.getByRole('button', { name: 'Close sidebar panel' }));
  view.rerender(show({ open: false }));
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Expand sidebar' }));
});

it('keeps inline account actions in keyboard tab order', async () => {
  const user = userEvent.setup();
  render(show());
  await user.click(screen.getByRole('button', { name: 'Open Demo User profile' }));
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close sidebar panel' }));
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Dashboard' }));
  await user.keyboard('{ArrowDown}');
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Settings' }));
});

it('pins a hover preview before opening its portalled rename menu', () => {
  vi.useFakeTimers();
  const original = window.matchMedia;
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...original(query),
    matches: query.includes('pointer: fine'),
  }));
  function Harness() {
    const [open, setOpen] = useState(false);
    return show({
      open,
      onToggleOpen: () => setOpen((value) => !value),
      onRenameConversation: vi.fn(),
    });
  }
  render(<Harness />);
  fireEvent.pointerEnter(screen.getByRole('button', { name: 'History' }), { pointerType: 'mouse' });
  act(() => vi.advanceTimersByTime(100));
  const options = screen.getByRole('button', { name: 'Options for Monthly revenue' });
  fireEvent.pointerDown(options);
  fireEvent.click(options);
  const rename = screen.getByRole('menuitem', { name: 'Rename' });
  fireEvent.pointerDown(rename);
  fireEvent.click(rename);
  act(() => vi.advanceTimersByTime(300));
  expect(screen.getByRole('textbox', { name: 'Conversation title' }).value).toBe('Monthly revenue');
  expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeTruthy();
});
