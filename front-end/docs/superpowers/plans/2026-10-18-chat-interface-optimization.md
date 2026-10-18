# Moonlit chat interface optimization proposal

Date: 2026-10-18. Status: implemented, then visually corrected following the user's screenshot feedback.

## Current visual correction — supersedes the earlier visual decisions

The user explicitly rejected the conservative adaptation and requested closer visual matching
to three supplied ChatGPT Work screenshots. That instruction supersedes the earlier decisions
below to retain a 20px composer, a single model menu, and no pinned output summary.

The current implementation uses a rounded near-black workspace, a static 24px welcome heading,
a 768px composer with 26px corners and a 126px welcome surface, an attached inset database context
strip, and vertically stacked suggestions. User bubbles have 24px corners. The model trigger shows
friendly names, opens compact settings with a supported Low/Medium/High slider, then a searchable
provider-grouped model list. Only configured Moonlit capabilities are exposed.

Active conversations show a 300px Outputs/Sources summary on wide screens, with a header toggle.
Sources come from recorded output provenance. Opening the workspace viewer hides the summary;
smaller screens retain the dropdown. A container query reserves room when an expanded sidebar
reduces the chat width. Suggestions scroll in their own grid row in short windows.

REA captured the signed-in reference page and screenshot again:
`ev_c4fd51b92ac2d1aaa24c5a43365d1f2e6636b2c7a807be5c9f1ad079e03836f2`
and `ev_d12f9e28ecda8dc7b03242208455369e9e2b461f212995d1e47b6515473096af`.
Its automated scenario provider still failed; interactive Moonlit checks used the internal browser.
Reference menu details also use the user's supplied screenshots rather than claiming a successful
REA interaction trace. Local screenshots: welcome
`ev_b459c5a319000ff21bd2854fab37e47853e27853fcffe90a98908add526efc3c`, conversation
`ev_008a8c877e2dd10431077d97bdc10a0eef6da1071dd759bbcfcb3bc1f68100b7`.

Fresh review found and prompted fixes for sidebar overlap, short-window suggestion clipping,
and stale search feedback on returning to model settings. At 1536 CSS px with an expanded
sidebar, the transcript's right edge now ends at 1124px before the summary begins at 1227px.
At 545px viewport height, the suggestion region scrolls and the final category remains reachable.
The 390px mobile popup fits within the viewport; unsupported models have no effort slider.

Final tests: 29 Node test files and 84 component tests across 20 files pass with two Vitest workers.
ESLint, production build and diff whitespace checks pass. Knip retains only its two pre-existing
unused exports; the existing Perspective bundle-size warning remains.
The unrestricted-worker run hit three timing failures under browser load; timeout settings were
not relaxed. Visual checks used production chat components with fictional data and a simplified
fixture sidebar. Temporary fixture files were removed and the browser viewport was reset.
Live database execution, real mobile keyboards, and 200% zoom were not checked in this pass.
Existing user-staged changes were preserved. No backend/dependency changes or commit were made.

## Earlier proposal and implementation record

The material below records the earlier proposal; the correction above governs current visuals.

## Recommendation

Refine the existing Moonlit composer and chat workspace using the interaction patterns observed in ChatGPT Work. Keep Moonlit's database workflow, design tokens, streaming hooks and artifact renderers. The highest-value changes are a compact composer, a combined model/reasoning picker, and consistent alignment between the transcript, composer and database context.

The request is to adopt only parts that work with Moonlit's actual capabilities. It does not require reproducing ChatGPT's model catalog, subscription controls, voice system, file ingestion, sharing, plugins or branding.

Three approaches were considered:

| Approach | Benefit | Cost and decision |
|---|---|---|
| Incremental adaptation of current components | Improves the daily workflow while preserving completed output/context work | Recommended; small, separately verifiable changes |
| Close visual reproduction of Work | Strong visual resemblance | Adds unsupported affordances and conflicts with Moonlit's design rules; reject |
| Replace the composer/editor and workspace architecture | More freedom for rich input and documents | No demonstrated need; introduces state, accessibility and bundle risks; defer |

