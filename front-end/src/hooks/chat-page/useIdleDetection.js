import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook to detect user idle state.
 * Returns true when user has been idle for the specified timeout.
 * Resets when user interacts (mouse, keyboard, scroll, touch).
 * 
 * @param {number} timeout - Idle timeout in milliseconds (default: 12000ms)
 * @returns {boolean} isIdle - Whether user is currently idle
 */
export function useIdleDetection(timeout = 12000) {
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef(null);
  const isIdleRef = useRef(false); // Track state without causing re-renders

  const resetTimer = useCallback(() => {
    if (isIdleRef.current) {
      isIdleRef.current = false;
      setIsIdle(false);
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      isIdleRef.current = true;
      setIsIdle(true);
    }, timeout);
  }, [timeout]);

  useEffect(() => {
    const events = [
      'mousemove',
      'mousedown',
      'keydown',
      'keyup',
      'touchstart',
      'touchmove',
      'scroll',
      'wheel',
      'resize',
    ];
    let lastEventTime = 0;
    const throttleMs = 100; // Only process events every 100ms

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastEventTime >= throttleMs) {
        lastEventTime = now;
        resetTimer();
      }
    };
    events.forEach((event) => {
      const isPassive = ['scroll', 'wheel', 'touchstart', 'touchmove'].includes(event);
      window.addEventListener(event, handleActivity, { passive: isPassive });
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Timer initialization is valid effect setup
    resetTimer();
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [resetTimer]);

  return isIdle;
}
