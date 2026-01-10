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
  
  // Track if this is a historical message (instant render) or fresh (animate)
  const isHistoryRef = useRef(!isActive && content.length > 0);

  /**
   * Find a safe reveal point that doesn't cut mid-marker.
   * Returns the adjusted index that either stops before a marker or skips past it.
   */
  const findSafeRevealPoint = useCallback((targetIdx, text) => {
    // Check for TOOL or THINKING markers that we might be cutting into
    const markerPrefixes = ['[[TOOL:', '[[THINKING:'];
    
    for (const prefix of markerPrefixes) {
      // Look for marker that starts before targetIdx
      let searchStart = Math.max(0, targetIdx - 100);
      let markerStart = text.indexOf(prefix, searchStart);
      
      while (markerStart !== -1 && markerStart < targetIdx) {
        // Find the end of this marker
        const markerEnd = text.indexOf(']]', markerStart);
        
        if (markerEnd === -1) {
          // Marker not complete yet - stop before it
          return Math.min(targetIdx, markerStart);
        }
        
        if (targetIdx <= markerEnd + 2) {
          // Target is inside the marker - skip to end of marker
          return markerEnd + 2;
        }
        
        // Check for next marker
        markerStart = text.indexOf(prefix, markerStart + 1);
      }
      
      // Check if we're about to enter a new marker
      const nextMarker = text.indexOf(prefix, targetIdx);
      if (nextMarker !== -1 && nextMarker < targetIdx + 10) {
        // Very close to marker start - check if complete
        const markerEnd = text.indexOf(']]', nextMarker);
        if (markerEnd === -1) {
          // Incomplete marker ahead - stop before it
          return nextMarker;
        }
      }
    }
    
    return targetIdx;
  }, []);

  useEffect(() => {
    // 1. History mode: Show everything immediately
    if (isHistoryRef.current) {
      progressRef.current = content.length;
      setRevealedLength(content.length);
      return;
    }

    // 2. Streaming stopped: Immediately reveal all content
    // This ensures typing animation completes when abort button disappears
    if (!isActive && progressRef.current < content.length) {
      progressRef.current = content.length;
      setRevealedLength(content.length);
      return;
    }

    // 3. Animation complete: Stop
    if (progressRef.current >= content.length) {
      return;
    }

    // 4. Animation Loop
    const charsPerTick = 4;
    const intervalMs = (charsPerTick / charsPerSecond) * 1000;

    const timer = setInterval(() => {
      if (progressRef.current >= content.length) {
        clearInterval(timer);
        return;
      }

      // Calculate raw next position
      let nextIdx = progressRef.current + charsPerTick;
      
      // Adjust to safe point (avoid cutting mid-marker)
      nextIdx = findSafeRevealPoint(nextIdx, content);
      
      // Clamp to content length
      if (nextIdx >= content.length) {
        nextIdx = content.length;
        clearInterval(timer);
      }

      progressRef.current = nextIdx;
      setRevealedLength(nextIdx);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [content, charsPerSecond, findSafeRevealPoint, isActive]);

  // Reset state if content is cleared/swapped entirely
  useEffect(() => {
    if (content.length === 0) {
      progressRef.current = 0;
      setRevealedLength(0);
    }
  }, [content.length]);

  return content.slice(0, revealedLength);
}
