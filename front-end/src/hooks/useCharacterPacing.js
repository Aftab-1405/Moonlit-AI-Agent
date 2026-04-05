/**
 * Character pacing hook for typing animation on assistant text.
 */
import { useState, useEffect, useRef } from 'react';

/**
 * @param {string} content - Full text to reveal
 * @param {boolean} isActive - Whether animation is active (streaming)
 * @param {number} charsPerSecond - Reveal speed (default: 200)
 */
export function useCharacterPacing(content, isActive, charsPerSecond = 200) {
  const [revealedLength, setRevealedLength] = useState(0);
  const progressRef = useRef(0);
  const isHistoryRef = useRef(!isActive && content.length > 0);

  useEffect(() => {
    if (isHistoryRef.current) {
      progressRef.current = content.length;
      setRevealedLength(content.length);
      return;
    }
    if (!isActive && progressRef.current < content.length) {
      progressRef.current = content.length;
      setRevealedLength(content.length);
      return;
    }
    if (progressRef.current >= content.length) {
      return;
    }
    const charsPerTick = 4;
    const intervalMs = (charsPerTick / charsPerSecond) * 1000;

    const timer = setInterval(() => {
      if (progressRef.current >= content.length) {
        clearInterval(timer);
        return;
      }
      let nextIdx = progressRef.current + charsPerTick;
      if (nextIdx >= content.length) {
        nextIdx = content.length;
        clearInterval(timer);
      }

      progressRef.current = nextIdx;
      setRevealedLength(nextIdx);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [content, charsPerSecond, isActive]);

  useEffect(() => {
    if (content.length === 0) {
      progressRef.current = 0;
      setRevealedLength(0);
    }
  }, [content.length]);

  return content.slice(0, revealedLength);
}
