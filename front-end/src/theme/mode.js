export const THEME_STORAGE_KEY = 'moonlit-settings';
export const THEME_ATTRIBUTE = 'data-moonlit-color-scheme';
export const INPUT_MODALITY_ATTRIBUTE = 'data-moonlit-input-modality';

export const getEffectiveThemeMode = (_pathname, preferredMode, systemDark = false) =>
  preferredMode === 'dark' || preferredMode === 'light'
    ? preferredMode
    : systemDark
      ? 'dark'
      : 'light';

export const getReducedMotion = (preference, systemReduced = false) =>
  preference === 'on' || (preference !== 'off' && systemReduced);
export const APPEARANCE_BOOT_KEY = 'moonlit-appearance-boot-v1';
