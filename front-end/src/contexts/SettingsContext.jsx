/**
 * Application settings context with localStorage persistence and cross-tab sync.
 * @module SettingsContext
 */

import { createContext, useContext, useCallback, useMemo } from 'react';
import { useLocalStorage } from '../hooks';

const SETTINGS_KEY = 'moonlit-settings';

const defaultSettings = {
  theme: 'dark',
  idleAnimation: true,
  idleAnimationIntensity: 'medium',
  confirmBeforeRun: false,
  queryTimeout: 30,
  maxRows: 1000,
  nullDisplay: 'NULL',
  rememberConnection: false,
  defaultDbType: 'postgresql',
  connectionPersistence: 0,
  enableReasoning: true,
  reasoningEffort: 'medium',
  responseStyle: 'balanced',
  llmProvider: null,
  llmModel: null,
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
  const [rawSettings, setRawSettings] = useLocalStorage(SETTINGS_KEY, defaultSettings);
  const settings = useMemo(() => ({
    ...defaultSettings,
    ...rawSettings,
  }), [rawSettings]);

  /** Update a single setting by key. */
  const updateSetting = useCallback((key, value) => {
    setRawSettings(prev => ({ ...prev, [key]: value }));
  }, [setRawSettings]);

  /** Update multiple settings at once. */
  const updateSettings = useCallback((newSettings) => {
    setRawSettings(prev => ({ ...prev, ...newSettings }));
  }, [setRawSettings]);

  /** Reset all settings to defaults. */
  const resetSettings = useCallback(() => {
    setRawSettings(defaultSettings);
  }, [setRawSettings]);

  /** Read a setting with optional fallback. */
  const getSetting = useCallback((key, defaultValue = null) => {
    return settings[key] ?? defaultValue;
  }, [settings]);

  const isDarkMode = settings.theme === 'dark';

  const value = useMemo(() => ({
    settings,
    isDarkMode,

    updateSetting,
    updateSettings,
    resetSettings,
    getSetting,

    theme: settings.theme,
  }), [settings, isDarkMode, updateSetting, updateSettings, resetSettings, getSetting]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
