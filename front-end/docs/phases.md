# Frontend Design-Compliance Phases

Canonical location: `front-end/docs/phases.md`

## Phase 0 — Repository and Design-System Understanding

### Objective

Establish the source of truth, map the actual architecture, classify verified gaps, record the
baseline, and define safe phase boundaries without changing UI code.

### Scope

Canonical design, frontend structure, routing, providers, theme/tokens, shared styles, chat,
sidebar, API boundaries, existing tests, staged changes, and build behavior.

### Components / Files

- `front-end/docs/design.md`
- `front-end/src/main.jsx`, `App.jsx`, routes and guards
- `front-end/src/theme/**`, `contexts/ThemeContext.jsx`, `SettingsContext.jsx`
- `front-end/src/features/MainInterface.jsx`, shell, chat, sidebar, and shared styles
- `front-end/src/hooks/chat-page/**`, `front-end/src/api/**`
- Root and backend README documentation

### Design Requirements

Dark-only canvas, Inter/Universal Sans substitute, Geist Mono captions, weight 400, documented
spacing, 8px cards/inputs, pill interactions, hairline elevation, no shadows, 768px primary
breakpoint, and 44px mobile targets.

### Known Issues

- Light mode conflicts with the canonical design.
- Composer surface, several radii, welcome typography, and responsive breakpoint differ from the
  documented system.
- Some component spacing and typography use one-off values.
- Authenticated chat visual inspection is unavailable without a local signed-in session.

### Planned Changes

Documentation only. No UI implementation changes.

### Dependencies

None.

### Validation

- Full read of `DESIGN.md`.
- Frontend and backend architecture inspection.
- `npm run lint` — passed.
- `npm run build` — passed with the existing oversized Perspective chunk warning.
- `npm run audit:theme` — passed its current assertions.
- `npm run audit:interaction` — passed its current assertions.
- `node --test src/pages/Landing/landingContent.test.js` — passed.
- Browser `/chat` attempt redirected to `/auth`; auth rendered without console warnings/errors.

### Exit Criteria

- Requested audit documentation exists and is internally consistent.
- The user approves the written workflow specification before detailed implementation planning.

### Status

COMPLETE

## Phase 1A — Canonical Dark Theme Foundation

### Objective

Make the runtime and automated design contract dark-only while keeping the change structurally
reversible for a future approved light-theme project.

### Scope

Theme bootstrapping, semantic mode selection, settings UI/persistence, theme exports, syntax
integration, and design audit assertions.

### Components / Files

`index.html`, `theme/**`, `contexts/ThemeContext.jsx`, `contexts/SettingsContext.jsx`,
`config/userSettings.js`, settings UI, Shiki/CodeMirror integrations, audit scripts, focused tests,
Knip configuration, and product documentation.

### Design Requirements

`#0a0a0a` default canvas, canonical dark surfaces/text/borders, no selectable light mode, and no
dormant production behavior that suggests light mode is currently supported.

### Known Issues

Authenticated Settings was verified. Code-block and SQL-editor rendering remain unavailable
because the dummy account has no conversations and no database connection.

### Planned Changes

Completed: removed the selectable/runtime light path, retained one explicit dark theme factory,
collapsed semantic and syntax integrations to dark, and replaced light assertions with executable
dark-only invariants. Future light-mode work still requires an approved design extension.

### Dependencies

Phase 0 approval.

### Validation

- `node --test src/theme/mode.test.js src/config/userSettings.test.js src/pages/Landing/landingContent.test.js` — 3 passed, 0 failed.
- `npm run audit:dark` — passed.
- `npm run audit:theme` — passed 51 WCAG pairs and all dark surface invariants.
- `npm run audit:interaction` — passed dark boundary, route, geometry, focus, and flatness checks.
- `npm run lint` — passed with no warnings or errors.
- `npm run knip` — passed after registering Node test files as entry points.
- `npm run build` — passed; the existing oversized Perspective vendor chunk warning remains.
- Browser `/`, `/auth`, and unauthenticated `/chat` redirect — `data-moonlit-color-scheme` and
  computed `color-scheme` were `dark`, body background was `rgb(10, 10, 10)`, and console had no
  warnings/errors.
