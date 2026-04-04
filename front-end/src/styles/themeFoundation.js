import { alpha } from '@mui/material/styles';

export const SHAPE = {
  borderRadius: 10,
  radius: { sm: 4, md: 8, lg: 10, xl: 16, full: 9999 },
};
export const HEX_WHITE = '#ffffff';
export const HEX_BLACK = '#000000';
export const HEX_BLACK_20 = '#111111';

export const BREAKPOINTS = {
  values: { xs: 0, sm: 600, md: 960, lg: 1200, xl: 1536 },
};

export const FONTS = {
  serif: '"Merriweather", "Georgia", serif',
  mono: '"JetBrains Mono", "Fira Code", "Monaco", monospace',
  sans: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
};

export const SYNTAX_COLORS = {
  sql: '#4fc3f7', mysql: '#4fc3f7', postgresql: '#4fc3f7', sqlite: '#4fc3f7',
  sqlserver: '#4fc3f7', oracle: '#4fc3f7', tsql: '#4fc3f7', plsql: '#4fc3f7',
  javascript: '#f7c948', js: '#f7c948',
  typescript: '#5b8dd9', ts: '#5b8dd9',
  jsx: '#61dafb', tsx: '#61dafb',
  python: '#6bbf8e', py: '#6bbf8e',
  json: '#e09b5e',
  bash: '#a8c28a', sh: '#a8c28a', shell: '#a8c28a',
  html: '#e07b59', xml: '#e07b59',
  css: '#7bafd4', scss: '#c39cd9', sass: '#c39cd9',
  rust: '#c96a44', go: '#5ab8d9', java: '#e07b59',
  cpp: '#6b9dd4', c: '#6b9dd4',
};

export const PALETTE_MODES = {
  dark: {
    background: { default: '#0a0b0d', paper: '#111214', elevated: '#17191d', sunken: '#07080a' },
    chart: ['#5b9bd6', '#d97575', '#c9a85c', '#6bbf8e', '#9b7ec8', '#5bc4c4', '#d4845a', '#8eabd9'],
    text: { primary: '#f1f3f5', secondary: '#a2a7b0', disabled: '#626872', hint: '#7c828c' },
    border: { default: '#2a2e35', subtle: '#1c2026', hover: '#3a4049', focus: '#8d949f' },
    primary: { main: '#9aa1ad', light: '#c2c7d0', dark: '#787f8a', contrastText: '#0a0b0d' },
    secondary: { main: '#7f8691', light: '#a1a8b2', dark: '#676d77', contrastText: '#0a0b0d' },
    error: { main: '#d88a8a', light: '#e8b4b4', dark: '#b96f6f' },
    warning: { main: '#c7a36b', light: '#dabc8d', dark: '#aa8756' },
    info: { main: '#8f97a4', light: '#b4bac4', dark: '#727985' },
    success: { main: '#7fb09a', light: '#9fc7b5', dark: '#669380' },
    action: {
      active: alpha(HEX_WHITE, 0.76),
      hover: alpha(HEX_WHITE, 0.045),
      selected: alpha(HEX_WHITE, 0.08),
      disabled: alpha(HEX_WHITE, 0.28),
      disabledBackground: alpha(HEX_WHITE, 0.1),
    },
    scrollbar: { track: 'transparent', thumb: '#363b44', thumbHover: '#4a515c' },
    code: { background: alpha(HEX_WHITE, 0.06), text: '#f1f3f5', border: alpha(HEX_WHITE, 0.08) },
    glassmorphism: {
      background: alpha('#101114', 0.84),
      backdropFilter: 'blur(16px)',
      borderColor: alpha(HEX_WHITE, 0.08),
    },
    monaco: { background: '#0f1012', gutter: '#0f1012', highlight: '#16181c', lineHighlight: '#14161a' },
  },
  light: {
    background: { default: '#f4f4f5', paper: '#fafafa', elevated: '#ffffff', sunken: '#ebebec' },
    chart: ['#3a7abf', '#c45a5a', '#b08040', '#4a8f6e', '#7a5cb0', '#3a9a9a', '#bf6a3a', '#5a8abf'],
    text: { primary: '#17181b', secondary: '#5f6570', disabled: '#979ca5', hint: '#767c86' },
    border: { default: '#d6d9de', subtle: '#e7e9ed', hover: '#c5c9d0', focus: '#626975' },
    primary: { main: '#353a42', light: '#525861', dark: '#25292f', contrastText: '#ffffff' },
    secondary: { main: '#6b7280', light: '#8b93a0', dark: '#4d5561', contrastText: '#ffffff' },
    error: { main: '#c46f6f', light: '#db9a9a', dark: '#a95858' },
    warning: { main: '#b78c54', light: '#caa978', dark: '#987241' },
    info: { main: '#707887', light: '#949ba7', dark: '#575f6c' },
    success: { main: '#5f8f7a', light: '#7aa18f', dark: '#4a715f' },
    action: {
      active: alpha(HEX_BLACK, 0.62),
      hover: alpha(HEX_BLACK, 0.04),
      selected: alpha(HEX_BLACK, 0.07),
      disabled: alpha(HEX_BLACK, 0.24),
      disabledBackground: alpha(HEX_BLACK, 0.06),
    },
    scrollbar: { track: 'transparent', thumb: '#bcc1c9', thumbHover: '#a4abb6' },
    code: { background: alpha(HEX_BLACK, 0.035), text: '#17181b', border: alpha(HEX_BLACK, 0.08) },
    glassmorphism: {
      background: alpha('#ffffff', 0.9),
      backdropFilter: 'blur(16px)',
      borderColor: alpha(HEX_BLACK, 0.08),
    },
    monaco: { background: '#f6f6f7', gutter: '#f8f8f9', highlight: '#eceef1', lineHighlight: '#e7eaee' },
  },
};

export const getReadableTextColor = (hex) => {
  if (!hex || typeof hex !== 'string') return HEX_WHITE;
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (full.length !== 6) return HEX_WHITE;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.45 ? HEX_BLACK_20 : HEX_WHITE;
};

export const getShadowScale = (mode) => {
  const isDark = mode === 'dark';
  return {
    containedHover: isDark
      ? `0 10px 26px -16px ${alpha(HEX_BLACK, 0.5)}`
      : `0 14px 26px -20px ${alpha(HEX_BLACK, 0.14)}`,
    cardHover: isDark
      ? `0 18px 34px -26px ${alpha(HEX_BLACK, 0.45)}`
      : `0 16px 28px -24px ${alpha(HEX_BLACK, 0.12)}`,
    subtle: isDark
      ? `0 1px 3px 0 ${alpha(HEX_BLACK, 0.5)}`
      : `0 1px 3px 0 ${alpha(HEX_BLACK, 0.08)}`,
    medium: isDark
      ? `0 4px 6px -1px ${alpha(HEX_BLACK, 0.6)}`
      : `0 4px 6px -1px ${alpha(HEX_BLACK, 0.08)}`,
    focus: (primaryMain) =>
      `0 0 0 3px ${alpha(primaryMain, isDark ? 0.16 : 0.12)}`,
  };
};