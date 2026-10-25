import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import useAutoScroll from './useAutoScroll';

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const container = document.createElement('div');
  Object.defineProperties(container, {
    scrollHeight: { configurable: true, value: 2000 },
    clientHeight: { configurable: true, value: 400 },
  });
  container.scrollTo = vi.fn();
  container.scrollTop = 1600;
  const initialProps = {
    sessionKey: 'a',
    messageCount: 30,
    lastMessageId: 'last',
    isStreaming: true,
  };
  const view = renderHook((props) => useAutoScroll(props), { initialProps });
  act(() => view.result.current.setScrollContainerRef(container));
  const flush = () =>
    act(() => {
      frames.splice(0).forEach((callback) => {
        callback();
      });
    });
  flush();
  container.scrollTo.mockClear();
  return { ...view, container, flush, initialProps };
}

it('cancels queued following when the reader scrolls up, including appended messages and stream start', () => {
  const { container, rerender, flush, initialProps, result } = setup();
  rerender({ ...initialProps, activityKey: 'token' });
  container.scrollTop = 300;
  fireEvent.scroll(container);
  flush();
  expect(container.scrollTo).not.toHaveBeenCalled();
  rerender({ ...initialProps, messageCount: 32, lastMessageId: 'new', activityKey: 'new reply' });
  flush();
  expect(container.scrollTo).not.toHaveBeenCalled();
  rerender({ ...initialProps, isStreaming: false });
  rerender({ ...initialProps, isStreaming: true });
  flush();
  expect(container.scrollTo).not.toHaveBeenCalled();
  act(() => result.current.scrollToBottom());
  expect(container.scrollTo).toHaveBeenLastCalledWith({ top: 2000, behavior: 'smooth' });
});

it('does not follow a history prepend but follows appended replies near the bottom', () => {
  const { container, rerender, flush, initialProps } = setup();
  container.scrollTop = 100;
  fireEvent.scroll(container);
  rerender({ ...initialProps, messageCount: 60 });
  flush();
  expect(container.scrollTo).not.toHaveBeenCalled();
  container.scrollTop = 1600;
  fireEvent.scroll(container);
  rerender({ ...initialProps, messageCount: 62, lastMessageId: 'new' });
  flush();
  expect(container.scrollTo).toHaveBeenLastCalledWith({ top: 2000, behavior: 'auto' });
});

it('positions a different session at latest even if the previous session was scrolled up', () => {
  const { container, rerender, flush, initialProps } = setup();
  container.scrollTop = 100;
  fireEvent.scroll(container);
  rerender({ ...initialProps, sessionKey: 'b', lastMessageId: 'other' });
  flush();
  expect(container.scrollTo).toHaveBeenLastCalledWith({ top: 2000, behavior: 'auto' });
});

it('keeps a short overflowing transcript anchored while history restoration emits scroll and resize', () => {
  let onResize;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback) {
        onResize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const { container, rerender, flush, initialProps, result } = setup();
  Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 480 });
  container.scrollTop = 0;
  fireEvent.scroll(container); // Within 96px of bottom, and also close to history loading.
  act(() => result.current.pauseFollowing());
  container.dataset.historyPrepending = 'true';
  Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 780 });
  container.scrollTop = 300;
  fireEvent.scroll(container); // Programmatic restoration must not re-pin.
  rerender({ ...initialProps, messageCount: 60 });
  act(() => onResize());
  flush();
  delete container.dataset.historyPrepending;
  rerender({ ...initialProps, messageCount: 60, activityKey: 'next-token' });
  act(() => onResize());
  flush();
  expect(container.scrollTo).not.toHaveBeenCalled();
});
