import { alpha } from '@mui/material/styles';

export const SHAPE = { borderRadius: 10 };
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

export const PALETTE_MODES = {
  dark: {
    background: { default: '#0c0c0e', paper: '#111114', elevated: '#15151a' },
    text: { primary: '#f2f2f2', secondary: '#b0b0b0', disabled: '#5a5a5a', hint: '#8a8a8a' },
    border: { default: '#2a2a30', subtle: '#1e1e24', hover: '#3d3d45', focus: '#e0e0e0' },
    primary: { main: '#f0f0f0', light: '#ffffff', dark: '#b5b5b5', contrastText: '#0c0c0e' },
    secondary: { main: '#8d8d8d', light: '#b5b5b5', dark: '#686868', contrastText: '#f2f2f2' },
    error: { main: '#ef4444', light: '#f87171', dark: '#dc2626' },
    warning: { main: '#f59e0b', light: '#fbbf24', dark: '#d97706' },
    info: { main: '#3b82f6', light: '#60a5fa', dark: '#2563eb' },
    success: { main: '#22c55e', light: '#4ade80', dark: '#16a34a' },
    action: {
      active: alpha(HEX_WHITE, 0.7),
      hover: alpha(HEX_WHITE, 0.045),
      selected: alpha(HEX_WHITE, 0.09),
      disabled: alpha(HEX_WHITE, 0.28),
      disabledBackground: alpha(HEX_WHITE, 0.14),
    },
    scrollbar: { track: 'transparent', thumb: '#3b3b44', thumbHover: '#4b4b55' },
    code: { background: alpha(HEX_WHITE, 0.12), text: '#f2f2f2', border: alpha(HEX_WHITE, 0.1) },
    glassmorphism: {
      background: alpha('#0c0c0e', 0.96),
      backdropFilter: 'blur(12px)',
      borderColor: alpha('#1e1e24', 0.9),
    },
    monaco: { background: '#0c0c0e', gutter: '#0c0c0e', highlight: '#ffffff0a', lineHighlight: '#ffffff08' },
  },
  light: {
    background: { default: '#f5f2ee', paper: '#f8f4ef', elevated: '#fbf7f2' },
    text: { primary: '#1a1a1a', secondary: '#464646', disabled: '#8f8f8f', hint: '#6f6f6f' },
    border: { default: '#ddd6cf', subtle: '#eee8e2', hover: '#c5bdb5', focus: '#1a1a1a' },
    primary: { main: '#1a1a1a', light: '#2e2e2e', dark: '#0f0f0f', contrastText: '#ffffff' },
    secondary: { main: '#6f6f6f', light: '#8c8c8c', dark: '#565656', contrastText: '#ffffff' },
    error: { main: '#dc2626', light: '#ef4444', dark: '#b91c1c' },
    warning: { main: '#d97706', light: '#f59e0b', dark: '#b45309' },
    info: { main: '#2563eb', light: '#3b82f6', dark: '#1d4ed8' },
    success: { main: '#16a34a', light: '#22c55e', dark: '#15803d' },
    action: {
      active: alpha(HEX_BLACK, 0.6),
      hover: alpha(HEX_BLACK, 0.06),
      selected: alpha(HEX_BLACK, 0.12),
      disabled: alpha(HEX_BLACK, 0.24),
      disabledBackground: alpha(HEX_BLACK, 0.12),
    },
    scrollbar: { track: 'transparent', thumb: '#bdb6ad', thumbHover: '#a69f96' },
    code: { background: alpha(HEX_BLACK, 0.05), text: '#1a1a1a', border: alpha(HEX_BLACK, 0.08) },
    glassmorphism: {
      background: alpha('#faf6f2', 0.96),
      backdropFilter: 'blur(12px)',
      borderColor: alpha('#ddd6cf', 0.95),
    },
    monaco: { background: '#f5f2ee', gutter: '#f5f2ee', highlight: '#0000000a', lineHighlight: '#00000008' },
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
