import { ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MessageList from '@/features/chat/MessageList';
import { createDarkTheme } from '@/theme';

const theme = createDarkTheme();

function renderMessageList(props = {}) {
  const baseProps = {
    sessionKey: 'session-a',
    messages: [],
    isLoadingConversation: false,
    conversationId: null,
    onRunQuery: vi.fn(),
    onOpenCanvasArtifact: vi.fn(),
    ...props,
  };

  const view = render(
    <ThemeProvider theme={theme}>
      <div data-chat-scroll-container="">
        <MessageList {...baseProps} />
      </div>
    </ThemeProvider>,
  );

  return {
    ...view,
    rerenderList(nextProps = {}) {
      view.rerender(
        <ThemeProvider theme={theme}>
          <div data-chat-scroll-container="">
            <MessageList {...baseProps} {...nextProps} />
          </div>
        </ThemeProvider>,
      );
    },
  };
}

describe('MessageList motion lifecycle', () => {
  it('animates messages appended to the ready session and keeps the assistant article mounted', async () => {
    const view = renderMessageList();
    const messages = [
      { id: 'user-live', role: 'user', text: 'Show revenue' },
      {
        id: 'assistant-live',
        role: 'assistant',
        text: '',
        steps: [],
        timeline: [],
        status: 'waiting',
      },
    ];

    view.rerenderList({ messages });

    const userArticle = screen.getByRole('article', { name: 'Your message' });
    const assistantArticle = screen.getByRole('article', { name: 'Moonlit response' });
    expect(userArticle.getAttribute('data-entry-motion')).toBe('live');
    expect(assistantArticle.getAttribute('data-entry-motion')).toBe('live');
    expect(
      screen
        .getByRole('status', { name: 'Moonlit is thinking' })
        .getAttribute('data-status-motion'),
    ).toBe('live');

    view.rerenderList({
      messages: [
        messages[0],
        {
          ...messages[1],
          text: 'Revenue increased.',
          timeline: [{ id: 'text-0', type: 'text', content: 'Revenue increased.' }],
          status: 'streaming',
        },
      ],
    });

    expect(screen.getByRole('article', { name: 'Moonlit response' })).toBe(assistantArticle);
    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Moonlit is thinking' })).toBeNull();
    });
    const firstTextChunk = screen.getByTestId('assistant-text-chunk');
    expect(firstTextChunk.getAttribute('data-content-motion')).toBe('live');

    view.rerenderList({
      messages: [
        messages[0],
        {
          ...messages[1],
          text: 'Revenue increased by 12%.',
          timeline: [{ id: 'text-0', type: 'text', content: 'Revenue increased by 12%.' }],
          status: 'streaming',
        },
      ],
    });

    expect(screen.getByTestId('assistant-text-chunk')).toBe(firstTextChunk);
  });

  it('does not animate stored messages when switching sessions', () => {
    const view = renderMessageList();

    view.rerenderList({
      sessionKey: 'session-history',
      conversationId: 'conversation-history',
      messages: [
        { id: 'stored-user', role: 'user', text: 'Stored question' },
        {
          id: 'stored-assistant',
          role: 'assistant',
          text: 'Stored answer',
          steps: [],
          timeline: [],
          status: 'done',
        },
      ],
    });

    expect(
      screen.getByRole('article', { name: 'Your message' }).getAttribute('data-entry-motion'),
    ).toBe('static');
    expect(
      screen.getByRole('article', { name: 'Moonlit response' }).getAttribute('data-entry-motion'),
    ).toBe('static');
    expect(screen.getByTestId('assistant-text-chunk').getAttribute('data-content-motion')).toBe(
      'static',
    );
  });

  it('animates a live reasoning group at one content boundary', () => {
    const view = renderMessageList();

    view.rerenderList({
      messages: [
        {
          id: 'assistant-reasoning',
          role: 'assistant',
          text: '',
          steps: [],
          timeline: [
            {
              id: 'thinking-0',
              type: 'thinking',
              content: 'Inspecting the available data',
              isComplete: false,
            },
          ],
          status: 'streaming',
        },
      ],
    });

    const reasoningBoundary = screen.getByTestId('assistant-thinking-step');
    expect(reasoningBoundary.getAttribute('data-content-motion')).toBe('live');
    expect(window.getComputedStyle(reasoningBoundary.firstElementChild).animation).not.toContain(
      '0.22s',
    );
  });

  it('cross-fades a live diagram artifact from generating to ready', async () => {
    const view = renderMessageList();
    const assistantMessage = {
      id: 'assistant-diagram',
      role: 'assistant',
      text: '',
      steps: [],
      timeline: [
        {
          id: 'diagram-skill',
          type: 'skill',
          skills: ['react-flow-diagram'],
          status: 'running',
        },
      ],
      status: 'streaming',
    };

    view.rerenderList({ messages: [assistantMessage] });

    expect(
      screen
        .getByRole('status', { name: 'Moonlit is building the diagram' })
        .getAttribute('data-artifact-motion'),
    ).toBe('live');

    view.rerenderList({
      messages: [
        {
          ...assistantMessage,
          text: '```diagram-flow\nexport default function Diagram() {}\n```',
          status: 'done',
        },
      ],
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'View diagram' }).getAttribute('data-artifact-motion'),
      ).toBe('live');
    });
  });

  it('reveals a terminal error notice without replacing the response article', () => {
    const view = renderMessageList();
    const assistantMessage = {
      id: 'assistant-error',
      role: 'assistant',
      text: '',
      steps: [],
      timeline: [],
      status: 'waiting',
    };

    view.rerenderList({ messages: [assistantMessage] });
    const responseArticle = screen.getByRole('article', { name: 'Moonlit response' });

    view.rerenderList({
      messages: [
        {
          ...assistantMessage,
          text: 'The request could not be completed.',
          timeline: [
            { id: 'error-text', type: 'text', content: 'The request could not be completed.' },
          ],
          status: 'error',
        },
      ],
    });

    expect(screen.getByRole('article', { name: 'Moonlit response' })).toBe(responseArticle);
    expect(responseArticle.getAttribute('data-response-state')).toBe('error');
    expect(screen.getByRole('alert').getAttribute('data-status-motion')).toBe('live');
  });
});

