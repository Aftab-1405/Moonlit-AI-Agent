# Settings and appearance implementation

Moonlit now has routed General, Appearance, Database and AI context settings, grouped navigation, setting-level search, a responsive drawer, and an account-local appearance system. Existing workspace components remain mounted beneath settings. No deployment, commit, or reset was performed; existing staged changes were preserved.

## Modified files

- Routing: `src/App.jsx`, `src/contexts/SettingsRouteContext.jsx`, `src/contexts/appearanceContext.js`, `src/hooks/chat-page/useOverlayState.js`, `src/hooks/chat-page/useChatPageController.js`, `src/App.vitest.jsx`.
- Settings: `src/features/overlays/settings/{SettingsModal.jsx,SettingsModal.vitest.jsx,AppearanceSection.jsx,AppearanceControls.jsx,AppearanceControls.vitest.jsx,AppearanceSection.vitest.jsx,settingsRegistry.js,settingsRegistry.test.js}`.
- Shared preference row: `src/features/overlays/preference-surface/PreferenceSurface.jsx` (scoped appearance density, DOM targets and description roles).
- Preference lifecycle: `index.html`, `src/contexts/{SettingsContext.jsx,SettingsContext.vitest.jsx,ThemeContext.jsx,ThemeContext.vitest.jsx}`, `src/hooks/useLocalStorage.js`, `src/hooks/useLocalStorage.vitest.jsx`.
- Appearance model/theme: `src/theme/{appearance.js,appearance.test.js,appearance.vitest.jsx,boot.vitest.jsx,mode.js,mode.test.js,createMoonlitTheme.js,typography.js,tokens/semantic.js,tokens/component.js,colorModel.js,colorModel.test.js}`.
- Code and charts: `src/theme/{syntaxPalettes.js,themeCodeMirror.js}`, `src/utils/shiki.js`, `src/components/{CodeViewer.jsx,codeViewerStyles.js}`, `src/features/sidebar-right/artifacts/{sql-workspace/SqlEditorSurface.jsx,data-visualization/PerspectiveDashboard.jsx}`.
- Motion: `src/hooks/useAppearanceReducedMotion.js`, `src/styles/mediaQueries.js`, `src/styles/shared.js`, `src/pages/{AdminDashboard.jsx,authLayoutStyles.js}`; consumers in `src/components/{common/ToastStack.jsx,common/AppPopover.jsx,common/ButtonLoadingSpinner.jsx,common/PageLoader.jsx,ui/Drawer.jsx,ui/toast.jsx}`, `src/features/{shell/AppShell.jsx,overlays/mindmap/SchemaMindmapDialog.jsx,chat/ChatHeader.jsx,chat/ChatInput.jsx,chat/ChatLayout.jsx,chat/WelcomeScreen.jsx,chat/ai-response-steps/StepTimelineItems.jsx,sidebar-left/components/SidebarPrimitives.jsx,sidebar-left/components/SidebarSectionLayout.jsx,sidebar-left/styles/sidebarStyles.js,chat/InlineExecutionTable.jsx,chat/MarkdownRenderer.jsx,chat/MessageList.jsx,chat/WelcomeSuggestions.jsx,chat/ai-response-steps/index.jsx}`.
- This report, `docs/superpowers/plans/2026-11-12-settings-appearance.md`, and `docs/appearance-qa/` (comparison HTML, actual screenshots, layout measurements and profile summaries).

## Verification

