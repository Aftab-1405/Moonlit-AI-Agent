# Accent flow and settings closure audit

The focused patch connects solid controls, text selection and user-message bubbles to distinct semantic roles. ChatGPT Purple/Blue now use the supplied mode-specific evidence. Moonlit Default remains white in dark mode and near-black in light mode; explicit Pink remains available. The closed accent selector stays plain, and its popup identifies the selected option. No settings rebuild, dependency, endpoint, staging, commit or deployment was introduced.

## Changes and role consumers

| Role | Consumers | Policy |
|---|---|---|
| `accent.base` | Profile-aware accent swatches and role generation | ChatGPT Blue `#3A83F7`; Purple `#A67DF2`. Moonlit and custom sources retain their identity. |
| `accent.main / contrastText` | Checked switch track/thumb; checked and indeterminate checkbox SVG; radio SVG | Solid fill and explicit on-solid marks. Status overrides and disabled styling remain separate. |
| `accent.foreground` | Slider track/thumb, existing text/outline accents | Slider rail stays muted. No global foreground-to-main substitution. |
| `textSelection.background / foreground` | Emitted prose and input `::selection` | Uses the measured selection role, separate from selected rows. Generated highlights check composited contrast on page, paper, input, composer and elevated surfaces. |
| `userMessage.background / foreground / selectionForeground` | Actual `MessageList` user-bubble subtree | Typography inherits the bubble foreground; selection is checked on that bubble. No stored message changes. |
| `composerAction.background / foreground / hover / pressed` | Enabled `ChatInput` Send | Independent pair; streaming Stop retains its error tone and disabled Send stays neutral. |
| Scoped profile variables | Existing custom-accent row sample and profile text selection | Bubble/action sample previews the edited profile locally. Preview and commit use the same generator, with cancellation and no per-move storage writes. |
| Existing syntax palette | CodeMirror selection and syntax | Editor selection deliberately keeps its syntax-palette background. `currentColor` preserves selected token colors; Shiki/code selection also retains token foregrounds. |

Reference hover/pressed values come from the saved tokens. Custom generation and unmeasured named colors remain Moonlit approximations. The measured Yellow reference composer uses white where generic marks use black; Moonlit deliberately chooses a readable composer foreground for Yellow/White/custom instead of claiming exact parity with that sample.

Source changes are confined to `theme/tokens/semantic.js`, `theme/createMoonlitTheme.js`, `theme/themeCodeMirror.js`, `MessageList.jsx`, `ChatInput.jsx`, and Settings' `AppearanceSection.jsx`, `profilePreview.js`, `SettingsModal.jsx`. The inactive profile selector needed an explicit foreground on its select slot: visual inspection found it inherited the active dark theme's light text on a light card.

## Runtime concerns and verification

Cold Settings entry reproduced the TanStack missing-`queryFn` diagnostic and failed to load reasoning capabilities. Settings now uses the existing `getLlmOptions(signal)` fetch, enabled only while open for an authenticated user, with the same cache lifetimes as chat. The new cold-cache test fails before the fix and passes afterward. The cache-populated path keeps reasoning enabled without an additional fetch. This is component/query integration evidence with a mocked API response, not a fresh authenticated service-capability measurement.

Fresh browser checks reproduced click and Enter search activation, repeated searches, Advanced expansion and UI-font focus at 1158, 768, 767 and 390 px. Drawer Escape restores its trigger and retains Settings. No production search change was needed. The initial harness sampled before disclosure completion and had overflowing synthetic controls; waiting for actual transition completion and wrapping the fixture corrected those harness failures.

The new role tests initially failed on missing bubble/selection roles and incorrect Blue mapping. Actual-control tests initially failed on switch fills. Review also caught insufficient Default/White selection contrast on input/composer surfaces; the added composited-contrast test failed at 4.17:1 before the fix. Independent review subsequently checked 120 combinations across modes, presets, accents and surfaces, all at least 4.5:1.

Fresh validation:

- `npm test`: **35 Node test files and 290 component tests across 56 files passed**. Vitest took 98.73 s. After the final selector-color adjustment, the affected Appearance/role suite passed **22 tests**.
- `npm run lint` and `npm run build`: passed. Build retains the existing large-chunk warning for Perspective (about 9.8 MB).
- Browser role matrix: **72 checks**, covering actual SVG marks/thumbs, status/disabled controls, slider roles, computed selection on prose/input/bubble, syntax, enabled/disabled/streaming composer, appended/prepended history, neutral assistant links and Copy hover.
- Settings search/mobile and neutral navigation: **24 checks**. Lifecycle: **10 checks** covering OS mode/motion listeners, fonts on real content/editor, editor/chart instances and chart configuration, draft retention, reload and real cross-tab propagation.
- Custom-profile/gesture checks: **7 checks** covering gray-to-blue editing, inactive-profile bubble preview, cancellation, readable selector text, no drag-time writes/rebuilds, and one settings/boot write plus one theme rebuild on release.
- Existing Default/reset regression: **14 checks passed**; pointer/keyboard focus regression: **55 checks passed**. Results are saved separately from older task evidence.

