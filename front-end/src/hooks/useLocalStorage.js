/**
 * Reactive localStorage hook with SSR safety and cross-tab sync.
 * @module useLocalStorage
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import logger from '../utils/logger';

/**
 * @template T
 * @typedef {T | ((prevValue: T) => T)} SetStateAction
 */

/**
 * @template T
 * @typedef {(value: SetStateAction<T>) => void} SetValue
 */

/**
 * Safely parse JSON, returning undefined on failure.
 * @param {string} value - JSON string to parse
 * @returns {any|undefined} Parsed value or undefined
 */
function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/**
 * Check if we're in a browser environment.
 * @returns {boolean}
 */
function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/**
 * React hook for localStorage-backed state.
 * 
 * @template T
 * @param {string} key - localStorage key
 * @param {T} initialValue - Default value if key doesn't exist
 * @returns {[T, SetValue<T>, () => void]} [value, setValue, removeValue]
 */
export function useLocalStorage(key, initialValue) {
  
  const [storedValue, setStoredValue] = useState(() => {
    if (!isBrowser()) {
      return initialValue;
    }
    
    try {
      const item = window.localStorage.getItem(key);
      if (item === null) {
        return initialValue;
      }
      
      const parsed = safeJsonParse(item);
      return parsed !== undefined ? parsed : initialValue;
    } catch (error) {
      logger.warn(`useLocalStorage: Error reading key "${key}":`, error);
      return initialValue;
    }
  });

  // Track the latest value in a ref so setValue can resolve functional updates
  // without adding storedValue to useCallback deps or using the state updater.
  const storedValueRef = useRef(storedValue);
  storedValueRef.current = storedValue;

  // Re-sync state when the key changes (useState initializer only runs at mount).
  useEffect(() => {
    if (!isBrowser()) return;
    try {
      const item = window.localStorage.getItem(key);
      if (item === null) {
        setStoredValue(initialValue);
        return;
      }
      const parsed = safeJsonParse(item);
      setStoredValue(parsed !== undefined ? parsed : initialValue);
    } catch (error) {
      logger.warn(`useLocalStorage: Error reading key "${key}":`, error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]); // intentionally excludes initialValue — read only when key identity changes

  const setValue = useCallback((value) => {
    try {
      // Resolve functional updates using the ref — avoids side effects inside a
      // state updater (which React 18 StrictMode calls twice to detect impurity).
      const valueToStore = value instanceof Function ? value(storedValueRef.current) : value;

      if (isBrowser()) {
        if (valueToStore === undefined || valueToStore === null) {
          window.localStorage.removeItem(key);
        } else {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      }

      setStoredValue(valueToStore);
    } catch (error) {
      logger.warn(`useLocalStorage: Error setting key "${key}":`, error);
      if (error.name === 'QuotaExceededError') {
        logger.error('localStorage quota exceeded. Consider clearing old data.');
      }
    }
  }, [key]);
  
  const removeValue = useCallback(() => {
    try {
      if (isBrowser()) {
        window.localStorage.removeItem(key);
      }
      setStoredValue(initialValue);
    } catch (error) {
      logger.warn(`useLocalStorage: Error removing key "${key}":`, error);
    }
  }, [key, initialValue]);
  
  useEffect(() => {
    if (!isBrowser()) {
      return;
    }
    
    const handleStorageChange = (event) => {
      if (event.key === key && event.newValue !== null) {
        const parsed = safeJsonParse(event.newValue);
        if (parsed !== undefined) {
          setStoredValue(parsed);
        }
      } else if (event.key === key && event.newValue === null) {
        setStoredValue(initialValue);
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key, initialValue]);
  
  return [storedValue, setValue, removeValue];
}