const historyMessages = (count, prefix = 'history') =>
  Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    role: 'user',
    text: `${prefix} message ${index}`,
  }));

describe('MessageList continuous history', () => {
  it('renders all loaded messages without transcript page controls', () => {
    renderMessageList({ messages: historyMessages(36) });
    expect(screen.getAllByRole('article')).toHaveLength(36);
    expect(screen.queryByRole('navigation', { name: 'Transcript pages' })).toBeNull();
    expect(screen.getByText('history message 0')).toBeTruthy();
    expect(screen.getByText('history message 35')).toBeTruthy();
  });

  it('preserves the live article when older messages are prepended without animating history', () => {
    const tail = { id: 'live', role: 'assistant', text: 'Working', status: 'streaming' };
    const messages = [...historyMessages(30, 'recent'), tail];
    const view = renderMessageList({ messages });
    const response = screen.getByRole('article', { name: 'Moonlit response' });
    view.rerenderList({ messages: [...historyMessages(30, 'older'), ...messages] });
    expect(screen.getByRole('article', { name: 'Moonlit response' })).toBe(response);
    expect(screen.getByText('older message 0').closest('article').dataset.entryMotion).toBe(
      'static',
    );
    view.rerenderList({
      messages: [
        ...historyMessages(30, 'older'),
        ...messages.slice(0, -1),
        { ...tail, text: 'Done', status: 'done' },
      ],
    });
    expect(screen.getByRole('article', { name: 'Moonlit response' })).toBe(response);
  });

  it('loads near the top once and preserves the visible anchor at response time', async () => {
    let finish;
    let capture;
    const onLoadOlder = vi.fn(({ beforePrepend }) => {
      capture = beforePrepend;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const messages = historyMessages(2, 'recent');
    const history = { hasMore: true, before: 'cursor', isLoading: false };
    const view = renderMessageList({ messages, history, onLoadOlder });
    const container = document.querySelector('[data-chat-scroll-container]');
    Object.defineProperties(container, {
      clientHeight: { value: 400 },
      scrollHeight: { value: 2000 },
    });
    container.getBoundingClientRect = () => ({ top: 0 });
    const anchor = document.querySelector('[data-message-id="recent-0"]');
    let anchorTop = -20;
    anchor.getBoundingClientRect = () => ({ top: anchorTop, bottom: anchorTop + 200 });
    container.scrollTop = 100;
    fireEvent.scroll(container);
    fireEvent.scroll(container);
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
    // The reader moves while fetching. Capture this offset when the response arrives.
    container.scrollTop = 150;
    anchorTop = -70;
    capture();
    anchorTop = 230;
    view.rerenderList({
      messages: [...historyMessages(2, 'older'), ...messages],
      history,
      onLoadOlder,
    });
    expect(container.scrollTop).toBe(450);
    expect(screen.getByText('recent message 0').closest('[data-message-id]')).toBe(anchor);
    await act(async () => finish(true));
  });

  it('exposes an inline retry after history failure', () => {
    const onLoadOlder = vi.fn().mockResolvedValue(false);
    renderMessageList({
      messages: historyMessages(2),
      onLoadOlder,
      history: { hasMore: true, error: 'Couldn’t load older messages.' },
    });
    fireEvent.scroll(document.querySelector('[data-chat-scroll-container]'));
    expect(onLoadOlder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading older messages' }));
    expect(onLoadOlder).toHaveBeenCalledOnce();
  });
});
