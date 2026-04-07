/**
 * Theme entry point — re-exports everything from the modular theme directory.
 *
 * This file ensures that existing imports (`from '../theme'` or `from './theme'`)
 * continue to resolve correctly. Vite's module resolution prefers theme.js over
 * src/theme/index.js for bare path imports, so this passthrough is required.
 *
 * To add or modify theme tokens/themes, edit files under src/theme/.
 */
export * from './theme/index.js';
export { default } from './theme/index.js';
