import { createTheme, responsiveFontSizes, alpha } from '@mui/material/styles';

// ============================================
// 1. DESIGN TOKENS (Static Constants)
// ============================================

const SHAPE = { borderRadius: 8 };

const BREAKPOINTS = {
  values: { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 },
};

const FONTS = {
  serif: '"Merriweather", "Georgia", serif',
  mono: '"JetBrains Mono", "Fira Code", "Monaco", monospace',
  sans: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
};

// ============================================
// 2. MONOCHROMATIC COLOR SYSTEM
// ============================================

const PALETTE_MODES = {
  dark: {
    background: {
      default: '#0a0a0a',
      paper: '#141414',
      elevated: '#1a1a1a',
    },
    text: {
      primary: '#fafafa',
      secondary: '#a3a3a3',
      disabled: '#525252',
      hint: '#737373',
    },
    border: {
      default: '#262626',
      subtle: '#1a1a1a',
      hover: '#404040',
      focus: '#d4d4d4',
    },
    primary: {
      main: '#e5e5e5',
      light: '#fafafa',
      dark: '#a3a3a3',
      contrastText: '#0a0a0a',
    },
    secondary: {
      main: '#737373',
      light: '#a3a3a3',
      dark: '#525252',
      contrastText: '#fafafa',
    },
    error: { main: '#ef4444', light: '#f87171', dark: '#dc2626' },
    warning: { main: '#f59e0b', light: '#fbbf24', dark: '#d97706' },
    info: { main: '#3b82f6', light: '#60a5fa', dark: '#2563eb' },
    success: { main: '#22c55e', light: '#4ade80', dark: '#16a34a' },
    action: {
      active: 'rgba(255, 255, 255, 0.7)',
      hover: 'rgba(255, 255, 255, 0.04)',
      selected: 'rgba(255, 255, 255, 0.08)',
      disabled: 'rgba(255, 255, 255, 0.26)',
      disabledBackground: 'rgba(255, 255, 255, 0.12)',
    },
    scrollbar: { track: 'transparent', thumb: '#404040', thumbHover: '#525252' },
  },
  light: {
    background: {
      default: '#fafafa',
      paper: '#ffffff',
      elevated: '#ffffff',
    },
    text: {
      primary: '#171717',
      secondary: '#525252',
      disabled: '#a3a3a3',
      hint: '#737373',
    },
    border: {
      default: '#e5e5e5',
      subtle: '#f5f5f5',
      hover: '#d4d4d4',
      focus: '#404040',
    },
    primary: {
      main: '#262626',
      light: '#404040',
      dark: '#171717',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#737373',
      light: '#a3a3a3',
      dark: '#525252',
      contrastText: '#ffffff',
    },
    error: { main: '#dc2626', light: '#ef4444', dark: '#b91c1c' },
    warning: { main: '#d97706', light: '#f59e0b', dark: '#b45309' },
    info: { main: '#2563eb', light: '#3b82f6', dark: '#1d4ed8' },
    success: { main: '#16a34a', light: '#22c55e', dark: '#15803d' },
    action: {
      active: 'rgba(0, 0, 0, 0.6)',
      hover: 'rgba(0, 0, 0, 0.04)',
      selected: 'rgba(0, 0, 0, 0.08)',
      disabled: 'rgba(0, 0, 0, 0.26)',
      disabledBackground: 'rgba(0, 0, 0, 0.12)',
    },
    scrollbar: { track: 'transparent', thumb: '#d4d4d4', thumbHover: '#a3a3a3' },
  },
};

// ============================================
// 3. TYPOGRAPHY SYSTEM
// ============================================

const createTypography = (palette) => ({
  fontFamily: FONTS.serif,
  fontWeightLight: 300,
  fontWeightRegular: 400,
  fontWeightMedium: 500,
  fontWeightBold: 700,
  
  h1: {
    fontSize: '2.5rem',
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: '-0.02em',
    color: palette.text.primary,
  },
  h2: {
    fontSize: '2rem',
    fontWeight: 700,
    lineHeight: 1.25,
    letterSpacing: '-0.01em',
    color: palette.text.primary,
  },
  h3: {
    fontSize: '1.5rem',
    fontWeight: 600,
    lineHeight: 1.3,
    letterSpacing: '-0.005em',
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
    lineHeight: 1.5,
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
    lineHeight: 1.6,
    letterSpacing: '0.01em',
  },
  body2: {
    fontSize: '0.875rem',
    lineHeight: 1.6,
    letterSpacing: '0.01em',
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
    letterSpacing: '0.025em',
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
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: palette.text.hint,
  },
});

