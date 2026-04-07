/**
 * Theme module entry point.
 *
 * Exports:
 *   - createDarkTheme / createLightTheme — Claude.ai-styled MUI theme factories
 *   - darkTheme / lightTheme             — Pre-built singleton instances
 *   - useThemeMode                        — Hook: current mode + toggle action
 *   - Re-exports of shared style utilities (backward-compat with ../theme imports)
 *
 * NOTE: ThemeContext itself is NOT re-exported here to prevent a circular
 * dependency (ThemeContext imports createDarkTheme/createLightTheme via
 * `../theme`, so if theme/index.js imported ThemeContext the cycle would close).
 * Import ThemeContext directly from `../contexts/ThemeContext` when needed.
 */

// ─── Claude.ai MUI themes ─────────────────────────────────────────────────────
export { createDarkTheme, darkTheme } from './darkTheme';
export { createLightTheme, lightTheme } from './lightTheme';
export { default } from './darkTheme';

// ─── Raw token data & utilities ──────────────────────────────────────────────
export { hslToHex, RAW_TOKENS, LIGHT, DARK, FONTS, SHAPE, BREAKPOINTS } from './tokens';

// ─── Style utilities (backward-compat: consumers import from '../theme') ──────
export {
  KEYFRAMES,
  TRANSITIONS,
  getAccentEffects,
  getGlassSx,
  getGlowButtonSx,
  getGradientTextSx,
  getMoonlitGradient,
} from '../styles/themeEffects';

export { getMonacoThemeName, registerMonacoThemes } from '../styles/themeMonaco';
export { getMermaidThemeConfig }                    from '../styles/themeMermaid';
export { getShadowScale }                           from '../styles/themeFoundation';

// ─── useThemeMode hook ────────────────────────────────────────────────────────
/**
 * Returns current theme mode and controls.
 * Must be called inside a SettingsProvider (provided by ThemeProvider in main.jsx).
 *
 * @returns {{ mode: string, isDark: boolean, toggle: () => void, setMode: (m: string) => void }}
 *
 * @example
 * import { useThemeMode } from '../theme';
 * const { isDark, toggle } = useThemeMode();
 */
import { useSettings } from '../contexts/SettingsContext';

export const useThemeMode = () => {
  const { theme: mode, isDarkMode, updateSetting } = useSettings();
  return {
    /** 'dark' | 'light' */
    mode,
    /** true when mode === 'dark' */
    isDark: isDarkMode,
    /** Flip between dark and light */
    toggle: () => updateSetting('theme', isDarkMode ? 'light' : 'dark'),
    /** Set mode explicitly */
    setMode: (m) => updateSetting('theme', m),
  };
};
