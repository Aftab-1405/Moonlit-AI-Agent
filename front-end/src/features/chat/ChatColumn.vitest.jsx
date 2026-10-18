import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ChatColumn from '@/features/chat/ChatColumn';
import { createDarkTheme } from '@/theme';

const theme = createDarkTheme();

function renderChatColumn(overrides = {}) {
  const props = {
    showWelcomeState: true,
    user: { displayName: 'Aftab' },
    chatInputSharedProps: {
      sessionKey: 'draft-session',
      onSend: vi.fn(),
      onStop: vi.fn(),
      providerOptions: [],
    },
    showConversationPanel: false,
    setScrollContainerRef: vi.fn(),
    isPinnedToBottom: true,
    scrollToBottom: vi.fn(),
    messages: [],
    isConversationLoading: false,
    conversationLoadState: 'idle',
    handleRunQuery: vi.fn(),
    handleOpenCanvasArtifact: vi.fn(),
    guidedConfirmDialog: { open: false },
    handleGuidedCancel: vi.fn(),
    handleGuidedConfirm: vi.fn(),
    currentConversationId: null,
    conversationTitle: null,
    onRenameConversation: vi.fn(),
    isNarrowLayout: false,
    onOpenSidebar: vi.fn(),
    onOpenDatabase: vi.fn(),
    openSidebarButtonRef: { current: null },
    theme,
    ...overrides,
  };

  const view = render(
    <ThemeProvider theme={theme}>
      <ChatColumn {...props} />
    </ThemeProvider>,
  );
  return {
    ...view,
    rerenderChat(nextOverrides = {}) {
      view.rerender(
        <ThemeProvider theme={theme}>
          <ChatColumn {...props} {...nextOverrides} />
        </ThemeProvider>,
      );
    },
  };
}

