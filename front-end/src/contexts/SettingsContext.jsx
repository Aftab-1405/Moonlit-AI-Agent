/**
 * SettingsContext - User Preferences & Application Settings
 * 
 * SEPARATION OF CONCERNS:
 * This context was split from ThemeContext to follow the Single Responsibility Principle.
 * - ThemeContext: Only handles MUI theme (dark/light mode, colors, typography)
 * - SettingsContext: Handles all application user preferences
 * 
 * FEATURES:
 * - Cross-tab sync: Settings changes in one tab auto-update all other tabs
 * - Persistence: All settings saved to localStorage automatically
 * - Type-safe: Uses useLocalStorage hook for reliable serialization
 * 
 * SETTINGS MANAGED:
 * - Appearance: theme, idleAnimation
 * - Query Execution: confirmBeforeRun, queryTimeout, maxRows
 * - Results Display: nullDisplay
 * - Connection: rememberConnection, defaultDbType, connectionPersistence
 * - AI Assistant: enableReasoning, reasoningEffort, responseStyle
 * 
 * @module SettingsContext
 */

import { createContext, useContext, useCallback, useMemo } from 'react';
import { useLocalStorage } from '../hooks';

// =============================================================================
// CONSTANTS
// =============================================================================

const SETTINGS_KEY = 'moonlit-settings';

// =============================================================================
// DEFAULT SETTINGS
// =============================================================================

const defaultSettings = {
  // ==== Appearance ====
  theme: 'dark',              // 'dark' | 'light'
  idleAnimation: true,        // Starfield animation when idle

  // ==== Query Execution ====
  confirmBeforeRun: false,    // Show confirmation dialog before running queries
  queryTimeout: 30,           // Query timeout in seconds
  maxRows: 1000,              // Maximum rows to return from queries

  // ==== Results Display ====
  nullDisplay: 'NULL',        // How to display NULL values

  // ==== Connection ====
  rememberConnection: false,  // Remember last connection details
  defaultDbType: 'postgresql',// Default database type in connection modal
  connectionPersistence: 0,   // Minutes to persist connection (0 = never)

  // ==== AI Assistant ====
  enableReasoning: true,      // Enable AI reasoning/thinking
  reasoningEffort: 'medium',  // 'low' | 'medium' | 'high'
  responseStyle: 'balanced',  // 'concise' | 'balanced' | 'detailed'
};

// =============================================================================
// CONTEXT CREATION
// =============================================================================

const SettingsContext = createContext(null);

// =============================================================================
// CUSTOM HOOK
// =============================================================================

/**
 * Hook to access and modify application settings.
 * Must be used within a SettingsProvider.
 * 
 * @example
 * const { settings, updateSetting, resetSettings } = useSettings();
 * 
 * // Read a setting
 * if (settings.confirmBeforeRun) { ... }
 * 
 * // Update a setting
 * updateSetting('theme', 'light');
 * 
 * // Reset all to defaults
 * resetSettings();
 * 
 * @returns {Object} Settings state and actions
 */
// eslint-disable-next-line react-refresh/only-export-components -- Hook export alongside Provider is valid React pattern
export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

// =============================================================================
// PROVIDER COMPONENT
// =============================================================================

export function SettingsProvider({ children }) {
  // ---------------------------------------------------------------------------
  // State with localStorage + Cross-Tab Sync
  // ---------------------------------------------------------------------------
  // useLocalStorage handles:
  // 1. Loading from localStorage on mount
  // 2. Saving to localStorage on every change
  // 3. Syncing changes across browser tabs via storage events

  const [rawSettings, setRawSettings] = useLocalStorage(SETTINGS_KEY, defaultSettings);

  // Merge with defaults to ensure new settings are available after updates
  const settings = useMemo(() => ({
    ...defaultSettings,
    ...rawSettings,
  }), [rawSettings]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Update a single setting by key.
   */
  const updateSetting = useCallback((key, value) => {
    setRawSettings(prev => ({ ...prev, [key]: value }));
  }, [setRawSettings]);

  /**
   * Update multiple settings at once.
   */
  const updateSettings = useCallback((newSettings) => {
    setRawSettings(prev => ({ ...prev, ...newSettings }));
  }, [setRawSettings]);

  /**
   * Reset all settings to their default values.
   */
  const resetSettings = useCallback(() => {
    setRawSettings(defaultSettings);
  }, [setRawSettings]);

  /**
   * Get a single setting with optional default.
   */
  const getSetting = useCallback((key, defaultValue = null) => {
    return settings[key] ?? defaultValue;
  }, [settings]);

  // ---------------------------------------------------------------------------
  // Derived Values
  // ---------------------------------------------------------------------------

  const isDarkMode = settings.theme === 'dark';

  // ---------------------------------------------------------------------------
  // Context Value
  // ---------------------------------------------------------------------------

  const value = useMemo(() => ({
    // State
    settings,
    isDarkMode,

    // Actions
    updateSetting,
    updateSettings,
    resetSettings,
    getSetting,

    // Convenience
    theme: settings.theme,
  }), [settings, isDarkMode, updateSetting, updateSettings, resetSettings, getSetting]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export default SettingsContext;
