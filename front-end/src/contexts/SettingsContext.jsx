/**
 * Application settings context with localStorage persistence and cross-tab sync.
 * @module SettingsContext
 */

import { createContext, useCallback, useContext, useMemo } from 'react';
import { defaultUserSettings } from '@/config/userSettings';
import { useAuth } from '@/contexts/AuthContext';
import { getAccountStorageKey } from '@/features/dashboard/accountModel';
import { useLocalStorage } from '@/hooks';
import { THEME_STORAGE_KEY } from '@/theme/mode';

const defaultSettings = Object.freeze({ ...defaultUserSettings });

const withoutLegacyTheme = (settings) => {
  const { theme: _legacyTheme, ...supportedSettings } = settings ?? {};
  return supportedSettings;
};

const SettingsContext = createContext(null);

/** Returns settings state and actions. Must be used within SettingsProvider. */
// eslint-disable-next-line react-refresh/only-export-components -- Hook export alongside Provider is valid React pattern
export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

export function SettingsProvider({ children }) {
  const { user } = useAuth();
  const storageKey = user?.uid
    ? getAccountStorageKey(user.uid, 'settings')
    : THEME_STORAGE_KEY;
  const [rawSettings, setRawSettings] = useLocalStorage(storageKey, defaultSettings);
  const settings = useMemo(
    () => ({
      ...defaultSettings,
      ...withoutLegacyTheme(rawSettings),
    }),
    [rawSettings],
  );

  /** Update a single setting by key. */
  const updateSetting = useCallback(
    (key, value) => {
      setRawSettings((prev) => ({ ...prev, [key]: value }));
    },
    [setRawSettings],
  );

  /** Update multiple settings at once. */
  const updateSettings = useCallback(
    (newSettings) => {
      setRawSettings((prev) => ({ ...prev, ...newSettings }));
    },
    [setRawSettings],
  );

  /** Reset all settings to defaults. */
  const resetSettings = useCallback(() => {
    setRawSettings(defaultSettings);
  }, [setRawSettings]);

  /** Read a setting with optional fallback. */
  const getSetting = useCallback(
    (key, defaultValue = null) => {
      return settings[key] ?? defaultValue;
    },
    [settings],
  );

  const value = useMemo(
    () => ({
      settings,

      updateSetting,
      updateSettings,
      resetSettings,
      getSetting,
    }),
    [settings, updateSetting, updateSettings, resetSettings, getSetting],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
