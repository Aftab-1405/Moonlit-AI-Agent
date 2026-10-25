import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
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
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ThemeProvider theme={createDarkTheme()}>
      <Sidebar {...props} {...extra} />
    </ThemeProvider>
  </QueryClientProvider>
);
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('highlights only the hovered rail trigger when moving from Home to Dashboard', () => {
  vi.useFakeTimers();
  const original = window.matchMedia;
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...original(query),
    matches: query.includes('pointer: fine'),
  }));
  render(show({ open: false }));
  const home = screen.getByRole('button', { name: 'Home' });
  const dashboard = screen.getByRole('button', { name: 'Dashboard', exact: true });
  fireEvent.pointerEnter(home, { pointerType: 'mouse' });
  act(() => vi.advanceTimersByTime(100));
  expect(screen.getByRole('region', { name: 'Sidebar panel' })).toBeTruthy();
  expect(home.getAttribute('aria-current')).toBe('true');
  expect(dashboard.hasAttribute('aria-current')).toBe(false);
  fireEvent.pointerLeave(home);
  fireEvent.pointerEnter(dashboard, { pointerType: 'mouse' });
  act(() => vi.advanceTimersByTime(300));
  expect(dashboard.getAttribute('aria-current')).toBe('true');
  expect(home.hasAttribute('aria-current')).toBe(false);
  fireEvent.keyDown(dashboard, { key: 'Escape' });
  expect(dashboard.hasAttribute('aria-current')).toBe(false);
  expect(home.hasAttribute('aria-current')).toBe(false);
});

it('moves the active highlight from Home when a pinned sidebar changes sections', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return show({ open, onToggleOpen: () => setOpen((value) => !value) });
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Home' }));
  const home = screen.getByRole('button', { name: 'Home' });
  expect(home.getAttribute('aria-current')).toBe('true');
  for (const label of ['Database', 'Dashboard', 'Search chats']) {
    fireEvent.click(screen.getByRole('button', { name: label, exact: true }));
    const rail = screen.getByRole('group', { name: 'Navigation rail' });
    expect(
      within(rail).getByRole('button', { name: label, exact: true }).getAttribute('aria-current'),
    ).toBe('true');
    expect(home.hasAttribute('aria-current')).toBe(false);
    expect(rail.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
  }
  fireEvent.click(screen.getByRole('button', { name: 'Close sidebar panel' }));
  expect(screen.queryByRole('region', { name: 'Sidebar panel' })).toBeNull();
  expect(home.hasAttribute('aria-current')).toBe(false);
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
  await user.click(within(rail).getByRole('button', { name: 'Home' }));
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
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Home' }));
});

it('keeps inline account actions in keyboard tab order', async () => {
  const user = userEvent.setup();
  render(show());
  await user.click(screen.getByRole('button', { name: 'Open Demo User profile' }));
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close sidebar panel' }));
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Settings' }));
  await user.keyboard('{ArrowDown}');
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Sign out' }));
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
  fireEvent.pointerEnter(screen.getByRole('button', { name: 'Home' }), { pointerType: 'mouse' });
  act(() => vi.advanceTimersByTime(100));
  const options = screen.getByRole('button', { name: 'Options for Monthly revenue' });
  fireEvent.pointerDown(options);
  fireEvent.click(options);
  const rename = screen.getByRole('menuitem', { name: 'Rename' });
  fireEvent.pointerDown(rename);
  fireEvent.click(rename);
  act(() => vi.advanceTimersByTime(300));
  expect(screen.getByRole('textbox', { name: 'Conversation title' }).value).toBe('Monthly revenue');
  expect(screen.getByRole('button', { name: 'Home' })).toBeTruthy();
});

it('bounds history pages, searches the entire history, and reveals the current chat', async () => {
  const user = userEvent.setup();
  const conversations = Array.from({ length: 105 }, (_, index) => ({
    id: `chat-${index}`,
    title: `Chat ${index}`,
  }));
  const onSelectConversation = vi.fn();
  render(show({ conversations, currentConversationId: 'chat-104', onSelectConversation }));
  const panel = screen.getByRole('region', { name: 'Sidebar panel' });
  expect(within(panel).getAllByRole('listitem')).toHaveLength(40);
  const next = screen.getByRole('button', { name: 'Next chats' });
  next.focus();
  await user.keyboard('{Enter}{Enter}');
  expect(within(panel).getAllByRole('listitem')).toHaveLength(25);
  expect(document.activeElement).toBe(next);
  expect(next.getAttribute('aria-disabled')).toBe('true');
  await user.click(screen.getByRole('button', { name: 'Previous chats' }));
  await user.click(screen.getByRole('button', { name: 'Show current chat' }));
  await user.click(screen.getByRole('button', { name: 'Open Chat 104', exact: true }));
  expect(onSelectConversation).toHaveBeenCalledWith('chat-104');
  await user.click(screen.getByRole('button', { name: 'Search chats' }));
  await user.type(screen.getByRole('textbox', { name: 'Search chats' }), 'Chat 99');
  expect(within(panel).getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Open Chat 99', exact: true })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Show current chat' }));
  expect(screen.getByRole('button', { name: 'Open Chat 104', exact: true })).toBeTruthy();
});

