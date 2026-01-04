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
  bodyMedium: { fontSize: '0.85rem', lineHeight: 1.5, fontFamily: FONT_MONO },
  bodyLarge: { fontSize: '0.95rem', lineHeight: 1.6, fontFamily: FONT_MONO },
};

// ============================================
// 2. PALETTE DEFINITIONS
// ============================================

// Shared color constants to avoid duplication
const COLORS = {
  // Dark mode
  dark: {
    bg: { default: '#0F0F11', paper: '#18181B', input: '#0A0A0A' },
    text: { primary: '#F1F5F9', secondary: '#A1A1AA', disabled: '#52525B' },
    border: { default: '#27272A', subtle: '#1F1F1F', hover: '#52525B', focus: '#FFFFFF' },
    scrollbar: { thumb: '#333', thumbHover: '#555' },
  },
  // Light mode - Extra warm sepia tones for eye comfort
  light: {
    bg: { default: '#FAF5EF', paper: '#FDF9F5', input: '#FFFBF7' },  // Warmer cream
    text: { primary: '#3D3630', secondary: '#6B5E52', disabled: '#A89A8C' },  // Warmer browns
    border: { default: '#E5DDD2', subtle: '#D5CABD', hover: '#B8A896', focus: '#3D3630' },
    scrollbar: { thumb: '#D5CABD', thumbHover: '#B8A896' },
  },
};

// MOONLIT GRADIENT - Single source for brand gradient
export const getMoonlitGradient = (theme) => 
  `linear-gradient(135deg, ${theme.palette.info.main}, ${theme.palette.primary.main})`;

// NATURAL MOONLIT EFFECTS - For special UI elements
export const getNaturalMoonlitEffects = () => ({
  gradient: 'linear-gradient(135deg, #E0E7FF, #C7D2FE, #A5B4FC, #818CF8)',
  glow: 'radial-gradient(ellipse at center, rgba(129, 140, 248, 0.15) 0%, rgba(99, 102, 241, 0.08) 40%, transparent 70%)',
  shadow: '0 8px 32px rgba(129, 140, 248, 0.12), 0 4px 16px rgba(99, 102, 241, 0.08)',
  textGradient: 'linear-gradient(135deg, #6366F1, #818CF8, #A5B4FC)',
  ambient: 'radial-gradient(ellipse at top right, rgba(129, 140, 248, 0.03) 0%, transparent 50%)',
  border: '1px solid rgba(129, 140, 248, 0.2)',
  hover: 'rgba(129, 140, 248, 0.05)',
  focus: '0 0 0 3px rgba(129, 140, 248, 0.1)',
});

const darkPalette = {
  mode: 'dark',
  primary: { main: '#F1F5F9', light: '#F8FAFC', dark: '#E2E8F0', contrastText: '#0F0F11' },
  secondary: { main: '#27272A', light: '#3F3F46', dark: '#18181B', contrastText: '#F1F5F9' },
  background: COLORS.dark.bg,
  text: COLORS.dark.text,
  divider: COLORS.dark.border.default,
  action: {
    active: '#F1F5F9',
    hover: 'rgba(255, 255, 255, 0.06)',
    selected: 'rgba(255, 255, 255, 0.10)',
    disabled: 'rgba(255, 255, 255, 0.3)',
    disabledBackground: 'rgba(255, 255, 255, 0.12)',
  },
  success: { main: '#10B981', light: '#34D399', dark: '#059669', contrastText: '#FFFFFF' },
  error: { main: '#EF4444', light: '#F87171', dark: '#DC2626', contrastText: '#FFFFFF' },
  warning: { main: '#F59E0B', light: '#FBBF24', dark: '#D97706', contrastText: '#000000' },
  info: { main: '#3B82F6', light: '#60A5FA', dark: '#2563EB', contrastText: '#FFFFFF' },
};

const lightPalette = {
  mode: 'light',
  primary: { main: '#3D3630', light: '#5A524A', dark: '#2A241F', contrastText: '#FFFFFF' },  // Warmer brown
  secondary: { main: '#8B7D6E', light: '#A69585', dark: '#6F6256', contrastText: '#FFFFFF' },  // Warm taupe
  background: COLORS.light.bg,
  text: COLORS.light.text,
  divider: COLORS.light.border.default,
  action: {
    active: '#2A241F',
    hover: 'rgba(61, 54, 48, 0.05)',      // Warmer hover
    selected: 'rgba(61, 54, 48, 0.10)',    // Warmer selection
    disabled: 'rgba(61, 54, 48, 0.26)',
    disabledBackground: 'rgba(61, 54, 48, 0.06)',
  },
  success: { main: '#2E7D32', light: '#4CAF50', dark: '#1B5E20', contrastText: '#FFFFFF' },
  error: { main: '#C62828', light: '#EF5350', dark: '#B71C1C', contrastText: '#FFFFFF' },
  warning: { main: '#F57C00', light: '#FF9800', dark: '#E65100', contrastText: '#000000' },
  info: { main: '#1565C0', light: '#2196F3', dark: '#0D47A1', contrastText: '#FFFFFF' },
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
            backgroundColor: isDark ? alpha('#FFFFFF', 0.05) : alpha('#2D2A26', 0.03),
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
            backgroundColor: isDark ? alpha('#FFFFFF', 0.05) : alpha('#2D2A26', 0.03),
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
                boxShadow: '0 0 0 3px rgba(45, 42, 38, 0.1)',
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
          '&.Mui-checked': { color: colors.text.primary },
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
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(45, 42, 38, 0.04)',
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: isDark ? '#111111' : colors.text.primary,
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
    getNaturalMoonlitEffects,
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
    getNaturalMoonlitEffects,
  };
  return responsiveFontSizes(theme);
};

export default createDarkTheme();