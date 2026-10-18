import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resumeAgent, sendMessage } from '@/api';
import { queryClient, queryKeys } from '@/api/queryClient';
import {
  CHAT_LOAD_STATUS,
  CHAT_STREAM_STATUS,
  createChatSession,
} from '@/hooks/chat-page/chatSessionModel';
import { useMessageStreaming } from '@/hooks/chat-page/useMessageStreaming';
import { MESSAGE_STATUS } from '@/utils/chatMessages';

vi.mock('@/api', () => ({
  resumeAgent: vi.fn(),
  sendMessage: vi.fn(),
}));

function createHookHarness({ loadStatus = CHAT_LOAD_STATUS.READY } = {}) {
  const sessionKey = 'conversation:conversation-a';
  let session = createChatSession({
    sessionKey,
    conversationId: 'conversation-a',
    loadStatus,
  });

  const getSession = (key) => (key === sessionKey ? session : null);
  const updateSession = (key, updater) => {
    if (key !== sessionKey) return;
    session = typeof updater === 'function' ? updater(session) : { ...session, ...updater };
  };
  const updateSessionMessages = (key, updater) => {
    if (key !== sessionKey) return;
    const messages = typeof updater === 'function' ? updater(session.messages) : updater;
    session = { ...session, messages };
  };

  const hookProps = {
    activeSessionKey: sessionKey,
    getSession,
    updateSession,
    updateSessionMessages,
    isSessionActive: () => true,
    navigate: vi.fn(),
    fetchConversations: vi.fn(),
    bindStreamingConversation: vi.fn(),
    settings: {},
  };

  return {
    getSession: () => session,
    hookProps,
    render: () => renderHook(() => useMessageStreaming(hookProps)),
  };
}