## Inspected interface

Reference: the supplied [Create revenue chart conversation](https://chatgpt.com/c/6ad43b32-40ec-83e8-8e33-fa90bd935572). Observations describe this account and build, not every ChatGPT deployment.

REA successfully discovered the authenticated target, inspected its DOM/accessibility surface and captured its desktop screenshot. Additional live interaction and computed-layout observations were made in the signed-in internal browser. The evidence record distinguishes the two sources.

Evidence: [scoped inspection record](../../research/2026-10-18-chatgpt-work-evidence.json). REA page inspection: `ev_5bfc03c2655fe4ca93a4d34c27887baf1133859d9aa56a9fe432c648a30051f1`; screenshot: `ev_40026ff2d2b6b034a70e8b2d3cdb7bb3948b71ebedb5e0b7b01c09f2a69e6ed5`. REA's scenario provider failed to return an action trace through MCP and the public CLI; menu interactions below are therefore attributed to the internal browser, not to a successful REA scenario. Registration and skill alignment passed the REA diagnostic check. No reinstall was performed.

| Area | Observed Work behavior | Moonlit decision |
|---|---|---|
| Composer shell | Two rows: growing input above a low-emphasis action row; desktop surface measured approximately 768 × 102 CSS px, 26px radius | Reuse the hierarchy and density; retain Moonlit's approved 20px composer radius and semantic surface colors |
| Input | Rich editable textbox, 16px type with approximately 26px line height; internally scrolls as a long draft grows | Keep the existing MUI multiline textarea, 1–6 rows; rich text is unnecessary for the current prompt API |
| Submission | Empty composer shows voice; nonempty draft replaces that action with Send | Keep Moonlit's existing empty-disabled Send → active Send → Stop states; no voice placeholder |
| Model trigger | Current model plus effort is visible near the send action | Show the selected model plus supported effective effort; expose the full name accessibly |
| Model menu | Compact first menu, separate model list, active selection checkmark | Use a single searchable provider-grouped list with a small reasoning section; fewer interactions for Moonlit's catalog |
| Effort | Account shows a discrete Power control, with “Light, 2 of 6”; arrow-key instructions; fast mode is separate | Low / Medium / High only. Use a labeled radio group, not ChatGPT's six-position slider or its fast-mode toggle |
| Tools | Plus opens labeled actions with descriptions: uploads, library, image, web, sketch and connected plugins | Keep SQL directly reachable. Do not add a generic plus menu containing capabilities Moonlit cannot execute |
| Messages | Right-aligned user bubble, open assistant text, restrained action row | Already substantially present; preserve the hierarchy and tune spacing only where needed |
| Progress | “Worked for 12s” reveals a compact activity summary | Preserve Moonlit's collapsed StepsAccordion and visible failure/paused states; show elapsed time only if recorded |
| Output discovery | Artifact card in the response plus Outputs/Sources summary | Already implemented in Moonlit as inline results and the Outputs menu; improve labeling rather than add a permanent third column |
| Artifact view | Preview can take the main workspace, with download/close/full-view controls; a compact composer remains available | Preserve existing split/fullscreen SQL/result/diagram host. Do not introduce a floating duplicate composer in this pass |
| Regeneration | Menu includes a change-response field, Try again and web-search choice | Exclude until Moonlit defines response versioning/retry behavior and provides supporting handlers |
| More actions | Includes branch-in-new-chat and a timestamp | Do not add branch/share controls without backend semantics; Copy remains available |
| Navigation | Narrow app rail, optional history pane, title/header actions | Keep Moonlit's existing navigation and database access; copying Spaces/Sites/Scheduled destinations adds no value |

The user-supplied DOM text mentions more effort labels than the visible six-position menu. Hidden text is not treated as the supported option set. No model or effort setting was changed during inspection. A fictional multiline draft was entered and cleared without submission; the artifact viewer and menus were closed afterward in the internal browser.

## Existing Moonlit capabilities and concrete gaps

The current working tree already includes searchable database/schema controls, conversation Outputs/Sources, inline result exploration, SQL links, and session-scoped artifact/editor state. These are baseline functionality, not new work proposed here.

1. `ChatInput.jsx` contains the model list but reasoning lives in `SettingsModal.jsx`. Users must leave the prompt to adjust a setting directly associated with its model.
2. The backend accepts `low`, `medium`, and `high` reasoning effort. `/llm/options` returns `capabilities[model].supports_reasoning`. The provider implementation forwards effort values for supported models; it does not promise the 1,024 / 5,000 / 16,000 token budgets currently printed in Settings.
3. For the supported GPT-OSS reasoning path, `enable_reasoning=false` clamps effort to Low; it is not a true Off setting. Do not introduce None/Off, Max, Ultra, Persistent or a misleading “fast” control.
4. The composer/context cap is 672px (`COMPOSER_MAX_WIDTH`); the transcript wrapper cap is 768px (`UI_LAYOUT.chatInputMaxWidth`) with its own internal padding. This creates different visual edges despite the shared-column presentation.
5. The composer surface reserves at least 124px on desktop and 132px on mobile before the database-context row. There is room to reclaim vertical space while preserving 44px mobile targets.
6. The model button has a fixed 116px mobile / 156px desktop width and animates overflow text. An effort suffix needs a layout that truncates the model name without hiding the effort or Send/Stop.
7. `ChatInput`'s Enter handler does not explicitly guard IME composition. A composing Enter must not submit a prompt. This is a source-level risk, not a reproduced production failure.
8. The toolbar can show the last resolved task mode while slash commands and Settings control the configured mode. Keep “reasoning effort” separate from “task mode”; the former adjusts model reasoning, the latter controls agent workflow limits.

Source anchors: `src/features/chat/ChatInput.jsx`, `src/features/chat/ComposerContextBar.jsx`, `src/features/chat/MessageList.jsx`, `src/features/styles/interfaceChrome.js`, `src/styles/shared.js`, `src/features/overlays/settings/SettingsModal.jsx`, `src/hooks/chat-page/useChatPageLlmSelection.js`, `src/hooks/chat-page/useMessageStreaming.js`, `src/config/userSettings.js`, `../back-end/controller/conversations_controller.py`, `../back-end/llm_provider/model_factory.py` and `../back-end/service/user_settings/user_settings_service.py`.

## Proposed composition

```text
Conversation title                                  Outputs · N

                         Your question
Activity summary ▸
Assistant answer
Result preview / SQL / diagram card
Copy

┌─────────────────────────────────────────────────────────────┐
│ Ask about your data…                                        │
│                                                             │
│ SQL                               Model · Medium ▾   Send   │
└─────────────────────────────────────────────────────────────┘
Database ▾     Schema ▾     Context
```

The database bar stays visible because it identifies where work will execute. The model trigger opens one popover containing a search field, provider headings, available models with a selected checkmark, and a separate **Reasoning effort** radio group when supported. Keep the existing Settings entry for defaults and slash commands for task mode; no additional toolbar row is needed.

Desktop target: approximately 104–112px for the empty composer surface, with the context row separate. Mobile target: approximately 112–120px without reducing 44px targets. These are proposed acceptance ranges, not measurements of Moonlit in a new browser run. Use existing spacing roles and validate actual rendered height before settling values.

Use the existing 768px chat-width role for the transcript, composer and context wrapper, with consistent outer gutters. Avoid double padding; the assistant text may retain an intentional inner inset, but the composer and message column boundaries should align. In split view all three shrink to the available chat pane. Keep the approved 20px composer and 16px suggestion-panel exceptions recorded in `docs/memory.md`; do not change `docs/design.md` or adopt Work's 26px radius, pink accent or private CSS classes.

## Delivery sequence

### 1. Model and reasoning controls

Extract only the existing model popover into `src/features/chat/ComposerModelPicker.jsx`; keep draft/submission logic in `ChatInput.jsx`. Reuse `AppPopover`, existing menu components and MUI controls. A search field filters model/provider labels; preserve provider grouping, selected state, loading skeletons and a clear no-results state. Search must not change selection, and Escape returns focus to the trigger.

Expose selected-model capability from `useChatPageLlmSelection.js` and pass it through `useChatPageController.js`. Derive capability from the effective selected model rather than only the possibly stale saved setting. Keep settings in the existing context; add no parallel model store.

Use the backend-supported effort values in a small shared option definition used by the picker and Settings. Remove fixed token counts from Settings. Selecting an effort should atomically set `enableReasoning: true` and the chosen `reasoningEffort`; if an existing supported-model preference has reasoning disabled, display its actual Low behavior until the user chooses another level. Unsupported models show no effort suffix and no editable effort control; retain the saved preference for switching back. Unknown capability must not imply support.

Changes while streaming apply to the next request, matching existing model-selection behavior. Clearly indicate this in the open picker; never relabel the already-running response. Keep model/effort semantics separate from task mode.

Acceptance: only configured models and Low/Medium/High can be selected; settings and picker agree; outgoing messages use the chosen values; unsupported models never advertise reasoning; loading/error/empty and keyboard paths work. Update ChatInput's custom memo comparison when adding props, so capability and effort changes render immediately.

### 2. Composer density, alignment and input correctness

Update shared layout values in `interfaceChrome.js`, and align wrappers in `ChatInput.jsx`, `ComposerContextBar.jsx` and `MessageList.jsx`. Keep the single mounted composer, current draft store, welcome-to-active layout, query-confirmation prompt and Send/Stop lifecycle.

Use a flexible model label with ellipsis and a full accessible name/tooltip. Preserve Send/Stop at a fixed size; shorten the model label before sacrificing the action. Keep usage warning information accessible in the picker as well as the existing tooltip/ring. Make the composer body grow only with text, then scroll internally at its cap.

Guard Enter during IME composition before slash-command or submit handling. Preserve Enter-to-send, Shift+Enter-to-newline, slash navigation, streaming cancellation and unsent drafts. No rich-text editor dependency is required.

Acceptance: shared visual column; no page-level horizontal overflow at 390, 767, 768 and 1440px; visible 44px mobile controls; long model/database/schema names remain usable; six-line text scrolls without pushing Send offscreen; no accidental IME send; no draft loss after a failed send, session switch or opening a viewer.

### 3. Conversation and output polish

Keep `ChatHeader`, `ConversationOutputs`, `MessageList`, `StepsAccordion` and `ArtifactLoader` as the current structure. Reuse existing source details and output types. Improve output titles or spacing only where the real content is ambiguous; preserve query context, selected output identity and focus restoration.

Move or relabel the last resolved task-mode caption so it cannot be mistaken for the next request's setting. Preserve collapsed activity summaries, error/paused indicators, Copy, Jump to latest and manual expansion. Do not force scrolling when a user is reading earlier messages.

Acceptance: inline result → viewer → SQL preserves the selected execution and rows; no duplicate output per open; fullscreen/close restores focus; selected-source provenance remains truthful; opening a viewer does not reset the draft or transcript scroll. Existing correct behavior should be verified, not rewritten.

## Explicit exclusions

No microphone, transcription, voice conversation, file-upload chips, attachment previews, web search, plugin picker, image generation, fast-mode billing toggle, model upsells, conversation sharing, branching, regeneration or new backend endpoint. No copied ChatGPT assets or compiled styles. These require capabilities or product decisions beyond a presentation improvement.

No always-open Outputs sidebar in addition to Moonlit's SQL/result panel. No second composer in fullscreen. No duplicate implementation of context search, output discovery or cached SQL tabs already delivered.

## Verification for implementation

Before editing, preserve the user-owned staged/unstaged baseline and establish relevant test results. Add focused behavior tests for capability-aware effort, model search/selection, IME Enter and draft preservation. Extend existing ChatColumn, MessageList, output and artifact tests only for behavior touched by the changes.

Run targeted tests, then `npm test`, `npm run lint`, `npm run build` and available design checks. Check Knip against the recorded baseline rather than treating pre-existing unused exports as introduced regressions. Verify keyboard-only operation, focus return, reduced motion, 200% zoom, touch targets, long content, unsupported/no-model states, failed sends, streaming Stop and split/fullscreen behavior in the browser. Use a deterministic fixture for UI states; claim live database validation only if a safe real database run is actually performed.

The initial investigation did not execute Moonlit tests or change product code. Implementation followed the user's approval. Live ChatGPT generation, voice, uploads, billing, branch/share mutations, mobile keyboard behavior and hidden backend behavior were not exercised. The proposal is based on observed UI interactions and current source contracts, not assumptions about ChatGPT's internal architecture.

## Implementation record

All three delivery steps are implemented. The searchable model/effort picker uses existing MUI controls and shared capability resolution; Settings uses the same effective Low/Medium/High values. The composer and transcript share the 768px width role and outer gutters. Model text truncates before Send/Stop; the input guards IME composition and restores failed prompts without replacing another session's draft or a newly typed draft. The streaming caption explicitly says **Last resolved task mode**, so it cannot claim that a previous response's mode describes a new response.

Existing output, SQL, activity and session components were preserved. No dependencies, backend files, model catalog, branding assets or `docs/design.md` changes were introduced by this implementation. Changes remain unstaged over the user's existing staged baseline; no commit or integration operation was performed.

Execution decisions:

- Ruling: use the existing `moonlit-dev` checkout and compare against the index, rather than create an empty worktree — the approved existing context/output work is staged here; moving to HEAD would omit it. Cost if wrong: this work is less isolated, mitigated by leaving the index untouched.
- Ruling: retain this implementation record in the plan instead of the helper's parent-repository scratch location — that location is outside the writable frontend. Cost if wrong: no generated per-task ledger; the test logs and this record provide the audit trail.
- Ruling: verify existing output/SQL/session behavior through its regression suite, without rewriting it. The temporary browser viewer fixture lacked AuthProvider and did not validate the live viewer; no successful viewer-browser claim is made for this pass. Cost if wrong: browser-only viewer defects may remain despite passing component tests.
- Ruling: treat the review's misleading “Current response” caption as a correctness issue, despite its minor label — truthful mode wording is an explicit requirement. Cost if wrong: the more conservative label offers less current-response specificity.

The fresh review found that terminal SSE errors still returned success to the composer. A failing regression reproduced this; the send handler now propagates stream failure. Error, step-limit pause and approval-wait outcomes pass alongside Stop cancellation tests. The caption correction also failed first and passed after the change. No review findings were deferred.

Browser checks used the real components with fictional local state. At measured CSS widths 390, 767, 768 and 1440 there was no page-level horizontal overflow. Empty surfaces measured approximately 118px mobile and 110px desktop; main mobile actions measured 44px, allowing fractional rounding at the browser's existing zoom. Long model names truncate and Send remains inside the surface. Nine input lines scroll inside the six-row cap. Search autofocus, Escape focus return, supported/unsupported effort controls, welcome transitions, failed-send restoration and session draft preservation were exercised. The database context strip scrolls horizontally on narrow screens. Viewport overrides were reset and the temporary fixture/tab removed.

Verification limitations: physical mobile keyboards and 200% browser zoom were not tested; current browser zoom was retained. Reduced-motion behavior is covered by the existing component tests, not a new browser preference run. No live database query was executed. Existing output/viewer/SQL/fullscreen and source-identity coverage comes from automated regression tests. The oversized Perspective build chunk and two existing Knip unused exports remain baseline findings.

Final checks: `npm test` passed (29 Node test files, 83 component tests across 19 files); `npm run lint` and `npm run build` passed. `npm run knip` reports only the existing `timelineShared.slideIn` and `chatMessages.isMessageActive` unused exports. No dedicated design-audit script is available. An initial concurrent tests/build/lint/Knip run caused test timeouts; the unchanged full suite passed in 14.29 seconds when rerun without competing checks. Focused review regressions passed 21/21. `git diff --check` passed. Temporary logs are under `/tmp/moonlit-chat-final-*` and `/tmp/moonlit-review-*`.
