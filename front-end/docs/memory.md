# Project Memory

Canonical location: `front-end/docs/memory.md`

## Current Focus

Current phase: Phase 6 — Cross-application responsive and final audit
Current task: Await user direction after completing the final audit
Current component: Cross-route frontend, focused backend authorization boundary, and audit records
Current file(s): Final browser matrix is complete; one Markdown SSR selector warning was corrected
Status: Phase 6 browser validation, focused correction, automated regression, self-review, and
documentation reconciliation are complete with explicit fixture limitations

## Recently Completed

Date: 2026-08-19
Task: Phase 6 live cross-application browser matrix
Summary: Recovered browser control and exercised the public landing page, Auth, welcome chat,
long-conversation transcript, both sidebar states, Settings, Database, and artifact/fullscreen paths
at the canonical 390px, 767px, 768px, and desktop boundaries. Confirmed overflow, focus ownership,
responsive target geometry, modal sequencing, flat semantic surfaces, and the previously corrected
left-sidebar transition performance. Signed the approved dummy account out for Auth coverage and
restored its authenticated conversation afterward. The only fresh browser warning came from a
Markdown `:first-child` style; traced it to `MarkdownRenderer`, added a focused audit guard, changed
it to Emotion's SSR-safe `:first-of-type` form, and confirmed a fresh reload emitted no new warning.
Files changed: `MarkdownRenderer.jsx`, the focused interaction audit, and Phase 5/6 audit records.
Validation: Landing and Auth screenshots plus computed layout/focus/overflow checks passed across
all four widths; authenticated shell, mobile drawer/overlay sequencing, profile/settings behavior,
long transcript, sidebar timing, and artifact focus restoration passed. Twelve frontend Node tests,
all seven focused UI audits, full ESLint, Knip, the production build, six backend authorization
tests, Python compilation, and final diff checks passed. The build retains only the known oversized
Perspective vendor chunk warning.
Important decisions: Preserve the approved 20px composer and 16px anchored suggestion-panel
geometry as a documented exception to the general 8px surface language; retain 8px internal
controls and pill actions. Treat unavailable live admin, connected-database, and streaming/error
fixtures as explicit coverage limits rather than inferred success.

Date: 2026-08-18
Task: Phase 5 landing-page compliance
Summary: Preserved the recent landing information architecture, copy, CTA routing, navigation,
product walkthrough, marquee, and accessible motion behavior while removing noncanonical gradients,
atmospheric/header blur, mockup shadow and tilt, and card lift. Centralized the landing presentation
contract around flat 8px hairline surfaces, 24px card padding, documented content-band spacing,
sentence-case display typography, and the canonical 768px topology boundary.
Files changed: Landing presentation helper/tests; Hero, shared sections, capability/security/workflow
cards, database strip, workspace illustration, page header/footer; focused landing audit; package
script; and Phase 5 audit records. `front-end/docs/design.md` was not changed.
Validation: Twelve frontend Node tests, landing/auth-admin/dark/theme/interaction/input-focus/workspace
audits, full ESLint, Knip, production build, diff checks, and a served `/` HTTP 200 check passed. The
known Perspective vendor chunk-size warning remains. Live responsive browser interaction and
screenshot checks were completed during Phase 6 after browser control became available again.
Important decisions: Treat the existing workspace mockup as the approved product illustration and
retain it with canonical flat chrome rather than deleting a recent content structure; keep the
database marquee and reveal motion because both retain explicit reduced-motion fallbacks; centralize
only the visual values shared across multiple landing components.

