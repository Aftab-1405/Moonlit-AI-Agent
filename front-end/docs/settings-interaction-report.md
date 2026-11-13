# Settings interaction follow-up

This focused patch fixes the semantic icons, Advanced interaction states and color-selection workflow. Existing routes, account storage, editor state, import validation, numeric drafts, card grouping and search reveal remain in place. No dependencies, commits or deployment were added.

## Root causes and changes

- **Icons:** replaced the sparkle fallback with an explicit General/Appearance/Database/AI-context map. General uses the canonical gear; Appearance uses a palette alias. Search uses the same mapping. Close/clear use `CloseIcon`; import uses `ImportIcon` (upload-to-app), alongside the existing Copy and chevron aliases. All four rendered navigation glyphs have matching 20×20 bounds and are decorative to assistive technology.
- **Advanced:** the global text-button pill treatment reached a zero-padding disclosure. Local `ButtonBase` styles now define secondary resting/expanded text, padded hover/pressed surfaces, keyboard outline, stable bounds, and independent Reset. The target is 36 px high on desktop and 44 px for coarse pointers. Chevron rotation respects reduced motion. Browser measurements found **no hover layout movement before or after**; the defect was the tightly fitted pill and visual treatment.
- **Picker:** replaced the nested native color dialog and HSL-only sliders with an inline HSV plane, selection indicator, spectrum hue rail, named keyboard-accessible Hue/Saturation/Brightness ranges and hex editing. Hue/saturation survive achromatic own-commit echoes; external profile revisions and account changes discard drafts. HSV math still leaves hue-only gray/black/white edits unchanged. Pointer capture clamps outside coordinates; touch prevents scrolling. A reproduced previous-slider blur race now respects gesture ownership.
- **Preview and performance:** preview and commit both use `updateProfile` and the same semantic resolver. The edited light/dark card and its contrast card receive scoped variables, including accent feedback, without switching the app mode. Removed broad descendant text recoloring so validation/status styling survives. Controls own transient state, coalesce painting with animation frames, flush the final value, and cancel scheduled work on reset/unmount. Escape and touch/pointer cancellation suppress late release/blur commits.

Pointer release and range keyboard actions commit the current valid color; blur accepts a valid hex draft; backdrop accepts the current draft. Escape discards the uncommitted gesture/draft and closes the picker. Repeated blur/backdrop/release events and serialized no-ops do not add writes. Earlier completed gestures remain saved.

## Changed source files

`src/components/icons/index.js`; `src/features/overlays/preference-surface/PreferenceSurface.jsx`; `src/features/overlays/settings/{SettingsModal,AppearanceSection,AppearanceControls,ContrastControl}.jsx`; `src/features/overlays/settings/profilePreview.js`; `src/theme/colorModel.js`. Extended `AppearanceControls.vitest.jsx`, `AppearanceSection.vitest.jsx`, `colorModel.test.js`; added `ContrastControl.vitest.jsx`. Planning and QA artifacts are under `docs/superpowers/plans/2026-11-12-settings-interaction-follow-up.md` and `docs/settings-interaction-qa/`.

## Browser evidence

[Before/after gallery](settings-interaction-qa/index.html), [66-check matrix](settings-interaction-qa/browser-checks.json), [18 supplemental checks](settings-interaction-qa/browser-supplement.json), [42 companion-control hover checks plus tooltips/copy/touch targets](settings-interaction-qa/companion-controls.json), [final bounds/states](settings-interaction-qa/final-states.json), and [brief Chrome trace](settings-interaction-qa/interaction-trace.json.gz). Extract the gzip and load the JSON in DevTools Performance; User Timing marks identify Advanced and picker interactions. The trace includes screenshots.

Actual Chrome interactions covered collapsed/expanded normal, hover, pressed and keyboard-focus states in light/dark; Enter/Space; separate Reset; normal/search navigation; Default/Purple/White accent menus; import controls; mobile drawer; neutral/pastel/red color workflows; keyboard dimensions; capture outside bounds; mobile touch; cancellation; normalized/no-op hex; backdrop commit deduplication; account switch; same-color external reset; custom accent and both separated profile previews; validation error color; and reduced motion. Desktop captures are 1158×928, mobile 390×844, DPR 1. These are synthetic-account fixture captures of the real components, with composer, CodeMirror and a three-row Perspective chart mounted behind Settings, not an authenticated reference service.

## Performance

Fresh before/after runs used Chrome 157, Vite development mode, the same viewport and mounted workload, 100 moves at nominal 25 ms spacing, a 20→80→20 trajectory and one release. The old gray lightness slider and new gray brightness range produce equivalent color trajectories. [Raw before](settings-interaction-qa/before.json) / [raw after](settings-interaction-qa/after.json).

| Interaction | React actual-duration p95, ms | Frame interval p95, ms | Long tasks: count / max ms |
|---|---:|---:|---:|
| Contrast, before → after | 51.3 → 2.7 | 50.1 → 16.7 | 29 / 276 → 1 / 232 |
| Color, before → after | 52.7 → 10.4 | 83.3 → 16.7 | 58 / 386 → 2 / 269 |

Both runs retain **one settings write, one theme rebuild and one boot write per gesture**. Actual elapsed gesture windows were about 5.6/7.7 seconds before and 3.9/4.0 seconds after; scheduling and long tasks stretch the nominal workload. Final commits still produce substantial work. These development fixture results do **not** prove sustained 60 fps or the user's device performance.

## Validation and limits

**`npm test` passed:** 35 Node test files and 275 component tests across 54 files (94.54 s for Vitest). The focused Settings/control run also passed. **`npm run lint` passed** with no warnings. **`npm run build` passed** in 12.10 s, with the existing large-chunk warning (Perspective about 9.8 MB). `git diff --check` passed. Full logs: [tests](settings-interaction-qa/project-tests.txt), [lint](settings-interaction-qa/project-lint.txt), [build](settings-interaction-qa/project-build.txt). Browser scripts and saved before/current fixture sources are available in [reproduction files](settings-interaction-qa/reproduce/README.md). The independent read-only review reproduced contrast touch cancellation, which was fixed and tested; it reported no remaining actionable findings after the final fixes.

The catalog remains Moonlit and measured ChatGPT. No accessible Vercel preset definition was recovered in this session, and nothing is relabeled as Vercel or claimed as an exact reference match. Custom palette generation remains the documented Moonlit approximation. Unsupported punctuation/full-width controls remain omitted. Browser verification used Chromium, including touch emulation; a physical-device/Safari/Firefox run is outside this evidence.
