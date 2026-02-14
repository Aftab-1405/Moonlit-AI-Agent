import { createTheme, responsiveFontSizes, alpha } from '@mui/material/styles';
import {
  BACKDROP_FILTER_FALLBACK_QUERY,
  MOBILE_SM_QUERY,
  REDUCED_MOTION_QUERY,
} from './styles/mediaQueries';

const SHAPE = { borderRadius: 10 };
const HEX_WHITE = '#ffffff';
const HEX_BLACK = '#000000';
const HEX_BLACK_20 = '#111111';

const BREAKPOINTS = {
  values: { xs: 0, sm: 600, md: 960, lg: 1200, xl: 1536 },
};

const FONTS = {
  serif: '"Merriweather", "Georgia", serif',
  mono: '"JetBrains Mono", "Fira Code", "Monaco", monospace',
  sans: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
};

const PALETTE_MODES = {
  dark: {
    background: {
      default: '#0c0c0e',
      paper: '#111114',
      elevated: '#15151a',
    },
    text: {
      primary: '#f2f2f2',
      secondary: '#b0b0b0',
      disabled: '#5a5a5a',
      hint: '#8a8a8a',
    },
    border: {
      default: '#2a2a30',
      subtle: '#1e1e24',
      hover: '#3d3d45',
      focus: '#e0e0e0',
    },
    primary: {
      main: '#f0f0f0',
      light: '#ffffff',
      dark: '#b5b5b5',
      contrastText: '#0c0c0e',
    },
    secondary: {
      main: '#8d8d8d',
      light: '#b5b5b5',
      dark: '#686868',
      contrastText: '#f2f2f2',
    },
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
    code: {
      background: alpha(HEX_WHITE, 0.12),
      text: '#f2f2f2',
      border: alpha(HEX_WHITE, 0.1),
    },
    glassmorphism: {
      background: alpha('#0c0c0e', 0.96),
      backdropFilter: 'blur(12px)',
      borderColor: alpha('#1e1e24', 0.9),
    },
    monaco: {
      background: '#0c0c0e',
      gutter: '#0c0c0e',
      highlight: '#ffffff0a',
      lineHighlight: '#ffffff08',
    },
  },

  light: {
    background: {
      default: '#f5f2ee',
      paper: '#f8f4ef',
      elevated: '#fbf7f2',
    },
    text: {
      primary: '#1a1a1a',
      secondary: '#464646',
      disabled: '#8f8f8f',
      hint: '#6f6f6f',
    },
    border: {
      default: '#ddd6cf',
      subtle: '#eee8e2',
      hover: '#c5bdb5',
      focus: '#1a1a1a',
    },
    primary: {
      main: '#1a1a1a',
      light: '#2e2e2e',
      dark: '#0f0f0f',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#6f6f6f',
      light: '#8c8c8c',
      dark: '#565656',
      contrastText: '#ffffff',
    },
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
    code: {
      background: alpha(HEX_BLACK, 0.05),
      text: '#1a1a1a',
      border: alpha(HEX_BLACK, 0.08),
    },
    glassmorphism: {
      background: alpha('#faf6f2', 0.96),
      backdropFilter: 'blur(12px)',
      borderColor: alpha('#ddd6cf', 0.95),
    },
    monaco: {
      background: '#f5f2ee',
      gutter: '#f5f2ee',
      highlight: '#0000000a',
      lineHighlight: '#00000008',
    },
  },
};

const getReadableTextColor = (hex) => {
  if (!hex || typeof hex !== 'string') return HEX_WHITE;
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (full.length !== 6) return HEX_WHITE;

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  return luminance > 0.45 ? HEX_BLACK_20 : HEX_WHITE;
};

