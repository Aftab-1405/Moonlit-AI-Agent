# Application focus and default-accent fixes

The audit covered the shared MUI theme, outlined-field helpers and every local focus/active override, including authentication, dashboard/admin controls, sidebar search and conversation actions, database/Settings overlays, composer/model selection, Appearance, SQL editing and embedded analytics.

## Fixed gaps

- Shared outlined fields used a brighter border when focused, and standalone selects used a different idle border. Pointer activation now retains the normal idle/hover boundary without changing its width. Standard/filled fields no longer add an active underline. Invalid fields retain their red border during hover and focus.
- Browser text inputs can match `:focus-visible` after mouse/touch input, and MUI can retain focus-visible after menu focus restoration. Pointer-specific suppression removes those extra outlines/shadows; keyboard navigation keeps a visible outline. Typing/caret editing retains its pointer origin. Tab, Escape and shortcuts restore keyboard modality, including events originating inside an open shadow root.
- Appearance's select and mode-preview overrides added their own focus accents. They now follow the same pointer/keyboard rule. Selected mode indicators remain visible.
- The conversation ellipsis's transparent hover/pressed rules lost to the more specific global IconButton styles. Matching specificity fixes the round fill while retaining row hover, menu behavior and keyboard focus. The same correction applies to inline rename actions. Slider pointer halos were also removed.
- Perspective's query/group/sort inputs live in a shadow root and added a contrasting border and fill on focus. A scoped, idempotent integration keeps their idle surface and inherits the application's keyboard outline. Existing invalid and grid-selection states remain intact; plugin changes do not duplicate the stylesheet.
- Moonlit's Default swatch was neutral while its resolver and legacy dark theme used the old pink workspace token. One mode-aware default now drives both UI and swatch: `#FFFFFF` in dark mode and `#0D0D0D` in light mode. Moonlit preset selection and Reset restore that default. Explicit named Pink remains available.
- Removed the checkmark from the closed accent selector. Its popup uses a visible selected-row fill and `aria-selected` to identify the current color.

## Evidence and checks

[Before/after gallery](interaction-focus-qa/index.html), [app browser matrix](interaction-focus-qa/after.json), [analytics](interaction-focus-qa/after-analytics.json), [touch](interaction-focus-qa/touch.json), and [Default/Reset/popup selection](interaction-focus-qa/default-accent.json). All use actual components with synthetic data in local Chrome, light/dark modes and a strict 390 px touch viewport. The app matrix exercises actual Auth, database Host, Settings/Appearance, composer model search and SQL editor, alongside shared controls used by other screens.

Browser checks confirm stable click boundaries, keyboard focus and menu-return focus, transparent ellipsis hover/press/open states, selected controls, validation styling, native inputs, analytics typing and plugin switching, touch activation, neutral Reset swatches/controls/send buttons, and visible popup selection with a plain closed label.

The pre-fix app capture recorded both-mode field/menu failures before stopping at a runner selector mismatch; that selector was corrected for the final full matrix. Raw [pre-fix app](interaction-focus-qa/before.json) and [pre-fix analytics](interaction-focus-qa/before-analytics.json) observations remain available. Source review found and verified the slider placement and Escape/shadow-input edge cases before completion.

An intermediate full test run exposed outdated pink-default assertions in `src/theme/accent.vitest.jsx` and `src/theme/darkPreset.vitest.jsx`. The colored-action test now supplies an explicit colored accent; the default-preset assertion expects the requested neutral. **Final verification passed:** `npm test` — 35 Node test files and 281 component tests across 54 files (87.59 s component run); `npm run lint` — no warnings; `npm run build` — 12.27 s with the existing large-chunk warning, including Perspective about 9.8 MB; `git diff --check` — clean. Logs: [tests](interaction-focus-qa/tests.txt), [lint](interaction-focus-qa/lint.txt), [build](interaction-focus-qa/build.txt). The final browser results contain 55 app checks, 9 analytics checks, 7 touch checks and 14 default-accent/selection checks, all passed.

## Modified files

Production: `src/theme/createMoonlitTheme.js`, `src/theme/tokens/{primitives,semantic}.js`, `src/theme/appearance.js`, `src/styles/{shared,mediaQueries}.js`, `src/contexts/ThemeContext.jsx`, `src/features/overlays/settings/AppearanceSection.jsx`, `src/features/sidebar-left/components/SidebarPrimitives.jsx`, and `src/features/sidebar-right/artifacts/data-visualization/{PerspectiveDashboard.jsx,perspectiveFocus.js}`.

Regression coverage: `src/contexts/ThemeContext.vitest.jsx`, `src/theme/{appearance,accent,darkPreset}.vitest.jsx`, `src/features/overlays/settings/AppearanceSection.vitest.jsx`; executable Chrome checks in `tests/browser/` and the synthetic fixture/config in `tests/fixtures/focus-*` and `tests/focus.vite.config.mjs`.

Reproduce: start `npm run dev -- --config tests/focus.vite.config.mjs --port 5173`, start a dedicated Chrome with CDP on port 9333, then run `node tests/browser/focus-interactions.mjs after`, `node tests/browser/perspective-focus.mjs after`, `node tests/browser/focus-touch.mjs`, and `node tests/browser/default-accent.mjs` sequentially from the frontend root. The tests overwrite the evidence files. No new dependencies, commits or deployment were added. Verification uses Chromium with touch emulation, not a physical-device or cross-browser certification.
