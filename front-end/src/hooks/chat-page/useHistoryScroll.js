import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

const HISTORY_THRESHOLD = 120;

// Capture at response time, not request time: the reader may keep scrolling
// while history is fetched, or a live reply may grow below the viewport.
export function useHistoryScroll({
  rootRef,
  sessionKey,
  messages,
  history,
  onLoadOlder,
  isLoading,
}) {
  const pendingRef = useRef(null);
  const requestRef = useRef(null);
  const restoreRef = useRef(null);
  const captureAnchor = useCallback(() => {
    const root = rootRef.current;
    const container = root?.closest('[data-chat-scroll-container]');
    if (!container) return;
    const top = container.getBoundingClientRect().top;
    const node = [...root.querySelectorAll('[data-message-id]')].find(
      (element) => element.getBoundingClientRect().bottom > top,
    );
    if (node) {
      pendingRef.current = { node, container, top: node.getBoundingClientRect().top, sessionKey };
      container.dataset.historyPrepending = 'true';
    }
  }, [rootRef, sessionKey]);

  const loadOlder = useCallback(async () => {
    if (!onLoadOlder || !history?.hasMore || history.isLoading || requestRef.current) return;
    const request = {};
    requestRef.current = request;
    try {
      await onLoadOlder({ beforePrepend: captureAnchor });
    } finally {
      if (requestRef.current === request) requestRef.current = null;
    }
  }, [onLoadOlder, history?.hasMore, history?.isLoading, captureAnchor]);

  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    const { node, container, top } = pending;
    if (pending.sessionKey === sessionKey && node.isConnected) {
      container.scrollTop += node.getBoundingClientRect().top - top;
    }
    const frame = requestAnimationFrame(() => {
      delete container.dataset.historyPrepending;
      restoreRef.current = null;
    });
    restoreRef.current = { frame, container };
  }, [messages, sessionKey, history?.isLoading]);

  useEffect(() => {
    const container = rootRef.current?.closest('[data-chat-scroll-container]');
    if (!container || isLoading) return;
    const onScroll = () => {
      if (container.dataset.historyPrepending && !pendingRef.current) return;
      if (container.scrollTop <= HISTORY_THRESHOLD && !history?.error) void loadOlder();
      // A scroll between response and commit must keep the new reading offset.
      const pending = pendingRef.current;
      if (pending) pending.top = pending.node.getBoundingClientRect().top;
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    // Fill a viewport when one page is too short to make it scrollable.
    if (
      container.clientHeight > 0 &&
      container.scrollHeight <= container.clientHeight &&
      !history?.error
    )
      void loadOlder();
    return () => container.removeEventListener('scroll', onScroll);
  }, [rootRef, sessionKey, isLoading, history?.error, loadOlder, messages.length]);

  useEffect(
    () => () => {
      requestRef.current = null;
      const pending = pendingRef.current;
      if (pending) delete pending.container.dataset.historyPrepending;
      pendingRef.current = null;
      const restore = restoreRef.current;
      if (restore) {
        cancelAnimationFrame(restore.frame);
        delete restore.container.dataset.historyPrepending;
      }
      restoreRef.current = null;
    },
    [sessionKey],
  );

  return loadOlder;
}