it('keeps later-page inline renaming available and prevents paging away while editing', async () => {
  const user = userEvent.setup();
  const conversations = Array.from({ length: 85 }, (_, index) => ({
    id: `chat-${index}`,
    title: `Chat ${index}`,
  }));
  const onRenameConversation = vi.fn().mockResolvedValue(true);
  render(show({ conversations, onRenameConversation }));
  await user.click(screen.getByRole('button', { name: 'Next chats' }));
  await user.click(screen.getByRole('button', { name: 'Options for Chat 40' }));
  await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
  const input = screen.getByRole('textbox', { name: 'Conversation title' });
  await user.clear(input);
  await user.type(input, 'Renamed');
  await user.click(screen.getByRole('button', { name: 'Next chats' }));
  expect(screen.getByRole('textbox', { name: 'Conversation title' })).toBe(input);
  await user.click(screen.getByRole('button', { name: 'Save conversation title' }));
  expect(onRenameConversation).toHaveBeenCalledWith('chat-40', 'Renamed');
});

it('keeps the current chat visible when revealing it from a collapsed hover preview', () => {
  vi.useFakeTimers();
  const original = window.matchMedia;
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...original(query),
    matches: query.includes('pointer: fine'),
  }));
  const conversations = Array.from({ length: 85 }, (_, index) => ({
    id: `chat-${index}`,
    title: `Chat ${index}`,
  }));
  render(show({ open: false, conversations, currentConversationId: 'chat-84' }));
  fireEvent.pointerEnter(screen.getByRole('button', { name: 'Home' }), { pointerType: 'mouse' });
  act(() => vi.advanceTimersByTime(100));
  fireEvent.click(screen.getByRole('button', { name: 'Show current chat' }));
  expect(screen.getByRole('button', { name: 'Open Chat 84', exact: true })).toBeTruthy();
});

it.each([
  'Search chats',
  'Dashboard',
  'Database',
  'Open Demo User profile',
])('opens the %s hover preview without creating a tooltip', (label) => {
  vi.useFakeTimers();
  const original = window.matchMedia;
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...original(query),
    matches: query.includes('pointer: fine'),
  }));
  render(show({ open: false }));
  const trigger = screen.getByRole('button', { name: label, exact: true });
  // Rail labels are accessible names; the preview supplies visual context.
  fireEvent.mouseOver(trigger);
  act(() => vi.advanceTimersByTime(200));
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
  act(() => vi.advanceTimersByTime(100));
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.queryByRole('tooltip')).toBeNull();
  const panel = screen.getByRole('region', { name: 'Sidebar panel' });
  fireEvent.pointerLeave(trigger);
  fireEvent.pointerEnter(panel);
  act(() => vi.advanceTimersByTime(200));
  expect(screen.getByRole('region', { name: 'Sidebar panel' })).toBe(panel);
});

it('keeps rail buttons labelled without popups during sustained hover and keyboard focus', () => {
  vi.useFakeTimers();
  render(show({ open: false }));
  for (const label of [
    'Home',
    'Search chats',
    'Dashboard',
    'Database',
    'Mindmap',
    'Open Demo User profile',
  ]) {
    const button = screen.getByRole('button', { name: label, exact: true });
    fireEvent.mouseOver(button);
    if (!button.disabled) button.focus();
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(button.getAttribute('title')).toBeNull();
  }
});