Date: 2026-08-18
Task: Approved B1/M1 authentication-page presentation
Summary: Replaced the nested centered Auth card with the approved 44/56 editorial split at the
canonical 768px boundary; added a focused Moonlit product panel and motion-free hairline orbit;
placed concise product context near the mobile form; and preserved the completed account-entry,
validation, provider, reset, loading, redirect, and operation-lock behavior.
Files changed: `Auth.jsx`, the extracted presentational `AuthBrandPanel.jsx`, the pure responsive
layout helper and regression tests, the focused auth/admin audit, `.gitignore`, and audit records.
Validation: Eleven frontend Node tests, all six UI audits, full ESLint, Knip, production build, six
backend authorization tests, Python compilation, and diff checks passed. The build retains the
known Perspective vendor chunk-size warning. Live desktop/mobile browser checks could not be run
at that time because the browser-control runtime rejected its own bundled `node:process` import;
Phase 6 later completed the missing live Auth matrix without using a substitute browser.
Important decisions: Keep all Auth behavior in `Auth.jsx` and presentation in `AuthBrandPanel`;
switch to one column below 768px and 44/56 from 768px; omit the redundant nested form card; keep the
decorative orbit non-interactive and motion-free; keep provider actions side-by-side on mobile.

Date: 2026-08-17
Task: Phase 4 authentication and administration compliance
Summary: Unified account entry behind the shared loader/dialog system and one operation lock;
removed the nonfunctional Remember Me control; made reset focus deterministic; contract-tested
route decisions; added a server-owned, fail-closed `ADMIN_UID` boundary to metrics, stream, and
reset; and aligned the admin dashboard to canonical responsive, semantic, and reduced-motion
contracts without changing telemetry behavior.
Files changed: Auth action styles/tests and page, shared DialogShell title/transition support,
guard model/tests and guard call sites, AdminDashboard, the focused auth/admin audit, backend admin
authorization/config/dependency/controller tests, environment documentation, and Phase 4 records.
Validation: Ten frontend Node tests, six UI audits, ESLint, Knip, production build, six backend
authorization unit tests, Python compilation, and safe browser checks passed. Browser coverage
included sign-in/sign-up switching, empty validation, reset entry focus/cancel, 44px actions through
767px, 36px actions from 768px, no overflow, and anonymous `/admin` redirect. Auth/OAuth/reset/admin
mutations were not triggered. Authorized live admin telemetry was unavailable; full FastAPI/pytest
route tests were unavailable because those dependencies are not installed in this workspace. The
known Perspective chunk-size warning remains.
Important decisions: The client guard remains navigation UX while the backend is authoritative;
missing/blank `ADMIN_UID` fails closed; auth actions become compact at the canonical 768px boundary;
reset input focus runs after dialog entry rather than racing MUI autofocus.

Date: 2026-08-16
Task: Phase 3C renderer internals and Phase 3 completion
Summary: Replaced nested SQL query-tab interactions with sibling native tab/Close controls and a
stable active tabpanel; restored true-modal focus ownership and reduced-motion behavior to the
schema mindmap; and completed public-wrapper semantics/containment for Perspective without changing
query state, graph layout, or third-party data/configuration behavior.
Files changed: SQL QueryTabs/QueryWorkspace, SchemaMindmapDialog, data-visualization wrappers, the
focused workspace audit, Phase 3 plan checklist, and audit documentation.
Validation: Seven Node tests; workspace, dark, theme, interaction, and input-focus audits; full
lint; Knip; production build; diff check; and the cumulative authenticated Phase 3 browser matrix
passed. The diagram fixture covered artifact behaviors and responsive breakpoints. SQL, schema, and
Perspective live states remain unavailable without a safe connected-database fixture. Opening the
SQL entry only confirmed and canceled the prerequisite dialog. No database, query, conversation,
setting, account, download, or clipboard mutation occurred. The known Perspective chunk warning
remains.
Important decisions: Active SQL tabs alone reference the mounted panel; native tab/Close controls
remain independently focusable without a partial roving-tabindex implementation; the mindmap uses
MUI modal ownership; Perspective internals remain untouched.

