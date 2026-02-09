/**
 * Theme context that adapts MUI theme from SettingsContext.
 * @module ThemeContext
 */

import { createContext, useContext, useMemo, useLayoutEffect, useRef } from 'react';
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
  const { settings, isDarkMode, updateSetting, resetSettings } = useSettings();
  const previousThemeRef = useRef(settings.theme);
  
  const theme = useMemo(() => {
    return settings.theme === 'light' ? createLightTheme() : createDarkTheme();
  }, [settings.theme]);
  
  const value = useMemo(() => ({
    settings,
    updateSetting,
    resetSettings,
    isDarkMode,
  }), [settings, updateSetting, resetSettings, isDarkMode]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    document.documentElement.style.colorScheme = settings.theme;

    if (previousThemeRef.current === settings.theme) return;
    previousThemeRef.current = settings.theme;

    const style = document.createElement('style');
    style.setAttribute('data-mui-theme-switch', 'true');
    style.textContent = `
      *, *::before, *::after {
        transition: none !important;
        animation: none !important;
      }
    `;
    document.head.appendChild(style);
    window.getComputedStyle(document.body);

    const remove = () => {
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    };
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(remove);
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      remove();
    };
  }, [settings.theme]);
  
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
