import { useSyncExternalStore } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resumeAgent, sendMessage } from '@/api';
import { requestDashboardNavigation } from '@/features/dashboard/dashboardModel';
import {
  CHAT_LOAD_STATUS,
  CHAT_STREAM_STATUS,
  createChatSession,
} from '@/hooks/chat-page/chatSessionModel';
import { useChatPageGuidedConfirm } from '@/hooks/chat-page/useChatPageGuidedConfirm';
import { useChatPageStreaming } from '@/hooks/chat-page/useChatPageStreaming';
import { MESSAGE_STATUS } from '@/utils/chatMessages';

vi.mock('@/api', () => ({
  resumeAgent: vi.fn(),
  sendMessage: vi.fn(),
}));

function createHarness() {
  const sessions = new Map(
    ['a', 'b', 'c'].map((id) => [
      id,
      createChatSession({
        sessionKey: id,
        conversationId: id,
        loadStatus: CHAT_LOAD_STATUS.READY,
      }),
    ]),
  );
  let activeKey = 'a';
  const signals = new Map();
  sendMessage.mockImplementation(
    (payload, signal) =>
      new Promise((_resolve, reject) => {
        signals.set(payload.conversationId, signal);
        signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }),
  );
  const getSession = (key) => sessions.get(key);
  const listeners = new Set();
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const updateSession = (key, updater) => {
    sessions.set(key, updater(getSession(key)));
    listeners.forEach((listener) => listener());
  };
  const props = {
    getSession,
    updateSession,
    updateSessionMessages: (key, updater) => {
      const session = getSession(key);
      updateSession(key, () => ({
        ...session,
        messages: typeof updater === 'function' ? updater(session.messages) : updater,
      }));
    },
    isSessionActive: (key) => key === activeKey,
    navigate: vi.fn(),
    fetchConversations: vi.fn(),
    bindStreamingConversation: vi.fn(),
    settings: {},
    dispatchUiActionRef: { current: null },
    handleOpenSqlEditorRef: { current: null },
    showSnackbar: vi.fn(),
    handleSidebarNewChat: vi.fn(),
  };
  const mount = () =>
    renderHook(() => {
      const activeSession = useSyncExternalStore(subscribe, () => getSession(activeKey));
      const guided = useChatPageGuidedConfirm();
      const streaming = useChatPageStreaming({
        ...props,
        activeSessionKey: activeKey,
        activeSession,
        setGuidedConfirmDialog: guided.setGuidedConfirmDialog,
      });
      return { ...guided, ...streaming };
    });
  let hook = mount();
  return {
    get result() {
      return hook.result;
    },
    unmount: () => hook.unmount(),
    remount: () => {
      hook = mount();
    },
    getSession,
    signals,
    navigate: props.navigate,
    select: (key) => {
      activeKey = key;
      hook.rerender();
    },
    requestDashboard: () =>
      requestDashboardNavigation({
        isStreaming: hook.result.current.hasActiveStreams(),
        stopStreaming: hook.result.current.stopAllStreams,
        navigate: props.navigate,
        openConfirmation: hook.result.current.setGuidedConfirmDialog,
      }),
  };
}

afterEach(() => vi.clearAllMocks());

describe('dashboard navigation with concurrent responses', () => {
  it('keeps a background response running when navigation from an idle chat is cancelled', async () => {
    const harness = createHarness();
    let pending;
    act(() => {
      pending = harness.result.current.handleSendMessage('Response in A');
    });
    harness.select('b');
    expect(harness.result.current.isCurrentlyStreaming).toBe(false);

    act(() => harness.requestDashboard());
    expect(harness.result.current.guidedConfirmDialog.open).toBe(true);
    expect(harness.navigate).not.toHaveBeenCalled();
    expect(harness.signals.get('a').aborted).toBe(false);

    await act(() => harness.result.current.handleGuidedCancel());
    expect(harness.result.current.guidedConfirmDialog.open).toBe(false);
    expect(harness.navigate).not.toHaveBeenCalled();
    expect(harness.signals.get('a').aborted).toBe(false);
    expect(harness.getSession('a').streamStatus).toBe(CHAT_STREAM_STATUS.STARTING);

    harness.unmount();
    await pending;
  });

  it('finalizes and aborts every response before confirmed dashboard navigation', async () => {
    const harness = createHarness();
    let pendingA;
    let pendingC;
    act(() => {
      pendingA = harness.result.current.handleSendMessage('Response in A');
    });
    harness.select('c');
    act(() => {
      pendingC = harness.result.current.handleSendMessage('Response in C');
    });
    harness.select('b');
    harness.navigate.mockImplementation(() => {
      for (const key of ['a', 'c']) {
        expect(harness.signals.get(key).aborted).toBe(true);
        expect(harness.getSession(key).streamStatus).toBe(CHAT_STREAM_STATUS.STOPPED);
        expect(harness.getSession(key).messages.at(-1).status).toBe(MESSAGE_STATUS.STOPPED);
      }
    });

    act(() => harness.requestDashboard());
    await act(() => harness.result.current.handleGuidedConfirm());

    expect(harness.navigate).toHaveBeenCalledWith('/dashboard/overview');
    expect(harness.result.current.hasActiveStreams()).toBe(false);
    expect(harness.getSession('b').streamStatus).toBe(CHAT_STREAM_STATUS.IDLE);
    await expect(Promise.all([pendingA, pendingC])).resolves.toEqual([false, false]);
  });
});

