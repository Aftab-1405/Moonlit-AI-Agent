import { alpha, darken, getContrastRatio, lighten } from '@mui/material/styles';
import { primitives } from './primitives.js';
import { getDefaultAccent } from '../appearance.js';

const DARK_BACKGROUND = Object.freeze({
  shell: primitives.neutral[1000],
  default: primitives.neutral[1000],
  paper: primitives.neutral[925],
  input: primitives.neutral[900],
  composer: primitives.neutral[890],
  composerContext: primitives.neutral[860],
  sunken: primitives.neutral[900],
  hover: primitives.neutral[800],
  strong: primitives.neutral[700],
  elevated1: primitives.neutral[900],
  elevated2: primitives.neutral[850],
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

// All interaction variants derive from the single workspace accent. Syntax and
// identity colors deliberately do not depend on this palette.
const createAccent = (main) => {
  const black = primitives.neutral[1000];
  const white = primitives.neutral[0];
  const contrastText =
    getContrastRatio(main, black) >= getContrastRatio(main, white) ? black : white;
  const readable = (color) => (getContrastRatio(color, contrastText) >= 4.5 ? color : main);
  let foreground = main;
  for (
    let step = 1;
    step <= 20 && getContrastRatio(foreground, DARK_BACKGROUND.elevated3) < 3;
    step += 1
  ) {
    foreground = lighten(main, step / 20);
  }
  return Object.freeze({
    main,
    light: lighten(main, 0.16),
    dark: readable(darken(main, 0.12)),
    hover: readable(darken(main, 0.08)),
    pressed: readable(darken(main, 0.16)),
    contrastText,
    foreground,
    selectedBackground: alpha(foreground, 0.12),
    selectedBorder: alpha(foreground, 0.5),
  });
};

// Settled ChatGPT preset tokens from the 2026-11-12 comparison. Dark bubbles
// are token evidence; light bubbles were also measured in a rendered conversation.
const REFERENCE_ACCENTS = {
  purple: {
    base: '#A67DF2',
    light: ['#8952EE', '#7849D1', '#643CAE', '#7849D1', '#EDE5FC', '#291947', '#A67DF259'],
    dark: ['#7849D1', '#643CAE', '#4E2F88', '#B897F4', '#4E2F88', '#F8F5FD', '#8952EE99'],
  },
  blue: {
    base: '#3A83F7',
    light: ['#2C67C5', '#1F4E94', '#173E76', '#2C67C5', '#E8F3FE', '#0C274A', '#539AF859'],
    dark: ['#2C67C5', '#1F4E94', '#173E76', '#63A8F8', '#173E76', '#F6FAFE', '#3A83F799'],
  },
};
const NAMED_ACCENTS = {
  blue: '#3566F0',
  green: '#04BB9F',
  yellow: '#FFCC38',
  pink: '#FA70AB',
  orange: '#FF8066',
  purple: '#A67DF2',
  white: '#FFFFFF',
};
export function getAccentBase(profile, mode) {
  if (profile.accent === 'default') return getDefaultAccent(mode);
  if (profile.accent === 'custom') return profile.customAccent;
  return (
    (profile.presetId === 'chatgpt' && REFERENCE_ACCENTS[profile.accent]?.base) ||
    NAMED_ACCENTS[profile.accent]
  );
}
const mixHex = (a, b, amount) =>
  '#' +
  [1, 3, 5]
    .map((i) =>
      Math.round(
        parseInt(a.slice(i, i + 2), 16) * (1 - amount) + parseInt(b.slice(i, i + 2), 16) * amount,
      )
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
const readableOn = (background, preferred) =>
  getContrastRatio(background, preferred) >= 4.5
    ? preferred
    : getContrastRatio(background, '#000000') >= getContrastRatio(background, '#FFFFFF')
      ? '#000000'
      : '#FFFFFF';

function accentContentRoles(accent, backgrounds, ink, dark, reference) {
  const surface = backgrounds.default;
  // Custom generation is deliberately local, not an inferred reference algorithm.
  const bubbleBackground =
    reference?.[4] || mixHex(surface, accent.base || accent.main, dark ? 0.24 : 0.12);
  const bubbleForeground = reference?.[5] || readableOn(bubbleBackground, ink);
  let selectionBackground = reference?.[6] || `${accent.base || accent.main}${dark ? '66' : '59'}`;
  const selectionSurfaces = ['default', 'paper', 'input', 'composer', 'elevated3'].map(
    (key) => backgrounds[key],
  );
  const selectionInk = () =>
    [ink, '#000000', '#FFFFFF'].find((color) =>
      selectionSurfaces.every(
        (bg) =>
          getContrastRatio(
            mixHex(
              bg,
              selectionBackground.slice(0, 7),
              parseInt(selectionBackground.slice(7), 16) / 255,
            ),
            color,
          ) >= 4.5,
      ),
    );
  // Generated highlights must work on input/composer surfaces as well as the page.
  // Reduce only unmeasured highlight opacity if no common readable foreground exists.
  if (!reference) {
    for (
      let opacity = parseInt(selectionBackground.slice(7), 16);
      !selectionInk() && opacity > 0;
    ) {
      opacity = Math.max(0, opacity - 13);
      selectionBackground = selectionBackground.slice(0, 7) + opacity.toString(16).padStart(2, '0');
    }
  }
  const selectedOn = (background, foreground) =>
    readableOn(
      mixHex(
        background,
        selectionBackground.slice(0, 7),
        parseInt(selectionBackground.slice(7), 16) / 255,
      ),
      foreground,
    );
  return {
    userMessage: {
      background: bubbleBackground,
      foreground: bubbleForeground,
      selectionForeground: selectedOn(bubbleBackground, bubbleForeground),
    },
    textSelection: {
      background: selectionBackground,
      foreground: selectionInk() || selectedOn(surface, ink),
    },
    // The reference Yellow composer uses white even when generic marks are black.
    // Keep an independent role and prefer readable text for Yellow/White/custom.
    composerAction: {
      background: accent.main,
      foreground: readableOn(accent.main, '#FFFFFF'),
      hover: accent.hover,
      pressed: accent.pressed,
    },
  };
}

export const createDarkSemanticTokens = (accentColor = primitives.workspace.accent) => {
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

  const accent = createAccent(accentColor);
  const primary = Object.freeze({
    main: foreground,
    light: primitives.neutral[0],
    dark: secondaryForeground,
    contrastText: primitives.neutral[950],
  });

  return Object.freeze({
    mode: 'dark',
    semanticColors: Object.freeze({
      diffAdded: primitives.workspace.diffAdded,
      diffRemoved: primitives.workspace.diffRemoved,
      skill: primitives.workspace.skill,
    }),
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
      focus: secondaryForeground,
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
    accent,
    ...accentContentRoles(accent, background, foreground, true),
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
      contrast: 50,
      opaqueWindows: true,
      accentSource: 'chatgpt',
      codeThemeId: 'vercel',
      codeTheme: 'moonlit-vercel',
      perspectiveTheme: 'Pro Dark',
      hyperspeedOpacity: 0,
    }),
    transparent: alpha(primitives.neutral[950], 0),
  });
};

export const darkSemanticTokens = createDarkSemanticTokens();

/** Measured baseline plus an isolated, deterministic Moonlit custom generator. */
export function createAppearanceSemanticTokens(appearance, mode) {
  const p = appearance.profiles[mode],
    dark = mode === 'dark',
    measured = p.presetId === 'chatgpt' && !p.custom;
  const base = createDarkSemanticTokens();
  const ink = p.ink,
    surface = p.surface;
  const mix = (a, b, n) => {
    const channels = (c) =>
      c
        .slice(1)
        .match(/../g)
        .map((v) => parseInt(v, 16));
    return (
      '#' +
      channels(a)
        .map((v, i) =>
          Math.round(v * (1 - n) + channels(b)[i] * n)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    );
  };
  // Custom contrast is a Moonlit approximation; the reference generator is unknown.
  const contrast = p.contrast / 100;
  const primarySurface = measured ? (dark ? '#0E0E0E' : '#FCFCFC') : surface;
  const secondarySurface = measured ? primarySurface : mix(surface, ink, 0.02 + contrast * 0.05);
  const tertiary = measured
    ? dark
      ? '#212121'
      : '#F9F9F9'
    : mix(surface, ink, 0.04 + contrast * 0.07);
  const elevated = measured
    ? dark
      ? '#212121'
      : '#FFFFFF'
    : dark
      ? tertiary
      : mix(surface, '#FFFFFF', 0.5);
  const shell = measured ? (dark ? '#000000' : '#F9F9F9') : secondarySurface;
  const isMoonlitDark = p.presetId === 'moonlit' && !p.custom && dark;
  const background = isMoonlitDark
    ? base.background
    : {
        shell,
        default: primarySurface,
        paper: secondarySurface,
        input: tertiary,
        composer: elevated,
        composerContext: tertiary,
        sunken: tertiary,
        hover: mix(surface, ink, 0.1),
        strong: mix(surface, ink, 0.18),
        elevated1: elevated,
        elevated2: elevated,
        elevated3: tertiary,
        elevated4: tertiary,
        elevated5: tertiary,
      };
  const readableInk =
    getContrastRatio(ink, background.default) >= 4.5
      ? ink
      : getContrastRatio('#000000', background.default) >=
          getContrastRatio('#FFFFFF', background.default)
        ? '#000000'
        : '#FFFFFF';
  const secondary = measured
    ? dark
      ? '#CDCDCD'
      : '#5D5D5D'
    : mix(readableInk, background.default, 0.25);
  const tertiaryInk = measured
    ? dark
      ? '#AFAFAF'
      : '#8F8F8F'
    : mix(readableInk, background.default, 0.42);
  const text = { primary: readableInk, secondary, disabled: tertiaryInk, hint: tertiaryInk };
  const borderColor = measured
    ? dark
      ? '#FFFFFF26'
      : '#0000001A'
    : alpha(readableInk, 0.08 + contrast * 0.1);
  const border = {
    idle: borderColor,
    subtle: alpha(readableInk, 0.05),
    separator: borderColor,
    default: tertiaryInk,
    hover: alpha(readableInk, 0.25),
    focus: secondary,
    active: measured ? (dark ? '#FFFFFF33' : '#00000026') : alpha(readableInk, 0.24),
    base: readableInk,
  };
  const referenceAccent = p.presetId === 'chatgpt' ? REFERENCE_ACCENTS[p.accent] : null;
  const source = getAccentBase(p, mode);
  let accent = { ...createAccent(source) };
  const reference = referenceAccent?.[mode];
  if (reference)
    accent = {
      ...accent,
      main: reference[0],
      hover: reference[1],
      pressed: reference[2],
      contrastText: '#FFFFFF',
      foreground: reference[3],
    };
  else {
    let foreground = source;
    for (let i = 1; i <= 20 && getContrastRatio(foreground, background.default) < 4.5; i++)
      foreground = mix(source, readableInk, i / 20);
    accent.foreground = foreground;
  }
  accent.base = source;
  accent.selectedBackground = alpha(accent.foreground, 0.12);
  accent.selectedBorder = alpha(accent.foreground, 0.5);
  const primary = {
    main: readableInk,
    light: readableInk,
    dark: secondary,
    contrastText:
      getContrastRatio(readableInk, '#000000') >= getContrastRatio(readableInk, '#FFFFFF')
        ? '#000000'
        : '#FFFFFF',
  };
  const action = {
    hover: alpha(readableInk, 0.1),
    selected: alpha(readableInk, 0.1),
    focus: alpha(readableInk, 0.16),
    active: alpha(readableInk, 0.72),
    disabled: alpha(readableInk, 0.38),
    disabledBackground: alpha(readableInk, 0.08),
  };
  const layer = Object.fromEntries(
    Object.entries(base.opacity).map(([key, n]) => [key, alpha(readableInk, n)]),
  );
  Object.assign(layer, {
    secondaryContent: alpha(secondary, 0.78),
    surfaceMuted: background.paper,
    surfaceTranslucent: background.paper,
    glass: background.paper,
    surfaceSoft: background.paper,
    surfaceSolid: background.paper,
  });
  const status = dark
    ? {}
    : Object.fromEntries(
        ['error', 'success', 'warning', 'info'].map((key) => [
          key,
          {
            ...base[key],
            main: {
              error: primitives.red[700],
              success: primitives.green[700],
              warning: primitives.amber[700],
              info: primitives.blue[700],
            }[key],
            contrastText: '#FFFFFF',
          },
        ]),
      );
  return {
    ...base,
    ...status,
    mode,
    background,
    text,
    border,
    action,
    layer,
    primary,
    accent,
    ...accentContentRoles(accent, background, readableInk, dark, reference),
    divider: borderColor,
    secondary: {
      main: secondary,
      light: readableInk,
      dark: tertiaryInk,
      contrastText: primary.contrastText,
    },
    semanticColors: {
      ...base.semanticColors,
      ...(!dark ? { diffAdded: '#007B2E', diffRemoved: '#BA2623' } : {}),
      ...p.semanticColors,
    },
    identity: { ...base.identity, marketing: { ...base.identity.marketing, ...primary } },
    // Preserve Moonlit's existing dark preset; only custom profiles enter neutral generation.
    ...(isMoonlitDark
      ? {
          background: base.background,
          text: base.text,
          border: base.border,
          action: base.action,
          layer: base.layer,
          primary: base.primary,
          secondary: base.secondary,
          identity: base.identity,
          divider: base.divider,
        }
      : {}),
    integration: {
      ...base.integration,
      colorMode: mode,
      contrast: p.contrast,
      codeThemeId: p.codeThemeId,
      codeTheme: dark ? 'moonlit-vercel' : 'moonlit-light',
      perspectiveTheme: dark ? 'Pro Dark' : 'Pro Light',
      appearance,
    },
  };
}