describe('ChatColumn lifecycle', () => {
  it('anchors the welcome greeting to the bottom of the space above the composer', () => {
    renderChatColumn();

    const heading = screen.getByRole('heading', { level: 1 });
    const welcomeRegion = heading.parentElement;
    const welcomeRegionStyle = window.getComputedStyle(welcomeRegion);

    expect(welcomeRegionStyle.position).toBe('absolute');
    expect(welcomeRegionStyle.inset).toBe('0px');
    expect(welcomeRegionStyle.alignItems).toBe('flex-end');
  });

  it('uses a calm, static welcome greeting', () => {
    renderChatColumn();

    const headingStyle = window.getComputedStyle(screen.getByRole('heading', { level: 1 }));

    expect(headingStyle.animation).not.toMatch(/infinite/);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('What should we explore?');
  });

  it('keeps the toolbar and same composer mounted when the first message activates chat', async () => {
    const user = userEvent.setup();
    const view = renderChatColumn();
    const toolbar = screen.getByRole('banner', { name: 'Conversation header' });
    const input = screen.getByRole('textbox', { name: 'Message Moonlit' });
    await user.type(input, 'Keep this draft');

    view.rerenderChat({
      showWelcomeState: false,
      currentConversationId: 'conversation-1',
      conversationTitle: 'First conversation',
      conversationLoadState: 'ready',
    });

    expect(screen.getByRole('banner', { name: 'Conversation header' })).toBe(toolbar);
    expect(screen.getByRole('textbox', { name: 'Message Moonlit' })).toBe(input);
    expect(input.value).toBe('Keep this draft');
    expect(
      screen.getByRole('button', { name: /Rename conversation/ }).getAttribute('data-title-motion'),
    ).toBe('live');
  });

  it('keeps the composer stationary while the first response activates the conversation', () => {
    const view = renderChatColumn();
    const input = screen.getByRole('textbox', { name: 'Message Moonlit' });
    const stage = input.closest('[data-chat-placement]');
    const composerPositioner = input.closest('form').parentElement.parentElement;

    view.rerenderChat({
      showWelcomeState: false,
      showConversationPanel: true,
      chatInputSharedProps: {
        sessionKey: 'draft-session',
        isStreaming: true,
        onSend: vi.fn(),
        onStop: vi.fn(),
        providerOptions: [],
      },
      messages: [
        { id: 'user-1', role: 'user', text: 'Hello', status: 'done' },
        { id: 'assistant-1', role: 'assistant', text: '', status: 'waiting' },
      ],
    });

    expect(window.getComputedStyle(stage).transition).not.toContain('grid-template-rows');

    view.rerenderChat({
      showWelcomeState: false,
      showConversationPanel: true,
      currentConversationId: 'conversation-1',
      conversationTitle: 'First conversation',
      conversationLoadState: 'ready',
      chatInputSharedProps: {
        sessionKey: 'draft-session',
        isStreaming: true,
        onSend: vi.fn(),
        onStop: vi.fn(),
        providerOptions: [],
      },
      messages: [
        { id: 'user-1', role: 'user', text: 'Hello', status: 'done' },
        { id: 'assistant-1', role: 'assistant', text: 'Hi', status: 'streaming' },
      ],
    });

    expect(input.closest('[data-chat-placement]')).toBe(stage);
    expect(input.closest('form').parentElement.parentElement).toBe(composerPositioner);
    expect(window.getComputedStyle(stage).gridTemplateRows).toContain('minmax(0, 0fr)');
    expect(window.getComputedStyle(stage).transition).not.toContain('grid-template-rows');
    expect(composerPositioner.style.transform).toBe('');
  });

  it('keeps the send control mounted while its icon changes to stop', () => {
    const view = renderChatColumn();
    const sendButton = screen.getByRole('button', { name: 'Send message' });

    view.rerenderChat({
      chatInputSharedProps: {
        sessionKey: 'draft-session',
        isStreaming: true,
        onSend: vi.fn(),
        onStop: vi.fn(),
        providerOptions: [],
      },
    });

    const stopButton = screen.getByRole('button', { name: 'Stop generating response' });
    expect(stopButton).toBe(sendButton);
    expect(stopButton.querySelector('[data-control-icon="stop"]')).not.toBeNull();
  });

  it('does not animate an existing title when selecting another session', () => {
    const view = renderChatColumn();

    view.rerenderChat({
      chatInputSharedProps: {
        sessionKey: 'stored-session',
        onSend: vi.fn(),
        onStop: vi.fn(),
        providerOptions: [],
      },
      showWelcomeState: false,
      currentConversationId: 'stored-conversation',
      conversationTitle: null,
      conversationLoadState: 'loading',
    });

    view.rerenderChat({
      chatInputSharedProps: {
        sessionKey: 'stored-session',
        onSend: vi.fn(),
        onStop: vi.fn(),
        providerOptions: [],
      },
      showWelcomeState: false,
      currentConversationId: 'stored-conversation',
      conversationTitle: 'Stored conversation',
      conversationLoadState: 'ready',
    });

    expect(
      screen.getByRole('button', { name: /Rename conversation/ }).getAttribute('data-title-motion'),
    ).toBe('static');
  });

  it('restores drafts independently when the selected session changes', async () => {
    const user = userEvent.setup();
    const view = renderChatColumn();
    await user.type(screen.getByRole('textbox', { name: 'Message Moonlit' }), 'Draft A');

    view.rerenderChat({
      chatInputSharedProps: {
        sessionKey: 'session-b',
        onSend: vi.fn(),
        onStop: vi.fn(),
        providerOptions: [],
      },
    });
    expect(screen.getByRole('textbox', { name: 'Message Moonlit' }).value).toBe('');
    await user.type(screen.getByRole('textbox', { name: 'Message Moonlit' }), 'Draft B');

    view.rerenderChat();
    expect(screen.getByRole('textbox', { name: 'Message Moonlit' }).value).toBe('Draft A');
  });

  it('disables the composer while conversation history is loading', () => {
    renderChatColumn({
      showWelcomeState: false,
      showConversationPanel: true,
      isConversationLoading: true,
      conversationLoadState: 'loading',
      currentConversationId: 'conversation-a',
    });

    expect(screen.getByRole('textbox', { name: 'Message Moonlit' }).disabled).toBe(true);
  });

  it('keeps the composer disabled when conversation history fails to load', () => {
    renderChatColumn({
      showWelcomeState: false,
      showConversationPanel: true,
      isConversationLoading: false,
      conversationLoadState: 'error',
      currentConversationId: 'conversation-a',
    });

    expect(screen.getByRole('textbox', { name: 'Message Moonlit' }).disabled).toBe(true);
  });
});

it('provides New chat in an active conversation header and hides it on welcome', async () => {
  const user = userEvent.setup();
  const onNewChat = vi.fn();
  const view = renderChatColumn({ onNewChat });
  expect(screen.queryByRole('button', { name: 'New chat' })).toBeNull();
  view.rerenderChat({
    showWelcomeState: false,
    currentConversationId: 'active',
    conversationLoadState: 'ready',
  });
  await user.click(screen.getByRole('button', { name: 'New chat' }));
  expect(onNewChat).toHaveBeenCalledOnce();
});
