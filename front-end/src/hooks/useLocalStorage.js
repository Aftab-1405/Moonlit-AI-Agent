/** Reactive storage with synchronous namespace isolation and cross-tab updates. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { resolveStoredValue } from '@/hooks/localStorageState';
import logger from '@/utils/logger';
const isBrowser = () => typeof window !== 'undefined';
function parse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
function read(key, fallback) {
  if (!isBrowser()) return fallback;
  try {
    const item = window.localStorage.getItem(key);
    return item === null ? fallback : (parse(item) ?? fallback);
  } catch (error) {
    logger.warn(`useLocalStorage: Error reading key "${key}":`, error);
    return fallback;
  }
}
export function useLocalStorage(key, initialValue) {
  const [snapshot, setSnapshot] = useState(() => ({ key, value: read(key, initialValue) }));
  // Guarded render reconciliation prevents exposing the previous namespace to children.
  if (snapshot.key !== key) setSnapshot({ key, value: read(key, initialValue) });
  const latest = useRef(snapshot);
  useLayoutEffect(() => {
    // Refresh on a committed namespace read (including a return to a previous account).
    // A child layout effect may already have written a newer value for this key.
    if (latest.current.key !== snapshot.key) latest.current = snapshot;
  }, [snapshot]);
  const setValue = useCallback(
    (action) => {
      try {
        // Child hydration effects can run before parent effects after an account switch.
        // Resolve from this key's storage when the ref still belongs to another namespace.
        const current = latest.current.key === key ? latest.current.value : read(key, initialValue);
        const next = { key, value: resolveStoredValue(current, action) };
        latest.current = next;
        setSnapshot(next);
        if (isBrowser()) {
          if (next.value === undefined || next.value === null) window.localStorage.removeItem(key);
          else window.localStorage.setItem(key, JSON.stringify(next.value));
        }
      } catch (error) {
        logger.warn(`useLocalStorage: Error setting key "${key}":`, error);
      }
    },
    [key, initialValue],
  );
  const removeValue = useCallback(() => {
    const next = { key, value: initialValue };
    latest.current = next;
    setSnapshot(next);
    try {
      if (isBrowser()) window.localStorage.removeItem(key);
    } catch (error) {
      logger.warn(`useLocalStorage: Error removing key "${key}":`, error);
    }
  }, [key, initialValue]);
  useEffect(() => {
    if (!isBrowser()) return;
    const onStorage = (event) => {
      if (event.key !== null && event.key !== key) return;
      const value =
        event.key === null || event.newValue === null ? initialValue : parse(event.newValue);
      if (value === undefined) return;
      const next = { key, value };
      latest.current = next;
      setSnapshot(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, initialValue]);
  return [snapshot.value, setValue, removeValue];
}
