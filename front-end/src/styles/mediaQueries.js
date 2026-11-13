/**
 * Shared media-query strings used across the app.
 *
 * Centralising these here means we never typo a query string and can update
 * them in one place if our breakpoint strategy changes. Always import from
 * here rather than re-declaring inline media queries in component sx props.
 */

/** Respect user motion preferences — disable animations / transitions. */
export const REDUCED_MOTION_QUERY = '@media (prefers-reduced-motion: reduce)';

/** Resolved System/On/Off appearance preference; also permits an explicit Off override. */
export const REDUCED_MOTION_SELECTOR = 'html[data-moonlit-reduced-motion="true"] &';

/** Focus decoration follows keyboard navigation, rather than mouse/touch activation. */
export const KEYBOARD_FOCUS_SELECTOR = 'html:not([data-moonlit-input-modality="pointer"]) &';

/** Devices that support hover + fine pointer (i.e. desktop with mouse). */
export const HOVER_CAPABLE_QUERY = '@media (hover: hover) and (pointer: fine)';

/** Touch-only devices — used to force visible affordances that desktop hides on hover. */
export const TOUCH_DEVICE_QUERY = '@media (hover: none)';

/** Small mobile viewport — matches MUI's `xs` breakpoint upper bound. */
export const MOBILE_SM_QUERY = '@media (max-width:599.95px)';

/** Browsers without backdrop-filter support — fallback to solid backgrounds. */
export const BACKDROP_FILTER_FALLBACK_QUERY =
  '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))';

/** Button hit targets cover small viewports and coarse pointers. */
export const BUTTON_TOUCH_QUERY = '@media (max-width:767.95px), (pointer: coarse)';