- Authenticated Settings — passed: Moonlit is the first section, Appearance/Light controls are
  absent, and Reset to defaults remains available without being invoked.
- Authenticated SQL entry — the expected database prerequisite opened; its connection dialog
  remained dark. The editor itself could not render without a database connection.
- Authenticated code-block rendering — unavailable because the dummy account has no conversations.
- Console review found two sign-up errors from an earlier duplicate-account attempt and an existing
  Framer Motion `motion()` deprecation warning; none originate from the dark-theme implementation.

### Exit Criteria

Every route resolves to the canonical dark theme and no user control offers light mode.

### Status

PARTIALLY COMPLETE — implementation, automated validation, and authenticated Settings checks are
complete; code-block and SQL-editor rendering require conversation and database fixtures.

## Phase 1B — Chat Shell, Empty State, and Composer

### Objective

Align the primary chat canvas, empty state, composer, action controls, and shell responsiveness.

### Scope

Page shell, mobile sidebar entry, welcome heading/suggestions, composer surface, input, context/SQL
actions, model selector, send/stop action, focus/hover/disabled states, and scroll-to-latest control.

### Components / Files

Expected areas: `AppShell.jsx`, `ChatColumn.jsx`, `WelcomeScreen.jsx`, `ChatInput.jsx`,
`interfaceChrome.js`, shared styling helpers, and responsive hooks.

### Design Requirements

Canonical canvas/surfaces, typography ladder, 4px spacing scale, pill controls, 8px input/card
shape, hairlines, no shadows, clear focus, 44px mobile targets, and 768px shell transition.

### Known Issues

The in-scope chat-shell issues are resolved. Existing preference-surface controls remain 34px at
767px, and mobile Settings/Database closure can return focus to the document when the original
drawer trigger has unmounted. Those behaviors predate Phase 1B and remain deferred to the
preference-surface accessibility phase.

### Planned Changes

Implemented a token-led correction: the global `md` breakpoint is now 768px, the semantic composer
surface maps to the canonical neutral input surface `#191919`, the greeting consumes `uiDisplaySm`, and shared runtime style helpers
provide responsive pill geometry and canonical welcome/composer spacing. The chat sidebar entry,
suggestions, toolbar actions, model selector, Send/Stop, and scroll-to-latest controls now remain
touch-safe below 768px. The later approved input-focus pass removed focus-driven nested outlines and
shadows while retaining keyboard focus indicators on non-input controls.

### Dependencies

Phase 1A.

### Validation

- `node --test src/theme/mode.test.js src/config/userSettings.test.js src/pages/Landing/landingContent.test.js` — 3 passed, 0 failed.
- `npm run lint` — passed.
- `npm run knip` — passed.
- `npm run audit:dark` — passed.
- `npm run audit:theme` — passed 51 WCAG pairs and all dark surface invariants.
- `npm run audit:interaction` — passed the 768px breakpoint, canonical composer surface, responsive
  geometry/spacing, welcome typography, flat input-focus behavior, and existing interaction
  invariants.
- `npm run audit:input-focus` — passed the neutral `#191919` input-surface and flat focused-input
  invariants while preserving non-input focus indicators.
- `npm run build` — passed with the existing oversized Perspective chunk warning.
- Authenticated computed-style checks at 390px, 767px, and 768px confirmed 28/28/32px greeting
  sizes, 44px controls through 767px, 36px desktop composer controls from 768px, pill radii, the
  `#191919` input surface with an 8px radius and hairline border, and zero horizontal document
  overflow.
- The narrow sidebar opened at 767px, closed with Escape, and returned focus to its trigger; the
  permanent sidebar replaced it at 768px.
- Settings and Database rendered at 767px and 768px without horizontal overflow. Settings retained
  the dark-only navigation with no Appearance or Light option. No database connection was attempted.
- Composer empty/ready/disabled behavior, flat input focus treatment, slash-command dismissal,
  Context and model menu Escape behavior, and the SQL prerequisite flow were exercised without
  sending a message.
