/**
 * Keeps chat pinned to bottom while streaming unless the user scrolls up.
 * Uses lightweight pinned-state refs plus event-driven scheduling for smooth
 * stream updates (including markdown/code block reflows) without per-frame loops.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const PINNED_THRESHOLD_PX = 96;
const POST_STREAM_SETTLE_MS = 700;

function useAutoScroll({ messageCount, isStreaming, activityKey = '' }) {
  const [scrollContainer, setScrollContainer] = useState(null);
  const scheduleRafRef = useRef(null);
  const prevMessageCountRef = useRef(messageCount);
  const prevStreamingRef = useRef(isStreaming);
  const pinnedRef = useRef(true);
  const streamingRef = useRef(isStreaming);
  const settleUntilRef = useRef(0);

  const setScrollContainerRef = useCallback((node) => {
    setScrollContainer(node);
  }, []);

  const scrollToBottomNow = useCallback(() => {
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'auto' });
    }
  }, [scrollContainer]);

  const scheduleScrollToBottom = useCallback(() => {
    if (scheduleRafRef.current !== null) return;
    scheduleRafRef.current = requestAnimationFrame(() => {
      scheduleRafRef.current = null;
      scrollToBottomNow();
    });
  }, [scrollToBottomNow]);

  const shouldAutoFollow = useCallback(() => {
    if (!pinnedRef.current) return false;
    if (streamingRef.current) return true;
    return Date.now() < settleUntilRef.current;
  }, []);

  useEffect(() => {
    streamingRef.current = isStreaming;
    if (isStreaming) {
      settleUntilRef.current = 0;
    } else {
      settleUntilRef.current = Date.now() + POST_STREAM_SETTLE_MS;
    }
  }, [isStreaming]);

  useEffect(() => {
    if (!scrollContainer) return undefined;

    const handleScroll = () => {
      const distanceFromBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
      pinnedRef.current = distanceFromBottom <= PINNED_THRESHOLD_PX;
    };

    handleScroll();
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [scrollContainer]);
  useEffect(() => {
    if (!scrollContainer) return;
    if (shouldAutoFollow()) {
      scheduleScrollToBottom();
    }
  }, [scrollContainer, scheduleScrollToBottom, shouldAutoFollow]);

  useEffect(() => {
    if (messageCount > prevMessageCountRef.current) {
      pinnedRef.current = true;
      scheduleScrollToBottom();
    }
    prevMessageCountRef.current = messageCount;
  }, [messageCount, scheduleScrollToBottom]);

  useEffect(() => {
    if (isStreaming && !prevStreamingRef.current) {
      pinnedRef.current = true;
      scheduleScrollToBottom();
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, scheduleScrollToBottom]);
  useEffect(() => {
    if (!scrollContainer) return;
    if (shouldAutoFollow()) {
      scheduleScrollToBottom();
    }
  }, [activityKey, scheduleScrollToBottom, scrollContainer, shouldAutoFollow]);
  useEffect(() => {
    if (!scrollContainer || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => {
      if (shouldAutoFollow()) {
        scheduleScrollToBottom();
      }
    });

    observer.observe(scrollContainer);

    const contentNode = scrollContainer.firstElementChild;
    if (contentNode) {
      observer.observe(contentNode);
    }

    return () => {
      observer.disconnect();
    };
  }, [messageCount, scrollContainer, scheduleScrollToBottom, shouldAutoFollow]);

  useEffect(() => {
    return () => {
      if (scheduleRafRef.current !== null) {
        cancelAnimationFrame(scheduleRafRef.current);
      }
    };
  }, []);

  return {
    setScrollContainerRef,
  };
}

export default useAutoScroll;
