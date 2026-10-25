import { ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ConversationItem,
  SidebarNavItem,
} from '@/features/sidebar-left/components/SidebarPrimitives';
import { createDarkTheme } from '@/theme';

const theme = createDarkTheme();

function renderConversationItem(isActive) {
  const props = {
    conv: { id: 'conversation-a', title: 'Conversation A' },
    activity: { streamStatus: 'streaming', unreadActivity: null },
    isActive,
    onSelect: vi.fn(),
    onDelete: vi.fn(),
    onRenameStart: vi.fn(),
    renameSurface: 'main',
  };
  const view = render(
    <ThemeProvider theme={theme}>
      <ul>
        <ConversationItem {...props} />
      </ul>
    </ThemeProvider>,
  );
  return {
    ...view,
    rerenderActive(nextIsActive) {
      view.rerender(
        <ThemeProvider theme={theme}>
          <ul>
            <ConversationItem {...props} isActive={nextIsActive} />
          </ul>
        </ThemeProvider>,
      );
    },
  };
}

it('shows generating activity only when the streaming conversation is in the background', () => {
  const view = renderConversationItem(true);

  expect(screen.queryByRole('status', { name: 'Generating response' })).toBeNull();
  expect(view.container.querySelector('[data-conversation-activity="generating"]')).toBeNull();

  view.rerenderActive(false);
  const activity = screen.getByRole('status', {
    name: 'Generating response for Conversation A',
  });
  expect(activity.closest('button')).toBeNull();
  expect(view.container.querySelector('[data-conversation-activity="generating"]')).not.toBeNull();
});

afterEach(() => vi.useRealTimers());

it('keeps navigation labelled without hover tooltips in either sidebar state', () => {
  vi.useFakeTimers();
  const item = (expanded) => (
    <ThemeProvider theme={theme}>
      <SidebarNavItem label="History" isCollapsed expanded={expanded} />
    </ThemeProvider>
  );
  const view = render(item(false));
  const button = screen.getByRole('button', { name: 'History' });
  fireEvent.mouseOver(button);
  act(() => vi.advanceTimersByTime(3000));
  expect(screen.queryByRole('tooltip')).toBeNull();
  view.rerender(item(true));
  expect(button.getAttribute('aria-label')).toBe('History');
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(screen.queryByRole('tooltip')).toBeNull();
});
