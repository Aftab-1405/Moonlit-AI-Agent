/**
 * Theme context that adapts MUI theme from SettingsContext.
 * @module ThemeContext
 */

import { createContext, useContext, useMemo, useCallback } from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { createDarkTheme, createLightTheme } from '../theme';
import { useSettings, SettingsProvider } from './SettingsContext';

const ThemeContext = createContext(null);

/** Returns theme-related settings and actions. */
// eslint-disable-next-line react-refresh/only-export-components -- Hook export alongside Provider is valid React pattern
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
function ThemeProviderInner({ children }) {
  const settingsContext = useSettings();
  const { settings, isDarkMode, updateSetting, resetSettings } = settingsContext;
  
  const theme = useMemo(() => {
    return settings.theme === 'light' ? createLightTheme() : createDarkTheme();
  }, [settings.theme]);
  
  const toggleTheme = useCallback(() => {
    updateSetting('theme', settings.theme === 'dark' ? 'light' : 'dark');
  }, [updateSetting, settings.theme]);
  
  const value = useMemo(() => ({
    settings,
    updateSetting,
    resetSettings,
    isDarkMode,
    toggleTheme,
  }), [settings, updateSetting, resetSettings, isDarkMode, toggleTheme]);
  
  return (
    <ThemeContext.Provider value={value}>
      <MuiThemeProvider theme={theme}>
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

/** App provider that composes SettingsProvider and MUI ThemeProvider. */
export function ThemeProvider({ children }) {
  return (
    <SettingsProvider>
      <ThemeProviderInner>{children}</ThemeProviderInner>
    </SettingsProvider>
  );
}

export default ThemeContext;
