/** Follow new replies only while the reader stays near the bottom. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const PINNED_THRESHOLD_PX = 96;

function useAutoScroll({
  messageCount,
  lastMessageId,
  sessionKey,
  isStreaming,
  isConversationLoading = false,
  activityKey = '',
}) {
  const [scrollContainer, setScrollContainer] = useState(null);
  const [pinnedState, setPinnedState] = useState({ sessionKey, pinned: true });
  const isPinnedToBottom =
    isConversationLoading || pinnedState.sessionKey !== sessionKey || pinnedState.pinned;
  const pinnedRef = useRef(true);
  const frameRef = useRef(null);
  const previousRef = useRef(null);

  const setScrollContainerRef = useCallback((node) => setScrollContainer(node), []);
  const setPinned = useCallback(
    (value) => {
      pinnedRef.current = value;
      setPinnedState((current) =>
        current.sessionKey === sessionKey && current.pinned === value
          ? current
          : { sessionKey, pinned: value },
      );
    },
    [sessionKey],
  );
  const followNow = useCallback(() => {
    if (!scrollContainer || !pinnedRef.current || scrollContainer.dataset.historyPrepending) return;
    scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'auto' });
  }, [scrollContainer]);
  const scheduleFollow = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      // Check at execution time: a queued stream frame must respect a later scroll.
      followNow();
    });
  }, [followNow]);
  const scrollToBottom = useCallback(() => {
    if (!scrollContainer) return;
    setPinned(true);
    scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
  }, [scrollContainer, setPinned]);
  const pauseFollowing = useCallback(() => setPinned(false), [setPinned]);

  useLayoutEffect(() => {
    const previous = previousRef.current;
    previousRef.current = { sessionKey, isConversationLoading, lastMessageId, scrollContainer };
    if (!scrollContainer) return;
    if (isConversationLoading) {
      pinnedRef.current = true;
      return;
    }
    if (
      !previous ||
      previous.sessionKey !== sessionKey ||
      previous.isConversationLoading ||
      previous.scrollContainer !== scrollContainer
    ) {
      pinnedRef.current = true;
      followNow();
    } else if (lastMessageId !== previous.lastMessageId && pinnedRef.current) {
      scheduleFollow();
    }
    // Count alone cannot distinguish a prepend from a newly appended reply.
  }, [
    sessionKey,
    isConversationLoading,
    lastMessageId,
    messageCount,
    scrollContainer,
    setPinned,
    followNow,
    scheduleFollow,
  ]);

  useEffect(() => {
    if (!scrollContainer) return;
    const onScroll = () => {
      if (scrollContainer.dataset.historyPrepending) return;
      const distance =
        scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
      setPinned(distance <= PINNED_THRESHOLD_PX);
    };
    scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', onScroll);
  }, [scrollContainer, setPinned]);

  useEffect(() => {
    void activityKey;
    void isStreaming;
    if (!isConversationLoading && pinnedRef.current) scheduleFollow();
  }, [activityKey, isStreaming, isConversationLoading, scheduleFollow]);

  useEffect(() => {
    if (!scrollContainer || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (!isConversationLoading && pinnedRef.current) scheduleFollow();
    });
    observer.observe(scrollContainer);
    if (scrollContainer.firstElementChild) observer.observe(scrollContainer.firstElementChild);
    return () => observer.disconnect();
  }, [scrollContainer, isConversationLoading, scheduleFollow]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    },
    [scrollContainer, sessionKey],
  );

  return { setScrollContainerRef, isPinnedToBottom, scrollToBottom, pauseFollowing };
}

export default useAutoScroll;