it('replaces History with Dashboard and keeps full navigation explicit', async () => {
  const user = userEvent.setup();
  const onOpenDashboard = vi.fn();
  render(show({ onOpenDashboard, isConnected: true, currentDatabase: 'analytics' }));
  expect(screen.queryByRole('button', { name: 'History', exact: true })).toBeNull();
  const dashboard = screen.getByRole('button', { name: 'Dashboard', exact: true });
  expect(within(dashboard).getByTestId('DashboardOutlinedIcon')).toBeTruthy();
  await user.click(dashboard);
  expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
  expect(screen.getByText('Connected to analytics')).toBeTruthy();
  expect(onOpenDashboard).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Open full dashboard' }));
  expect(onOpenDashboard).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'Home', exact: true }));
  expect(screen.getByRole('button', { name: 'Open Costs', exact: true })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Open Demo User profile' }));
  expect(screen.queryByRole('menuitem', { name: 'Dashboard' })).toBeNull();
});

it('keeps Home chats and Dashboard reachable in the mobile drawer', async () => {
  const original = window.matchMedia;
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...original(query),
    matches: query.includes('max-width'),
  }));
  const user = userEvent.setup();
  const onMobileClose = vi.fn();
  const onOpenDashboard = vi.fn();
  render(show({ mobileOpen: true, onMobileClose, onOpenDashboard }));
  await user.click(screen.getByRole('button', { name: 'Dashboard', exact: true }));
  expect(screen.getByRole('button', { name: 'Open full dashboard' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Home', exact: true }));
  expect(screen.getByRole('button', { name: 'Open Costs', exact: true })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Dashboard', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Open full dashboard' }));
  expect(onMobileClose).toHaveBeenCalledOnce();
  expect(onOpenDashboard).toHaveBeenCalledOnce();
});

it('previews database details without switching and pins the panel before opening management', () => {
  vi.useFakeTimers();
  const original = window.matchMedia;
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...original(query),
    matches: query.includes('pointer: fine'),
  }));
  const onDatabaseSwitch = vi.fn();
  const onOpenDbModal = vi.fn();
  const onToggleOpen = vi.fn();
  const panelProps = {
    isConnected: true,
    currentDatabase: 'sales',
    dbType: 'postgresql',
    currentSchema: 'public',
    availableDatabases: ['sales', 'analytics'],
    onDatabaseSwitch,
    onOpenDbModal,
    onToggleOpen,
  };
  const view = render(show({ ...panelProps, open: false }));
  fireEvent.pointerEnter(screen.getByRole('button', { name: 'Database', exact: true }), {
    pointerType: 'mouse',
  });
  act(() => vi.advanceTimersByTime(100));
  expect(screen.getByText('PostgreSQL')).toBeTruthy();
  expect(screen.getByText('public')).toBeTruthy();
  expect(onDatabaseSwitch).not.toHaveBeenCalled();
  expect(onOpenDbModal).not.toHaveBeenCalled();
  const action = screen.getByRole('button', { name: 'Manage connection' });
  fireEvent.focus(action);
  expect(onToggleOpen).toHaveBeenCalledOnce();
  view.rerender(show({ ...panelProps, open: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Manage connection' }));
  expect(onOpenDbModal).toHaveBeenCalledOnce();
});

it('offers connection setup in the mobile database panel', () => {
  const original = window.matchMedia;
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...original(query),
    matches: query.includes('max-width'),
  }));
  const onOpenDbModal = vi.fn();
  render(show({ mobileOpen: true, isConnected: false, onOpenDbModal }));
  fireEvent.click(screen.getByRole('button', { name: 'Database', exact: true }));
  expect(screen.getByText('Not connected')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Connect database' }));
  expect(onOpenDbModal).toHaveBeenCalledOnce();
});

it('keeps conversation controls mounted while initial data resolves and preserves search on refresh', () => {
  const view = render(show({ conversations: [], isConversationsLoading: true }));
  const footer = screen.getByRole('navigation', { name: 'Conversation pages' });
  expect(screen.getByRole('status').textContent).toBe('Loading recent conversations');
  expect(document.querySelectorAll('[data-sidebar-skeleton]').length).toBe(9);
  fireEvent.click(screen.getByRole('button', { name: 'Search chats' }));
  const input = screen.getByRole('textbox', { name: 'Search chats' });
  fireEvent.change(input, { target: { value: 'revenue' } });
  expect(screen.getByRole('status').textContent).toBe('Loading conversations');
  view.rerender(show({ isConversationsLoading: true }));
  expect(screen.getByRole('navigation', { name: 'Conversation pages' })).toBe(footer);
  expect(screen.getByRole('textbox', { name: 'Search chats' })).toBe(input);
  expect(input.value).toBe('revenue');
  expect(screen.getByRole('button', { name: 'Open Monthly revenue' })).toBeTruthy();
  expect(document.querySelector('[data-sidebar-skeleton]')).toBeNull();
});
