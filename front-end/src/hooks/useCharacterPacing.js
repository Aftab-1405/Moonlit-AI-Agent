/**
 * Character pacing hook for typing animation effect.
 * Used by AIMessage for the main response text.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Lightweight character pacing hook for fast LLM responses.
 * CRITICAL: Skips over THINKING/TOOL markers atomically to prevent partial markers
 * appearing in the UI during the reveal animation.
 * 
 * @param {string} content - The full text content to reveal
 * @param {boolean} isActive - Whether animation is active (streaming)
 * @param {number} charsPerSecond - Speed of reveal (default: 200)
 */
export function useCharacterPacing(content, isActive, charsPerSecond = 200) {
  const [revealedLength, setRevealedLength] = useState(0);
  const progressRef = useRef(0);
  const isHistoryRef = useRef(!isActive && content.length > 0);

  /**
   * Find a safe reveal point that doesn't cut mid-marker.
   * Returns the adjusted index that either stops before a marker or skips past it.
   */
  const findSafeRevealPoint = useCallback((targetIdx, text) => {
    const markerPrefixes = ['[[TOOL:', '[[THINKING:'];
    
    for (const prefix of markerPrefixes) {
      let searchStart = Math.max(0, targetIdx - 100);
      let markerStart = text.indexOf(prefix, searchStart);
      
      while (markerStart !== -1 && markerStart < targetIdx) {
        const markerEnd = text.indexOf(']]', markerStart);
        
        if (markerEnd === -1) {
          return Math.min(targetIdx, markerStart);
        }
        
        if (targetIdx <= markerEnd + 2) {
          return markerEnd + 2;
        }
        markerStart = text.indexOf(prefix, markerStart + 1);
      }
      const nextMarker = text.indexOf(prefix, targetIdx);
      if (nextMarker !== -1 && nextMarker < targetIdx + 10) {
        const markerEnd = text.indexOf(']]', nextMarker);
        if (markerEnd === -1) {
          return nextMarker;
        }
      }
    }
    
    return targetIdx;
  }, []);

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
      nextIdx = findSafeRevealPoint(nextIdx, content);
      if (nextIdx >= content.length) {
        nextIdx = content.length;
        clearInterval(timer);
      }

      progressRef.current = nextIdx;
      setRevealedLength(nextIdx);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [content, charsPerSecond, findSafeRevealPoint, isActive]);
  useEffect(() => {
    if (content.length === 0) {
      progressRef.current = 0;
      setRevealedLength(0);
    }
  }, [content.length]);

  return content.slice(0, revealedLength);
}
