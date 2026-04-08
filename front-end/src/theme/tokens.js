/**
 * Moonlit design tokens
 *
 * Brand identity: Selene — HSL(250°) deep indigo-violet.
 * Named after the Greek goddess of the moon. The hue evokes a deep night sky —
 * distinctively between blue and violet, not the generic corporate 230° blue.
 *
 * Token scale convention:
 *   000 = most prominent / foreground
 *   200 = mid-weight
 *   400 = subtle / muted
 *   500 = near-invisible
 */

/** Converts HSL components (h: 0-360, s: 0-100, l: 0-100) to a hex color string. */
const hslToHex = (h, s, l) => {
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

/** Pre-computed hex values — light theme */
export const LIGHT = {
  // Backgrounds (lighter → darker)
  bg000:      hslToHex(0,   0,    100),    // #ffffff  — pure white
  bg100:      hslToHex(48,  12,   98.2),   // #fbfbfa  — barely-warm white (paper)
  bg200:      hslToHex(48,  10,   95.8),   // #f5f5f4  — soft neutral (sunken / input)
  bg300:      hslToHex(48,  9,    92.5),   // #eeeeed  — light neutral (hover bg)
  bg400:      hslToHex(48,  8,    88.8),   // #e3e3e2  — mid neutral (strongest surface)

  // Text (prominent → muted)
  text000:    hslToHex(60,  2.6,  7.6),    // #141413  — near black (primary)
  text200:    hslToHex(60,  2.5,  23.3),   // #3c3c39  — dark gray (secondary)
  text400:    hslToHex(51,  3.1,  43.7),   // #706f6a  — muted (disabled / hint)

  // Brand — Selene (deep indigo-violet, WCAG AA on white)
  brand000:   hslToHex(250, 72,  44),   // ~#3b28c8  — deep indigo-violet (7:1 on white)
  brand200:   hslToHex(250, 64,  58),   // ~#6b5cd9  — mid indigo
  brandDark:  hslToHex(250, 80,  30),   // ~#220fa3  — near-black indigo

  accent000:  hslToHex(263, 42,  54),   // ~#7255b8  — muted violet (slightly purple-shifted)
  accentLight:hslToHex(263, 38,  67),   // ~#9882cc  — soft violet
  accentDark: hslToHex(263, 50,  39),   // ~#4d2696  — deep violet

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

  // Brand — Selene (deep indigo-violet, luminous on dark bg)
  brand000:   hslToHex(250, 88,  72),   // ~#8b77f7  — vibrant indigo-violet
  brand200:   hslToHex(250, 90,  83),   // ~#b5abfb  — soft indigo
  brandDark:  hslToHex(250, 76,  57),   // ~#5e4de6  — deeper indigo

  accent000:  hslToHex(263, 45,  74),   // ~#a48dd6  — muted violet
  accentLight:hslToHex(263, 42,  84),   // ~#c3b5e8  — near-pastel violet
  accentDark: hslToHex(263, 40,  61),   // ~#8068bf  — deep muted violet

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
