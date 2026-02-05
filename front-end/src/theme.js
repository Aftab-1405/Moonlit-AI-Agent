import { createTheme, responsiveFontSizes, alpha } from '@mui/material/styles';

// ============================================
// 1. DESIGN TOKENS (Static Constants)
// ============================================

const SHAPE = { borderRadius: 10 };

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
      default: '#0c0c0e',
      paper: '#151518',
      elevated: '#1c1c20',
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
      active: 'rgba(255, 255, 255, 0.7)',
      hover: 'rgba(255, 255, 255, 0.045)',
      selected: 'rgba(255, 255, 255, 0.09)',
      disabled: 'rgba(255, 255, 255, 0.28)',
      disabledBackground: 'rgba(255, 255, 255, 0.14)',
    },
    scrollbar: { track: 'transparent', thumb: '#3b3b44', thumbHover: '#4b4b55' },
  },
  light: {
    background: {
      default: '#f6f5f3',
      paper: '#ffffff',
      elevated: '#fbfaf8',
    },
    text: {
      primary: '#1b1b1b',
      secondary: '#4d4d4d',
      disabled: '#9c9c9c',
      hint: '#7a7a7a',
    },
    border: {
      default: '#e1dfdc',
      subtle: '#f1f0ee',
      hover: '#c7c5c1',
      focus: '#1b1b1b',
    },
    primary: {
      main: '#1f1f1f',
      light: '#343434',
      dark: '#111111',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#7a7a7a',
      light: '#9a9a9a',
      dark: '#5a5a5a',
      contrastText: '#ffffff',
    },
    error: { main: '#dc2626', light: '#ef4444', dark: '#b91c1c' },
    warning: { main: '#d97706', light: '#f59e0b', dark: '#b45309' },
    info: { main: '#2563eb', light: '#3b82f6', dark: '#1d4ed8' },
    success: { main: '#16a34a', light: '#22c55e', dark: '#15803d' },
    action: {
      active: 'rgba(0, 0, 0, 0.6)',
      hover: 'rgba(0, 0, 0, 0.045)',
      selected: 'rgba(0, 0, 0, 0.09)',
      disabled: 'rgba(0, 0, 0, 0.24)',
      disabledBackground: 'rgba(0, 0, 0, 0.12)',
    },
    scrollbar: { track: 'transparent', thumb: '#c7c5c1', thumbHover: '#a9a7a4' },
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
    ? `linear-gradient(135deg, ${alpha(theme.palette.text.primary, 0.2)}, ${alpha(theme.palette.text.primary, 0.8)})`
    : `linear-gradient(135deg, ${alpha(theme.palette.text.primary, 0.9)}, ${alpha(theme.palette.text.primary, 0.5)})`;

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
          backgroundColor: palette.background.default,
          backgroundImage: isDark
            ? 'radial-gradient(60% 60% at 20% 0%, rgba(255,255,255,0.05), transparent 60%), radial-gradient(60% 60% at 80% 100%, rgba(255,255,255,0.04), transparent 60%)'
            : 'radial-gradient(60% 60% at 20% 0%, rgba(0,0,0,0.05), transparent 60%), radial-gradient(60% 60% at 80% 100%, rgba(0,0,0,0.04), transparent 60%)',
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
          borderRadius: 8,
          padding: '10px 22px',
          fontWeight: 500,
          transition: TRANSITIONS.default,
          borderWidth: 1,
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
          backgroundImage: isDark
            ? 'linear-gradient(180deg, rgba(255,255,255,0.02), transparent)'
            : 'linear-gradient(180deg, rgba(0,0,0,0.02), transparent)',
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
          backgroundImage: isDark
            ? 'linear-gradient(180deg, rgba(255,255,255,0.02), transparent)'
            : 'linear-gradient(180deg, rgba(0,0,0,0.02), transparent)',
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

    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha(palette.background.paper, isDark ? 0.8 : 0.9),
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${palette.border.subtle}`,
          boxShadow: 'none',
        },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: palette.background.paper,
          border: `1px solid ${palette.border.subtle}`,
          backgroundImage: isDark
            ? 'linear-gradient(180deg, rgba(255,255,255,0.02), transparent)'
            : 'linear-gradient(180deg, rgba(0,0,0,0.02), transparent)',
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
          border: `1px solid ${palette.border.subtle}`,
          backgroundColor: palette.background.elevated,
        },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${palette.border.subtle}`,
        },
        head: {
          color: palette.text.secondary,
          fontWeight: 600,
          backgroundColor: alpha(palette.text.primary, isDark ? 0.04 : 0.03),
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
    divider: PALETTE_MODES[mode].border.subtle,
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