beforeEach(() => {
  queryClient.clear();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe('message stream session lifecycle', () => {
  it.each([
    ['error', false, CHAT_STREAM_STATUS.ERROR],
    ['agent_step_limit_reached', true, CHAT_STREAM_STATUS.PAUSED],
    ['agent_interrupt', true, CHAT_STREAM_STATUS.WAITING],
  ])('reports %s completion correctly to the composer', async (type, accepted, status) => {
    sendMessage.mockResolvedValue({
      headers: { get: () => null },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ type, message: 'Provider unavailable' })}\n\n`,
            ),
          );
          controller.close();
        },
      }),
    });
    const harness = createHookHarness();
    const { result } = harness.render();
    let outcome;
    await act(async () => {
      outcome = await result.current.handleSendMessage('Keep this prompt on failure');
    });
    expect(outcome).toBe(accepted);
    expect(harness.getSession().streamStatus).toBe(status);
  });

  it.each([
    true,
    false,
  ])('sends selected effort while respecting model reasoning support: %s', async (supported) => {
    queryClient.setQueryData(queryKeys.llmOptions, {
      capabilities: { chosen: { supports_reasoning: supported } },
    });
    sendMessage.mockResolvedValue({
      headers: { get: () => null },
      body: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
    });
    const harness = createHookHarness();
    harness.hookProps.settings = { enableReasoning: true, reasoningEffort: 'high' };
    const { result } = harness.render();
    await act(async () => {
      await result.current.handleSendMessage('Use the selected model', {
        provider: 'bedrock',
        model: 'chosen',
      });
    });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'bedrock',
        model: 'chosen',
        reasoningEffort: 'high',
        enableReasoning: supported,
      }),
      expect.any(AbortSignal),
    );
  });

  it('finalizes the cached session before aborting all streams on unmount', async () => {
    let requestSignal;
    sendMessage.mockImplementation(
      (_payload, signal) =>
        new Promise((_resolve, reject) => {
          requestSignal = signal;
          signal.addEventListener('abort', () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    const harness = createHookHarness();
    const { result, unmount } = harness.render();

    let sendResult;
    await act(async () => {
      sendResult = result.current.handleSendMessage('Keep my partial response');
      await Promise.resolve();
    });
    expect(harness.getSession().streamStatus).toBe(CHAT_STREAM_STATUS.STARTING);

    unmount();

    const stoppedSession = harness.getSession();
    expect(requestSignal.aborted).toBe(true);
    expect(stoppedSession.streamStatus).toBe(CHAT_STREAM_STATUS.STOPPED);
    expect(stoppedSession.messages.at(-1).status).toBe(MESSAGE_STATUS.STOPPED);
    await expect(sendResult).resolves.toBe(false);
  });

  it('preserves partial assistant content when unmounting a streaming session', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    );
    vi.stubGlobal('cancelAnimationFrame', (timerId) => window.clearTimeout(timerId));
    sendMessage.mockImplementation((_payload, signal) => {
      let readCount = 0;
      const reader = {
        read: vi.fn(() => {
          readCount += 1;
          if (readCount === 1) {
            return Promise.resolve({
              done: false,
              value: new TextEncoder().encode(
                'data: {"type":"token","content":"Partial response"}\n\n',
              ),
            });
          }
          return new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              const error = new Error('Aborted');
              error.name = 'AbortError';
              reject(error);
            });
          });
        }),
        cancel: vi.fn().mockResolvedValue(undefined),
        releaseLock: vi.fn(),
      };
      return Promise.resolve({
        headers: { get: () => null },
        body: { getReader: () => reader },
      });
    });
    const harness = createHookHarness();
    const { result, unmount } = harness.render();

    let sendResult;
    await act(async () => {
      sendResult = result.current.handleSendMessage('Stream a response');
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(harness.getSession().streamStatus).toBe(CHAT_STREAM_STATUS.STREAMING);
      expect(harness.getSession().messages.at(-1).text).toBe('Partial response');
    });

    unmount();

    const stoppedSession = harness.getSession();
    expect(stoppedSession.streamStatus).toBe(CHAT_STREAM_STATUS.STOPPED);
    expect(stoppedSession.messages.at(-1)).toMatchObject({
      text: 'Partial response',
      status: MESSAGE_STATUS.STOPPED,
    });
    await expect(sendResult).resolves.toBe(false);
  });

  it('does not append a turn while a persisted conversation is still loading', async () => {
    const reader = {
      read: vi.fn().mockResolvedValue({ done: true }),
      cancel: vi.fn().mockResolvedValue(undefined),
      releaseLock: vi.fn(),
    };
    sendMessage.mockResolvedValue({
      headers: { get: () => null },
      body: { getReader: () => reader },
    });
    const harness = createHookHarness({ loadStatus: CHAT_LOAD_STATUS.LOADING });
    const { result } = harness.render();

    let sendResult;
    await act(async () => {
      sendResult = await result.current.handleSendMessage('Do not lose this message');
    });

    expect(sendResult).toBe(false);
    expect(harness.getSession().messages).toEqual([]);
    expect(harness.getSession().streamStatus).toBe(CHAT_STREAM_STATUS.IDLE);
  });
});

describe('resumes during stream finalization', () => {
  it.each([
    'interrupt',
    'step limit',
  ])('queues a %s resume exactly once until the prior stream finishes', async (kind) => {
    let finish;
    const body = new ReadableStream({
      start(controller) {
        finish = () => controller.close();
      },
    });
    sendMessage.mockResolvedValue({ headers: { get: () => null }, body });
    resumeAgent.mockResolvedValue({
      headers: { get: () => null },
      body: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
    });
    const harness = createHookHarness();
    const { result } = harness.render();
    let sending;
    await act(async () => {
      sending = result.current.handleSendMessage('hello');
    });
    const resume = () =>
      kind === 'interrupt'
        ? result.current.handleResumeAgent({ approved: true, interrupt_id: 'approval' })
        : result.current.handleContinueTask({ task_mode: 'long_task' });
    let resuming;
    let duplicate;
    act(() => {
      resuming = resume();
      duplicate = resume();
    });
    expect(resumeAgent).not.toHaveBeenCalled();
    await act(async () => {
      finish();
      await sending;
      await resuming;
      await duplicate;
    });
    expect(resumeAgent).toHaveBeenCalledTimes(1);
    expect(resumeAgent.mock.calls[0][0]).toMatchObject({
      conversationId: 'conversation-a',
      resume:
        kind === 'interrupt'
          ? { approved: true, interrupt_id: 'approval' }
          : { continue_task: true },
    });
  });

  it.each(['stop', 'unmount'])('cancels the queued resume on %s', async (action) => {
    sendMessage.mockImplementation(
      (_payload, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const harness = createHookHarness();
    const { result, unmount } = harness.render();
    let sending;
    let resuming;
    act(() => {
      sending = result.current.handleSendMessage('hello');
      resuming = result.current.handleResumeAgent({ approved: true });
    });
    await act(async () => {
      if (action === 'stop') result.current.handleStopStreaming();
      else unmount();
      await sending;
      await expect(resuming).resolves.toBe(false);
    });
    expect(resumeAgent).not.toHaveBeenCalled();
  });
});
