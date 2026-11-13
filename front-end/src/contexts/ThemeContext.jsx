/**
 * Theme context for resolved, account-local appearance.
 * @module ThemeContext
 */

import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { useContext, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { AppearanceContext as ThemeContext } from '@/contexts/appearanceContext';
import { useAuth } from '@/contexts/AuthContext';
import { SettingsProvider, useSettings } from '@/contexts/SettingsContext';
import { MotionConfig } from 'framer-motion';
import { createMoonlitTheme } from '@/theme/createMoonlitTheme';
import { createAppearanceSemanticTokens } from '@/theme/tokens/semantic';
import { createComponentTokens } from '@/theme/tokens/component';
import { validateAppearance } from '@/theme/appearance';
import { FONTS } from '@/theme/tokens';
import {
  APPEARANCE_BOOT_KEY,
  getEffectiveThemeMode,
  getReducedMotion,
  INPUT_MODALITY_ATTRIBUTE,
  THEME_ATTRIBUTE,
} from '@/theme/mode';

function useSystemPreference(query) {
  const media = useMemo(() => window.matchMedia?.(query), [query]);
  return useSyncExternalStore(
    useMemo(
      () => (callback) => {
        media?.addEventListener('change', callback);
        return () => media?.removeEventListener('change', callback);
      },
      [media],
    ),
    () => media?.matches ?? false,
    () => false,
  );
}

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
  const { settings, updateSetting, updateSettings, resetSettings } = useSettings();
  const { loading: accountLoading } = useAuth();
  const bootAppearance = useMemo(() => {
    try {
      const snapshot = JSON.parse(localStorage.getItem(APPEARANCE_BOOT_KEY));
      return snapshot?.version === 1 && snapshot.appearance?.version === 1
        ? validateAppearance(snapshot.appearance)
        : null;
    } catch {
      return null;
    }
  }, []);
  const systemDark = useSystemPreference('(prefers-color-scheme: dark)');
  const systemReduced = useSystemPreference('(prefers-reduced-motion: reduce)');
  const appearance = useMemo(
    () => (accountLoading && bootAppearance ? bootAppearance : settings.appearance),
    [settings.appearance, accountLoading, bootAppearance],
  );
  const effectiveTheme = getEffectiveThemeMode(null, appearance.mode, systemDark);
  const reducedMotion = getReducedMotion(appearance.reducedMotion, systemReduced);
  const resolvedAppearance = useMemo(
    () => ({
      ...appearance,
      effectiveMode: effectiveTheme,
      profile: appearance.profiles[effectiveTheme],
      reducedMotionResolved: reducedMotion,
    }),
    [appearance, effectiveTheme, reducedMotion],
  );
  // Only the active color/font profile changes the MUI palette; flags and CSS font sizes have their own consumers.
  const paletteSignature = JSON.stringify({
    mode: effectiveTheme,
    profile: appearance.profiles[effectiveTheme],
  });
  const paletteAppearance = useMemo(() => {
    const { mode, profile } = JSON.parse(paletteSignature);
    return { mode, profiles: { [mode]: profile } };
  }, [paletteSignature]);
  const semantic = useMemo(
    () => createAppearanceSemanticTokens(paletteAppearance, effectiveTheme),
    [paletteAppearance, effectiveTheme],
  );
  const theme = useMemo(
    () => createMoonlitTheme(semantic, createComponentTokens(semantic)),
    [semantic],
  );
  const value = useMemo(
    () => ({
      settings,
      updateSetting,
      updateSettings,
      resetSettings,
      isDarkMode: effectiveTheme === 'dark',
      effectiveTheme,
      resolvedAppearance,
      reducedMotion,
    }),
    [
      settings,
      updateSetting,
      updateSettings,
      resetSettings,
      effectiveTheme,
      resolvedAppearance,
      reducedMotion,
    ],
  );

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.colorScheme = effectiveTheme;
    root.setAttribute(THEME_ATTRIBUTE, effectiveTheme);
    root.setAttribute('data-moonlit-reduced-motion', String(reducedMotion));
    root.setAttribute('data-moonlit-diff-markers', appearance.diffMarkers);
    const profile = appearance.profiles[effectiveTheme];
    const uiSize = appearance.uiFontSize + 2;
    const variables = {
      '--font-ui-size': `${uiSize}px`,
      '--font-content-size': `${appearance.contentFontSize}px`,
      '--font-code-size': `${appearance.codeFontSize}px`,
      '--font-ui-family': profile.fonts.ui || FONTS.sans,
      '--font-code-family': profile.fonts.code || FONTS.mono,
      '--reading-max-width': appearance.fullWidthPages ? 'none' : '768px',
      '--appearance-surface': semantic.background.default,
      '--appearance-ink': semantic.text.primary,
    };
    for (const [key, value] of Object.entries(variables)) root.style.setProperty(key, value);
    // Snapshot contains only visual preferences, never an account identifier or auth data.
    try {
      localStorage.setItem(
        APPEARANCE_BOOT_KEY,
        JSON.stringify({
          version: 1,
          appearance,
          mode: appearance.mode,
          light: {
            surface: createAppearanceSemanticTokens(appearance, 'light').background.default,
            ink: appearance.profiles.light.ink,
          },
          dark: {
            surface: createAppearanceSemanticTokens(appearance, 'dark').background.default,
            ink: appearance.profiles.dark.ink,
          },
        }),
      );
    } catch {
      /* Blocked storage does not prevent in-memory appearance. */
    }
  }, [appearance, effectiveTheme, reducedMotion, semantic]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const markKeyboardInput = (event) => {
      const target = event.composedPath?.()[0] || event.target;
      const editingText =
        target?.isContentEditable ||
        target?.tagName === 'TEXTAREA' ||
        (target?.tagName === 'INPUT' &&
          !['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color'].includes(
            target.type,
          ));
      if (
        event.key === 'Tab' ||
        event.key === 'Escape' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        !editingText
      )
        root.setAttribute(INPUT_MODALITY_ATTRIBUTE, 'keyboard');
    };
    const markPointerInput = () => root.setAttribute(INPUT_MODALITY_ATTRIBUTE, 'pointer');

    document.addEventListener('keydown', markKeyboardInput, true);
    document.addEventListener('pointerdown', markPointerInput, true);
    return () => {
      document.removeEventListener('keydown', markKeyboardInput, true);
      document.removeEventListener('pointerdown', markPointerInput, true);
    };
  }, []);

  return (
    <ThemeContext.Provider value={value}>
      <MuiThemeProvider theme={theme}>
        <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>{children}</MotionConfig>
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
