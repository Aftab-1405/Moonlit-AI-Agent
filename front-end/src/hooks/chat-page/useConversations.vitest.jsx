import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteConversation,
  getAllUserConversations,
  getConversation,
  renameConversation,
} from '@/api';
import { queryClient } from '@/api/queryClient';
import { useConversations } from '@/hooks/chat-page/useConversations';
import { useWorkspaceCanvas } from '@/hooks/chat-page/useWorkspaceCanvas';

vi.mock('@/api', () => ({
  deleteConversation: vi.fn(),
  getAllUserConversations: vi.fn(),
  getConversation: vi.fn(),
  renameConversation: vi.fn(),
}));

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function ConversationHarness() {
  const conversations = useConversations();
  const canvas = useWorkspaceCanvas({ sessionKey: conversations.activeSessionKey });
  return (
    <>
      <output aria-label="Selected SQL">
        {canvas.workspaceCanvasArtifact?.props?.initialQuery || ''}
      </output>
      <button type="button" onClick={() => canvas.handleOpenSqlEditor('select 42')}>
        Open working query
      </button>
      <output aria-label="Route conversation">{conversations.routeConversationId || 'new'}</output>
      <output aria-label="Current conversation">
        {conversations.currentConversationId || 'new'}
      </output>
      <output aria-label="Transcript">
        {conversations.messages.map((message) => message.text).join('|')}
      </output>
      <button type="button" onClick={() => conversations.loadOlderMessages()}>
        Load history
      </button>
      <output aria-label="History state">{JSON.stringify(conversations.history)}</output>
      <output aria-label="Conversation list">
        {conversations.conversations.map((conversation) => conversation.id).join('|')}
      </output>
      <button type="button" onClick={() => conversations.fetchConversations()}>
        Reload conversations
      </button>
      <button
        type="button"
        onClick={() => conversations.handleDeleteConversation('conversation-a')}
      >
        Delete A
      </button>
      <button type="button" onClick={conversations.startNewChat}>
        New chat
      </button>
      <button type="button" onClick={() => conversations.selectConversation('conversation-b')}>
        Select B
      </button>
      <button
        type="button"
        onClick={() =>
          conversations.updateSessionMessages(conversations.activeSessionKey, [
            { id: 'user-1', role: 'user', text: 'First prompt' },
          ])
        }
      >
        Send first prompt
      </button>
      <button
        type="button"
        onClick={() =>
          conversations.bindStreamingConversation(
            conversations.activeSessionKey,
            'created-conversation',
            'First prompt',
          )
        }
      >
        Receive conversation ID
      </button>
    </>
  );
}

function renderAt(path) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/chat/:conversationId?" element={<ConversationHarness />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  queryClient.clear();
  getAllUserConversations.mockResolvedValue({ status: 'success', conversations: [] });
  deleteConversation.mockResolvedValue({ status: 'success' });
  renameConversation.mockResolvedValue({ status: 'success' });
});

afterEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
});