- After authentication was restored, final screenshots were captured at 390px, 767px, and 768px.
  The shell changed topology exactly at 768px, controls were 44px below the boundary and 36px at
  the desktop boundary, and every viewport had zero horizontal overflow.
- Settings was repeated at 767px and 768px: it was full-width below the boundary, desktop-panel at
  the boundary, exposed Moonlit/Database/AI Context only, contained no Appearance or Light control,
  and had zero horizontal overflow. The temporary viewport override was reset to 1097×926.
- Console review retained the existing Framer Motion `motion()` deprecation warning and an existing
  MUI `:first-child` SSR-safety warning; neither originates in the Phase 1B diff.

### Exit Criteria

The empty and active composer surfaces conform in every reachable state without layout regressions.

### Status

COMPLETE — implementation, automated validation, final responsive screenshots, and the repeated
authenticated Settings topology pass are complete. Transcript/code/tool styling and
sidebar-history redesign remain intentionally deferred to Phases 1C and 2.

## Phase 1C — Transcript, Markdown, and Agent States

### Objective

Align conversation content and every state produced by streaming agent work.

### Scope

User and assistant messages, action rows, Markdown, code, tables, reasoning/tool steps, inline query
results, artifacts, loading skeletons, streaming/waiting/paused states, and errors.

### Components / Files

`MessageList.jsx`, `MarkdownRenderer.jsx`, `CodeViewer.jsx`, `InlineExecutionTable.jsx`,
`GuidedConfirmationPrompt.jsx`, `ai-response-steps/**`, `features/styles/interfaceChrome.js`, and
`scripts/audit-interaction-contrast.mjs`.

### Design Requirements

Consistent type hierarchy, tokenized spacing/surfaces/borders, approved shapes, readable long
content, responsive overflow, accessible statuses, visible actions, and reduced motion.

### Known Issues

Repeatable authenticated fixtures remain unavailable for fenced code blocks, execution-result
tables, active streaming, guided confirmation, paused execution, and error presentation. Browser
keyboard emulation did not advance focus in the in-app browser, so the focus-ring contract was
verified in source and by the executable interaction audit rather than by a captured keyboard-focus
screenshot.

### Planned Changes

Completed: normalized transcript typography and 4px-scale spacing, moved message/code actions and
reasoning/tool controls onto shared responsive pill geometry, aligned Markdown and execution tables
to the paper surface, aligned fenced code to the code surface, and made guided confirmation stack
through the 768px boundary with canonical focus treatment. Message ordering, agent behavior,
streaming data flow, tool execution, and artifact behavior were not changed.

### Dependencies

Phase 1B.

### Validation

- `node --test src/theme/mode.test.js src/config/userSettings.test.js src/pages/Landing/landingContent.test.js`
  — 3 passed, 0 failed.
- `npm run audit:interaction` — passed boundary hierarchy, canonical geometry, focus contrast, flat
  reasoning controls, transcript/table/code semantic surfaces, and shadow-free states.
- `npm run audit:theme` — passed 51 WCAG pairs and all Moonlit surface invariants.
- `npm run audit:dark` — passed.
- `npm run audit:input-focus` — passed.
- `npm run lint` — passed.
- `npm run knip` — passed.
- `npm run build` — passed with the existing oversized Perspective vendor chunk warning.
- Authenticated browser checks at 1302×926 confirmed 30px message/code action controls, 32px
  reasoning/tool controls, pill radii, no shadows, canonical 16px response-body typography, and no
  horizontal overflow.
- Authenticated browser checks at 390×844 confirmed 44px copy, reasoning, tool-detail, and diagram
  controls, pill radii, no shadows, a visible composer, and no horizontal overflow. Collapsed and
  expanded reasoning states were exercised without sending a message or invoking a tool/artifact.
- The temporary viewport override was restored to 1302×926.
- Fenced code blocks, execution-result tables, active streaming, guided confirmation, paused
  execution, and error presentation were source/audit validated but could not be visually exercised
  because the signed-in conversation did not contain those fixtures.

### Exit Criteria