// ============================================
// 4. ANIMATION PRESETS (EXPORTED)
// ============================================

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

// ============================================
// 5. UTILITY FUNCTIONS (Monochrome)
// ============================================

const gradientCache = new Map();

export const getMoonlitGradient = (theme) => {
  const mode = theme.palette.mode;
  if (gradientCache.has(mode)) return gradientCache.get(mode);
  
  const gradient = mode === 'dark'
    ? `linear-gradient(135deg, ${theme.palette.text.secondary}, ${theme.palette.text.primary})`
    : `linear-gradient(135deg, ${theme.palette.text.primary}, ${theme.palette.text.secondary})`;
    
  gradientCache.set(mode, gradient);
  return gradient;
};

export const getAccentEffects = (theme) => {
  const isDark = theme.palette.mode === 'dark';
  const main = theme.palette.text.primary;
  
  const effects = isDark ? {
    gradient: `linear-gradient(135deg, ${alpha(main, 0.6)}, ${main})`,
    glow: `0 0 20px ${alpha(main, 0.1)}, 0 0 40px ${alpha(main, 0.05)}`,
    border: `1px solid ${alpha(main, 0.15)}`,
    background: alpha(main, 0.05),
  } : {
    gradient: `linear-gradient(135deg, ${main}, ${alpha(main, 0.8)})`,
    glow: `0 4px 20px ${alpha(main, 0.08)}`,
    border: `1px solid ${alpha(main, 0.1)}`,
    background: alpha(main, 0.03),
  };
  
  return Object.freeze(effects);
};