describe('conversation session routing', () => {
  it('restores a newly bound chat workspace when Dashboard reopens its URL without route state', async () => {
    getConversation.mockResolvedValue({ status: 'success', conversation: { messages: [] } });
    const user = userEvent.setup();
    const first = renderAt('/chat');
    await user.click(screen.getByRole('button', { name: 'New chat' }));
    await user.click(screen.getByRole('button', { name: 'Send first prompt' }));
    await user.click(screen.getByRole('button', { name: 'Receive conversation ID' }));
    await user.click(screen.getByRole('button', { name: 'Open working query' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Selected SQL').textContent).toBe('select 42'),
    );
    first.unmount();
    renderAt('/chat/created-conversation');
    await waitFor(() =>
      expect(screen.getByLabelText('Selected SQL').textContent).toBe('select 42'),
    );
    expect(screen.getByLabelText('Transcript').textContent).toBe('First prompt');
  });

  it('keeps a deleted conversation out of the list after returning to chat', async () => {
    getAllUserConversations.mockResolvedValueOnce({
      status: 'success',
      conversations: [{ id: 'conversation-a' }, { id: 'conversation-b' }],
    });
    getAllUserConversations.mockResolvedValue({
      status: 'success',
      conversations: [{ id: 'conversation-b' }],
    });
    const user = userEvent.setup();
    const workspace = renderAt('/chat');
    await user.click(screen.getByRole('button', { name: 'Reload conversations' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Conversation list').textContent).toBe(
        'conversation-a|conversation-b',
      );
    });

    await user.click(screen.getByRole('button', { name: 'Delete A' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Conversation list').textContent).toBe('conversation-b');
    });
    workspace.unmount();
    renderAt('/chat');
    await user.click(screen.getByRole('button', { name: 'Reload conversations' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Conversation list').textContent).toBe('conversation-b');
    });
  });

  it('keeps the new-chat transcript visible before the first conversation URL commits', async () => {
    const user = userEvent.setup();
    renderAt('/chat');
    await user.click(screen.getByRole('button', { name: 'New chat' }));
    await user.click(screen.getByRole('button', { name: 'Send first prompt' }));
    expect(screen.getByLabelText('Transcript').textContent).toBe('First prompt');

    await user.click(screen.getByRole('button', { name: 'Receive conversation ID' }));

    expect(screen.getByLabelText('Route conversation').textContent).toBe('new');
    expect(screen.getByLabelText('Current conversation').textContent).toBe('created-conversation');
    expect(screen.getByLabelText('Transcript').textContent).toBe('First prompt');
  });

  it('starts a fresh chat immediately instead of waiting for a route-reset effect', async () => {
    const pendingLoad = deferred();
    getConversation.mockReturnValueOnce(pendingLoad.promise);
    const user = userEvent.setup();
    renderAt('/chat/conversation-a');

    expect(screen.getByLabelText('Route conversation').textContent).toBe('conversation-a');
    await user.click(screen.getByRole('button', { name: 'New chat' }));

    expect(screen.getByLabelText('Route conversation').textContent).toBe('new');
    expect(screen.getByLabelText('Current conversation').textContent).toBe('new');
    expect(screen.getByLabelText('Transcript').textContent).toBe('');
    pendingLoad.resolve({ status: 'success', conversation: { messages: [] } });
  });

  it('keeps a late conversation load in its owner session after selecting another chat', async () => {
    const conversationALoad = deferred();
    getConversation.mockImplementation((conversationId) => {
      if (conversationId === 'conversation-a') return conversationALoad.promise;
      return Promise.resolve({
        status: 'success',
        conversation: {
          messages: [{ sender: 'user', content: 'Message from B', timestamp: 2 }],
        },
      });
    });
    const user = userEvent.setup();
    renderAt('/chat/conversation-a');

    await user.click(screen.getByRole('button', { name: 'Select B' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Transcript').textContent).toBe('Message from B');
    });

    conversationALoad.resolve({
      status: 'success',
      conversation: {
        messages: [{ sender: 'user', content: 'Late message from A', timestamp: 1 }],
      },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Current conversation').textContent).toBe('conversation-b');
      expect(screen.getByLabelText('Transcript').textContent).toBe('Message from B');
    });
  });
});

describe('cursor transcript loading', () => {
  const response = (messages, before = null) => ({
    status: 'success',
    conversation: {
      messages,
      pagination: { has_more: Boolean(before), before },
    },
  });
  const message = (id, content) => ({ id, sender: 'user', content });

  it('merges older pages once without losing a concurrently appended live message', async () => {
    const older = deferred();
    getConversation
      .mockResolvedValueOnce(response([message('recent', 'Recent')], 'before-recent'))
      .mockReturnValueOnce(older.promise);
    const user = userEvent.setup();
    renderAt('/chat/conversation-a');
    await waitFor(() => expect(screen.getByLabelText('Transcript').textContent).toBe('Recent'));
    const cached = queryClient.getQueryData(['chatSessions', 'conversation:conversation-a']);
    await user.click(screen.getByRole('button', { name: 'Load history' }));
    await user.click(screen.getByRole('button', { name: 'Load history' }));
    expect(getConversation).toHaveBeenCalledTimes(2);
    expect(getConversation).toHaveBeenLastCalledWith('conversation-a', expect.any(AbortSignal), {
      limit: 30,
      before: 'before-recent',
    });
    act(() =>
      queryClient.setQueryData(['chatSessions', 'conversation:conversation-a'], (current) => ({
        ...current,
        messages: [
          ...current.messages,
          { id: 'live', role: 'assistant', text: 'Streaming', status: 'streaming' },
        ],
      })),
    );
    await act(async () =>
      older.resolve(response([message('old', 'Older'), message('recent', 'Duplicate')])),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Transcript').textContent).toBe('Older|Recent|Streaming'),
    );
    expect(
      queryClient.getQueryData(['chatSessions', 'conversation:conversation-a']).messages[1],
    ).toEqual(cached.messages[0]);
    await user.click(screen.getByRole('button', { name: 'Load history' }));
    expect(getConversation).toHaveBeenCalledTimes(2);
  });

  it('cancels history on a conversation switch and ignores a response that arrives afterward', async () => {
    const older = deferred();
    getConversation
      .mockResolvedValueOnce(response([message('a', 'A')], 'before-a'))
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(response([message('b', 'B')]));
    const user = userEvent.setup();
    renderAt('/chat/conversation-a');
    await waitFor(() => expect(screen.getByLabelText('Transcript').textContent).toBe('A'));
    await user.click(screen.getByRole('button', { name: 'Load history' }));
    const signal = getConversation.mock.calls[1][1];
    await user.click(screen.getByRole('button', { name: 'Select B' }));
    await waitFor(() => expect(screen.getByLabelText('Transcript').textContent).toBe('B'));
    expect(signal.aborted).toBe(true);
    await act(async () => older.resolve(response([message('old', 'Wrong chat')])));
    expect(screen.getByLabelText('Transcript').textContent).toBe('B');
    expect(
      queryClient.getQueryData(['chatSessions', 'conversation:conversation-a']).history.isLoading,
    ).toBe(false);
  });

  it('keeps the cursor after failure and allows retry', async () => {
    getConversation
      .mockResolvedValueOnce(response([message('a', 'A')], 'before-a'))
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(response([message('old', 'Older')]));
    const user = userEvent.setup();
    renderAt('/chat/conversation-a');
    await waitFor(() => expect(screen.getByLabelText('Transcript').textContent).toBe('A'));
    await user.click(screen.getByRole('button', { name: 'Load history' }));
    await waitFor(() =>
      expect(screen.getByLabelText('History state').textContent).toContain('Couldn’t load'),
    );
    expect(screen.getByLabelText('Transcript').textContent).toBe('A');
    await user.click(screen.getByRole('button', { name: 'Load history' }));
    await waitFor(() => expect(screen.getByLabelText('Transcript').textContent).toBe('Older|A'));
  });
});

it('restores loaded cursor history from the detail cache without refetching or losing the next boundary', async () => {
  const response = (id, text, before) => ({
    status: 'success',
    conversation: {
      messages: [{ id, sender: 'user', content: text }],
      pagination: { has_more: true, before },
    },
  });
  getConversation
    .mockResolvedValueOnce(response('recent', 'Recent', 'page-2'))
    .mockResolvedValueOnce(response('old', 'Older', 'page-1'));
  const user = userEvent.setup();
  const first = renderAt('/chat/conversation-a');
  await waitFor(() => expect(screen.getByLabelText('Transcript').textContent).toBe('Recent'));
  await user.click(screen.getByRole('button', { name: 'Load history' }));
  await waitFor(() => expect(screen.getByLabelText('Transcript').textContent).toBe('Older|Recent'));
  first.unmount();
  queryClient.removeQueries({ queryKey: ['chatSessions', 'conversation:conversation-a'] });
  renderAt('/chat/conversation-a');
  await waitFor(() => expect(screen.getByLabelText('Transcript').textContent).toBe('Older|Recent'));
  expect(screen.getByLabelText('History state').textContent).toContain('page-1');
  expect(getConversation).toHaveBeenCalledTimes(2);
});

it('does not recreate a deleted conversation when its pending history response arrives', async () => {
  const older = deferred();
  getConversation
    .mockResolvedValueOnce({
      status: 'success',
      conversation: {
        messages: [{ id: 'recent', sender: 'user', content: 'Recent' }],
        pagination: { has_more: true, before: 'page-2' },
      },
    })
    .mockReturnValueOnce(older.promise);
  const user = userEvent.setup();
  renderAt('/chat/conversation-a');
  await waitFor(() => expect(screen.getByLabelText('Transcript').textContent).toBe('Recent'));
  await user.click(screen.getByRole('button', { name: 'Load history' }));
  const signal = getConversation.mock.calls[1][1];
  await user.click(screen.getByRole('button', { name: 'Delete A' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Current conversation').textContent).toBe('new'),
  );
  await act(async () =>
    older.resolve({
      status: 'success',
      conversation: { messages: [{ id: 'old', sender: 'user', content: 'Deleted history' }] },
    }),
  );
  expect(signal.aborted).toBe(true);
  expect(queryClient.getQueryData(['chatSessions', 'conversation:conversation-a'])).toBeUndefined();
  expect(queryClient.getQueryData(['conversations', 'detail', 'conversation-a'])).toBeUndefined();
  expect(screen.getByLabelText('Transcript').textContent).toBe('');
});