All reachable transcript states conform; unavailable fixture states are covered by executable
source contracts and explicitly documented for later visual verification.

### Status

COMPLETE WITH FIXTURE LIMITATIONS — implementation, automated validation, authenticated desktop and
mobile transcript checks, and responsive reasoning screenshots are complete. The unavailable
streaming/code/table/confirmation/pause/error fixtures remain recorded above.

## Phase 2 — Sidebar and Conversation History

### Objective

Align desktop rail/expanded sidebar, mobile drawer, search/history overlays, and conversation rows.

### Scope

Navigation, active state, conversation history, search, rename, delete, loading/empty states,
database entry, profile entry, collapsed behavior, and mobile drawer.

### Components / Files

`features/sidebar-left/**`, `components/ui/Drawer.jsx`, relevant shared popovers/dialogs, and sidebar
hooks.

### Design Requirements

Canonical app-shell rows, white active indicator, 8px row chrome, pill interactive controls,
hairline boundaries, tracked mono labels, and 44px touch targets.

### Known Issues

The reachable sidebar states now conform. Repeatable browser fixtures are still unavailable for an
initial conversation-list failure, a successful empty list, and failed rename/delete operations;
their state precedence and failure retention are covered by executable model/source contracts.

### Planned Changes

Completed: introduced deterministic list loading/error state, made conversation selection and
options sibling native controls, added the canonical active indicator and responsive geometry,
made Search/History focus deterministic, removed unsupported shortcut hints, and moved the mobile
drawer to MUI modal ownership while preserving its public composition and animation.

### Dependencies

Phase 1 theme foundation.

### Validation

- Six Node tests passed, including the new conversation-list state model.
- Dark, theme, interaction, and input-focus audits passed.
- Full ESLint and Knip passed.
- The production build passed with the existing oversized Perspective vendor chunk warning.
- Authenticated browser checks passed for expanded/collapsed desktop, immediate Search focus,
  first-row collapsed-History focus, active-row semantics, 390px and 767px modal drawer behavior,
  nested popover Escape ordering, focus restoration, the 768px permanent-sidebar boundary, and
  zero horizontal overflow.
- The browser was restored to the authenticated conversation URL with its viewport override reset
  and the desktop sidebar expanded. No conversation/database/account data was changed.

### Exit Criteria

All sidebar states pass the phase report and validation matrix.

### Status

COMPLETE — implementation, automated regression checks, responsive authenticated browser checks,
and documentation are complete. Unavailable destructive/error fixtures are explicitly documented.

## Phase 3 — Workspace Panels and Global Overlays

### Objective

Align chat-connected artifacts, SQL workspace, diagrams, visualizations, settings/database surfaces,
dialogs, menus, and toasts.

### Scope

Only surfaces reachable from the primary authenticated chat journey.

### Components / Files

`features/sidebar-right/**`, `features/overlays/**`, `components/common/**`, and shared UI primitives.

### Design Requirements

Flat hierarchy, canonical cards/inputs/buttons, semantic statuses, responsive overlays, accessible
dialogs, and tokenized third-party integrations.

### Known Issues

Phase 3A is complete. The existing Settings “Reset to defaults” action applies immediately without
confirmation; this behavior was not changed because the approved preference-surface work preserves
settings callbacks. Phase 3B artifact fullscreen and Phase 3C renderer-internal work remain.

### Planned Changes

Completed in Phase 3A: introduced a focused workspace/overlay audit; made preference, dialog,
confirmation, notification, and drawer controls responsive; coordinated mobile drawer exit before
opening Settings/Database; added deterministic heading focus and focus return; removed duplicate
Escape ownership; separated toast timing from motion; and corrected React reserved-key and Framer
Motion deprecation warnings. The left-sidebar performance interruption was also resolved by keeping
workspace-canvas callbacks stable when sidebar width changes, preventing long transcripts from
reconciling during sidebar animation.

Remaining: artifact action/state/fullscreen behavior in Phase 3B, followed by SQL tabs, mindmap,
diagram, and visualization internals in Phase 3C.

### Dependencies

Phases 1 and 2.

