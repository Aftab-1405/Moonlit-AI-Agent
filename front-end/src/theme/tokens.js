/**
 * Moonlit design tokens
 *
 * Brand identity: Selene — HSL(230°, 70%, 69%) on dark / HSL(230°, 63%, 40%) on light.
 * Named after the Greek goddess of the moon. Reflected moonlight cool blue-silver.
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
  bg100:      hslToHex(48,  33.3, 97.1),   // #faf9f5  — warm off-white (paper)
  bg200:      hslToHex(53,  28.6, 94.5),   // #f5f4ee  — cream (sunken / input)
  bg300:      hslToHex(48,  25,   92.2),   // #eeeadf  — deeper cream (hover bg)
  bg400:      hslToHex(50,  20.7, 88.6),   // #e5e2d7  — strongest hover surface

  // Text (prominent → muted)
  text000:    hslToHex(60,  2.6,  7.6),    // #141413  — near black (primary)
  text200:    hslToHex(60,  2.5,  23.3),   // #3c3c39  — dark gray (secondary)
  text400:    hslToHex(51,  3.1,  43.7),   // #706f6a  — muted (disabled / hint)

  // Brand — Selene (darkened for WCAG AA on white bg)
  brand000:   hslToHex(230, 63,  40),   // #263AA6  — deep Selene (9:1 on white)
  brand200:   hslToHex(230, 55,  54),   // #5170C8  — mid Selene
  brandDark:  hslToHex(230, 70,  28),   // #152088  — deep navy

  accent000:  hslToHex(230, 38,  50),   // #5566AA  — muted support
  accentLight:hslToHex(230, 35,  63),   // #7A8ABD  — soft support
  accentDark: hslToHex(230, 45,  36),   // #324797  — deep support

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

  // Brand — Selene (moon-blue identity color, light on dark bg)
  brand000:   hslToHex(230, 70,  69),   // #7B8FE8  — Selene main
  brand200:   hslToHex(230, 75,  80),   // #AEBCF2  — Selene light
  brandDark:  hslToHex(230, 62,  55),   // #5469D0  — Selene dark

  accent000:  hslToHex(230, 35,  74),   // #A3AAD9  — muted Selene support
  accentLight:hslToHex(230, 38,  83),   // #B8BFE7  — softest support
  accentDark: hslToHex(230, 32,  60),   // #808DC0  — deeper support

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
