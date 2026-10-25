import { darkSemanticTokens } from './semantic.js';

/**
 * Component-role aliases consumed by the centralized MUI overrides.
 * Application components should prefer semantic palette roles directly.
 */
const createComponentTokens = (tokens) =>
  Object.freeze({
    bg000: tokens.background.default,
    bg100: tokens.background.paper,
    bg200: tokens.background.sunken,
    bg300: tokens.background.hover,
    bg400: tokens.background.strong,
    text000: tokens.text.primary,
    text200: tokens.text.secondary,
    text400: tokens.text.disabled,
    brand000: tokens.identity.marketing.main,
    brand200: tokens.identity.marketing.light,
    brandDark: tokens.identity.marketing.dark,
    brandGlow: tokens.text.disabled,
    accent000: tokens.accent.main,
    accentLight: tokens.accent.light,
    accentDark: tokens.accent.dark,
    info000: tokens.info.main,
    infoLight: tokens.info.light,
    infoDark: tokens.info.dark,
    danger000: tokens.error.main,
    dangerLight: tokens.error.light,
    dangerDark: tokens.error.dark,
    success000: tokens.success.main,
    successLight: tokens.success.light,
    successDark: tokens.success.dark,
    warning000: tokens.warning.main,
    warningLight: tokens.warning.light,
    warningDark: tokens.warning.dark,
    border200: tokens.border.base,
  });

export const darkComponentTokens = createComponentTokens(darkSemanticTokens);