### Validation

- Seven Node tests passed.
- Workspace, dark-only, theme, interaction, and input-focus audits passed.
- Full ESLint and Knip passed.
- The production build passed with the existing oversized Perspective vendor chunk warning.
- Authenticated browser checks passed at the default desktop viewport and at 390×844, 767px, and
  768px for Settings/Database geometry, drawer-to-overlay sequencing, heading focus, focus return,
  nested Escape order, confirmation cancellation, and responsive topology.
- Long-transcript instrumentation confirmed that left-sidebar expand/collapse produces no new
  `MessageList` renders, including while the right artifact panel is open.
- Opening the diagram artifact produced no React reserved-`key` warning after the fix; a fresh
  reload also produced no drawer deprecation warning.
- The browser returned to the authenticated conversation URL, default viewport, expanded desktop
  sidebar, closed overlays, and the original `mistral.devstral-2-123b` model. The model was restored
  after the existing immediate Reset action was encountered during browser review.
- Phase 3B made artifact actions 44px below 768px while retaining compact desktop sizing, added
  semantic loading/error states, and exposed bounded separator values for assistive technology.
- Fullscreen now focuses a named local region, owns Escape without a document listener, restores
  the invoking control, preserves a single renderer instance, and removes backdrop duration when
  reduced motion is requested.
- Authenticated diagram checks passed for keyboard and pointer resizing, fullscreen entry/Escape,
  focus restoration, renderer-state preservation, artifact close, and zero horizontal overflow.
  At 390×844 and 767px the resize separator is omitted and the artifact uses the full viewport;
  at 768px the desktop separator and compact actions return.
- A previously captured Emotion `:first-child` diagnostic did not recur after a fresh fully loaded
  conversation reload, so no speculative Markdown selector change was made.
- Phase 3C replaced nested SQL tab interactions with sibling native tab/Close controls and a
  stable labeled tabpanel without changing query callbacks or editor state ownership.
- The schema mindmap now uses MUI modal focus containment/restoration, autofocuses its Close action,
  exposes named asynchronous states, uses 44px/34px responsive pill geometry, and disables its
  opacity duration under reduced motion. Graph layout and interaction behavior were not changed.
- Perspective empty/loading/error states now use the shared live semantics and its public wrapper
  has complete flex/min-size containment. Worker lifecycle, schema inference, storage, selection,
  exports, saved viewer configuration, plugin registration, and shadow DOM were not changed.
- Final validation passed: seven Node tests; workspace, dark-only, theme, interaction, and
  input-focus audits; full ESLint; Knip; production build; and `git diff --check`. The build retains
  only the known oversized Perspective vendor chunk warning.
- SQL editor, schema mindmap, and Perspective live browser states remain unavailable without a
  connected database. Opening SQL safely confirmed the database prerequisite and it was canceled;
  no connection, query, setting, conversation, download, clipboard, or account mutation occurred.
  The existing diagram fixture covered renderer chrome, responsive topology, resize, fullscreen,
  focus, Escape, state preservation, and overflow.

### Exit Criteria

Chat-connected secondary surfaces conform without breaking their functional workflows.

### Status

COMPLETE — shared overlays/preferences, artifact shell/fullscreen, and renderer-internal contracts
pass the available automated and authenticated browser checks. Database-dependent fixture limits
are documented above.

## Phase 4 — Authentication and Administration

### Objective

Audit and align authenticated entry and administrator-only surfaces.

### Scope

Sign in/sign up, validation and provider states, guards/loaders, and administration views.

### Components / Files

`pages/Auth.jsx`, `pages/AdminDashboard.jsx`, guards, loaders, and shared form/dialog primitives.

### Design Requirements

Canonical dark form cards, inputs, pills, typography, semantic errors, responsive layout, and
keyboard accessibility.

### Known Issues

The current dummy account is not an administrator, so the authorized dashboard and live telemetry
states do not have a safe browser fixture. Full Firebase/provider/reset submission was intentionally
not exercised. Browser-only validation also reports Firebase initialization errors when the backend
configuration endpoint is unavailable; this is an environment limitation rather than a Phase 4
regression.

