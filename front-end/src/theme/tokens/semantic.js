import { alpha } from '@mui/material/styles';
import { primitives } from './primitives.js';

const DARK_BACKGROUND = Object.freeze({
  shell: primitives.neutral[1000],
  default: primitives.neutral[950],
  paper: primitives.neutral[850],
  input: primitives.neutral[900],
  composer: primitives.neutral[850],
  sunken: primitives.neutral[900],
  hover: primitives.neutral[800],
  strong: primitives.neutral[700],
  elevated1: primitives.neutral[850],
  elevated2: primitives.neutral[800],
  elevated3: primitives.neutral[800],
  elevated4: primitives.neutral[800],
  elevated5: primitives.neutral[800],
});

const createStatus = (family) => {
  const map = {
    error: [primitives.red[300], primitives.red[100], primitives.red[500], primitives.neutral[950]],
    success: [
      primitives.green[300],
      primitives.green[100],
      primitives.green[500],
      primitives.neutral[950],
    ],
    warning: [
      primitives.marketing.orangeSoft,
      primitives.amber[100],
      primitives.amber[500],
      primitives.neutral[950],
    ],
    info: [
      primitives.marketing.breeze,
      primitives.blue[100],
      primitives.blue[500],
      primitives.neutral[950],
    ],
  };
  const [main, light, dark, contrastText] = map[family];
  return Object.freeze({ main, light, dark, contrastText });
};

const createDarkSemanticTokens = () => {
  const background = DARK_BACKGROUND;
  const foreground = primitives.neutral[100];
  const secondaryForeground = primitives.neutral[300];
  const disabledForeground = primitives.neutral[500];
  const hairline = alpha(primitives.neutral[0], 0.15);
  const card = background.paper;

  const semanticOpacity = Object.freeze({
    barely: 0.025,
    faint: 0.04,
    subtle: 0.06,
    soft: 0.08,
    medium: 0.12,
    strong: 0.2,
    focus: 0.32,
    emphasis: 0.52,
    content: 0.78,
    surfaceMuted: 0.72,
    surfaceTranslucent: 0.4,
    surfaceSoft: 0.94,
    surfaceSolid: 0.98,
    statusBackground: 0.14,
    statusHover: 0.18,
    statusSelected: 0.22,
    statusSelectedHover: 0.26,
    statusBorder: 0.3,
    statusBorderHover: 0.46,
    statusBorderSelected: 0.5,
    statusFocus: 0.24,
  });

  const primary = Object.freeze({
    main: foreground,
    light: secondaryForeground,
    dark: primitives.neutral[300],
    contrastText: primitives.neutral[950],
  });

  return Object.freeze({
    mode: 'dark',
    background,
    text: Object.freeze({
      primary: foreground,
      secondary: secondaryForeground,
      disabled: disabledForeground,
      hint: primitives.neutral[400],
    }),
    border: Object.freeze({
      idle: hairline,
      subtle: alpha(primitives.neutral[0], 0.05),
      separator: alpha(primitives.neutral[0], 0.15),
      default: disabledForeground,
      hover: alpha(foreground, 0.25),
      focus: foreground,
      active: hairline,
      base: foreground,
    }),
    action: Object.freeze({
      hover: alpha(primitives.neutral[0], 0.1),
      selected: alpha(primitives.neutral[0], 0.15),
      focus: alpha(foreground, 0.16),
      active: alpha(foreground, 0.72),
      disabled: alpha(foreground, 0.38),
      disabledBackground: alpha(foreground, 0.08),
    }),
    opacity: semanticOpacity,
    layer: Object.freeze({
      barely: alpha(foreground, semanticOpacity.barely),
      faint: alpha(foreground, semanticOpacity.faint),
      subtle: alpha(foreground, semanticOpacity.subtle),
      soft: alpha(foreground, semanticOpacity.soft),
      medium: alpha(foreground, semanticOpacity.medium),
      strong: alpha(foreground, semanticOpacity.strong),
      focus: alpha(foreground, semanticOpacity.focus),
      emphasis: alpha(foreground, semanticOpacity.emphasis),
      secondaryContent: alpha(secondaryForeground, semanticOpacity.content),
      surfaceMuted: card,
      surfaceTranslucent: card,
      glass: card,
      surfaceSoft: card,
      surfaceSolid: card,
    }),
    divider: hairline,
    primary,
    secondary: Object.freeze({
      main: secondaryForeground,
      light: foreground,
      dark: disabledForeground,
      contrastText: primitives.neutral[950],
    }),
    error: createStatus('error'),
    success: createStatus('success'),
    warning: createStatus('warning'),
    info: createStatus('info'),
    overlay: Object.freeze({
      scrim: alpha(primitives.neutral[950], 0.78),
      modal: alpha(primitives.neutral[950], 0.68),
      soft: alpha(primitives.neutral[950], 0.28),
      fullscreen: alpha(primitives.neutral[950], 0.2),
    }),
    shadow: Object.freeze({
      xs: 'none',
      sm: 'none',
      md: 'none',
      lg: 'none',
      flowCanvas: 'none',
      flowDragging: 'none',
      flowEdge: 'none',
      flowEdgeHover: 'none',
      flowLabel: 'none',
    }),
    identity: Object.freeze({
      marketing: Object.freeze({
        main: foreground,
        light: foreground,
        dark: secondaryForeground,
        contrastText: primary.contrastText,
        buttonShadow: 'none',
        raisedShadow: 'none',
        hoverShadow: 'none',
        shimmer: 'none',
        static: 'none',
      }),
      accent: Object.freeze({
        sunset: primitives.marketing.orange,
        sunsetSoft: primitives.marketing.orangeSoft,
        dusk: primitives.marketing.dusk,
        twilight: primitives.marketing.twilight,
        breeze: primitives.marketing.breeze,
        midnight: primitives.marketing.midnight,
      }),
      provider: primitives.provider,
      database: primitives.database,
    }),
    integration: Object.freeze({
      colorMode: 'dark',
      codeTheme: 'moonlit-dark',
      perspectiveTheme: 'Pro Dark',
      hyperspeedOpacity: 0,
    }),
    transparent: alpha(primitives.neutral[950], 0),
  });
};

export const darkSemanticTokens = createDarkSemanticTokens();
