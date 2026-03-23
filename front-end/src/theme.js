import { createTheme, responsiveFontSizes, alpha } from '@mui/material/styles';
import {
  BACKDROP_FILTER_FALLBACK_QUERY,
  MOBILE_SM_QUERY,
  REDUCED_MOTION_QUERY,
} from './styles/mediaQueries';
import {
  BREAKPOINTS,
  FONTS,
  HEX_BLACK,
  HEX_WHITE,
  PALETTE_MODES,
  SHAPE,
  getReadableTextColor,
} from './styles/themeFoundation';
import {
  KEYFRAMES,
  TRANSITIONS,
  getAccentEffects,
  getGlassSx,
  getGlowButtonSx,
  getGradientTextSx,
  getMoonlitGradient,
} from './styles/themeEffects';
import { getMonacoThemeName, registerMonacoThemes } from './styles/themeMonaco';
import { getMermaidThemeConfig } from './styles/themeMermaid';

export {
  KEYFRAMES,
  TRANSITIONS,
  getAccentEffects,
  getGlassSx,
  getGlowButtonSx,
  getGradientTextSx,
  getMoonlitGradient,
  getMonacoThemeName,
  registerMonacoThemes,
  getMermaidThemeConfig,
};

const createTypography = (palette) => ({
  fontFamily: FONTS.sans,
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
    color: palette.text.primary,
  },
  body2: {
    fontSize: '0.875rem',
    lineHeight: 1.7,
    letterSpacing: '0.008em',
    color: palette.text.primary,
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
    fontFamily: FONTS.sans,
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
    fontFamily: FONTS.serif,
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
    fontFamily: FONTS.serif,
    fontSize: { xs: '2rem', sm: '2.5rem', md: '3.25rem' },
    lineHeight: 1.15,
    letterSpacing: '-0.02em',
  },
  uiHeadingLandingLg: {
    fontFamily: FONTS.serif,
    fontSize: { xs: '1.75rem', md: '2.25rem' },
    lineHeight: 1.2,
  },
  uiHeadingLandingMd: {
    fontFamily: FONTS.serif,
    fontSize: { xs: '1.5rem', md: '2rem' },
    lineHeight: 1.2,
  },
  uiBodyLg: {
    fontSize: { xs: '1rem', md: '1.125rem' },
    lineHeight: 1.7,
  },
  uiLoaderWordmark: {
    fontFamily: FONTS.serif,
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
const MOBILE_MEDIA_QUERY = MOBILE_SM_QUERY;

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
  const ambientBackground = isDark
    ? `radial-gradient(52% 58% at 14% 0%, ${alpha(HEX_WHITE, 0.055)}, transparent 62%), radial-gradient(44% 50% at 88% 100%, ${alpha(HEX_WHITE, 0.025)}, transparent 60%)`
    : `radial-gradient(50% 56% at 14% 0%, ${alpha(HEX_BLACK, 0.03)}, transparent 62%), radial-gradient(42% 48% at 88% 100%, ${alpha(HEX_BLACK, 0.014)}, transparent 60%)`;
  const surfaceGradient = isDark
    ? `linear-gradient(180deg, ${alpha(HEX_WHITE, 0.035)}, transparent)`
    : `linear-gradient(180deg, ${alpha(HEX_BLACK, 0.02)}, transparent)`;
  const containedHoverShadow = isDark
    ? `0 10px 26px -16px ${alpha(HEX_BLACK, 0.5)}`
    : `0 14px 26px -20px ${alpha(HEX_BLACK, 0.14)}`;
  const cardHoverShadow = isDark
    ? `0 18px 34px -26px ${alpha(HEX_BLACK, 0.45)}`
    : `0 16px 28px -24px ${alpha(HEX_BLACK, 0.12)}`;
  const focusRing = `0 0 0 3px ${alpha(palette.text.primary, isDark ? 0.14 : 0.1)}`;

  return {
    MuiCssBaseline: {
      styleOverrides: {
        ...KEYFRAMES,
        '*, *::before, *::after': {
          boxSizing: 'border-box',
        },
        '*': {
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--scrollbar-thumb) var(--scrollbar-track)',
        },
        '*::-webkit-scrollbar': {
          width: 'var(--app-scrollbar-size)',
          height: 'var(--app-scrollbar-size)',
        },
        '*::-webkit-scrollbar-track': {
          background: 'var(--scrollbar-track)',
        },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: 'var(--scrollbar-thumb)',
          borderRadius: 999,
          border: '2px solid transparent',
          backgroundClip: 'content-box',
          minHeight: 24,
          minWidth: 24,
        },
        '*::-webkit-scrollbar-thumb:hover': {
          backgroundColor: 'var(--scrollbar-thumb-hover)',
        },
        '*::-webkit-scrollbar-corner': {
          backgroundColor: 'transparent',
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
          fontFamily: FONTS.sans,
          color: palette.text.primary,
          fontFeatureSettings: '"liga" 1, "calt" 1',
          textRendering: 'optimizeLegibility',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          backgroundColor: palette.background.default,
          backgroundImage: ambientBackground,

          '--app-scrollbar-size': '8px',
          '--scrollbar-track': palette.scrollbar.track,
          '--scrollbar-thumb': palette.scrollbar.thumb,
          '--scrollbar-thumb-hover': palette.scrollbar.thumbHover,
          '&::selection': {
            backgroundColor: alpha(palette.primary.main, isDark ? 0.3 : 0.18),
            color: isDark ? palette.text.primary : palette.primary.dark,
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
          borderRadius: 10,
          fontFamily: FONTS.sans,
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
            ? alpha(palette.background.elevated, 0.92)
            : alpha(palette.background.paper, 0.88),
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
            boxShadow: containedHoverShadow,
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
          backgroundImage: surfaceGradient,
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
          backgroundImage: surfaceGradient,
          '&:hover': {
            borderColor: alpha(palette.primary.main, isDark ? 0.28 : 0.24),
            boxShadow: cardHoverShadow,
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
            '&.Mui-focused': {
              boxShadow: focusRing,
            },
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
          backgroundColor: alpha(palette.background.paper, isDark ? 0.86 : 0.92),
          backgroundImage: surfaceGradient,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${alpha(palette.text.primary, isDark ? 0.08 : 0.1)}`,
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
          backgroundImage: surfaceGradient,
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: palette.background.paper,
          backgroundImage: surfaceGradient,
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
          backgroundColor: alpha(palette.text.primary, isDark ? 0.05 : 0.035),
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
          border: `1px solid ${alpha(palette.text.primary, isDark ? 0.08 : 0.1)}`,
          backgroundColor: alpha(palette.background.paper, isDark ? 0.96 : 0.98),
          backgroundImage: surfaceGradient,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
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
          backgroundColor: alpha(palette.background.paper, isDark ? 0.96 : 0.98),
          backgroundImage: surfaceGradient,
          border: `1px solid ${alpha(palette.text.primary, isDark ? 0.08 : 0.1)}`,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
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
          textDecorationColor: alpha(palette.primary.main, 0.35),
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

