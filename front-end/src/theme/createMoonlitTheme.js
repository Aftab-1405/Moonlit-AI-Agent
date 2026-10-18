import { alpha, createTheme, responsiveFontSizes } from '@mui/material/styles';
import { HOVER_CAPABLE_QUERY, MOBILE_SM_QUERY, REDUCED_MOTION_QUERY, TOUCH_DEVICE_QUERY } from '@/styles/mediaQueries';
import { BREAKPOINTS, FONTS, SHAPE, SWITCH_GEOMETRY } from '@/theme/tokens';
import { createTypography } from '@/theme/typography';

const pill = SHAPE.radius.pill;
const cardRadius = SHAPE.radius.md;

const outlined = (S, color = S.text.primary) => ({
  color,
  borderColor: color === S.text.primary ? alpha(S.text.primary, 0.25) : alpha(color, 0.4),
  backgroundColor: 'transparent',
  '&:hover': {
    color,
    borderColor: color === S.text.primary ? alpha(S.text.primary, 0.4) : alpha(color, 0.58),
    backgroundColor: alpha(color, 0.07),
  },
  '&.Mui-focusVisible': { boxShadow: `0 0 0 2px ${S.border.focus}` },
});

const contained = (S, color, contrastText) => ({
  color: contrastText,
  borderColor: color,
  backgroundColor: color,
  '&:hover': { color: contrastText, borderColor: color, backgroundColor: color, opacity: 0.9 },
  '&.Mui-focusVisible': { boxShadow: `0 0 0 2px ${S.border.focus}` },
});

const textButton = (S, color = S.text.primary) => ({
  color,
  borderColor: 'transparent',
  backgroundColor: 'transparent',
  '&:hover': { color, borderColor: 'transparent', backgroundColor: alpha(color, 0.07) },
  '&.Mui-focusVisible': { boxShadow: `0 0 0 2px ${S.border.focus}` },
});

const createPalette = (S) => ({
  mode: S.mode,
  background: { ...S.background, elevated: S.background.elevated1 },
  text: S.text,
  primary: S.primary,
  secondary: S.secondary,
  error: S.error,
  success: S.success,
  warning: S.warning,
  info: S.info,
  divider: S.border.separator,
  border: S.border,
  action: S.action,
  opacity: S.opacity,
  layer: S.layer,
  overlay: S.overlay,
  shadow: S.shadow,
  identity: S.identity,
  integration: S.integration,
  transparent: S.transparent,
  scrollbar: {
    track: 'transparent',
    thumb: alpha(S.text.primary, 0.18),
    thumbHover: alpha(S.text.primary, 0.3),
  },
  code: {
    background: S.background.sunken,
    text: S.text.primary,
    border: S.border.idle,
  },
  monaco: {
    background: S.background.sunken,
    gutter: S.background.sunken,
    highlight: S.background.strong,
    lineHighlight: S.action.hover,
  },
  chart: [
    S.identity.accent.breeze,
    S.identity.accent.sunset,
    S.identity.accent.twilight,
    S.success.main,
    S.warning.main,
    S.identity.accent.dusk,
    S.info.main,
    S.error.main,
  ],
});