- `npm test`: all 35 Node test files and all 267 component tests across 53 files passed in the final run (91.55s). An earlier run overlapping the build hit the existing 5-second sidebar-history deadline; that test passed in isolation in 2.87s, and the subsequent full run passed without concurrent build/browser work. No deadline or test behavior was changed. Added coverage includes account/guest switching, storage failures and cross-tab events, OS color/motion changes and listener cleanup, boot/account reconciliation, corruption recovery, profile independence/reset, import validation/round trip, readable defaults, local-only server payload filtering, accessible controls, setting search/reveal/focus, deep links, history, launchers, and draft retention.
- `npm run lint`: passed.
- `npm run build`: passed. Vite reports large bundle warnings, including the existing Perspective chunk.
- `git diff --check`: passed.
- Headless Chrome inspected the real settings, composer, CodeMirror, Shiki and Perspective components in an isolated local harness using synthetic query data. The harness was removed afterward. This did not execute queries against a live database or require account credentials.
- Widths 390, 767, 768, 1158 and 1440 had no horizontal document overflow. Desktop title x positions were 380.5 at 1158 and 521.5 at 1440. After adjustment, mobile title x was 52. The sidebar returns at 768; navigation and main content own separate scroll containers.
- Mobile drawer measured 332px, focused Search, displayed a backdrop and locked body scrolling. Font search + Enter closed the drawer, expanded Advanced and focused the UI size input. Native browser checks also verified Escape/backdrop dismissal and focus return to Show settings navigation; import dialog Escape restored focus to Import theme.
- Native browser history verified General → Appearance → Back → Forward and return to the original chat URL with the same composer element and typed draft. On the actual app page, an OS reduced-motion override produced 10s probe animation with explicit Off, and 0.01ms with On/System; initialization recorded one resolved mode without a light/dark flip.
- Browser checks confirmed two tabs synchronized Light and Dark; real typed chat and SQL drafts, the CodeMirror element/selection and Perspective element survived mode changes. A configured Y Bar chart retained its plugin and grouping when changed to Pro Light.
- Visual inspection covered light/dark, Moonlit defaults, measured ChatGPT/Purple and White, desktop/mobile settings, preset menu, Color/Hue popover, import dialog, composer, SQL/code blocks, result grid and Y Bar chart. Menus/dialog control semantics and dismissal are additionally covered by component tests. Boot tests execute the actual pre-render script and verify explicit preference versus OS resolution.

## Deliberate Moonlit adaptations and reference limits

- The selectable presets are Moonlit and measured ChatGPT. Purple is the measured ChatGPT baseline, not an account-independent assertion about ChatGPT defaults. Moonlit retains its existing dark palette and has a generated light counterpart.
- The additional Codex catalog is **not implemented**: Absolutely, Ayu, Catppuccin, Dracula, Everforest, GitHub, Gruvbox, Linear, Lobster, Material, Matrix, Monokai, Night Owl, Nord, Notion, OG, One, Oscurange, Raycast, Rose Pine, Sentry, Solarized, Temple, Tokyo Night, Vercel, VS Code Plus, Xcode. Their full palettes were not supplied or recovered; no inert menu entries were added.
- Custom color generation is a deterministic, mode-aware Moonlit approximation. It is isolated from measured preset selection; contrast/color customization enters the generated path, while reselecting a preset clears overrides. The reference generator, exact contrast-46 path, custom palette math, and all unmeasured preset details are not claimed as reproduced.
- Linked mode edits follow the requested Moonlit adaptation: accent choices propagate to both profiles; surface/ink/contrast edits stay with their profile. Preset selection restores the appropriate defaults for affected profiles. Separating or linking modes alone preserves both profiles.
- UI size 14 maps to 16px and 15 to 17px. Content and code sizes affect their own roles. The broader scale is Moonlit's coherent adaptation, not a recovered reference typography algorithm.
- No prose editor or constrained document/artifact reading surface exists in this workspace. Smart punctuation and Full width pages rows are omitted; neither exposes a nonfunctional toggle or transforms chat, SQL or pasted data. This is an intentional visual difference from the reference. The versioned record retains these requested fields for compatibility. Diff markers act on actual diff code blocks, with accessible Added/Deleted labels and optional literal +/- signs.
- Imports support validated colors, contrast, supported font-family metadata and semantic diff/skill colors. `codex` syntax is explicitly mapped to Moonlit's supported light/dark palettes; unsupported code themes/fonts produce errors. Copies use the versioned `moonlit-theme-v1` format; full Codex compatibility is not advertised.
- Appearance is local per account, with a separate guest namespace and non-sensitive boot snapshot. It is excluded from existing backend sync keys. Startup uses the snapshot while account identity loads, then reconciles to that account's own record. No auth tokens are read for initialization.
- Search ranking, mobile card spacing, touch targets, and generated palettes are Moonlit adaptations. Reference browser history was not recovered; Moonlit's own history/draft behavior is tested.

