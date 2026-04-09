/**
 * Moonlit design tokens
 *
 * Brand gradient: #00BFFF (cyan-blue) → #6A5ACD (slate blue) → #8A2BE2 (electric violet)
 *   Primary  (brand):  electric violet  #8A2BE2 → HSL(271°, 76%)
 *   Accent:            cyan-blue        #00BFFF → HSL(195°, 100%)
 *   Mid (slate blue)   #6A5ACD appears naturally in gradient usages
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

  // Brand — exact user-specified gradient colors
  brand000:   '#8A2BE2',               // electric violet — exact spec (5.97:1 on white ✓)
  brand200:   '#6A5ACD',               // slate blue — exact spec
  brandDark:  hslToHex(271, 82,  25),  // ~#440c8a  — deeper for hover/dark states

  // Accent — cyan-blue (start of brand gradient), darkened for text contrast on white
  accent000:  hslToHex(195, 100, 35),  // ~#005fa8  — deep cyan (AA on white)
  accentLight:'#00BFFF',               // exact spec — decorative / dark-theme use
  accentDark: hslToHex(195, 100, 22),  // ~#003a6b  — deep teal

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

  // Brand — electric violet, luminous on dark bg
  brand000:   hslToHex(271, 80,  68),   // ~#b05cf0  — vibrant electric violet
  brand200:   hslToHex(271, 82,  80),   // ~#cda0f7  — soft violet
  brandDark:  hslToHex(271, 74,  55),   // ~#8a35e0  — deeper violet

  // Accent — cyan-blue, luminous on dark bg
  accent000:  hslToHex(195, 100, 52),   // ~#00b8e6  — vivid cyan (#00BFFF range)
  accentLight:hslToHex(195, 100, 65),   // ~#40d4f5  — soft cyan
  accentDark: hslToHex(195, 100, 40),   // ~#0090b8  — deeper cyan

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
