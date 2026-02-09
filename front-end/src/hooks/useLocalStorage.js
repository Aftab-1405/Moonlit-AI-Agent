/**
 * Reactive localStorage hook with SSR safety and cross-tab sync.
 * @module useLocalStorage
 */

import { useState, useEffect, useCallback } from 'react';
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
  
  const setValue = useCallback((value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);

      if (isBrowser()) {
        if (valueToStore === undefined || valueToStore === null) {
          window.localStorage.removeItem(key);
        } else {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      }
    } catch (error) {
      logger.warn(`useLocalStorage: Error setting key "${key}":`, error);
      
      if (error.name === 'QuotaExceededError') {
        logger.error('localStorage quota exceeded. Consider clearing old data.');
      }
    }
  }, [key, storedValue]);
  
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

export default useLocalStorage;
