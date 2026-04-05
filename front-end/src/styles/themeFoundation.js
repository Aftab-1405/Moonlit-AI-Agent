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
  sql: '#4fc3f7', mysql: '#4fc3f7', postgresql: '#4fc3f7',
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
    // Deep night sky — blue-black, not flat grey-black
    background: { default: '#0d1017', paper: '#131822', elevated: '#1b2334', sunken: '#090c12' },
    // Vibrant but harmonious series — moon blue leads, violet second
    chart: ['#6e9fd4', '#e07878', '#d4924e', '#62b888', '#8b78d0', '#66b0d8', '#d47862', '#a894e0'],
    // Cool off-white text — softer than pure white, easier on the eyes at night
    text: { primary: '#d8e4f2', secondary: '#7a90aa', disabled: '#3c4a5e', hint: '#546070' },
    // Blue-tinted borders — cohesive with the night-sky backgrounds
    border: { default: '#1e2d42', subtle: '#141e2e', hover: '#2a3f5a', focus: '#4a7cbf' },
    // Moon blue — the signature accent: luminous, cool, unmistakably "moonlit"
    primary: { main: '#6e9fd4', light: '#94bce4', dark: '#4c7db8', contrastText: '#0d1017' },
    // Violet haze — the secondary: the pre-moonrise sky
    secondary: { main: '#8b78d0', light: '#aa9ae0', dark: '#6a58b0', contrastText: '#ffffff' },
    error: { main: '#e07878', light: '#eea8a8', dark: '#bc5858' },
    warning: { main: '#d4924e', light: '#e8b880', dark: '#b07030' },
    info: { main: '#66b0d8', light: '#90cae8', dark: '#4490b8' },
    success: { main: '#62b888', light: '#88d0a8', dark: '#429868' },
    action: {
      active: alpha(HEX_WHITE, 0.76),
      hover: alpha(HEX_WHITE, 0.05),
      selected: alpha(HEX_WHITE, 0.09),
      disabled: alpha(HEX_WHITE, 0.28),
      disabledBackground: alpha(HEX_WHITE, 0.1),
    },
    scrollbar: { track: 'transparent', thumb: '#1e2d42', thumbHover: '#2a3f5a' },
    code: { background: alpha('#6e9fd4', 0.1), text: '#94bce4', border: alpha('#6e9fd4', 0.18) },
    glassmorphism: {
      background: alpha('#10151e', 0.84),
      backdropFilter: 'blur(16px)',
      borderColor: alpha(HEX_WHITE, 0.08),
    },
    monaco: { background: '#0a0d14', gutter: '#0a0d14', highlight: '#151e2e', lineHighlight: '#121a28' },
  },
  light: {
    // Cool pearl — slightly blue-tinted, not warm beige
    background: { default: '#f0f2f7', paper: '#ffffff', elevated: '#ffffff', sunken: '#e6e9f2' },
    // Same hue family as dark but richer saturation for light backgrounds
    chart: ['#2e5fa8', '#c44848', '#b87830', '#3d9068', '#5244a8', '#3d88c4', '#b85830', '#6858c0'],
    // Deep cool navy text — not pure black, has depth and warmth
    text: { primary: '#0f1623', secondary: '#586275', disabled: '#98a2b0', hint: '#7888a0' },
    // Crisp, slightly blue-tinted borders
    border: { default: '#cdd4e4', subtle: '#e0e5f0', hover: '#b0bcce', focus: '#2e5fa8' },
    // Deep navy — same hue as dark mode primary, just darkened for light contrast
    primary: { main: '#2e5fa8', light: '#4c80cc', dark: '#1a3f7e', contrastText: '#ffffff' },
    // Deep violet — consistent brand across modes
    secondary: { main: '#5244a8', light: '#7868c4', dark: '#362e80', contrastText: '#ffffff' },
    error: { main: '#c44848', light: '#dc7878', dark: '#9e3030' },
    warning: { main: '#b87830', light: '#d4a060', dark: '#8e5818' },
    info: { main: '#3d88c4', light: '#60a8dc', dark: '#2468a0' },
    success: { main: '#3d9068', light: '#60b088', dark: '#287048' },
    action: {
      active: alpha(HEX_BLACK, 0.62),
      hover: alpha(HEX_BLACK, 0.04),
      selected: alpha(HEX_BLACK, 0.08),
      disabled: alpha(HEX_BLACK, 0.24),
      disabledBackground: alpha(HEX_BLACK, 0.06),
    },
    scrollbar: { track: 'transparent', thumb: '#c8d0e0', thumbHover: '#b0bcd0' },
    code: { background: alpha('#2e5fa8', 0.07), text: '#2e5fa8', border: alpha('#2e5fa8', 0.18) },
    glassmorphism: {
      background: alpha('#ffffff', 0.92),
      backdropFilter: 'blur(16px)',
      borderColor: alpha(HEX_BLACK, 0.08),
    },
    monaco: { background: '#f5f6fa', gutter: '#f2f3f8', highlight: '#e8ecf5', lineHighlight: '#e4e8f4' },
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