function completedResponse(events = []) {
  return {
    headers: { get: () => null },
    body: new ReadableStream({
      start(controller) {
        for (const event of events)
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
        controller.close();
      },
    }),
  };
}

describe('pending approvals across dashboard navigation', () => {
  it.each([
    [
      'agent_interrupt',
      {
        type: 'agent_interrupt',
        id: 'approval',
        payload: { action: 'execute_query', message: 'Run this query?' },
      },
    ],
    ['step_limit', { type: 'agent_step_limit_reached', task_mode: 'long_task', steps_used: 20 }],
  ])('restores and resolves an active %s after workspace remount', async (type, event) => {
    const harness = createHarness();
    sendMessage.mockResolvedValue(completedResponse([event]));
    await act(async () => {
      await harness.result.current.handleSendMessage('hello');
    });
    expect(harness.result.current.guidedConfirmDialog.open).toBe(true);
    const prompt = harness.result.current.guidedConfirmDialog.message;
    expect(harness.getSession('a').pendingInteraction).toMatchObject({ type, event });

    harness.select('b');
    expect(harness.result.current.guidedConfirmDialog.open).toBe(false);
    harness.select('a');
    expect(harness.result.current.guidedConfirmDialog).toMatchObject({
      open: true,
      message: prompt,
    });

    act(() => harness.requestDashboard());
    expect(harness.navigate).toHaveBeenCalledWith('/dashboard/overview');
    harness.unmount();
    harness.remount();
    expect(harness.result.current.guidedConfirmDialog).toMatchObject({
      open: true,
      message: prompt,
    });

    resumeAgent.mockResolvedValue(completedResponse());
    await act(async () => {
      await harness.result.current.handleGuidedConfirm();
    });
    expect(resumeAgent).toHaveBeenCalledTimes(1);
    expect(resumeAgent.mock.calls[0][0]).toMatchObject({
      conversationId: 'a',
      resume:
        type === 'agent_interrupt'
          ? { approved: true, interrupt_id: 'approval' }
          : { continue_task: true },
    });
    expect(harness.getSession('a').pendingInteraction).toBeNull();
    harness.unmount();
    harness.remount();
    expect(harness.result.current.guidedConfirmDialog.open).toBe(false);
  });

  it.each([
    'agent_interrupt',
    'agent_step_limit_reached',
  ])('queues an early %s confirmation until the terminal frame', async (type) => {
    const harness = createHarness();
    let finish;
    sendMessage.mockResolvedValue({
      headers: { get: () => null },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ type, id: 'approval', payload: { action: 'execute_query' } })}\n\n`,
            ),
          );
          finish = () => {
            controller.enqueue(new TextEncoder().encode('data: {"type":"done"}\n\n'));
            controller.close();
          };
        },
      }),
    });
    resumeAgent.mockResolvedValue(completedResponse());
    let sending;
    await act(async () => {
      sending = harness.result.current.handleSendMessage('hello');
    });
    await waitFor(() => expect(harness.result.current.guidedConfirmDialog.open).toBe(true));
    let confirming;
    await act(async () => {
      confirming = harness.result.current.handleGuidedConfirm();
    });
    expect(resumeAgent).not.toHaveBeenCalled();
    await act(async () => {
      finish();
      await sending;
      await confirming;
    });
    expect(resumeAgent).toHaveBeenCalledTimes(1);
    expect(harness.getSession('a').pendingInteraction).toBeNull();
  });

  it.each([
    'agent_interrupt',
    'agent_step_limit_reached',
  ])('does not restore a cancelled %s after remount', async (type) => {
    const harness = createHarness();
    sendMessage.mockResolvedValue(
      completedResponse([{ type, id: 'approval', payload: { action: 'execute_query' } }]),
    );
    resumeAgent.mockResolvedValue(completedResponse());
    await act(async () => {
      await harness.result.current.handleSendMessage('hello');
    });
    await act(async () => {
      await harness.result.current.handleGuidedCancel();
    });
    if (type === 'agent_interrupt') {
      expect(resumeAgent).toHaveBeenCalledTimes(1);
      expect(resumeAgent.mock.calls[0][0].resume).toMatchObject({
        approved: false,
        interrupt_id: 'approval',
      });
    } else {
      expect(resumeAgent).not.toHaveBeenCalled();
    }
    expect(harness.getSession('a').pendingInteraction).toBeNull();
    harness.unmount();
    harness.remount();
    expect(harness.result.current.guidedConfirmDialog.open).toBe(false);
  });
});