Date: 2026-08-16
Task: Phase 3B artifact shell and fullscreen compliance
Summary: Added responsive artifact action geometry and semantic loading/error states; supplied
bounded separator values; made fullscreen a named, locally keyboard-owned region with deterministic
entry/return focus and reduced-motion behavior; retained one renderer instance; and removed the
desktop resize separator from narrow full-screen overlays after browser testing exposed a 10px
width loss.
Files changed: Shared artifact layout/loader utilities, ResizeHandle, workspace-canvas bounds wiring,
MainInterface narrow topology, the focused workspace audit, and Phase 3 documentation.
Validation: Seven Node test files; workspace, dark, theme, interaction, and input-focus audits; full
lint; Knip; production build; diff check; and authenticated diagram browser checks passed. Browser
coverage included pointer/keyboard resize, fullscreen focus/Escape/return, state preservation,
close, 390×844, 767px, 768px, and overflow. Reduced motion is covered by the executable hook/style
contract because the available browser viewport capability does not emulate media preferences. The
existing Perspective chunk warning remains. A historical Emotion `:first-child` console entry did
not reproduce on a fresh loaded reload and was not changed speculatively.
Important decisions: Fullscreen interaction stays local to the persistent artifact root; narrow
artifact overlays never render the desktop separator; artifact actions retain their caller-defined
desktop size while becoming 44px touch targets below 768px.

Date: 2026-08-16
Task: Phase 3A shared overlays/preferences plus interruption fixes
Summary: Added the focused workspace-overlay audit; made preference, dialog, confirmation, and
notification controls responsive; coordinated mobile drawer exit with Settings/Database entry;
added deterministic focus entry/return and topmost Escape ownership; separated toast duration from
visual motion; fixed artifact action `key` spreading and deprecated drawer motion creation; and
stabilized workspace-canvas callbacks so left-sidebar animation no longer reconciles long message
lists.
Files changed: Preference surfaces, Settings/Database overlays, shared Drawer/Dialog/Confirm/toast
primitives, chat/sidebar controller wiring, artifact header action mapping, workspace-canvas hook,
the focused Phase 3 audit, and Phase 3 specification/plan documentation. `front-end/docs/design.md` was
not changed.
Validation: Seven Node test files; workspace, dark, theme, interaction, and input-focus audits; full
lint; Knip; and production build passed. Browser checks covered desktop, 390px, 767px, and 768px,
drawer-to-overlay sequencing, focus entry/return, nested Escape order, confirmation cancellation,
artifact warning removal, and long-transcript sidebar render isolation. The existing Perspective
chunk-size warning remains.
Important decisions: Keep one overlay owner and wait for mobile drawer exit before opening a
preference surface; keep dialog helper logic outside component files for Fast Refresh; use refs to
read current sidebar width without changing callback identity; preserve Settings Reset behavior
for now. Browser review exposed that Reset applies immediately; the prior Mistral model was
restored, leaving no intended settings change.

Date: 2026-08-15
Task: Phase 2 sidebar and conversation-history compliance
Summary: Added deterministic conversation-list loading/error/retry state; replaced nested row
interactions with sibling native selection/options controls; added the canonical active indicator,
8px rename chrome, and 44px sub-768 geometry; made Search and collapsed History focus deterministic;
removed unsupported shortcut labels; and upgraded the animated mobile drawer to MUI modal focus
ownership with reduced-motion support.
Files changed: Sidebar components/styles, shared Drawer and obsolete selectable-row helper,
conversation/controller hooks, focused model tests, interaction audit, Phase 2 spec/plan, and audit
documentation. `front-end/docs/design.md` was not changed.
Validation: Six Node tests, four design audits, full lint, Knip, and production build passed. The
build retains the existing Perspective chunk warning. Authenticated browser checks passed for
expanded/collapsed desktop, Search/History initial focus, active-row semantics, 390/767px modal
drawer focus and Escape behavior, nested popover ordering, the 768px topology boundary, focus
restoration, and zero overflow. The viewport was reset and the desktop sidebar restored expanded.
No conversation, database, account, or settings data was changed.
Important decisions: Preserve the shared Drawer composition while delegating modal behavior to
MUI; keep compact 36px desktop rows and use 44px controls below 768px; retain existing rows during
background refresh failures; do not advertise shortcuts until handlers exist.