const createTypography = (palette) => ({
  fontFamily: FONTS.serif,
  fontFamilyMono: FONTS.mono,
  fontWeightLight: 300,
  fontWeightRegular: 400,
  fontWeightMedium: 500,
  fontWeightBold: 700,

  h1: {
    fontSize: '2.5rem',
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: '-0.015em',
    color: palette.text.primary,
    fontFamily: FONTS.serif,
  },
  h2: {
    fontSize: '2rem',
    fontWeight: 700,
    lineHeight: 1.25,
    letterSpacing: '-0.01em',
    color: palette.text.primary,
    fontFamily: FONTS.serif,
  },
  h3: {
    fontSize: '1.5rem',
    fontWeight: 600,
    lineHeight: 1.35,
    letterSpacing: '-0.005em',
    fontFamily: FONTS.serif,
  },
  h4: {
    fontSize: '1.25rem',
    fontWeight: 600,
    lineHeight: 1.4,
  },
  h5: {
    fontSize: '1.125rem',
    fontWeight: 600,
    lineHeight: 1.5,
  },
  h6: {
    fontSize: '1rem',
    fontWeight: 600,
    lineHeight: 1.5,
  },
  subtitle1: {
    fontSize: '1rem',
    fontWeight: 500,
    lineHeight: 1.6,
    color: palette.text.primary,
  },
  subtitle2: {
    fontSize: '0.875rem',
    fontWeight: 500,
    lineHeight: 1.5,
    color: palette.text.secondary,
  },
  body1: {
    fontSize: '1rem',
    lineHeight: 1.75,
    letterSpacing: '0.008em',
  },
  body2: {
    fontSize: '0.875rem',
    lineHeight: 1.7,
    letterSpacing: '0.008em',
  },
  caption: {
    fontSize: '0.75rem',
    lineHeight: 1.5,
    letterSpacing: '0.02em',
    color: palette.text.secondary,
  },
  overline: {
    fontSize: '0.625rem',
    fontWeight: 600,
    letterSpacing: '0.1em',
    lineHeight: 1.5,
    textTransform: 'uppercase',
    color: palette.text.secondary,
  },
  button: {
    textTransform: 'none',
    fontWeight: 500,
    fontSize: '0.875rem',
    letterSpacing: '0.02em',
  },
  mono: {
    fontFamily: FONTS.mono,
    fontSize: '0.875rem',
    lineHeight: 1.6,
  },
  label: {
    fontFamily: FONTS.mono,
    fontSize: '0.6875rem',
    fontWeight: 500,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: palette.text.hint,
  },
  uiBodyMd: {
    fontSize: { xs: '0.82rem', sm: '0.9rem' },
    lineHeight: 1.65,
    letterSpacing: '0.008em',
  },
  uiBodySm: {
    fontSize: { xs: '0.8rem', sm: '0.875rem' },
    lineHeight: 1.55,
    letterSpacing: '0.008em',
  },
  uiCaptionSm: {
    fontSize: { xs: '0.72rem', sm: '0.8rem' },
    lineHeight: 1.45,
    letterSpacing: '0.01em',
  },
  uiCaptionXs: {
    fontSize: { xs: '0.68rem', sm: '0.75rem' },
    lineHeight: 1.4,
    letterSpacing: '0.01em',
  },
  uiMonoLabel: {
    fontFamily: FONTS.mono,
    fontSize: { xs: '0.62rem', sm: '0.6875rem' },
    fontWeight: 500,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  uiInput: {
    fontSize: { xs: '1rem', sm: '0.95rem' },
  },
  uiBrandWordmark: {
    fontSize: { xs: '2rem', sm: '2.5rem' },
    fontWeight: 800,
    lineHeight: 1.1,
    letterSpacing: '-0.01em',
  },
  uiSidebarWordmark: {
    fontSize: { xs: '1.05rem', sm: '1.1rem' },
    fontWeight: 600,
    lineHeight: 1.2,
    letterSpacing: '-0.01em',
  },
  uiPanelTitle: {
    fontSize: { xs: '0.9rem', sm: '0.95rem' },
    fontWeight: 600,
    lineHeight: 1.35,
  },
  uiCaption2xs: {
    fontSize: { xs: '0.65rem', sm: '0.7rem' },
    lineHeight: 1.4,
    letterSpacing: '0.01em',
  },
  uiCaptionMd: {
    fontSize: { xs: '0.75rem', sm: '0.8125rem' },
    lineHeight: 1.45,
    letterSpacing: '0.01em',
  },
  uiBodyTable: {
    fontSize: { xs: '0.78rem', sm: '0.875rem' },
    lineHeight: 1.55,
    letterSpacing: '0.008em',
  },
  uiSelectCompact: {
    fontSize: { xs: 14, sm: 13 },
  },
  uiCodeBlock: {
    fontSize: '0.85rem',
    lineHeight: 1.5,
  },
  uiHeadingHero: {
    fontSize: { xs: '2rem', sm: '2.5rem', md: '3.25rem' },
    lineHeight: 1.15,
    letterSpacing: '-0.02em',
  },
  uiHeadingLandingLg: {
    fontSize: { xs: '1.75rem', md: '2.25rem' },
    lineHeight: 1.2,
  },
  uiHeadingLandingMd: {
    fontSize: { xs: '1.5rem', md: '2rem' },
    lineHeight: 1.2,
  },
  uiBodyLg: {
    fontSize: { xs: '1rem', md: '1.125rem' },
    lineHeight: 1.7,
  },
  uiLoaderWordmark: {
    fontSize: { xs: '2.5rem', md: '3.5rem' },
    fontWeight: 800,
    lineHeight: 1.1,
    letterSpacing: '-0.015em',
  },
  uiCardTitle: {
    fontSize: '1.1rem',
    lineHeight: 1.35,
  },
  uiCardBody: {
    fontSize: '0.9rem',
    lineHeight: 1.7,
  },
  uiStepNumber: {
    fontSize: '0.85rem',
    lineHeight: 1.1,
    letterSpacing: '0.02em',
  },
  uiSchemaDbLabel: {
    fontSize: { xs: '0.9rem', sm: '0.8rem' },
    lineHeight: 1.3,
  },
  uiSchemaTableLabel: {
    fontSize: { xs: '0.85rem', sm: '0.75rem' },
    lineHeight: 1.3,
  },
  uiSchemaColumnLabel: {
    fontSize: { xs: '0.75rem', sm: '0.7rem' },
    lineHeight: 1.3,
  },
  uiSchemaColumnType: {
    fontSize: { xs: '0.65rem', sm: '0.6rem' },
    lineHeight: 1.2,
  },
  uiCode: {
    fontSizePx: 13,
  },
  uiCodeCompact: {
    fontSizePx: 12,
  },
});

export const TRANSITIONS = {
  default: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  smooth: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
  bounce: 'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  fade: 'opacity 200ms ease-in-out',
};

export const KEYFRAMES = {
  '@keyframes float': {
    '0%, 100%': { transform: 'translateY(0) scale(1)' },
    '50%': { transform: 'translateY(30px) scale(1.05)' },
  },
  '@keyframes shimmer': {
    '0%': { backgroundPosition: '-200% 0' },
    '100%': { backgroundPosition: '200% 0' },
  },
  '@keyframes fadeIn': {
    from: { opacity: 0, transform: 'translateY(8px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
  },
  '@keyframes pulse': {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.5 },
  },
  '@keyframes slideIn': {
    from: { transform: 'translateX(-100%)' },
    to: { transform: 'translateX(0)' },
  },
  '@keyframes slideUp': {
    from: { opacity: 0, transform: 'translateY(20px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
  },
};

const gradientCache = new WeakMap();
const accentEffectsCache = new WeakMap();
const mermaidCache = new WeakMap();
const MONACO_THEME_PREFIX = 'moonlit';
const TRANSPARENT_MONACO_BG = '#00000000';
const MOBILE_MEDIA_QUERY = MOBILE_SM_QUERY;

export const getMonacoThemeName = (mode, transparent = false) =>
  `${MONACO_THEME_PREFIX}-${mode}${transparent ? '-transparent' : ''}`;

const createMonacoTheme = (mode, transparent = false) => {
  const palette = PALETTE_MODES[mode];
  return {
    base: mode === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': transparent ? TRANSPARENT_MONACO_BG : palette.monaco.background,
      'editor.lineHighlightBackground': palette.monaco.lineHighlight,
      'editorGutter.background': transparent ? TRANSPARENT_MONACO_BG : palette.monaco.gutter,
    },
  };
};

export const registerMonacoThemes = (monaco, { transparent = false } = {}) => {
  monaco.editor.defineTheme(
    getMonacoThemeName('dark', transparent),
    createMonacoTheme('dark', transparent)
  );
  monaco.editor.defineTheme(
    getMonacoThemeName('light', transparent),
    createMonacoTheme('light', transparent)
  );
};

export const getMoonlitGradient = (theme) => {
  if (gradientCache.has(theme)) return gradientCache.get(theme);

  const isDark = theme.palette.mode === 'dark';
  const p = theme.palette.text.primary;

  const gradient = isDark
    ? `linear-gradient(135deg, ${alpha(p, 0.2)}, ${alpha(p, 0.8)})`
    : `linear-gradient(135deg, ${alpha(p, 0.6)}, ${alpha(p, 0.3)})`;

  gradientCache.set(theme, gradient);
  return gradient;
};

export const getAccentEffects = (theme) => {
  if (accentEffectsCache.has(theme)) return accentEffectsCache.get(theme);

  const isDark = theme.palette.mode === 'dark';
  const main = theme.palette.text.primary;
  const gradient = isDark
    ? `linear-gradient(135deg, ${alpha(main, 0.6)}, ${main})`
    : `linear-gradient(135deg, ${main}, ${alpha(main, 0.8)})`;

  const effects = isDark
    ? {
        gradient,
        textGradient: gradient,
        glow: `0 0 20px ${alpha(main, 0.1)}, 0 0 40px ${alpha(main, 0.05)}`,
        border: `1px solid ${alpha(main, 0.15)}`,
        background: alpha(main, 0.05),
      }
    : {
        gradient,
        textGradient: gradient,
        glow: `0 4px 20px ${alpha(main, 0.08)}`,
        border: `1px solid ${alpha(main, 0.1)}`,
        background: alpha(main, 0.03),
      };

  const frozen = Object.freeze(effects);
  accentEffectsCache.set(theme, frozen);
  return frozen;
};

export const getGlassSx = (theme) => ({
  backgroundColor: theme.palette.glassmorphism.background,
  backdropFilter: theme.palette.glassmorphism.backdropFilter,
  WebkitBackdropFilter: theme.palette.glassmorphism.backdropFilter,
  border: `1px solid ${theme.palette.glassmorphism.borderColor}`,
  [BACKDROP_FILTER_FALLBACK_QUERY]: {
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
  },
});

export const getGlowButtonSx = (theme) => {
  const isDark = theme.palette.mode === 'dark';
  const main = theme.palette.primary.main;

  return {
    px: 3,
    py: 1.5,
    borderRadius: 2,
    fontWeight: 600,
    background: main,
    color: theme.palette.primary.contrastText,
    border: 'none',
    boxShadow: isDark
      ? `0 4px 15px ${alpha(theme.palette.common.black, 0.4)}`
      : `0 4px 15px ${alpha(theme.palette.common.black, 0.15)}`,
    transition: TRANSITIONS.smooth,
    '&:hover': {
      background: isDark ? theme.palette.primary.light : theme.palette.primary.dark,
      boxShadow: isDark
        ? `0 6px 20px ${alpha(theme.palette.common.black, 0.5)}`
        : `0 6px 20px ${alpha(theme.palette.common.black, 0.2)}`,
      transform: 'translateY(-2px)',
    },
    '&:active': {
      transform: 'scale(0.98)',
    },
  };
};

export const getGradientTextSx = (theme) => ({
  background: getMoonlitGradient(theme),
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
});

const getComponentOverrides = (mode) => {
  const palette = PALETTE_MODES[mode];
  const isDark = mode === 'dark';
  const disableBlurFallback = {
    [BACKDROP_FILTER_FALLBACK_QUERY]: {
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
    },
  };
  const mobileBlurFallback = {
    [MOBILE_MEDIA_QUERY]: {
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
    },
  };

  return {
    MuiCssBaseline: {
      styleOverrides: {
        ...KEYFRAMES,
        '*, *::before, *::after': {
          boxSizing: 'border-box',
        },
        html: {
          colorScheme: mode,
          scrollBehavior: 'smooth',
          WebkitTextSizeAdjust: '100%',
          textSizeAdjust: '100%',
          minHeight: '100%',
        },
        body: {
          margin: 0,
          overflowX: 'hidden',
          minHeight: '100dvh',
          '@supports not (min-height: 100dvh)': {
            minHeight: '100vh',
          },
          fontSize: '1rem',
          fontFeatureSettings: '"liga" 1, "calt" 1',
          textRendering: 'optimizeLegibility',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          backgroundColor: palette.background.default,
          backgroundImage: isDark
            ? `radial-gradient(60% 60% at 20% 0%, ${alpha(HEX_WHITE, 0.05)}, transparent 60%), radial-gradient(60% 60% at 80% 100%, ${alpha(HEX_WHITE, 0.04)}, transparent 60%)`
            : `radial-gradient(60% 60% at 20% 0%, ${alpha(HEX_BLACK, 0.04)}, transparent 60%), radial-gradient(60% 60% at 80% 100%, ${alpha(HEX_BLACK, 0.03)}, transparent 60%)`,

          '--scrollbar-track': palette.scrollbar.track,
          '--scrollbar-thumb': palette.scrollbar.thumb,
          '--scrollbar-thumb-hover': palette.scrollbar.thumbHover,
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--scrollbar-thumb) var(--scrollbar-track)',

          '&::-webkit-scrollbar': { width: 8, height: 8 },
          '&::-webkit-scrollbar-track': { background: 'var(--scrollbar-track)' },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'var(--scrollbar-thumb)',
            borderRadius: 4,
            border: '2px solid transparent',
            backgroundClip: 'content-box',
            '&:hover': { backgroundColor: 'var(--scrollbar-thumb-hover)' },
          },
          [MOBILE_MEDIA_QUERY]: {
            '& input, & select, & textarea': {
              fontSize: '16px',
            },
          },
        },
        '#root': {
          minHeight: '100dvh',
          '@supports not (min-height: 100dvh)': {
            minHeight: '100vh',
          },
        },
        [REDUCED_MOTION_QUERY]: {
          '*': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important',
            scrollBehavior: 'auto !important',
          },
        },
      },
    },

    MuiButtonBase: {
      defaultProps: { disableRipple: true },
    },

    MuiButton: {
      defaultProps: {
        disableElevation: true,
        variant: 'outlined',
      },
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '10px 22px',
          fontWeight: 500,
          transition: TRANSITIONS.default,
          borderWidth: 1,
          [MOBILE_MEDIA_QUERY]: {
            minHeight: 44,
            padding: '10px 18px',
          },
          '&:active': { transform: 'scale(0.98)' },
        },
        outlined: {
          borderColor: palette.border.default,
          color: palette.text.primary,
          backgroundColor: isDark
            ? alpha(palette.text.primary, 0.02)
            : alpha(palette.text.primary, 0.015),
          '&:hover': {
            borderColor: palette.border.hover,
            backgroundColor: palette.action.hover,
          },
        },
        contained: {
          backgroundColor: palette.primary.main,
          color: palette.primary.contrastText,
          '&:hover': {
            backgroundColor: isDark ? palette.primary.light : palette.primary.dark,
            boxShadow: isDark
              ? `0 4px 12px ${alpha(HEX_BLACK, 0.4)}`
              : `0 4px 12px ${alpha(HEX_BLACK, 0.15)}`,
          },
        },
        containedPrimary: {
          backgroundColor: palette.primary.main,
          color: palette.primary.contrastText,
          '&:hover': { backgroundColor: isDark ? palette.primary.light : palette.primary.dark },
        },
        containedSecondary: {
          backgroundColor: palette.secondary.main,
          color: palette.secondary.contrastText,
          '&:hover': { backgroundColor: isDark ? palette.secondary.light : palette.secondary.dark },
        },
        containedSuccess: {
          backgroundColor: palette.success.main,
          color: getReadableTextColor(palette.success.main),
          '&:hover': { backgroundColor: palette.success.dark },
        },
        containedWarning: {
          backgroundColor: palette.warning.main,
          color: getReadableTextColor(palette.warning.main),
          '&:hover': { backgroundColor: palette.warning.dark },
        },
        containedError: {
          backgroundColor: palette.error.main,
          color: getReadableTextColor(palette.error.main),
          '&:hover': { backgroundColor: palette.error.dark },
        },
        containedInfo: {
          backgroundColor: palette.info.main,
          color: getReadableTextColor(palette.info.main),
          '&:hover': { backgroundColor: palette.info.dark },
        },

        outlinedPrimary: {
          borderColor: alpha(palette.primary.main, isDark ? 0.35 : 0.4),
          color: palette.primary.main,
          '&:hover': {
            borderColor: palette.primary.main,
            backgroundColor: alpha(palette.primary.main, isDark ? 0.12 : 0.08),
          },
        },
        outlinedSecondary: {
          borderColor: alpha(palette.secondary.main, isDark ? 0.35 : 0.4),
          color: palette.secondary.main,
          '&:hover': {
            borderColor: palette.secondary.main,
            backgroundColor: alpha(palette.secondary.main, isDark ? 0.12 : 0.08),
          },
        },
        outlinedSuccess: {
          borderColor: alpha(palette.success.main, isDark ? 0.35 : 0.4),
          color: palette.success.main,
          '&:hover': {
            borderColor: palette.success.main,
            backgroundColor: alpha(palette.success.main, isDark ? 0.12 : 0.08),
          },
        },
        outlinedWarning: {
          borderColor: alpha(palette.warning.main, isDark ? 0.35 : 0.4),
          color: palette.warning.main,
          '&:hover': {
            borderColor: palette.warning.main,
            backgroundColor: alpha(palette.warning.main, isDark ? 0.12 : 0.08),
          },
        },
        outlinedError: {
          borderColor: alpha(palette.error.main, isDark ? 0.35 : 0.4),
          color: palette.error.main,
          '&:hover': {
            borderColor: palette.error.main,
            backgroundColor: alpha(palette.error.main, isDark ? 0.12 : 0.08),
          },
        },
        outlinedInfo: {
          borderColor: alpha(palette.info.main, isDark ? 0.35 : 0.4),
          color: palette.info.main,
          '&:hover': {
            borderColor: palette.info.main,
            backgroundColor: alpha(palette.info.main, isDark ? 0.12 : 0.08),
          },
        },

        textPrimary: {
          color: palette.primary.main,
          '&:hover': { backgroundColor: alpha(palette.primary.main, isDark ? 0.12 : 0.08) },
        },
        textSecondary: {
          color: palette.secondary.main,
          '&:hover': { backgroundColor: alpha(palette.secondary.main, isDark ? 0.12 : 0.08) },
        },
        textSuccess: {
          color: palette.success.main,
          '&:hover': { backgroundColor: alpha(palette.success.main, isDark ? 0.12 : 0.08) },
        },
        textWarning: {
          color: palette.warning.main,
          '&:hover': { backgroundColor: alpha(palette.warning.main, isDark ? 0.12 : 0.08) },
        },
        textError: {
          color: palette.error.main,
          '&:hover': { backgroundColor: alpha(palette.error.main, isDark ? 0.12 : 0.08) },
        },
        textInfo: {
          color: palette.info.main,
          '&:hover': { backgroundColor: alpha(palette.info.main, isDark ? 0.12 : 0.08) },
        },

        sizeSmall: { padding: '6px 16px', fontSize: '0.8125rem' },
        sizeLarge: { padding: '14px 28px', fontSize: '0.9375rem' },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          transition: TRANSITIONS.default,
          [MOBILE_MEDIA_QUERY]: {
            minWidth: 44,
            minHeight: 44,
          },
          '&:hover': { backgroundColor: palette.action.hover },
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: SHAPE.borderRadius,
          backgroundColor: palette.background.paper,
          backgroundImage: isDark
            ? `linear-gradient(180deg, ${alpha(HEX_WHITE, 0.02)}, transparent)`
            : `linear-gradient(180deg, ${alpha(HEX_BLACK, 0.015)}, transparent)`,
        },
        elevation1: {
          boxShadow: isDark
            ? `0 1px 3px 0 ${alpha(HEX_BLACK, 0.5)}`
            : `0 1px 3px 0 ${alpha(HEX_BLACK, 0.08)}`,
          border: `1px solid ${palette.border.subtle}`,
        },
        elevation2: {
          boxShadow: isDark
            ? `0 4px 6px -1px ${alpha(HEX_BLACK, 0.6)}`
            : `0 4px 6px -1px ${alpha(HEX_BLACK, 0.08)}`,
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          border: `1px solid ${palette.border.subtle}`,
          boxShadow: 'none',
          transition: TRANSITIONS.smooth,
          backgroundImage: isDark
            ? `linear-gradient(180deg, ${alpha(HEX_WHITE, 0.02)}, transparent)`
            : `linear-gradient(180deg, ${alpha(HEX_BLACK, 0.015)}, transparent)`,
          '&:hover': { borderColor: palette.border.hover },
        },
      },
    },

    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            backgroundColor: alpha(palette.background.paper, isDark ? 0.7 : 0.9),
            transition: TRANSITIONS.default,
            '& fieldset': {
              borderColor: palette.border.default,
              borderWidth: 1,
              transition: TRANSITIONS.default,
            },
            '&:hover fieldset': { borderColor: palette.border.hover },
            '&.Mui-focused fieldset': {
              borderColor: palette.border.focus,
              borderWidth: 1.5,
            },
          },
          '& .MuiInputBase-input': {
            '&::placeholder': { color: palette.text.hint, opacity: 0.8 },
          },
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 500,
          transition: TRANSITIONS.default,
        },
        filled: {
          backgroundColor: alpha(palette.text.primary, isDark ? 0.06 : 0.05),
          color: palette.text.primary,
          '&:hover': { backgroundColor: alpha(palette.text.primary, isDark ? 0.1 : 0.08) },
        },
        outlined: {
          borderColor: palette.border.default,
          '&:hover': { backgroundColor: palette.action.hover },
        },

        filledPrimary: {
          backgroundColor: alpha(palette.primary.main, isDark ? 0.16 : 0.12),
          color: palette.primary.main,
        },
        filledSecondary: {
          backgroundColor: alpha(palette.secondary.main, isDark ? 0.16 : 0.12),
          color: palette.secondary.main,
        },
        filledSuccess: {
          backgroundColor: alpha(palette.success.main, isDark ? 0.16 : 0.12),
          color: palette.success.main,
        },
        filledWarning: {
          backgroundColor: alpha(palette.warning.main, isDark ? 0.16 : 0.12),
          color: palette.warning.main,
        },
        filledError: {
          backgroundColor: alpha(palette.error.main, isDark ? 0.16 : 0.12),
          color: palette.error.main,
        },
        filledInfo: {
          backgroundColor: alpha(palette.info.main, isDark ? 0.16 : 0.12),
          color: palette.info.main,
        },

        outlinedPrimary: {
          borderColor: alpha(palette.primary.main, isDark ? 0.35 : 0.4),
          color: palette.primary.main,
        },
        outlinedSecondary: {
          borderColor: alpha(palette.secondary.main, isDark ? 0.35 : 0.4),
          color: palette.secondary.main,
        },
        outlinedSuccess: {
          borderColor: alpha(palette.success.main, isDark ? 0.35 : 0.4),
          color: palette.success.main,
        },
        outlinedWarning: {
          borderColor: alpha(palette.warning.main, isDark ? 0.35 : 0.4),
          color: palette.warning.main,
        },
        outlinedError: {
          borderColor: alpha(palette.error.main, isDark ? 0.35 : 0.4),
          color: palette.error.main,
        },
        outlinedInfo: {
          borderColor: alpha(palette.info.main, isDark ? 0.35 : 0.4),
          color: palette.info.main,
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: isDark ? palette.background.elevated : palette.text.primary,
          color: isDark ? palette.text.primary : palette.background.paper,
          borderRadius: 4,
          fontSize: '0.75rem',
          fontWeight: 500,
          padding: '8px 12px',
          boxShadow: isDark ? 'none' : `0 4px 6px -1px ${alpha(HEX_BLACK, 0.1)}`,
          border: isDark ? `1px solid ${palette.border.default}` : 'none',
        },
        arrow: {
          color: isDark ? palette.background.elevated : palette.text.primary,
        },
      },
    },

    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha(palette.background.paper, isDark ? 0.8 : 0.9),
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${palette.border.subtle}`,
          boxShadow: 'none',
          ...disableBlurFallback,
          ...mobileBlurFallback,
        },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: palette.background.paper,
          border: `1px solid ${palette.border.subtle}`,
          backgroundImage: isDark
            ? `linear-gradient(180deg, ${alpha(HEX_WHITE, 0.02)}, transparent)`
            : `linear-gradient(180deg, ${alpha(HEX_BLACK, 0.02)}, transparent)`,
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: palette.background.paper,
          borderRight: `1px solid ${palette.border.subtle}`,
        },
      },
    },
    MuiSnackbarContent: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          border: `1px solid ${palette.border.subtle}`,
          backgroundColor: palette.background.elevated,
        },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${palette.border.subtle}` },
        head: {
          color: palette.text.secondary,
          fontWeight: 600,
          backgroundColor: alpha(palette.text.primary, isDark ? 0.04 : 0.03),
        },
      },
    },

    MuiTablePagination: {
      styleOverrides: {
        root: {
          backgroundColor: palette.background.default,
          borderTop: `1px solid ${palette.border.subtle}`,
        },
        selectLabel: { color: palette.text.secondary },
        displayedRows: { color: palette.text.secondary },
        select: { color: palette.text.primary },
        actions: { color: palette.text.primary },
      },
    },

    MuiMenu: {
      styleOverrides: {
        paper: {
          border: `1px solid ${alpha(palette.border.subtle, isDark ? 0.9 : 0.95)}`,
          backgroundColor: alpha(palette.background.elevated, isDark ? 0.96 : 0.98),
          backgroundImage: 'none',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          boxShadow: 'none',
          borderRadius: 8,
          ...disableBlurFallback,
          ...mobileBlurFallback,
        },
      },
    },

    MuiPopover: {
      styleOverrides: {
        paper: {
          backgroundColor: alpha(palette.background.elevated, isDark ? 0.96 : 0.98),
          backgroundImage: 'none',
          border: `1px solid ${alpha(palette.border.subtle, isDark ? 0.9 : 0.95)}`,
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          boxShadow: 'none',
          ...disableBlurFallback,
          ...mobileBlurFallback,
        },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          margin: '2px 8px',
          padding: '10px 16px',
          transition: TRANSITIONS.default,
          [MOBILE_MEDIA_QUERY]: {
            minHeight: 44,
          },
          '&:hover': { backgroundColor: palette.action.hover },
          '&.Mui-selected': {
            backgroundColor: palette.action.selected,
            fontWeight: 600,
            '&:hover': { backgroundColor: palette.action.selected },
          },
        },
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          transition: TRANSITIONS.default,
          '&:hover': { backgroundColor: palette.action.hover },
          '&.Mui-selected': {
            backgroundColor: palette.action.selected,
            '&:hover': { backgroundColor: palette.action.selected },
          },
        },
      },
    },

    MuiLink: {
      styleOverrides: {
        root: {
          color: palette.primary.main,
          textDecoration: 'underline',
          textUnderlineOffset: '2px',
          transition: TRANSITIONS.default,
          '&:hover': { color: isDark ? palette.primary.light : palette.primary.dark },
        },
      },
    },

    MuiSkeleton: {
      styleOverrides: {
        root: {
          backgroundColor: alpha(palette.text.secondary, 0.08),
          borderRadius: 4,
        },
      },
    },

    MuiDivider: {
      styleOverrides: {
        root: { borderColor: palette.border.subtle },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          border: `1px solid ${palette.border.subtle}`,
        },
        standardSuccess: {
          backgroundColor: alpha(palette.success.main, isDark ? 0.12 : 0.08),
          color: palette.text.primary,
          '& .MuiAlert-icon': { color: palette.success.main },
        },
        standardInfo: {
          backgroundColor: alpha(palette.info.main, isDark ? 0.12 : 0.08),
          color: palette.text.primary,
          '& .MuiAlert-icon': { color: palette.info.main },
        },
        standardWarning: {
          backgroundColor: alpha(palette.warning.main, isDark ? 0.12 : 0.08),
          color: palette.text.primary,
          '& .MuiAlert-icon': { color: palette.warning.main },
        },
        standardError: {
          backgroundColor: alpha(palette.error.main, isDark ? 0.12 : 0.08),
          color: palette.text.primary,
          '& .MuiAlert-icon': { color: palette.error.main },
        },
      },
    },

    MuiBadge: {
      styleOverrides: {
        badge: {
          fontWeight: 600,
          border: `1px solid ${alpha(palette.background.paper, isDark ? 0.2 : 0.4)}`,
        },
      },
    },

    MuiSwitch: {
      styleOverrides: {
        root: {
          width: 44,
          height: 26,
          padding: 0,
          display: 'flex',
        },
        switchBase: {
          padding: 3,
          '&.Mui-checked': {
            transform: 'translateX(18px)',
            color: palette.background.paper,
            '& + .MuiSwitch-track': {
              opacity: 1,
              backgroundColor: palette.success.main,
              borderColor: alpha(palette.success.main, isDark ? 0.4 : 0.5),
            },
          },
          '&.Mui-disabled + .MuiSwitch-track': {
            opacity: 0.5,
          },
        },
        thumb: {
          boxShadow: 'none',
          width: 20,
          height: 20,
        },
        track: {
          opacity: 1,
          borderRadius: 13,
          backgroundColor: isDark
            ? alpha(palette.text.primary, 0.2)
            : alpha(palette.text.primary, 0.1),
          border: `1px solid ${palette.border.default}`,
        },
      },
    },

    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: palette.text.secondary,
          '&.Mui-checked': { color: palette.primary.main },
          '&.MuiCheckbox-indeterminate': { color: palette.primary.main },
        },
      },
    },

    MuiRadio: {
      styleOverrides: {
        root: {
          color: palette.text.secondary,
          '&.Mui-checked': { color: palette.primary.main },
          '&.MuiRadio-colorSecondary.Mui-checked': { color: palette.secondary.main },
        },
      },
    },

    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderColor: palette.border.default,
          color: palette.text.secondary,
          textTransform: 'none',
          '&:hover': { backgroundColor: palette.action.hover },
          '&.Mui-selected': {
            color: palette.text.primary,
            backgroundColor: palette.action.selected,
            '&:hover': { backgroundColor: palette.action.selected },
          },
        },
      },
    },
  };
};
//    NOTE: If mermaid content is untrusted/user-provided, consider securityLevel:'strict'.

