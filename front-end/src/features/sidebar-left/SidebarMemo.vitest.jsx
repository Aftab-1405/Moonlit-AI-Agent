import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { createDarkTheme } from '@/theme';
import Sidebar from './index';

const renders = vi.hoisted(() => vi.fn());
vi.mock('./components/SidebarPrimitives', async (importOriginal) => {
  const actual = await importOriginal();
  const { memo } = await import('react');
  return {
    ...actual,
    ConversationItem: memo(function TrackedConversationItem(props) {
      renders(props.conv.id);
      return <actual.ConversationItem {...props} />;
    }),
  };
});

it('skips unaffected rows during rename typing and activity changes', () => {
  const theme = createDarkTheme();
  const conversations = [
    { id: 'a', title: 'First' },
    { id: 'b', title: 'Second' },
  ];
  const onSelectConversation = vi.fn();
  const onRenameConversation = vi.fn();
  const show = (activity = {}) => (
    <ThemeProvider theme={theme}>
      <Sidebar
        conversations={conversations}
        conversationActivity={activity}
        onSelectConversation={onSelectConversation}
        onRenameConversation={onRenameConversation}
      />
    </ThemeProvider>
  );
  const view = render(show());
  renders.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Options for First' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Conversation title' }), {
    target: { value: 'Changed title' },
  });
  expect(renders.mock.calls.every(([id]) => id === 'a')).toBe(true);
  renders.mockClear();
  view.rerender(show({ a: { status: 'generating' } }));
  expect(renders.mock.calls).toEqual([['a']]);
});