## Fidelity and interaction correction

The later `../docs/chatgpt-settings-fidelity-correction-prompt.txt` guided a focused correction after the initial implementation. Appearance now has a separate Mode group, a single compact Theme header with import/copy icons and preset picker, grouped font/motion/contrast/diff controls, real inset dividers, compact color pills and numeric px suffixes. Reset shares the Advanced header. General and Database retain their row density. Supporting text uses the secondary color role.

Unchanged hex blur/Enter no longer changes preferences or writes storage. HSL conversion retains saturation and round trips gray, pastel, black, white and saturated colors; a native picker permits editing all RGB channels. Number fields support empty/intermediate drafts and commit valid integers on Enter/blur. Scope changes discard drafts. Search uses element/Collapse/Drawer readiness rather than a fixed reveal delay and cancels pending focus when the user resumes searching. MUI disclosure/drawer timing follows resolved reduced motion.

Drag feedback and palette preview are local to Appearance cards and controls. The application-wide MUI theme and durable preferences commit on gesture release, keyboard changes or blur. Escape cancels an active gesture; closing settings unmounts only its editing controls, and account changes discard their transient state. Motion/diff flags and CSS font-size changes no longer rebuild the MUI color theme.

### Visual evidence

Open [the interactive before/after comparison](appearance-qa/comparison.html). The light desktop and mobile pairs match viewport, rendering scale, mode, preset/accent, font sizes and collapsed Advanced state. Expanded dark/Purple images show the corrected grouping at 100%, plus an 80% rendering-scale emulation. All captures mount the actual components; no static replacement UI was created. The fixture used real composer, CodeMirror and Perspective components with synthetic query rows.

The reference screenshot itself is absent from the attachment in this workspace; only its written description is available. A pixel overlay against that image and authenticated Vercel token recovery were therefore unavailable. The black/Purple/contrast-50 view uses **Moonlit**, clearly labeled as an approximation, rather than relabeling it as Vercel or substituting the measured ChatGPT contrast-60 palette. The 80% experiment uses a 1706×960 CSS viewport with device scale 0.8, not production CSS zoom or a claim of recovered browser-toolbar zoom.

### Measured interaction cost

A development-build stress fixture sent 100 pointer moves with nominal 25ms spacing for each slider while the real composer, SQL editor and Perspective remained mounted as they do beneath settings. Renderer work stretched the baseline run; these samples are not a measurement of a normal user's fixed-duration gesture or a 60fps claim. Raw results: [before](appearance-qa/profile-before.json), [after](appearance-qa/profile-after.json).

| Metric | Contrast before → after | Color before → after |
| --- | --- | --- |
| Theme rebuilds | 76 → 1 | 69 → 1 |
| Settings writes | 94 → 1 | 99 → 1 |
| Boot snapshot writes | 76 → 1 | 69 → 1 |
| React render duration p95 | 54.0 → 36.6ms | 55.7 → 31.5ms |
| Frame interval p95 | 550 → 33.4ms | 1683.3 → 50ms |
| Browser long tasks | 99 → 5 | 101 → 3 |

The final values persisted correctly. Remaining long tasks and the measured frame intervals mean this is a substantial improvement, not evidence of consistent 60fps. No additional dependency was introduced.

A final read-only review reproduced and resolved two additional defects: cached server hydration could merge an earlier account's local appearance, and the native color chooser could bypass preview-only input handling. Storage now refreshes a namespace read before passive hydration while preserving newer child writes; tests cover A→B, actual cached `UserSettingsSync`, and A→B→A with an external update. Native color `input` events preview only; a native `change` commit and blur fallback persist once and ignore repeated values. The reviewer reran all four reproduction scenarios successfully.

The palette audit also verifies that selecting Moonlit in dark mode preserves its original semantic backgrounds, text, borders, layers and neutral actions. Only custom profiles use the generated neutral palette. Valid imported surface/ink/contrast overrides infer the custom path even if a share record contains an outdated custom flag, so supported colors are not silently ignored.