Date: 2026-08-15
Task: Sidebar Profile and Settings separation correction
Summary: Split the sidebar footer into independent Profile and Settings controls. Profile now opens
an informational account popover with avatar, display name, email, provider, verification status,
member-since date, last-sign-in date, and Sign out. The expanded desktop/mobile gear opens Settings
directly; the collapsed desktop Profile popover supplies the explicit Settings fallback. Safe
account metadata is normalized at the auth boundary without exposing raw Firebase objects or UID.
Files changed: Auth normalization utility/tests, `AuthContext.jsx`, sidebar footer/model/tests,
sidebar controller wiring, `UserProfileMenu.jsx`, `MainInterface.jsx`, and focused design/plan
documents. `front-end/docs/design.md` was not changed.
Validation: Five Node test entries passed; dark, theme, interaction, and input-focus audits passed;
lint and Knip passed; production build passed with the existing Perspective chunk warning.
Authenticated browser checks passed for separate expanded controls, direct Settings, collapsed
Settings fallback, account details, Sign out presence, 44px mobile controls, modal/drawer
coordination, and zero overflow. The viewport and desktop sidebar were restored to 1302×926 and
expanded. No settings, account, conversation, or database data was changed.
Important decisions: Mobile is always treated as an expanded profile surface regardless of the
persisted desktop sidebar preference; collapsed Settings access belongs in the Profile popover;
backend `verified` is authoritative over Firebase `emailVerified` when present.

Date: 2026-08-15
Task: Phase 1C transcript, Markdown, tables, and agent-state geometry
Summary: Normalized transcript typography and spacing, aligned Markdown/execution-table/code
surfaces to their semantic tokens, moved copy/code/reasoning/tool/diagram controls onto shared
responsive pill geometry, and corrected guided-confirmation stacking and focus treatment. Message
ordering, tool execution, streaming data flow, and artifact behavior were preserved.
Files changed: `MessageList.jsx`, `MarkdownRenderer.jsx`, `CodeViewer.jsx`,
`InlineExecutionTable.jsx`, `GuidedConfirmationPrompt.jsx`, `ai-response-steps/**`, shared interface
chrome, the interaction audit, and Phase 1C design/plan/audit documentation. `front-end/docs/design.md`
was not changed.
Validation: Three focused Node tests passed; dark, theme, interaction, and input-focus audits
passed; lint and Knip passed; the production build passed with the existing Perspective chunk
warning. Authenticated computed-style checks passed at 1302×926 and 390×844 for responsive sizes,
pill radii, shadows, typography,
composer visibility, and overflow. Expanded reasoning and tool details were exercised; the browser
was restored to 1302×926.
Important decisions: Keep one shared responsive control contract (44px below 768px, compact desktop
sizes at and above 768px); use `#191919` for paper/table surfaces and `#1a1c20` for fenced code; treat
unavailable streaming/code/table/confirmation/pause/error examples as explicit fixture limitations,
not as evidence of visual browser compliance.

Date: 2026-08-15
Task: Phase 1B final authenticated evidence and focused surface consistency fixes
Summary: Restored the signed-in browser session, captured the final 390/767/768px chat matrix,
repeated Settings at 767/768px, and reset the temporary viewport. The composer and all form inputs
now use the canonical neutral `#191919` input surface without nested focus outlines/shadows. The
Auth fields and chat composer retain a single border. The AI Context segmented control now consumes
the shared transparent-wrapper pattern, and the Connect Database Connection mode row no longer adds
an unnecessary nested tint. Shared multi-row preference styling remains unchanged.
Files changed: Chat/Auth/theme/shared input styles, focused audit scripts, AI Context and Database
preference call sites, plus their design/implementation documents. `front-end/docs/design.md` was not
changed.
Validation: Dark, theme, interaction, and input-focus audits passed; lint and Knip passed;
production build passed with the existing Perspective chunk warning. Computed browser checks
confirmed zero horizontal overflow, 44px mobile controls below 768px, 36px controls at 768px,
transparent redundant wrappers/rows, and preserved selected-state fills.
Important decisions: Use `#191919` for all canonical input surfaces; input focus must not add a
second visual outline or shadow; shared segmented-control styling owns button state while local
single-row preference surfaces may remove redundant tint without changing the shared row API.

