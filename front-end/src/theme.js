import { createTheme, responsiveFontSizes, alpha } from '@mui/material/styles';

// ============================================
// 1. SHARED CONFIGURATION
// ============================================

const shape = { borderRadius: 12 };

// Standard MUI breakpoints
const breakpoints = {
  values: {
    xs: 0,
    sm: 600,
    md: 900,
    lg: 1200,
    xl: 1536,
  },
};

// Font families - single source of truth
const FONT_SERIF = '"Merriweather", serif';
const FONT_MONO = '"JetBrains Mono", monospace';

const typography = {
  fontFamily: FONT_SERIF,
  // Standard MUI variants - fontFamily inherited from root
  h1: { fontWeight: 700, fontSize: '3rem', lineHeight: 1.1, letterSpacing: '-0.025em' },
  h2: { fontWeight: 700, fontSize: '2.25rem', lineHeight: 1.2, letterSpacing: '-0.02em' },
  h3: { fontWeight: 700, fontSize: '1.75rem', lineHeight: 1.3, letterSpacing: '-0.015em' },
  h4: { fontWeight: 700, fontSize: '1.25rem', lineHeight: 1.4 },
  h5: { fontWeight: 700, fontSize: '1.125rem', lineHeight: 1.4 },
  h6: { fontWeight: 700, fontSize: '1rem', lineHeight: 1.5 },
  subtitle1: { fontSize: '1rem', fontWeight: 500, lineHeight: 1.5 },
  subtitle2: { fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.5 },
  body1: { fontSize: '1rem', lineHeight: 1.6 },
  body2: { fontSize: '0.875rem', lineHeight: 1.5 },
  caption: { fontSize: '0.75rem', lineHeight: 1.4, letterSpacing: '0.02em' },
  overline: { fontSize: '0.625rem', fontWeight: 600, lineHeight: 1.5, letterSpacing: '0.1em', textTransform: 'uppercase' },
  button: { textTransform: 'none', fontWeight: 500, fontSize: '0.875rem' },
  // Custom monospace variants
  labelSmall: { fontSize: '0.65rem', fontWeight: 500, lineHeight: 1.4, letterSpacing: '0.02em', fontFamily: FONT_MONO },
  labelMedium: { fontSize: '0.7rem', fontWeight: 500, lineHeight: 1.4, letterSpacing: '0.01em', fontFamily: FONT_MONO },
  bodySmall: { fontSize: '0.8rem', lineHeight: 1.5, fontFamily: FONT_MONO },
  bodyLarge: { fontSize: '0.95rem', lineHeight: 1.6, fontFamily: FONT_MONO },
};

// ============================================
// 2. PALETTE DEFINITIONS
// ============================================

// MOONLIT Color Palette - Serene, cool tones evoking the night sky
// Silvery whites, soft grays, deep charcoals, indigo-blues with purple/teal hints
const COLORS = {
  // Dark mode - True neutral charcoals (no green/teal tint)
  dark: {
    bg: { 
      default: '#121417',   // True dark charcoal
      paper: '#1C1E22',     // Slightly lifted charcoal
      input: '#0C0D0F',     // Deepest charcoal
    },
    text: { 
      primary: '#E8ECF0',   // Silvery moonlight
      secondary: '#9BA8B4', // Cool silver-gray
      disabled: '#5C6773',  // Muted steel
    },
    border: { 
      default: '#2C2E33',   // Neutral charcoal border
      subtle: '#1F2125',    // Deep border
      hover: '#3C3E44',     // Lifted charcoal
      focus: '#A5B4FC',     // Soft indigo glow
    },
    scrollbar: { thumb: '#3C3E44', thumbHover: '#4C4E54' },
  },
  // Light mode - Soft dawn with cool undertones
  light: {
    bg: { 
      default: '#F4F6F8',   // Silvery white
      paper: '#FFFFFF',     // Pure white
      input: '#FFFFFF',
    },
    text: { 
      primary: '#1A1F26',   // Deep charcoal
      secondary: '#5C6773', // Cool gray
      disabled: '#9BA8B4',  // Muted silver
    },
    border: { 
      default: '#D8DEE4',   // Cool light gray
      subtle: '#EDF0F3',    // Subtle silver
      hover: '#B8C4CF',     // Medium cool gray
      focus: '#4F46E5',     // Deep indigo
    },
    scrollbar: { thumb: '#B8C4CF', thumbHover: '#9BA8B4' },
  },
};