### Implemented Changes

Auth initialization now uses the shared loader; email, provider, and reset operations share one
deterministic operation lock and named busy state; the nonfunctional Remember Me control is gone;
and password recovery uses the shared dialog/action geometry with deterministic entered focus and
focus restoration. Pure route-decision tests cover loading, anonymous, authenticated, non-admin,
configured-admin, and missing-admin-configuration paths. The server now owns a fail-closed
`ADMIN_UID` check for metrics, metrics streaming, and metrics reset. Admin presentation uses
canonical tokens, responsive action geometry, semantic live/busy states, and reduced motion while
preserving telemetry URLs, transforms, credentials, timers, and cleanup. The subsequently approved
B1/M1 Auth presentation replaces the redundant nested form card with a 44/56 editorial split from
768px, a compact single-column mobile flow, and an extracted product-only brand panel; account
behavior and ownership remain unchanged.

### Dependencies

Phase 1A and stable shared components.

### Validation

Eleven frontend Node tests, six UI audits, ESLint, Knip, production build, six isolated backend
authorization tests, Python compilation, diff checks, and safe browser checks passed. Browser
coverage included public sign-in/sign-up switching, empty validation, reset-dialog focus/cancel,
44px actions through a 767px CSS viewport, compact actions at 768px, zero horizontal overflow, and
anonymous `/admin` redirection. Auth submissions, OAuth, password reset, sign-out, and live admin
operations were not triggered. Full FastAPI route tests were unavailable because this workspace
does not provide FastAPI/pytest dependencies; the pure authorization decision tests and source
audit cover the new boundary. Phase 6 subsequently exercised the B1/M1 layout at 390px, 767px,
768px, and desktop, including mode switching, validation, reset-dialog focus/restoration, field
focus treatment, provider alignment, overflow, and the approved sign-out/sign-in cycle.

### Exit Criteria

Reachable states pass the phase report; inaccessible states are explicitly documented.

### Status

COMPLETE WITH FIXTURE LIMITATIONS — account entry, guards, server-owned administration
authorization, reachable admin presentation contracts, and the approved Auth layout pass the
automated and live responsive checks. Authorized live admin telemetry and full backend route-test
dependencies remain unavailable as documented above.

## Phase 5 — Landing Page Compliance

### Objective

Verify the existing landing-page implementation against the canonical design without redesigning
recent, unrelated work.

### Scope

Landing navigation, hero, sections, product showcase, security, FAQ, CTA, and footer.

### Components / Files

`pages/Landing/**` and directly shared landing primitives only.

### Design Requirements

Canonical marketing canvas, display hierarchy, mono labels, sparse accents, outline pills,
hairline cards, no shadows, and 768px grid transition.

### Known Issues

No unresolved landing defect remains. Phase 6 restored browser control and supplied the previously
missing live 390px, 767px, 768px, and desktop interaction, screenshot, and overflow evidence.

### Implemented Changes

Preserved the recent landing structure, content, auth-aware CTA routing, sticky navigation, product
walkthrough, database marquee, reveal behavior, FAQ semantics, and mobile drawer. Removed verified
design-system inconsistencies: hero gradients and atmospheric blur, translucent header blur,
mockup shadow and perspective tilt, elevated card hover motion, noncanonical 10–16px radii, excess
card/section padding, uppercase hero treatment, and selected topology changes below 768px. A focused
presentation helper and audit now own flat 8px hairline surfaces, 24px card padding, documented
content-band spacing, and the canonical responsive boundary.

### Dependencies

Canonical dark theme foundation.

### Validation

- `node --test` — 12 passed, including landing CTA destination and presentation contracts.
- `npm run audit:landing` — passed flat surfaces, canonical geometry, and 768px topology checks.
- Auth/admin, dark-only, theme, interaction, input-focus, and workspace audits — passed.
- Full ESLint and Knip — passed.
- Production build — passed with the existing oversized Perspective vendor chunk warning.
- `git diff --check` — passed.
- Served `/` route — returned HTTP 200 from the local Vite server.
- Phase 6 live browser checks — passed at 390px, 767px, 768px, and desktop: zero horizontal
  overflow; mobile navigation through 767px and desktop navigation from 768px; correct one/two/three
  column topology changes; flat header/cards/mockup; and Escape focus restoration for mobile nav.