Date: 2026-08-15
Task: Phase 1B chat shell, empty state, composer, and responsive boundary
Summary: Moved the global desktop boundary to 768px, mapped the composer to the canonical
`#191919` input surface, routed welcome typography through `uiDisplaySm`, centralized responsive
chat-control geometry and layout spacing, made mobile/tablet controls touch-safe, corrected the
sidebar and scroll-control radii, and added the composer focus ring. Chat handlers and data flow
were not changed.
Files changed: Theme tokens, semantic tokens, shared interface chrome, chat welcome/composer/column,
theme/interaction audit scripts, Phase 1B specification/plan, and frontend audit documentation.
`front-end/docs/design.md` was not changed.
Validation: Three Node tests passed; lint, Knip, dark-only, theme, and interaction audits passed;
production build passed with the existing Perspective chunk warning. Authenticated computed-style
checks at 390/767/768px passed for typography, surface, pill geometry, control sizes, spacing, shell
topology, focus, menu dismissal, and overflow. Settings and Database rendered without horizontal
overflow at 767/768px. No message was sent, no data was reset, and no database was connected. The
session redirected to `/auth` before final screenshots and one repeated Settings pass.
Important decisions: Keep the global 768px `md` breakpoint; use runtime style-helper audits instead
of brittle JSX source-text checks; defer preference-surface 34px controls and mobile modal focus
restoration to the preference-surface accessibility phase.

Date: 2026-08-15
Task: Phase 1A canonical dark-theme foundation
Summary: Made every route resolve to one canonical dark MUI theme, removed the Appearance/light
control and light theme factory, ignored legacy stored/server theme preferences, collapsed semantic
tokens and Shiki/CodeMirror/Perspective integrations to dark, and added executable dark-only
invariants.
Files changed: Frontend boot/runtime/settings/theme and syntax files, audit scripts, focused tests,
Knip configuration, README, and frontend audit documentation. `front-end/docs/design.md` was not
changed.
Validation: Three Node tests passed; dark-only, theme, and interaction audits passed; lint and
Knip passed; production build passed with the existing oversized Perspective chunk warning.
Browser checks passed for `/`, `/auth`, unauthenticated `/chat` redirect, the authenticated chat
shell, Settings, and the database prerequisite dialog. Settings opens on Moonlit with no
Appearance/Light control. The SQL editor requires a database connection and code-block rendering
requires a conversation, neither of which exists for the dummy account. Console review also found
two duplicate-account sign-up errors and a pre-existing Framer Motion deprecation warning unrelated
to the theme implementation.
Important decisions: The frontend ignores legacy `theme` values without changing backend schemas.
`useTheme()` retains `isDarkMode` and `effectiveTheme` compatibility fields as constant dark values.

Date: 2026-08-15
Task: Read-only design and repository audit
Summary: Read the full canonical design, mapped frontend architecture and chat composition,
classified initial compliance gaps, established validation baseline, and defined incremental
phases.
Files changed: Documentation files only. `front-end/docs/design.md` and UI code were not changed.
Validation: Frontend lint passed; build passed with an existing oversized Perspective chunk
warning; theme and interaction audits passed their current assertions; landing content test
passed; unauthenticated browser check redirected `/chat` to `/auth` and produced no console
warnings/errors.
Important decisions: Remove light mode in Phase 1A. A future light theme is a separate project and
requires an approved canonical design extension.

## In Progress

Task: None; Phase 6 is complete.
Files: No active Phase 6 implementation files.
Remaining work: Await user direction for the next product/design task.
Blockers: Authorized live admin telemetry and connected-database/streaming error fixtures remain
unavailable. Their boundaries continue to be covered by focused automated contracts where possible.

## Important Decisions

- `front-end/docs/design.md` remains authoritative and immutable.
- Use foundation-first sequencing: canonical dark theme before chat component corrections.
- Preserve existing architecture and user-owned staged changes.
- Do not commit automatically while the repository contains the current large staged change set.
- Use Inter as the documented Universal Sans substitute and Geist Mono for technical captions.
- Canonical input surfaces use `#191919`; focused inputs do not add nested outlines or shadows.
- Preference segmented controls use transparent wrappers with button-level selected states.
- Transcript and agent controls share responsive pill geometry: 44px below 768px and compact
  desktop sizing from 768px.
