/**
 * useLocalStorage - Type-Safe Reactive localStorage Hook
 * 
 * A custom React hook that provides a reactive interface to localStorage.
 * Changes to the stored value trigger re-renders automatically.
 * 
 * FEATURES:
 * - Reactive: Component re-renders when value changes
 * - Type-safe: Preserves types through JSON serialization
 * - SSR-safe: Gracefully handles server-side rendering (no window)
 * - Error-resistant: Handles malformed JSON and quota exceeded errors
 * - Sync across tabs: Listens to storage events from other tabs
 * 
 * USAGE:
 * ```jsx
 * const [theme, setTheme] = useLocalStorage('theme', 'dark');
 * 
 * // Read
 * console.log(theme); // 'dark'
 * 
 * // Update
 * setTheme('light');
 * 
 * // Update with function (like useState)
 * setTheme(prev => prev === 'dark' ? 'light' : 'dark');
 * ```
 * 
 * @module useLocalStorage
 */

import { useState, useEffect, useCallback } from 'react';
import logger from '../utils/logger';

// =============================================================================
// TYPE DEFINITIONS (JSDoc for vanilla JS)
// =============================================================================

/**
 * @template T
 * @typedef {T | ((prevValue: T) => T)} SetStateAction
 */

/**
 * @template T
 * @typedef {(value: SetStateAction<T>) => void} SetValue
 */

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

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

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * React hook for reactive localStorage access.
 * 
 * @template T
 * @param {string} key - localStorage key
 * @param {T} initialValue - Default value if key doesn't exist
 * @returns {[T, SetValue<T>, () => void]} [value, setValue, removeValue]
 * 
 * @example
 * // Basic usage
 * const [name, setName] = useLocalStorage('user-name', '');
 * 
 * @example
 * // With object
 * const [settings, setSettings] = useLocalStorage('settings', { theme: 'dark' });
 * 
 * @example
 * // Removing value
 * const [token, setToken, removeToken] = useLocalStorage('auth-token', null);
 * removeToken(); // Clears from localStorage and resets to initial
 */
export function useLocalStorage(key, initialValue) {
  // ---------------------------------------------------------------------------
  // State Initialization
  // ---------------------------------------------------------------------------
  // Read from localStorage on mount, fallback to initialValue
  
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
  
  // ---------------------------------------------------------------------------
  // Setter Function
  // ---------------------------------------------------------------------------
  // Supports both direct values and updater functions (like useState)
  
  const setValue = useCallback((value) => {
    try {
      // Handle function updates
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      
      // Update React state
      setStoredValue(valueToStore);
      
      // Update localStorage
      if (isBrowser()) {
        if (valueToStore === undefined || valueToStore === null) {
          window.localStorage.removeItem(key);
        } else {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      }
    } catch (error) {
      logger.warn(`useLocalStorage: Error setting key "${key}":`, error);
      
      // Handle quota exceeded error
      if (error.name === 'QuotaExceededError') {
        logger.error('localStorage quota exceeded. Consider clearing old data.');
      }
    }
  }, [key, storedValue]);
  
  // ---------------------------------------------------------------------------
  // Remove Function
  // ---------------------------------------------------------------------------
  // Utility to completely remove the key and reset to initial value
  
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
  
  // ---------------------------------------------------------------------------
  // Cross-Tab Sync
  // ---------------------------------------------------------------------------
  // Listen for storage events from other tabs/windows
  
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
        // Key was removed in another tab
        setStoredValue(initialValue);
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key, initialValue]);
  
  return [storedValue, setValue, removeValue];
}

export default useLocalStorage;
