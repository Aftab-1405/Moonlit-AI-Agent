/** Local-only, versioned appearance preferences. No authentication data is needed at boot. */
import { primitives } from './tokens/primitives.js';

export const getDefaultAccent = (mode) =>
  mode === 'dark' ? primitives.workspace.accent : primitives.workspace.accentLight;

export const ACCENTS = [
  ['default', 'Default', getDefaultAccent('dark')],
  ['blue', 'Blue', '#3566F0'],
  ['green', 'Green', '#04BB9F'],
  ['yellow', 'Yellow', '#FFCC38'],
  ['pink', 'Pink', '#FA70AB'],
  ['orange', 'Orange', '#FF8066'],
  ['purple', 'Purple', '#A25BFF'],
  ['white', 'White', '#FFFFFF'],
  ['custom', 'Custom', null],
].map(([id, label, swatch]) => ({ id, label, swatch }));
export const normalizeHex = (value) =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : null;
const choice = (value, options, fallback) => (options.includes(value) ? value : fallback);
const integer = (value, min, max, fallback) =>
  Number.isInteger(value) && value >= min && value <= max ? value : fallback;
const object = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};
export function createProfile(mode, presetId = 'moonlit') {
  const dark = mode === 'dark';
  return {
    presetId,
    accent: presetId === 'chatgpt' ? 'purple' : 'default',
    customAccent: '#A67DF2',
    surface: dark ? '#000000' : '#FCFCFC',
    ink: dark ? '#EDEDED' : '#0D0D0D',
    contrast: presetId === 'chatgpt' ? (dark ? 60 : 45) : 50,
    custom: false,
    codeThemeId: 'moonlit',
    fonts: { ui: null, code: null },
    semanticColors: {},
  };
}
export const DEFAULT_APPEARANCE = {
  version: 1,
  mode: 'system',
  separateModes: false,
  profiles: { light: createProfile('light'), dark: createProfile('dark') },
  uiFontSize: 14,
  contentFontSize: 14,
  codeFontSize: 12,
  reducedMotion: 'system',
  smartPunctuation: true,
  fullWidthPages: false,
  diffMarkers: 'color',
};
export const SUPPORTED_FONTS = {
  ui: [null, 'Geist', 'Inter', 'system-ui'],
  code: [null, 'Geist Mono', 'monospace'],
};
function validateProfile(input, mode) {
  const p = object(input),
    presetId = choice(p.presetId, ['moonlit', 'chatgpt'], 'moonlit'),
    d = createProfile(mode, presetId);
  const surface = normalizeHex(p.surface) || d.surface,
    ink = normalizeHex(p.ink) || d.ink,
    contrast = integer(p.contrast, 0, 100, d.contrast);
  const semanticColors = {};
  for (const key of ['diffAdded', 'diffRemoved', 'skill'])
    if (normalizeHex(p.semanticColors?.[key]))
      semanticColors[key] = normalizeHex(p.semanticColors[key]);
  return {
    ...d,
    accent: choice(
      p.accent,
      ACCENTS.map((a) => a.id),
      d.accent,
    ),
    customAccent: normalizeHex(p.customAccent) || d.customAccent,
    surface,
    ink,
    contrast,
    custom: p.custom === true || surface !== d.surface || ink !== d.ink || contrast !== d.contrast,
    codeThemeId: 'moonlit',
    fonts: {
      ui: choice(p.fonts?.ui, SUPPORTED_FONTS.ui, null),
      code: choice(p.fonts?.code, SUPPORTED_FONTS.code, null),
    },
    semanticColors,
  };
}
export function validateAppearance(input) {
  const a = object(input),
    d = DEFAULT_APPEARANCE;
  if (a.version !== 1) return structuredClone(d);
  return {
    ...d,
    mode: choice(a.mode, ['system', 'light', 'dark'], 'system'),
    separateModes: a.separateModes === true,
    profiles: {
      light: validateProfile(a.profiles?.light, 'light'),
      dark: validateProfile(a.profiles?.dark, 'dark'),
    },
    uiFontSize: integer(a.uiFontSize, 11, 16, 14),
    contentFontSize: integer(a.contentFontSize, 12, 24, 14),
    codeFontSize: integer(a.codeFontSize, 8, 24, 12),
    reducedMotion: choice(a.reducedMotion, ['system', 'on', 'off'], 'system'),
    smartPunctuation: a.smartPunctuation !== false,
    fullWidthPages: a.fullWidthPages === true,
    diffMarkers: choice(a.diffMarkers, ['color', 'sign'], 'color'),
  };
}
export function updateProfile(input, mode, patch) {
  const a = validateAppearance(input),
    profiles = { ...a.profiles };
  profiles[mode] = validateProfile(
    {
      ...profiles[mode],
      ...patch,
      custom:
        profiles[mode].custom ||
        ['surface', 'ink', 'contrast'].some(
          (key) =>
            key in patch &&
            (key === 'contrast' ? patch[key] : normalizeHex(patch[key])) !== profiles[mode][key],
        ),
    },
    mode,
  );
  if (!a.separateModes) {
    const other = mode === 'dark' ? 'light' : 'dark',
      linked = {};
    for (const key of ['accent', 'customAccent']) if (key in patch) linked[key] = patch[key];
    profiles[other] = validateProfile({ ...profiles[other], ...linked }, other);
  }
  return { ...a, profiles };
}
export function selectPreset(input, mode, presetId) {
  const a = validateAppearance(input),
    profiles = { ...a.profiles, [mode]: createProfile(mode, presetId) };
  if (!a.separateModes) {
    const other = mode === 'dark' ? 'light' : 'dark';
    profiles[other] = createProfile(other, presetId);
  }
  return validateAppearance({ ...a, profiles });
}
export function exportTheme(profile, mode) {
  return `moonlit-theme-v1:${JSON.stringify({ variant: mode, profile: validateProfile(profile, mode) })}`;
}
export function importTheme(text) {
  if (typeof text !== 'string' || text.length > 20000)
    throw new Error('Theme strings must be at most 20,000 characters.');
  const trimmed = text.trim(),
    prefix = trimmed.slice(0, trimmed.indexOf(':'));
  if (!['moonlit-theme-v1', 'codex-theme-v1'].includes(prefix))
    throw new Error('Use a moonlit-theme-v1 or supported codex-theme-v1 theme string.');
  let value;
  try {
    value = JSON.parse(trimmed.slice(prefix.length + 1));
  } catch {
    throw new Error('Theme contains invalid JSON.');
  }
  if (!['light', 'dark'].includes(value?.variant))
    throw new Error('Theme variant must be light or dark.');
  const mode = value.variant;
  if (prefix === 'moonlit-theme-v1') {
    const p = object(value.profile);
    if (!['moonlit', 'chatgpt'].includes(p.presetId))
      throw new Error('This preset is not supported.');
    if (
      !normalizeHex(p.surface) ||
      !normalizeHex(p.ink) ||
      !normalizeHex(p.customAccent) ||
      !Number.isInteger(p.contrast) ||
      p.contrast < 0 ||
      p.contrast > 100
    )
      throw new Error('Theme requires hex colors and contrast from 0 to 100.');
    if (
      !ACCENTS.some((item) => item.id === p.accent) ||
      !['moonlit', undefined].includes(p.codeThemeId)
    )
      throw new Error('Unsupported accent or code theme.');
    for (const role of ['ui', 'code'])
      if (p.fonts?.[role] != null && !SUPPORTED_FONTS[role].includes(p.fonts[role]))
        throw new Error(`Unsupported ${role} font.`);
    for (const color of Object.values(object(p.semanticColors)))
      if (!normalizeHex(color)) throw new Error('Semantic colors must be six-digit hex values.');
    return { profile: validateProfile(p, mode), mode };
  }
  const t = object(value.theme);
  if (!['codex', 'moonlit', undefined].includes(value.codeThemeId))
    throw new Error(
      'Unsupported code theme. Moonlit supports its own syntax palette and maps codex to it.',
    );
  if (
    !normalizeHex(t.surface) ||
    !normalizeHex(t.ink) ||
    !normalizeHex(t.accent) ||
    !Number.isInteger(t.contrast) ||
    t.contrast < 0 ||
    t.contrast > 100
  )
    throw new Error(
      'Theme requires six-digit hex surface, ink, accent and contrast from 0 to 100.',
    );
  for (const role of ['ui', 'code'])
    if (t.fonts?.[role] != null && !SUPPORTED_FONTS[role].includes(t.fonts[role]))
      throw new Error(`Unsupported ${role} font. Choose an installed Moonlit font.`);
  for (const color of Object.values(object(t.semanticColors)))
    if (!normalizeHex(color)) throw new Error('Semantic colors must be six-digit hex values.');
  return {
    mode,
    profile: validateProfile(
      {
        ...createProfile(mode, 'chatgpt'),
        surface: t.surface,
        ink: t.ink,
        accent: 'custom',
        customAccent: t.accent,
        contrast: t.contrast,
        fonts: t.fonts,
        semanticColors: t.semanticColors,
        custom: true,
      },
      mode,
    ),
  };
}