- Semantic transcript surfaces use paper `#191919` for Markdown/execution tables and code
  `#1a1c20` for fenced code.
- Sidebar selection/options are sibling native controls; active rows use a white leading indicator.
- Mobile drawer modal ownership belongs to MUI; Framer Motion provides animation only.
- Mobile drawer exit must complete before a Settings/Database overlay opens.
- Workspace-canvas callbacks consumed by the transcript must stay stable across sidebar-width
  changes; current layout width is read through a ref.
- Shared dialog action geometry belongs in a non-component style module so Fast Refresh boundaries
  remain valid.
- Artifact fullscreen owns Escape on its focusable region and restores the connected invoking
  control; document-level fullscreen key listeners are prohibited.
- Narrow artifact overlays omit the desktop resize separator so the artifact consumes the complete
  viewport width; the separator remains keyboard/pointer operable from 768px.
- SQL query tabs use sibling native selection and Close controls; only the active tab references
  the currently mounted tabpanel.
- Whole-screen schema mindmap focus/Escape/restoration belongs to MUI Dialog; graph internals remain
  unchanged.
- Perspective compliance changes stop at public React wrappers and semantic states; third-party
  worker/data/configuration/shadow-DOM behavior is out of scope without a verified defect.
- The backend `ADMIN_UID` is the authoritative administration boundary and fails closed when absent
  or blank; the client `AdminRoute` remains early navigation UX only.
- Auth presentation uses one column below 768px and the approved 44/56 editorial split from 768px;
  behavior remains owned by `Auth.jsx`, while `AuthBrandPanel.jsx` stays presentational.
- Landing content and product structure remain intact; shared presentation values enforce flat 8px
  hairline surfaces, 24px card padding, canonical section spacing, and 768px topology changes.
- The approved shared chat composer uses a 20px radius and its anchored welcome suggestion panel
  uses 16px; internal category/suggestion controls remain 8px and actions remain pill-shaped.
- Emotion-authored frontend selectors must avoid SSR-unsafe `:first-child`/`:nth-child` forms when
  an equivalent type selector preserves the intended presentation.

## Design Deviations Approved by User

The shared chat composer uses a 20px radius and its anchored welcome suggestion panel uses 16px as
approved during the Claude-inspired welcome redesign. This is a deliberate exception to the
general 8px input/card surface language; the surfaces remain flat, hairline-bounded, and shadowless,
while their internal controls retain canonical 8px or pill geometry.

Removing light mode is compliance with the current canonical design, not a deviation. The desire
to reintroduce it later does not authorize a deviation now.

## Known Issues

- Repeatable browser fixtures remain limited for the specific inaccessible chat and admin states
  listed below; the available landing/Auth/chat responsive matrix is complete.
- Production build reports an oversized Perspective vendor chunk.
- Phase 1C lacks repeatable visual fixtures for fenced code, execution tables, active streaming,
  guided confirmation, paused execution, and error presentation; executable source contracts cover
  those states until fixtures are available.
- Phase 2 lacks repeatable browser fixtures for initial list failure, successful empty history, and
  failed rename/delete operations; focused model/source contracts cover these states.
- Settings “Reset to defaults” applies immediately without confirmation.
- Live SQL editor, schema mindmap, and Perspective browser coverage requires a safe connected
  database fixture that is not available for the current dummy account.
- Authorized live admin telemetry has no safe browser fixture for the current dummy account.
- Full backend route integration tests are unavailable in the current workspace because FastAPI
  and pytest are not installed; isolated authorization tests and Python compilation pass.

## Technical Debt

- Large chat/sidebar presentation files increase review risk.
- Root README implementation details are partly stale relative to the current code.
- Repeatable authenticated database and conversation fixtures are not yet available for editor
  and code-block checks.

## Open Questions

- What canonical light palette and component behavior should a future `DESIGN.md` extension define?
- What authenticated local fixture should be used for repeatable browser checks?

## Next Recommended Task

Apply the user's requested Auth page visual redesign while preserving the completed Phase 4
operation, validation, focus, guard, and responsive contracts. Start Phase 5 landing-page
verification after that user-directed design work unless priorities change.