export const getGlassSx = (theme) => ({
  backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.6 : 0.8),
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
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
      ? `0 4px 15px ${alpha('#000', 0.4)}`
      : `0 4px 15px ${alpha('#000', 0.15)}`,
    transition: TRANSITIONS.smooth,
    '&:hover': {
      background: isDark ? theme.palette.primary.light : theme.palette.primary.dark,
      boxShadow: isDark
        ? `0 6px 20px ${alpha('#000', 0.5)}`
        : `0 6px 20px ${alpha('#000', 0.2)}`,
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

// ============================================
// 6. COMPONENT OVERRIDES
// ============================================

const getComponentOverrides = (mode) => {
  const palette = PALETTE_MODES[mode];
  const isDark = mode === 'dark';
  
  return {
    MuiCssBaseline: {
      styleOverrides: {
        ...KEYFRAMES,
        html: {
          colorScheme: mode,
          scrollBehavior: 'smooth',
        },
        body: {
          fontFeatureSettings: '"liga" 1, "calt" 1',
          textRendering: 'optimizeLegibility',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          '--scrollbar-thumb': palette.scrollbar.thumb,
          '--scrollbar-thumb-hover': palette.scrollbar.thumbHover,
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--scrollbar-thumb) transparent',
          '&::-webkit-scrollbar': { width: 8, height: 8 },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'var(--scrollbar-thumb)',
            borderRadius: 4,
            border: `2px solid transparent`,
            backgroundClip: 'content-box',
            '&:hover': { backgroundColor: 'var(--scrollbar-thumb-hover)' },
          },
        },
        '@media (prefers-reduced-motion: reduce)': {
          '*': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important',
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
          borderRadius: 6,
          padding: '10px 24px',
          fontWeight: 600,
          transition: TRANSITIONS.default,
          borderWidth: 1,
          '&:active': { transform: 'scale(0.98)' },
        },
        outlined: {
          borderColor: palette.border.default,
          color: palette.text.primary,
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
              ? `0 4px 12px ${alpha('#000', 0.4)}`
              : `0 4px 12px ${alpha('#000', 0.15)}`,
          },
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
          '&:hover': {
            backgroundColor: palette.action.hover,
          },
        },
      },
    },
    
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: SHAPE.borderRadius,
          backgroundColor: palette.background.paper,
        },
        elevation1: {
          boxShadow: isDark 
            ? '0 1px 3px 0 rgba(0, 0, 0, 0.5)' 
            : '0 1px 3px 0 rgba(0, 0, 0, 0.08)',
          border: `1px solid ${palette.border.subtle}`,
        },
        elevation2: {
          boxShadow: isDark
            ? '0 4px 6px -1px rgba(0, 0, 0, 0.6)'
            : '0 4px 6px -1px rgba(0, 0, 0, 0.08)',
        },
      },
    },
    
    MuiCard: {
      styleOverrides: {
        root: {
          border: `1px solid ${palette.border.subtle}`,
          boxShadow: 'none',
          transition: TRANSITIONS.smooth,
          '&:hover': {
            borderColor: palette.border.hover,
          },
        },
      },
    },
    
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 6,
            backgroundColor: palette.background.elevated,
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
          borderRadius: 4, 
          fontWeight: 500,
          transition: TRANSITIONS.default,
        },
        filled: {
          backgroundColor: palette.border.default,
          color: palette.text.primary,
          '&:hover': { backgroundColor: palette.border.hover },
        },
        outlined: {
          borderColor: palette.border.default,
          '&:hover': { backgroundColor: palette.action.hover },
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
          boxShadow: isDark ? 'none' : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          border: isDark ? `1px solid ${palette.border.default}` : 'none',
        },
        arrow: {
          color: isDark ? palette.background.elevated : palette.text.primary,
        },
      },
    },
    
    MuiMenu: {
      styleOverrides: {
        paper: {
          border: `1px solid ${palette.border.subtle}`,
          boxShadow: isDark 
            ? '0 20px 25px -5px rgba(0, 0, 0, 0.6)'
            : '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          borderRadius: 8,
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
          '&:hover': { backgroundColor: palette.action.hover },
          '&.Mui-selected': {
            backgroundColor: palette.action.selected,
            fontWeight: 600,
            '&:hover': { 
              backgroundColor: palette.action.selected,
            },
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
            '&:hover': {
              backgroundColor: palette.action.selected,
            },
          },
        },
      },
    },
    
    MuiLink: {
      styleOverrides: {
        root: {
          color: palette.text.primary,
          textDecoration: 'underline',
          textUnderlineOffset: '2px',
          transition: TRANSITIONS.default,
          '&:hover': { 
            color: palette.text.secondary,
          },
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
        root: {
          borderColor: palette.border.subtle,
        },
      },
    },
  };
};

// ============================================
// 7. MERMAID CONFIG (Cached)
// ============================================

const mermaidCache = new Map();

export const getMermaidThemeConfig = (theme) => {
  const mode = theme.palette.mode;
  if (mermaidCache.has(mode)) return mermaidCache.get(mode);
  
  const isDark = mode === 'dark';
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
  
  mermaidCache.set(mode, config);
  return config;
};

// ============================================
// 8. THEME FACTORIES
// ============================================

const createBaseTheme = (mode) => {
  const palette = {
    mode,
    ...PALETTE_MODES[mode],
  };
  
  const theme = createTheme({
    breakpoints: BREAKPOINTS,
    shape: SHAPE,
    palette,
    typography: createTypography(palette),
    components: getComponentOverrides(mode),
  });
  
  theme.custom = {
    getGradient: () => getMoonlitGradient(theme),
    getEffects: () => getAccentEffects(theme),
    fonts: FONTS,
    transitions: TRANSITIONS,
  };
  
  return theme;
};

export const createDarkTheme = () => responsiveFontSizes(createBaseTheme('dark'));
export const createLightTheme = () => responsiveFontSizes(createBaseTheme('light'));

// ============================================
// 9. BACKWARDS COMPATIBILITY ALIASES
// ============================================

export const getNaturalMoonlitEffects = getAccentEffects;
export const getGlassCardSx = getGlassSx;

// ============================================
// 10. DEFAULT EXPORT
// ============================================

export default createDarkTheme();