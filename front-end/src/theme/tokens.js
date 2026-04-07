/**
 * Claude.ai design tokens
 *
 * HSL values extracted from Claude.ai's CSS design system and pre-computed to hex
 * so MUI's alpha() / color manipulation utilities work correctly.
 *
 * Token scale convention (Claude):
 *   000 = most prominent / foreground
 *   200 = mid-weight
 *   400 = subtle / muted
 *   500 = near-invisible
 */

/** Converts HSL components (h: 0-360, s: 0-100, l: 0-100) to a hex color string. */
export const hslToHex = (h, s, l) => {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

/**
 * Raw HSL token definitions — [h, s, l] tuples.
 * Grouped by theme mode for reference / tooling.
 */
export const RAW_TOKENS = {
  light: {
    'bg-000':      [0,   0,    100],
    'bg-100':      [48,  33.3, 97.1],
    'bg-200':      [53,  28.6, 94.5],
    'bg-300':      [48,  25,   92.2],
    'bg-400':      [50,  20.7, 88.6],
    'text-000':    [60,  2.6,  7.6],
    'text-200':    [60,  2.5,  23.3],
    'text-400':    [51,  3.1,  43.7],
    'brand-000':   [45,  4.5, 12],
    'brand-200':   [45,  4,   22],
    'accent-000':  [45,  3,   34],
    'info-000':    [210, 73.7, 40.2],
    'danger-000':  [0,   58.6, 34.1],
    'success-000': [125, 100,  18],
    'warning-000': [45,  91.8, 19],
    'border-200':  [30,  3.3,  11.8],
  },
  dark: {
    'bg-000':      [60,  2.1,  18.4],
    'bg-100':      [60,  2.7,  14.5],
    'bg-200':      [30,  3.3,  11.8],
    'bg-300':      [60,  2.6,  7.6],
    'bg-400':      [0,   0,    0],
    'text-000':    [48,  33.3, 97.1],
    'text-200':    [50,  9,    73.7],
    'text-400':    [48,  4.8,  59.2],
    'brand-000':   [48,  18,  95],
    'brand-200':   [48,  18,  99],
    'accent-000':  [48,  6,   72],
    'info-000':    [210, 65.5, 67.1],
    'danger-000':  [0,   98.4, 75.1],
    'success-000': [97,  59.1, 46.1],
    'warning-000': [40,  71,   50],
    'border-200':  [51,  16.5, 84.5],
  },
};

/** Pre-computed hex values — light theme */
export const LIGHT = {
  // Backgrounds (lighter → darker)
  bg000:      hslToHex(0,   0,    100),    // #ffffff  — pure white
  bg100:      hslToHex(48,  33.3, 97.1),   // #faf9f5  — warm off-white (paper)
  bg200:      hslToHex(53,  28.6, 94.5),   // #f5f4ee  — cream (sunken / input)
  bg300:      hslToHex(48,  25,   92.2),   // #eeeadf  — deeper cream (hover bg)
  bg400:      hslToHex(50,  20.7, 88.6),   // #e5e2d7  — strongest hover surface

  // Text (prominent → muted)
  text000:    hslToHex(60,  2.6,  7.6),    // #141413  — near black (primary)
  text200:    hslToHex(60,  2.5,  23.3),   // #3c3c39  — dark gray (secondary)
  text400:    hslToHex(51,  3.1,  43.7),   // #706f6a  — muted (disabled / hint)

  // Primary / secondary neutrals for the monochrome UI
  brand000:   hslToHex(45,  4.5, 12),
  brand200:   hslToHex(45,  4,   22),
  brandDark:  hslToHex(45,  5,   7),

  accent000:  hslToHex(45,  3,   34),
  accentLight:hslToHex(45,  3,   46),
  accentDark: hslToHex(45,  3,   22),

  // Semantic info remains blue
  info000:    hslToHex(210, 73.7, 40.2),
  infoLight:  hslToHex(210, 73.7, 52),
  infoDark:   hslToHex(210, 73.7, 28),

  // Semantic
  danger000:  hslToHex(0,   58.6, 34.1),   // #8a2424  — error.main
  success000: hslToHex(125, 100,  18),      // #005c08  — success.main
  warning000: hslToHex(45,  91.8, 19),      // #5c4500  — warning.main

  // Border base (to be used with alpha in practice)
  border200:  hslToHex(30,  3.3,  11.8),   // #1f1e1c  — near-black warm gray
};

/** Pre-computed hex values — dark theme */
export const DARK = {
  // Backgrounds (lighter → darker)
  bg000:      hslToHex(60,  2.1,  18.4),   // #2f2e2d  — dark base (default)
  bg100:      hslToHex(60,  2.7,  14.5),   // #252524  — darkest (paper)
  bg200:      hslToHex(30,  3.3,  11.8),   // #1f1e1c  — very dark (sunken / input)
  bg300:      hslToHex(60,  2.6,  7.6),    // #141413  — near black
  bg400:      hslToHex(0,   0,    0),       // #000000

  // Text (prominent → muted)
  text000:    hslToHex(48,  33.3, 97.1),   // #faf9f5  — near white (primary)
  text200:    hslToHex(50,  9,    73.7),    // #c2c0b5  — gray (secondary)
  text400:    hslToHex(48,  4.8,  59.2),   // #989590  — muted (disabled / hint)

  // Primary / secondary neutrals for the monochrome UI
  brand000:   hslToHex(48,  18,  95),
  brand200:   hslToHex(48,  18,  99),
  brandDark:  hslToHex(48,  8,   82),

  accent000:  hslToHex(48,  6,   72),
  accentLight:hslToHex(48,  6,   82),
  accentDark: hslToHex(48,  6,   58),

  // Semantic info remains blue
  info000:    hslToHex(210, 65.5, 67.1),
  infoLight:  hslToHex(210, 65.5, 76),
  infoDark:   hslToHex(210, 65.5, 52),

  // Semantic
  danger000:  hslToHex(0,   98.4, 75.1),   // #fe8181  — error.main
  success000: hslToHex(97,  59.1, 46.1),   // #65bb30  — success.main
  warning000: hslToHex(40,  71,   50),      // #da9e25  — warning.main

  // Border base (used with alpha in practice)
  border200:  hslToHex(51,  16.5, 84.5),   // #dedcd0  — light warm gray
};

/** Claude.ai / Anthropic font stacks */
export const FONTS = {
  sans:  '"Anthropic Sans", system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  mono:  '"Anthropic Mono", ui-monospace, "Cascadia Code", "Fira Code", monospace',
  serif: '"Anthropic Serif", Georgia, "Times New Roman", serif',
};

/** Shared MUI shape config */
export const SHAPE = {
  borderRadius: 8,
  radius: { sm: 4, md: 8, lg: 12, xl: 16, full: 9999 },
};

/** Shared MUI breakpoints */
export const BREAKPOINTS = {
  values: { xs: 0, sm: 600, md: 960, lg: 1200, xl: 1536 },
};
