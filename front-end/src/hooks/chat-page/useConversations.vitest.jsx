import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