export const getMermaidThemeConfig = (theme) => {
  if (mermaidCache.has(theme)) return mermaidCache.get(theme);

  const isDark = theme.palette.mode === 'dark';
  const { palette } = theme;

  const config = {
    startOnLoad: false,
    suppressErrorRendering: true,
    securityLevel: 'loose',
    theme: isDark ? 'dark' : 'neutral',
    themeVariables: {
      primaryColor: palette.primary.main,
      primaryTextColor: palette.text.primary,
      primaryBorderColor: palette.border.default,
      lineColor: palette.text.secondary,
      secondaryColor: palette.secondary.main,
      tertiaryColor: palette.background.default,
      background: 'transparent',
      mainBkg: palette.background.paper,
      nodeBorder: palette.border.default,
      clusterBkg: alpha(palette.background.paper, 0.5),
      clusterBorder: palette.border.default,
      titleColor: palette.text.primary,
      edgeLabelBackground: palette.background.paper,
      nodeTextColor: palette.text.primary,
      entityBkg: palette.background.paper,
      entityBorder: palette.border.default,
      attributeBoxBkg: palette.action.hover,
      attributeBoxText: palette.text.primary,
      relationLabelColor: palette.text.secondary,
    },
  };

  mermaidCache.set(theme, config);
  return config;
};

