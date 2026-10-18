import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ConversationItem } from '@/features/sidebar-left/components/SidebarPrimitives';
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