The main transcript fixture renders production components with fixed synthetic messages and valid composer prerequisites. No chat was sent and no SQL was executed. User messages currently render plain text, including URLs, and expose Copy; they have no hyperlink or Edit consumer to recolor/test. This existing behavior is preserved. Assistant markdown hyperlinks were rendered and verified neutral; bubble hyperlink/edit parity is not claimed.

[Matched before/after gallery](accent-flow-qa/index.html), [role measurements](accent-flow-qa/after.json), [search checks](accent-flow-qa/settings-closure.json), [lifecycle checks](accent-flow-qa/lifecycle.json), and [custom preview/performance data](accent-flow-qa/preview-performance.json) contain the actual evidence. Screenshots use 1158×1000, DPR 1, the same mode, ChatGPT preset and named accent, with no CSS zoom. The reference sources are the supplied [ChatGPT evidence](../../docs/chatgpt-accent-live-evidence.json) and [Moonlit comparison](../../docs/moonlit-accent-live-comparison.json).

## Commit cost

The earlier interaction report's 16.7 ms frame-p95 and 2.7/10.4 ms React-p95 remain historical measurements of its own workload. A fresh 100-move custom-accent drag with the transcript, composer, SQL editor and Perspective mounted measured **7.9 ms React-p95, 33.3 ms frame-p95, and a 387 ms final-commit long task**. The workload and instrumentation differ; this is not a controlled regression comparison or a sustained-60-fps claim. There were no settings writes or theme rebuilds during the drag, followed by one of each on release.

The [final-commit CPU profile](accent-flow-qa/final-commit.cpuprofile) places the long task immediately after release. Hot work includes MUI textarea autosizing/layout, React development property diffing, element creation/style insertion and popover positioning; semantic color decomposition was a smaller sampled cost. The existing global theme commit remains expensive. This patch preserves the local/frame-coalesced preview rather than expanding into an application rendering redesign.

## Earlier-requirements ledger

| Requirement | Final status | Evidence | Remaining difference |
|---|---|---|---|
| Shell, categories, routes, history/draft retention | Implemented | Current Settings source; fresh full-suite App route tests and browser draft retention | Fixture evidence, not a new authenticated end-to-end route session. |
| Search activation and mobile navigation | Implemented | Fresh 24-check matrix at both breakpoint sides and mobile | Physical-device/browser-family testing remains outside this evidence. |
| Groups, semantic icons, Advanced hover, HSV picker | Implemented | Existing source retained; fresh component suite and custom-profile interaction checks | Earlier complete hover-state matrix remains saved evidence; no unrelated redesign. |
| Mode, separate/linked profiles, account isolation, boot and persistence | Intentional adaptation | Fresh OS/reload/cross-tab checks; account-isolation, boot and profile tests in full suite | Browser/account-local appearance only; unsupported appearance fields still excluded from backend settings sync. |
| Typography, motion, editor and chart integration | Partial | Fresh content/code sizes, OS/explicit motion, editor/chart identity and configuration checks; existing source/tests | No claim of fresh exhaustive table/font/rendered-chart or cross-browser fidelity. Categorical series and diff colors remain stable. |
| Import/copy | Implemented | Fresh importer, atomic-validation, clipboard-failure and round-trip tests | Moonlit v1 and validated Codex subset only. |
| Preset/custom fidelity | Partial | Measured Purple/Blue role tests; bounded review of supplied preset evidence | Vercel/broader Codex catalog not recovered; supplied screenshot not reproduced exactly. Custom surface/contrast math remains approximate. |
| Punctuation/full-width controls | Intentional adaptation | Current supported-surface inventory and omitted controls | No enabled no-op controls; a prose/document surface remains outside this patch. |
| Accent consumers and neutral boundaries | Implemented | Role tests, actual-component browser matrix, local preview and regression evidence | Rendered reference coverage is settings, selection, light user bubbles and sampled neutral external links. Dark reference bubbles are token evidence; charts, arbitrary generator math and enabled-Send reference parity remain unverified. |

## Reproduction

Start `npm run dev -- --host 127.0.0.1 --port 5173 --config tests/focus.vite.config.mjs` and a separate Chrome profile with debugging port 9333. Run `node tests/browser/accent-flow.mjs after`, `settings-closure.mjs`, `accent-lifecycle.mjs`, and `accent-preview-performance.mjs` from `tests/browser` paths, sequentially from the frontend root. These scripts save evidence under `docs/accent-flow-qa`; do not run other tests/builds while profiling. The saved `before` captures precede the patch; running `accent-flow.mjs before` against current source will not recreate the old implementation. Default/focus regression scripts were reused with only their output directory redirected, preserving older task evidence.