### Exit Criteria

The landing page is classified and any verified gaps are resolved.

### Status

COMPLETE — the landing presentation contract, automated checks, served route, and Phase 6 live
responsive interaction/screenshots pass without changing product behavior or recent content
structure.

## Phase 6 — Cross-Application Responsive and Final Audit

### Objective

Run the final consistency, accessibility, cleanup, and regression pass across completed phases.

### Scope

Token scans, responsive matrices, keyboard/focus behavior, contrast, reduced motion, loading/error
consistency, and repository documentation.

### Components / Files

All frontend files changed by prior phases; unrelated files remain out of scope.

### Design Requirements

No unapproved deviations from `DESIGN.md` and no duplicate visual language.

### Known Issues

Live fixtures remain unavailable for authorized admin telemetry; a safely connected database and
its SQL/schema/Perspective states; active streaming; guided confirmation; paused execution; and
error presentation. Initial history failure, successful empty history, and failed rename/delete
also lack repeatable live fixtures. Their available source/model/authorization contracts remain in
the automated suite. Production build continues to report the known oversized Perspective vendor
chunk.

### Implemented Changes / Findings

Completed the public and authenticated viewport matrix at 390px, 767px, 768px, and desktop. Verified
landing topology, Auth presentation and interactions, welcome/composer geometry, mobile drawer and
overlay sequencing, expanded/collapsed profile/settings separation, long-transcript containment and
sidebar timing, Database/Settings containment, and artifact fullscreen focus/Escape restoration.
The approved dummy account was signed out only for Auth checks and returned to the same known
conversation afterward. No message, reset link, OAuth request, account creation, database mutation,
query, or preference reset was submitted.

The only fresh console diagnostic was Emotion's SSR-safety warning for `:first-child` in
`MarkdownRenderer`. A focused interaction-audit regression first reproduced the selector, the style
was changed to the recommended `:first-of-type` form, and a fresh authenticated reload produced no
new warning or error. No final-pass architectural rewrite was needed.

The shared chat composer retains its user-approved 20px radius and the anchored welcome suggestion
panel retains 16px. This is a recorded exception to the general 8px surface language; both remain
flat, use one low-contrast hairline, and have no shadow. Internal controls remain 8px or pill-shaped.

### Dependencies

All intended implementation phases.

### Validation

- Live landing/Auth/chat viewport matrix at 390px, 767px, 768px, and desktop — passed with zero
  document/workspace horizontal overflow and the canonical 768px topology switch.
- Auth sign-in/sign-up switching, empty validation, reset-dialog entry focus/cancel restoration,
  and the approved dummy sign-out/sign-in restoration — passed without reset/OAuth/account creation.
- Long-conversation left-sidebar transitions — approximately 324–326ms including their intended
  animation, with no seconds-long stall or jerking; right-side artifact behavior remained smooth.
- Mobile drawer/Settings/Database sequencing, expanded/collapsed profile/settings ownership, and
  artifact fullscreen focus/Escape restoration — passed.
- Fresh browser console after the Markdown selector correction — no new warnings or errors.
- `node --test` — 12 passed.
- Landing, auth/admin, dark-only, theme, interaction, input-focus, and workspace audits — passed.
- Full ESLint and Knip — passed.
- Production build — passed with the known oversized Perspective vendor chunk warning.
- Backend administration authorization — six unit tests passed; the focused Python modules compile.
- `git diff --check`, debug-artifact scan, and final changed-file self-review — passed.

### Exit Criteria

All completed phases are stable, documentation is current, and remaining limitations are explicit.

### Status

COMPLETE WITH FIXTURE LIMITATIONS — the live responsive matrix, sole reproducible final-pass warning
correction, automated regression suite, final changed-file review, and audit documentation are
complete. Only the explicit live-fixture and Perspective bundle-size limitations above remain.