const createBaseTheme = (mode) => {
  const palette = {
    mode,
    ...PALETTE_MODES[mode],
    divider: PALETTE_MODES[mode].border.subtle,
  };

  const theme = createTheme({
    breakpoints: BREAKPOINTS,
    spacing: 8,
    shape: SHAPE,
    palette,
    typography: createTypography(palette),
    components: getComponentOverrides(mode),
  });
  theme.custom = {
    getGradient: () => getMoonlitGradient(theme),
    getEffects: () => getAccentEffects(theme),
    getNaturalMoonlitEffects: () => getAccentEffects(theme),
    fonts: FONTS,
    transitions: TRANSITIONS,
    alpha: {
      subtle: 0.05,
      light: 0.1,
      medium: 0.2,
      strong: 0.4,
    },
  };

  return theme;
};

const THEME_CACHE = new Map();

const getCachedTheme = (mode) => {
  if (THEME_CACHE.has(mode)) return THEME_CACHE.get(mode);
  const built = responsiveFontSizes(createBaseTheme(mode));
  THEME_CACHE.set(mode, built);
  return built;
};

export const createDarkTheme = () => getCachedTheme('dark');
export const createLightTheme = () => getCachedTheme('light');
export const darkTheme = createDarkTheme();
export const lightTheme = createLightTheme();

export const getNaturalMoonlitEffects = getAccentEffects;
export const getGlassCardSx = getGlassSx;

export default darkTheme;