// MOONLIT GRADIENT - Single source for brand gradient
export const getMoonlitGradient = (theme) => {
  const isDark = theme.palette.mode === 'dark';
  return isDark 
    ? `linear-gradient(135deg, ${theme.palette.primary.light}, ${theme.palette.primary.main})`
    : `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`;
};

// MOONLIT EFFECTS - Theme-aware effects for special UI elements
export const getNaturalMoonlitEffects = (theme) => {
  const isDark = theme?.palette?.mode === 'dark';
  
  return isDark ? {
    // Dark mode - ethereal, glowing moonlight
    gradient: 'linear-gradient(135deg, #E0E7FF, #C7D2FE, #A5B4FC, #818CF8)',
    glow: 'radial-gradient(ellipse at center, rgba(165, 180, 252, 0.12) 0%, rgba(129, 140, 248, 0.06) 40%, transparent 70%)',
    shadow: '0 8px 32px rgba(165, 180, 252, 0.08), 0 4px 16px rgba(129, 140, 248, 0.05)',
    textGradient: 'linear-gradient(135deg, #C7D2FE, #A5B4FC, #818CF8)',
    ambient: 'radial-gradient(ellipse at top right, rgba(165, 180, 252, 0.04) 0%, transparent 50%)',
    border: '1px solid rgba(165, 180, 252, 0.15)',
    hover: 'rgba(165, 180, 252, 0.04)',
    focus: '0 0 0 3px rgba(165, 180, 252, 0.08)',
  } : {
    // Light mode - subtle, grounded indigo
    gradient: 'linear-gradient(135deg, #6366F1, #4F46E5, #4338CA)',
    glow: 'radial-gradient(ellipse at center, rgba(79, 70, 229, 0.08) 0%, rgba(67, 56, 202, 0.04) 40%, transparent 70%)',
    shadow: '0 8px 32px rgba(79, 70, 229, 0.10), 0 4px 16px rgba(67, 56, 202, 0.06)',
    textGradient: 'linear-gradient(135deg, #4F46E5, #4338CA, #3730A3)',
    ambient: 'radial-gradient(ellipse at top right, rgba(79, 70, 229, 0.03) 0%, transparent 50%)',
    border: '1px solid rgba(79, 70, 229, 0.15)',
    hover: 'rgba(79, 70, 229, 0.04)',
    focus: '0 0 0 3px rgba(79, 70, 229, 0.08)',
  };
};

// ============================================
// 2.5 LANDING PAGE UTILITIES
// ============================================

// Global keyframes for animations - use in sx via animation property
export const KEYFRAMES = {
  float: {
    '@keyframes float': {
      '0%, 100%': { transform: 'translateY(0) scale(1)' },
      '50%': { transform: 'translateY(30px) scale(1.05)' },
    },
  },
  shimmer: {
    '@keyframes shimmer': {
      '0%': { left: '-100%' },
      '100%': { left: '100%' },
    },
  },
  fadeIn: {
    '@keyframes fadeIn': {
      from: { opacity: 0, transform: 'translateY(-10px)' },
      to: { opacity: 1, transform: 'translateY(0)' },
    },
  },
  slideUp: {
    '@keyframes slideUp': {
      from: { opacity: 0, transform: 'translateY(20px)' },
      to: { opacity: 1, transform: 'translateY(0)' },
    },
  },
};

// Glass card sx props - theme-aware glassmorphism
export const getGlassCardSx = (theme) => ({
  background: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.03 : 0.7),
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderRadius: 3,
  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  '&:hover': {
    transform: 'translateY(-6px)',
  },
});

// Gradient text sx props - use with span or Typography
export const getGradientTextSx = (theme) => {
  const effects = getNaturalMoonlitEffects(theme);
  return {
    background: effects.textGradient,
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  };
};

