import { ThemeProvider } from '@mui/material/styles';
import { render, screen, waitFor } from '@testing-library/react';
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
      <MessageList {...baseProps} />
    </ThemeProvider>,
  );

  return {
    ...view,
    rerenderList(nextProps = {}) {
      view.rerender(
        <ThemeProvider theme={theme}>
          <MessageList {...baseProps} {...nextProps} />
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