const createComponents = (S) => ({
  MuiCssBaseline: {
    styleOverrides: {
      '*, *::before, *::after': { boxSizing: 'border-box' },
      '*': { scrollbarWidth: 'thin' },
      '*::-webkit-scrollbar': { width: 8, height: 8 },
      '*::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
      '*::-webkit-scrollbar-thumb': {
        border: '2px solid transparent',
        borderRadius: pill,
        backgroundColor: alpha(S.text.primary, 0.18),
        backgroundClip: 'padding-box',
      },
      '*::-webkit-scrollbar-thumb:hover': { backgroundColor: alpha(S.text.primary, 0.3) },
      '*::-webkit-scrollbar-corner': { backgroundColor: 'transparent' },
      html: {
        colorScheme: S.mode,
        scrollBehavior: 'smooth',
        WebkitTextSizeAdjust: '100%',
        textSizeAdjust: '100%',
        minHeight: '100%',
        height: '100%',
      },
      body: {
        margin: 0,
        minHeight: '100dvh',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
        fontFamily: FONTS.sans,
        fontSize: '1rem',
        fontWeight: 400,
        color: S.text.primary,
        backgroundColor: S.background.default,
        fontFeatureSettings: '"liga" 1, "calt" 1',
        textRendering: 'optimizeLegibility',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        '--app-scrollbar-size': '8px',
        '--scrollbar-track': 'transparent',
        '--scrollbar-thumb': alpha(S.text.primary, 0.18),
        '--scrollbar-thumb-hover': alpha(S.text.primary, 0.3),
        '--dark-mode': S.mode === 'dark' ? '1' : '0',
        '--color-bg-default': S.background.default,
        '--color-bg-paper': S.background.paper,
        '--color-bg-elevated': S.background.paper,
        '--color-bg-sunken': S.background.sunken,
        '--color-text-primary': S.text.primary,
        '--color-text-secondary': S.text.secondary,
        '--color-text-disabled': S.text.disabled,
        '--color-text-hint': S.text.hint,
        '--color-border-default': S.border.default,
        '--color-border-subtle': S.border.idle,
        '--color-border-hover': S.border.hover,
        '--color-border-focus': S.border.focus,
        '--color-primary': S.primary.main,
        '--color-primary-light': S.primary.light,
        '--color-primary-dark': S.primary.dark,
        '--color-primary-glow': 'transparent',
        '--color-error': S.error.main,
        '--color-warning': S.warning.main,
        '--color-success': S.success.main,
        '--color-info': S.info.main,
        '--radius-sm': `${cardRadius}px`,
        '--radius-md': `${cardRadius}px`,
        '--radius-lg': `${cardRadius}px`,
        '--radius-full': `${pill}px`,
        '--color-code-bg': S.background.sunken,
        '--color-code-text': S.text.primary,
        '--color-code-border': S.border.idle,
        '&::selection': { backgroundColor: alpha(S.text.primary, 0.2), color: S.text.primary },
        [MOBILE_SM_QUERY]: { '& input, & select, & textarea': { fontSize: '16px' } },
      },
      '#root': {
        flex: '1 1 auto',
        minWidth: 0,
        width: '100%',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
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
  MuiButtonBase: { defaultProps: { disableRipple: true } },
  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: {
      root: {
        minHeight: 36,
        padding: '7px 16px',
        borderRadius: pill,
        border: '1px solid',
        fontFamily: FONTS.sans,
        fontSize: '0.875rem',
        fontWeight: 400,
        lineHeight: '20px',
        letterSpacing: 0,
        textTransform: 'none',
        boxShadow: 'none',
        transition: 'background-color 140ms ease, border-color 140ms ease, color 140ms ease',
        [MOBILE_SM_QUERY]: { minHeight: 44, padding: '11px 16px' },
        [TOUCH_DEVICE_QUERY]: { minHeight: 44 },
        '&:active:not(.Mui-disabled)': { backgroundColor: S.action.selected },
        '&.Mui-disabled': {
          color: S.text.disabled,
          borderColor: S.border.idle,
          backgroundColor: S.action.disabledBackground,
          boxShadow: 'none',
        },
      },
      contained: contained(S, S.primary.main, S.primary.contrastText),
      containedPrimary: contained(S, S.primary.main, S.primary.contrastText),
      containedSecondary: contained(S, S.secondary.main, S.secondary.contrastText),
      containedSuccess: contained(S, S.success.main, S.success.contrastText),
      containedWarning: contained(S, S.warning.main, S.warning.contrastText),
      containedError: contained(S, S.error.main, S.error.contrastText),
      containedInfo: contained(S, S.info.main, S.info.contrastText),
      outlined: outlined(S),
      outlinedInherit: outlined(S),
      outlinedPrimary: outlined(S),
      outlinedSecondary: outlined(S, S.secondary.main),
      outlinedSuccess: outlined(S, S.success.main),
      outlinedWarning: outlined(S, S.warning.main),
      outlinedError: outlined(S, S.error.main),
      outlinedInfo: outlined(S, S.info.main),
      text: textButton(S),
      textInherit: textButton(S),
      textPrimary: textButton(S),
      textSecondary: textButton(S, S.secondary.main),
      textSuccess: textButton(S, S.success.main),
      textWarning: textButton(S, S.warning.main),
      textError: textButton(S, S.error.main),
      textInfo: textButton(S, S.info.main),
      sizeSmall: { minHeight: 32, padding: '5px 12px', fontSize: '0.8125rem' },
      sizeLarge: { minHeight: 40, padding: '9px 20px' },
    },
  },
  MuiIconButton: {
    styleOverrides: {
      root: {
        width: 36,
        height: 36,
        minWidth: 36,
        minHeight: 36,
        padding: 0,
        border: '1px solid transparent',
        borderRadius: pill,
        color: S.text.secondary,
        backgroundColor: 'transparent',
        boxShadow: 'none',
        '& .MuiSvgIcon-root': { fontSize: '20px' },
        [HOVER_CAPABLE_QUERY]: {
          '&:hover:not(.Mui-disabled)': { color: S.text.primary, backgroundColor: S.action.hover },
        },
        [TOUCH_DEVICE_QUERY]: { minWidth: 44, minHeight: 44 },
        [REDUCED_MOTION_QUERY]: { transition: 'none' },
        '&.Mui-focusVisible': { outline: `2px solid ${S.border.focus}`, outlineOffset: 2 },
        '&:active:not(.Mui-disabled)': { backgroundColor: S.action.selected },
        '&.Mui-disabled': { color: S.text.disabled, backgroundColor: 'transparent' },
      },
      sizeSmall: {
        width: 32, height: 32, minWidth: 32, minHeight: 32,
        '& .MuiSvgIcon-root': { fontSize: '18px' },
        [TOUCH_DEVICE_QUERY]: { minWidth: 44, minHeight: 44 },
      },
      sizeLarge: { width: 44, height: 44, minWidth: 44, minHeight: 44 },
    },
    variants: [{ props: { variant: 'outlined' }, style: outlined(S) }],
  },
  MuiPaper: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: {
        borderRadius: cardRadius,
        backgroundColor: S.background.paper,
        backgroundImage: 'none',
        boxShadow: 'none',
      },
      elevation1: { border: `1px solid ${S.border.idle}`, boxShadow: 'none' },
      elevation2: { boxShadow: 'none' },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        borderRadius: cardRadius,
        border: `1px solid ${S.border.idle}`,
        backgroundColor: S.background.paper,
        backgroundImage: 'none',
        boxShadow: 'none',
        '&:hover': { borderColor: S.border.hover, boxShadow: 'none' },
      },
    },
  },
  MuiTextField: {
    styleOverrides: {
      root: {
        '& .MuiOutlinedInput-root': {
          borderRadius: cardRadius,
          backgroundColor: S.background.input,
          '& fieldset': { borderColor: S.border.idle, borderWidth: 1 },
          '&:hover fieldset': { borderColor: S.border.hover },
        },
        '& .MuiInputBase-input': {
          color: S.text.primary,
          '&::placeholder': { color: S.text.disabled, opacity: 1 },
        },
      },
    },
  },
  MuiInputBase: {
    styleOverrides: {
      root: {
        color: S.text.primary,
        fontFamily: FONTS.sans,
        '&.Mui-focused': { outline: 'none', boxShadow: 'none' },
      },
      input: {
        fontFamily: 'inherit',
        fontWeight: 400,
        '&:focus': { outline: 'none', boxShadow: 'none' },
      },
    },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        backgroundColor: S.background.input,
        '&.Mui-focused': { outline: 'none', boxShadow: 'none' },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
          borderColor: S.border.idle,
          borderWidth: 1,
        },
        '&.Mui-focused:hover .MuiOutlinedInput-notchedOutline': {
          borderColor: S.border.hover,
          borderWidth: 1,
        },
        '&.Mui-error.Mui-focused .MuiOutlinedInput-notchedOutline': {
          borderColor: S.error.main,
          borderWidth: 1,
        },
      },
    },
  },
  MuiDivider: { styleOverrides: { root: { borderColor: S.border.idle } } },
  MuiTooltip: {
    styleOverrides: {
      tooltip: {
        padding: '8px 12px',
        borderRadius: cardRadius,
        border: `1px solid ${S.border.idle}`,
        backgroundColor: S.background.sunken,
        color: S.text.primary,
        fontFamily: FONTS.sans,
        fontSize: '0.75rem',
        fontWeight: 400,
        boxShadow: 'none',
      },
      arrow: { color: S.background.sunken },
    },
  },
  MuiChip: {
    styleOverrides: {
      root: {
        minHeight: 32,
        borderRadius: pill,
        fontWeight: 400,
        backgroundColor: 'transparent',
        border: `1px solid ${alpha(S.text.primary, 0.25)}`,
        '&:hover': { backgroundColor: S.action.hover, borderColor: S.border.hover },
        '&.Mui-focusVisible': { outline: `2px solid ${S.border.focus}`, outlineOffset: 2 },
      },
      filled: { color: S.text.primary, backgroundColor: S.action.selected },
      outlined: { borderColor: alpha(S.text.primary, 0.25) },
    },
  },
  MuiAppBar: {
    styleOverrides: {
      root: {
        borderRadius: 0,
        borderBottom: `1px solid ${S.border.idle}`,
        backgroundColor: S.background.default,
        backgroundImage: 'none',
        color: S.text.primary,
        boxShadow: 'none',
      },
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: {
        borderRadius: cardRadius,
        border: `1px solid ${S.border.idle}`,
        backgroundColor: S.background.default,
        backgroundImage: 'none',
        boxShadow: 'none',
      },
    },
  },
  MuiMenu: {
    styleOverrides: {
      paper: {
        borderRadius: '16px',
        overflowX: 'hidden',
        border: `1px solid ${S.border.idle}`,
        backgroundColor: S.background.paper,
        backgroundImage: 'none',
        backdropFilter: 'none',
        boxShadow: 'none',
      },
      list: { padding: 6, display: 'flex', flexDirection: 'column', gap: 2 },
    },
  },
  MuiPopover: {
    styleOverrides: {
      paper: {
        borderRadius: '16px',
        overflowX: 'hidden',
        border: `1px solid ${S.border.idle}`,
        backgroundColor: S.background.paper,
        backgroundImage: 'none',
        backdropFilter: 'none',
        boxShadow: 'none',
      },
    },
  },
  MuiMenuItem: {
    styleOverrides: {
      root: {
        minHeight: 36,
        padding: '8px',
        gap: 8,
        borderRadius: cardRadius,
        fontSize: '0.8125rem',
        fontWeight: 400,
        '&:hover': { backgroundColor: S.action.hover },
        '&.Mui-selected': { backgroundColor: S.action.selected, fontWeight: 400 },
        '&.Mui-focusVisible': { outline: `2px solid ${S.border.focus}`, outlineOffset: -2 },
        [TOUCH_DEVICE_QUERY]: { minHeight: 44 },
      },
    },
  },
  MuiTableCell: {
    styleOverrides: {
      root: {
        padding: '12px 16px',
        borderBottom: `1px solid ${S.border.idle}`,
        fontSize: '0.875rem',
        fontWeight: 400,
      },
      head: {
        color: S.text.secondary,
        backgroundColor: S.background.sunken,
        fontFamily: FONTS.mono,
        fontSize: '0.75rem',
        fontWeight: 400,
        letterSpacing: '1.2px',
        textTransform: 'uppercase',
      },
    },
  },
  MuiTablePagination: {
    styleOverrides: {
      root: { borderTop: `1px solid ${S.border.idle}`, backgroundColor: S.background.default },
    },
  },
  MuiAlert: {
    styleOverrides: {
      root: { borderRadius: cardRadius, border: `1px solid ${S.border.idle}`, boxShadow: 'none' },
      standardSuccess: { backgroundColor: alpha(S.success.main, S.opacity.statusBackground) },
      standardInfo: { backgroundColor: alpha(S.info.main, S.opacity.statusBackground) },
      standardWarning: { backgroundColor: alpha(S.warning.main, S.opacity.statusBackground) },
      standardError: { backgroundColor: alpha(S.error.main, S.opacity.statusBackground) },
    },
  },
  MuiSnackbarContent: {
    styleOverrides: {
      root: {
        borderRadius: cardRadius,
        border: `1px solid ${S.border.idle}`,
        backgroundColor: S.background.paper,
        color: S.text.primary,
        boxShadow: 'none',
      },
    },
  },
  MuiSkeleton: {
    defaultProps: { animation: 'pulse' },
    styleOverrides: {
      root: {
        borderRadius: cardRadius,
        backgroundColor: S.action.selected,
        backgroundImage: 'none',
      },
    },
  },
  MuiLinearProgress: {
    styleOverrides: {
      root: { height: 4, borderRadius: pill, backgroundColor: S.action.selected },
      bar: { borderRadius: pill },
    },
  },
  MuiTabs: {
    styleOverrides: { root: { minHeight: 40 }, indicator: { display: 'none' } },
  },
  MuiTab: {
    styleOverrides: {
      root: {
        minHeight: 36,
        padding: '8px 16px',
        borderRadius: pill,
        color: S.text.secondary,
        fontSize: '0.875rem',
        fontWeight: 400,
        letterSpacing: 0,
        textTransform: 'none',
        '&:hover': { color: S.text.primary, backgroundColor: S.action.hover },
        '&.Mui-selected': {
          color: S.text.primary,
          backgroundColor: S.action.selected,
          fontWeight: 400,
        },
        '&.Mui-focusVisible': { outline: `2px solid ${S.border.focus}`, outlineOffset: 2 },
        [MOBILE_SM_QUERY]: { minHeight: 44 },
      },
    },
  },
  MuiSwitch: {
    defaultProps: { disableRipple: true },
    styleOverrides: {
      root: {
        width: SWITCH_GEOMETRY.width,
        height: SWITCH_GEOMETRY.height,
        padding: 0,
        display: 'inline-flex',
        overflow: 'visible',
        flexShrink: 0,
        verticalAlign: 'middle',
      },
      sizeSmall: {
        width: SWITCH_GEOMETRY.width,
        height: SWITCH_GEOMETRY.height,
        padding: 0,
        '& .MuiSwitch-switchBase': {
          width: SWITCH_GEOMETRY.height,
          height: SWITCH_GEOMETRY.height,
          padding: SWITCH_GEOMETRY.inset,
          '&.Mui-checked': { transform: `translateX(${SWITCH_GEOMETRY.travel}px)` },
        },
        '& .MuiSwitch-thumb': {
          width: SWITCH_GEOMETRY.thumb,
          height: SWITCH_GEOMETRY.thumb,
        },
      },
      switchBase: {
        width: SWITCH_GEOMETRY.height,
        height: SWITCH_GEOMETRY.height,
        padding: SWITCH_GEOMETRY.inset,
        margin: 0,
        color: S.text.secondary,
        backgroundColor: 'transparent',
        transition: 'transform 140ms ease, color 140ms ease',
        '&:hover, &:active': { backgroundColor: 'transparent' },
        '&.Mui-checked': {
          transform: `translateX(${SWITCH_GEOMETRY.travel}px)`,
          color: S.background.default,
          backgroundColor: 'transparent',
          '&:hover, &:active': { backgroundColor: 'transparent' },
          '& + .MuiSwitch-track': { opacity: 1, backgroundColor: S.text.primary },
        },
        '&.Mui-focusVisible': {
          outline: 'none',
          boxShadow: 'none',
          backgroundColor: 'transparent',
        },
        '&.Mui-focusVisible + .MuiSwitch-track': {
          boxShadow: 'none',
        },
        '&.Mui-disabled': { color: S.text.disabled },
        '&.Mui-disabled + .MuiSwitch-track': {
          opacity: 0.5,
          backgroundColor: S.background.strong,
        },
      },
      thumb: {
        width: SWITCH_GEOMETRY.thumb,
        height: SWITCH_GEOMETRY.thumb,
        borderRadius: '50%',
        boxShadow: 'none',
      },
      track: {
        width: '100%',
        height: '100%',
        opacity: 1,
        border: 0,
        borderRadius: pill,
        boxSizing: 'border-box',
        backgroundColor: S.background.strong,
        transition: 'background-color 140ms ease, box-shadow 140ms ease, opacity 140ms ease',
      },
    },
  },
  MuiSelect: {
    styleOverrides: {
      root: { borderRadius: cardRadius },
      select: { color: S.text.primary },
      icon: { color: S.text.secondary },
    },
  },
  MuiLink: {
    styleOverrides: {
      root: {
        color: S.text.primary,
        textDecorationColor: alpha(S.text.primary, 0.35),
        textUnderlineOffset: '3px',
        '&:hover': { color: S.text.primary, textDecorationColor: S.text.primary },
        '&.Mui-focusVisible': { outline: `2px solid ${S.border.focus}`, outlineOffset: 2 },
      },
    },
  },
  MuiAccordion: {
    styleOverrides: {
      root: {
        border: `1px solid ${S.border.idle}`,
        borderRadius: `${cardRadius}px !important`,
        backgroundColor: 'transparent',
        backgroundImage: 'none',
        boxShadow: 'none',
        '&::before': { display: 'none' },
      },
    },
  },
  MuiAccordionSummary: {
    styleOverrides: {
      root: {
        minHeight: 48,
        padding: '0 16px',
        '&:hover': { backgroundColor: S.action.hover },
        '&.Mui-focusVisible': { outline: `2px solid ${S.border.focus}`, outlineOffset: -2 },
      },
    },
  },
  MuiListItemButton: {
    styleOverrides: {
      root: {
        borderRadius: cardRadius,
        fontWeight: 400,
        '&:hover': { backgroundColor: S.action.hover },
        '&.Mui-selected': { backgroundColor: S.action.selected },
        '&.Mui-focusVisible': { outline: `2px solid ${S.border.focus}`, outlineOffset: -2 },
      },
    },
  },
  MuiToggleButton: {
    styleOverrides: {
      root: {
        minHeight: 36,
        padding: '7px 14px',
        border: `1px solid ${alpha(S.text.primary, 0.25)} !important`,
        borderRadius: `${pill}px !important`,
        color: S.text.secondary,
        backgroundColor: 'transparent',
        fontSize: '0.875rem',
        fontWeight: 400,
        textTransform: 'none',
        '&:hover': { color: S.text.primary, backgroundColor: S.action.hover },
        '&.Mui-selected': {
          color: S.text.primary,
          backgroundColor: S.action.selected,
          fontWeight: 400,
        },
        '&.Mui-focusVisible': { boxShadow: `0 0 0 2px ${S.border.focus}` },
      },
    },
  },
  MuiToggleButtonGroup: {
    styleOverrides: {
      root: { gap: 4, borderRadius: pill, boxShadow: 'none' },
      grouped: { margin: '0 !important', borderRadius: `${pill}px !important` },
    },
  },
  MuiInputLabel: {
    styleOverrides: {
      root: {
        color: S.text.secondary,
        fontSize: '0.875rem',
        fontWeight: 400,
        '&.Mui-focused': { color: S.text.secondary },
      },
    },
  },
  MuiFormHelperText: { styleOverrides: { root: { fontSize: '0.75rem', color: S.text.secondary } } },
  MuiCheckbox: {
    styleOverrides: {
      root: {
        color: S.text.secondary,
        '&.Mui-checked': { color: S.text.primary },
        '&.Mui-focusVisible': { outline: 'none', boxShadow: 'none' },
      },
    },
  },
  MuiRadio: {
    styleOverrides: {
      root: {
        color: S.text.secondary,
        '&.Mui-checked': { color: S.text.primary },
        '&.Mui-focusVisible': { outline: 'none', boxShadow: 'none' },
      },
    },
  },
  MuiSlider: {
    styleOverrides: {
      thumb: { '&.Mui-focusVisible': { outline: 'none', boxShadow: 'none' } },
    },
  },
  MuiBadge: {
    styleOverrides: { badge: { fontWeight: 400, border: `1px solid ${S.border.idle}` } },
  },
});

export function createMoonlitTheme(S, H) {
  const typography = createTypography(H);
  const base = createTheme({
    cssVariables: { colorSchemeSelector: 'data-moonlit-color-scheme' },
    breakpoints: BREAKPOINTS,
    spacing: 8,
    shape: SHAPE,
    palette: createPalette(S),
    typography,
    components: createComponents(S),
  });
  return responsiveFontSizes(base);
}