// Glow button sx props - primary CTA with shimmer effect
export const getGlowButtonSx = (theme) => {
  const effects = getNaturalMoonlitEffects(theme);
  return {
    px: 4,
    py: 1.5,
    borderRadius: 3,
    background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.info.main})`,
    color: theme.palette.getContrastText(theme.palette.primary.main),
    fontWeight: 600,
    fontSize: '1rem',
    position: 'relative',
    overflow: 'hidden',
    border: 'none',
    ...KEYFRAMES.shimmer,
    '&::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: '-100%',
      width: '100%',
      height: '100%',
      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
      animation: 'shimmer 2.5s infinite',
    },
    '&:hover': {
      background: `linear-gradient(135deg, ${theme.palette.info.main}, ${theme.palette.primary.main})`,
      transform: 'translateY(-3px)',
      boxShadow: effects.shadow,
    },
  };
};

const darkPalette = {
  mode: 'dark',
  // Primary: Soft moonlit indigo (luminous, ethereal)
  primary: { main: '#A5B4FC', light: '#C7D2FE', dark: '#818CF8', contrastText: '#121417' },
  // Secondary: Silvery moonlight for text/neutral elements
  secondary: { main: '#E8ECF0', light: '#F4F6F8', dark: '#9BA8B4', contrastText: '#121417' },
  background: COLORS.dark.bg,
  text: COLORS.dark.text,
  divider: COLORS.dark.border.default,
  action: {
    active: '#A5B4FC',
    hover: 'rgba(165, 180, 252, 0.06)',
    selected: 'rgba(165, 180, 252, 0.10)',
    disabled: 'rgba(232, 236, 240, 0.3)',
    disabledBackground: 'rgba(232, 236, 240, 0.08)',
  },
  // Semantic colors with cool undertones
  success: { main: '#34D399', light: '#6EE7B7', dark: '#10B981', contrastText: '#121417' },
  error: { main: '#F87171', light: '#FCA5A5', dark: '#EF4444', contrastText: '#121417' },
  warning: { main: '#FBBF24', light: '#FCD34D', dark: '#F59E0B', contrastText: '#121417' },
  info: { main: '#A5B4FC', light: '#C7D2FE', dark: '#818CF8', contrastText: '#121417' },
};

const lightPalette = {
  mode: 'light',
  // Primary: Deep indigo (professional, grounded)
  primary: { main: '#4F46E5', light: '#6366F1', dark: '#4338CA', contrastText: '#FFFFFF' },
  // Secondary: Deep charcoal for text/neutral elements
  secondary: { main: '#1C1E22', light: '#5C6773', dark: '#121417', contrastText: '#FFFFFF' },
  background: COLORS.light.bg,
  text: COLORS.light.text,
  divider: COLORS.light.border.default,
  action: {
    active: '#4F46E5',
    hover: 'rgba(79, 70, 229, 0.06)',
    selected: 'rgba(79, 70, 229, 0.10)',
    disabled: 'rgba(26, 31, 38, 0.26)',
    disabledBackground: 'rgba(26, 31, 38, 0.06)',
  },
  // Semantic colors - slightly muted for elegance
  success: { main: '#059669', light: '#10B981', dark: '#047857', contrastText: '#FFFFFF' },
  error: { main: '#DC2626', light: '#EF4444', dark: '#B91C1C', contrastText: '#FFFFFF' },
  warning: { main: '#D97706', light: '#F59E0B', dark: '#B45309', contrastText: '#FFFFFF' },
  info: { main: '#4F46E5', light: '#6366F1', dark: '#4338CA', contrastText: '#FFFFFF' },
};

// ============================================
// 3. MERMAID DIAGRAM THEMING
// ============================================

/**
 * Get Mermaid diagram theme config based on current theme
 */
export const getMermaidThemeConfig = (theme) => {
  const isDark = theme.palette.mode === 'dark';
  
  const baseConfig = {
    startOnLoad: false,
    suppressErrorRendering: true,
    securityLevel: 'loose',
    logLevel: 'fatal',
  };

  const darkVariables = {
    primaryColor: theme.palette.primary.main,
    primaryTextColor: theme.palette.text.primary,
    primaryBorderColor: theme.palette.primary.dark,
    lineColor: theme.palette.text.secondary,
    secondaryColor: theme.palette.secondary.main,
    tertiaryColor: alpha(theme.palette.background.paper, 0.8),
    background: 'transparent',
    mainBkg: theme.palette.background.paper,
    nodeBorder: theme.palette.primary.main,
    clusterBkg: theme.palette.background.default,
    clusterBorder: theme.palette.divider,
    titleColor: theme.palette.text.primary,
    edgeLabelBackground: theme.palette.background.paper,
    // ER Diagram
    entityBkg: theme.palette.background.paper,
    entityBorder: theme.palette.divider,
    entityTextColor: theme.palette.text.primary,
    attributeBoxBkg: alpha(theme.palette.primary.main, 0.15),
    attributeBoxText: theme.palette.text.primary,
    relationColor: theme.palette.text.secondary,
    relationLabelColor: theme.palette.text.primary,
    relationLabelBackground: theme.palette.background.paper,
  };

  const lightVariables = {
    primaryColor: theme.palette.primary.main,
    primaryTextColor: theme.palette.grey[900],
    primaryBorderColor: theme.palette.primary.dark,
    lineColor: theme.palette.grey[600],
    secondaryColor: theme.palette.secondary.main,
    tertiaryColor: theme.palette.grey[100],
    background: 'transparent',
    mainBkg: '#ffffff',
    nodeBorder: theme.palette.primary.main,
    clusterBkg: theme.palette.grey[50],
    clusterBorder: theme.palette.grey[300],
    titleColor: theme.palette.grey[900],
    edgeLabelBackground: '#ffffff',
    // ER Diagram
    entityBkg: '#ffffff',
    entityBorder: theme.palette.grey[400],
    entityTextColor: theme.palette.grey[900],
    attributeBoxBkg: theme.palette.grey[100],
    attributeBoxText: theme.palette.grey[800],
    relationColor: theme.palette.grey[600],
    relationLabelColor: theme.palette.grey[900],
    relationLabelBackground: '#ffffff',
    textColor: theme.palette.grey[900],
    labelTextColor: theme.palette.grey[800],
  };

  return {
    ...baseConfig,
    theme: isDark ? 'dark' : 'default',
    themeVariables: isDark ? darkVariables : lightVariables,
  };
};

// ============================================
// 4. COMPONENT OVERRIDES
// ============================================

const getComponentOverrides = (mode) => {
  const isDark = mode === 'dark';
  const colors = isDark ? COLORS.dark : COLORS.light;

  return {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarWidth: 'thin',
          scrollbarColor: `${colors.scrollbar.thumb} transparent`,
          '&::-webkit-scrollbar': { width: 8 },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: colors.scrollbar.thumb,
            borderRadius: 4,
            '&:hover': { backgroundColor: colors.scrollbar.thumbHover },
          },
          ...(!isDark && {
            textRendering: 'optimizeLegibility',
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
          }),
        },
      },
    },
    MuiButtonBase: { defaultProps: { disableRipple: true } },
    MuiButton: {
      defaultProps: { 
        disableElevation: true,
        variant: 'outlined',
      },
      styleOverrides: {
        root: {
          borderRadius: 10,
          padding: '10px 24px',
          fontWeight: 600,
          textTransform: 'none',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          letterSpacing: '0.01em',
          borderWidth: '1.5px',
          borderColor: colors.border.subtle,
          '&:hover': {
            backgroundColor: isDark ? 'rgba(165, 180, 252, 0.06)' : 'rgba(79, 70, 229, 0.06)',
            borderColor: colors.border.focus,
            transform: 'translateY(-1px)',
          },
        },
        sizeSmall: { padding: '6px 16px', fontSize: '0.8125rem' },
        sizeLarge: { padding: '14px 28px', fontSize: '0.9375rem' },
      },
    },
    MuiIconButton: {
      defaultProps: { color: 'default' },
      styleOverrides: {
        root: {
          borderRadius: 10,
          border: `1.5px solid ${colors.border.subtle}`,
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            backgroundColor: isDark ? 'rgba(165, 180, 252, 0.06)' : 'rgba(79, 70, 229, 0.06)',
            borderColor: colors.border.hover,
          },
        },
        sizeSmall: { padding: 6 },
        sizeMedium: { padding: 8 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { 
          backgroundImage: 'none', 
          borderRadius: 16,
          ...(!isDark && {
            background: `linear-gradient(145deg, ${colors.bg.paper} 0%, ${colors.bg.default} 100%)`,
          }),
        },
        elevation1: {
          boxShadow: isDark ? 'none' : '0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px 0 rgba(0, 0, 0, 0.04)',
          border: `1px solid ${colors.border.subtle}`,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: `1px solid ${colors.border.subtle}`,
          boxShadow: 'none',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
            backgroundColor: isDark ? colors.bg.input : colors.bg.paper,
            ...(!isDark && {
              boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.04)',
            }),
            '& fieldset': { 
              borderColor: colors.border.default,
              borderWidth: '1.5px',
            },
            '&:hover fieldset': { 
              borderColor: colors.border.hover,
            },
            '&.Mui-focused fieldset': { 
              borderColor: colors.border.focus, 
              borderWidth: 2,
              ...(!isDark && {
                boxShadow: '0 0 0 3px rgba(79, 70, 229, 0.08)',  // Indigo-600 alpha
              }),
            },
          },
        },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: colors.text.disabled,
          '&.Mui-checked': { color: isDark ? '#A5B4FC' : '#4F46E5' },  // Moonlit indigo
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 500, letterSpacing: '0.01em' },
        filled: {
          backgroundColor: isDark ? colors.border.default : colors.bg.default,
          color: colors.text.primary,
          ...(!isDark && { border: `1px solid ${colors.border.default}` }),
        },
        outlined: {
          borderColor: isDark ? colors.text.disabled : colors.border.default,
          color: colors.text.secondary,
          '&:hover': {
            backgroundColor: isDark ? 'rgba(165, 180, 252, 0.06)' : 'rgba(79, 70, 229, 0.06)',
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: isDark ? '#0C0D0F' : colors.text.primary,  // Deepest charcoal
          borderRadius: 8,
          border: `1px solid ${colors.border.subtle}`,
          fontSize: '0.875rem',
          fontWeight: 500,
          padding: '8px 12px',
          ...(!isDark && {
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          }),
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          border: `1px solid ${colors.border.subtle}`,
          boxShadow: isDark ? '0 20px 25px -5px rgba(0, 0, 0, 0.4)' : '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          margin: '2px 6px',
          fontSize: '0.875rem',
          minHeight: '40px',
          '&:hover': { backgroundColor: isDark ? colors.border.default : colors.bg.default },
          '&.Mui-selected': {
            backgroundColor: isDark ? colors.border.default : colors.bg.default,
            color: colors.text.primary,
            fontWeight: 500,
            '&:hover': { 
              backgroundColor: isDark ? colors.border.hover : colors.border.default,
            },
          },
        },
      },
    },
  };
};

// ============================================
// 5. THEME FACTORIES
// ============================================

export const createDarkTheme = () => {
  const theme = createTheme({
    breakpoints,
    shape,
    typography,
    palette: darkPalette,
    components: getComponentOverrides('dark'),
  });
  theme.custom = { 
    getMoonlitGradient: () => getMoonlitGradient(theme),
    getNaturalMoonlitEffects: () => getNaturalMoonlitEffects(theme),
  };
  return responsiveFontSizes(theme);
};

export const createLightTheme = () => {
  const theme = createTheme({
    breakpoints,
    shape,
    typography,
    palette: lightPalette,
    components: getComponentOverrides('light'),
  });
  theme.custom = { 
    getMoonlitGradient: () => getMoonlitGradient(theme),
    getNaturalMoonlitEffects: () => getNaturalMoonlitEffects(theme),
  };
  return responsiveFontSizes(theme);
};

export default createDarkTheme();