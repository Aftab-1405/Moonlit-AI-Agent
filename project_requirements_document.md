# Moonlit Project Requirements

Last updated: 2026-08-26

## Purpose and Evidence

This document records Moonlit's current product requirements, implemented capabilities, active
remediation work, and unresolved product decisions. It describes the repository as it exists; it
does not convert planned work into implemented behavior.

Evidence is evaluated in this order:

1. Executable code, public schemas, configuration, and tests.
2. `front-end/docs/architecture.md` and `back-end/docs/architecture.md`.
3. The current status and evidence in each codebase's `memory.md` and `phases.md`.
4. Setup and operational guidance in `README.md` and `back-end/README.md`.

When these sources disagree, executable behavior takes precedence and the stale documentation must
be corrected.

### Status Labels

- **CONFIRMED** — explicitly supported by repository evidence or an approved design contract.
- **IMPLEMENTED** — present in the current codebase.
- **PARTIALLY IMPLEMENTED** — present, but a required invariant, workflow, or validation path is
  incomplete.
- **IN PROGRESS** — approved work is actively tracked but is not complete.
- **INFERRED** — strongly suggested by the product and code, but not explicitly approved as product
  policy.
- **PROPOSED** — recommended future work, not a current commitment.
- **UNKNOWN** — a product or operational decision not established by the repository.

## Product Definition

### CONFIRMED

Moonlit is a web application for working with relational databases through a streaming, tool-using
AI agent. An authenticated user can connect an allowed database, ask questions in natural language,
observe model and tool progress, inspect results and generated artifacts, and return to persisted
conversations.

### IMPLEMENTED

- React 19 single-page application built with Vite, Material UI, and React Router.
- Python 3.12+ FastAPI service exposing authenticated JSON and server-sent-event endpoints.
- Firebase Authentication with server-verified session cookies.
- Firestore-backed conversations, messages, execution results, settings, context, and durable task
  metadata.
- Redis-backed production session state, quotas, rate limits, and LangGraph checkpoints.
- LangGraph agent orchestration using authorized AWS Bedrock models.
- Qdrant-backed VAMP summary memory for long-context retrieval.
- PostgreSQL, MySQL, SQL Server, and Oracle connection and metadata workflows.
- Conversation history, rename/delete, model selection, schema context, query execution, SQL
  workspace, Perspective visualizations, and React Flow/Dagre diagram artifacts.
- Canonical dark-only interface with a 768px primary responsive transition.

### PARTIALLY IMPLEMENTED / IN PROGRESS

- The backend has completed its session/admission and request/authentication/security remediation
  phases. Ownership-safe LangGraph lifecycle and terminal durability work is still active.
- Immutable run policy, fenced leases, and isolated checkpoint generations are implemented, but the
  complete command-idempotency, protected-action, hard-budget, recoverable-finalization, and
  truthful-terminal contract is not yet finished.
- Frontend design-compliance implementation is complete with fixture limitations. Several live
  database, streaming, pause, error, and authorized-administrator states lack repeatable end-to-end
  fixtures.

### INFERRED

- Primary users are developers, analysts, and data-oriented teams that need database answers,
  exploration, or artifacts without manually authoring every query.
- The authenticated chat workspace is the primary product journey because it coordinates database
  context, model selection, agent execution, history, and artifacts.

## Users and Access Roles

### Anonymous Visitor — IMPLEMENTED

- Can view the public landing page.
- Can open sign-in, sign-up, and account-recovery interfaces.
- Cannot access chat, conversation data, database state, settings, artifacts, or administration.

### Authenticated User — IMPLEMENTED

- Can create and revisit owned conversations.
- Can connect, disconnect, and switch supported database contexts.
- Can submit prompts, observe agent progress, resume supported interruptions, and inspect results.
- Can manage owned conversation history, user settings, and cached schema/query context.
- Cannot access another user's conversations, session state, execution results, or administration.

### Administrator — IMPLEMENTED WITH LIVE-FIXTURE LIMITATIONS

- Is authorized by the backend through the configured `ADMIN_UID`; client route guards are only
  navigation assistance.
- Can access context metrics, metrics streaming, and metrics reset endpoints.
- Authorization fails closed when the administrator identity is absent, blank, or mismatched.
- Authorized live telemetry has not been exercised with the available browser fixture.

## Main User Journeys

1. Visit the landing page and continue to authentication.
2. Sign in or create an account through Firebase-backed authentication.
3. Open a new conversation or an owned conversation from history.
4. Optionally connect or switch a supported database and select a schema.
5. Select an available Bedrock model and configure supported response/reasoning preferences.
6. Submit a natural-language request.
7. Observe streamed text, reasoning status, skills, tool activity, usage, interruption, or failure
   events.
8. Inspect Markdown, code, query results, SQL, visualization, or diagram artifacts.
9. Resume a supported interrupted run or begin another turn.
10. Search, rename, or delete owned conversation history.
11. Adjust user settings, manage cached context, or sign out.

## Functional Requirements

### Public Experience and Authentication

#### CONFIRMED AND IMPLEMENTED

- Provide public landing and authentication routes.
- Support Firebase sign-in/sign-up and server session establishment.
- Protect `/chat`, `/chat/:conversationId`, and `/admin` with appropriate client navigation guards.
- Treat backend authentication and authorization as authoritative.
- Support session checking, secure logout, CSRF bootstrap, and authenticated-session cleanup.
- Present validation, loading, disabled, recovery, and safe failure states during account actions.

### Conversations and Agent Execution

#### CONFIRMED AND IMPLEMENTED

- Mint canonical UUID conversation identifiers and validate externally supplied identifiers.
- Persist user and assistant turns under an authenticated owner.
- List, load, search, rename, and delete owned conversations.
- Stream JSON SSE events for tokens, thinking, tool start/end, UI actions, workflow status, activated
  skills, usage metrics, interrupts, step limits, errors, and completion.
- Support explicit and automatic task-mode selection through one resolved run policy.
- Authorize provider/model selections against the server-owned model capability catalog.
- Support agent pause/resume using durable task state and LangGraph checkpoints.
- Persist execution results separately when an artifact is too large for the conversation timeline.

#### IN PROGRESS

- Assign one stable logical command identity so safe retries do not duplicate graph work, quota, or
  protected effects.
- Enforce total graph-step, tool-call, wall-clock, and protected-action budgets across continuations.
- Reserve protected actions durably before external execution and reject stale-fence publication.
- Finalize assistant, checkpoint, command, and lease state before emitting public success.
- Make disconnect, no-output, partial, resumable, and failed-finalization outcomes explicit to the
  browser.

### Database Connections and Querying

#### CONFIRMED AND IMPLEMENTED

- Support PostgreSQL, MySQL, SQL Server, and Oracle through database-specific adapters.
- Accept validated field-based or supported connection-string configuration.
- Connect, disconnect, synchronize connection state, list/switch databases, select databases and
  schemas, list tables, and inspect table schema.
- Store database connection state per authenticated session rather than treating it as identity.
- Restrict connection targets through server-side host, address, and SSRF policy.
- Apply dialect-aware SQL safety checks before AI-generated query execution.
- Execute allowed SQL with configured timeout and result-row bounds.
- Normalize database values into JSON-compatible API and SSE payloads.
- Close cursors/connections and maintain bounded pool lifecycle accounting.

#### PARTIALLY IMPLEMENTED / IN PROGRESS

- Aggregate query-result byte and persistence-chunk limits require further hardening.
- Database-role least privilege, UDF/extension policy, and resource governance remain deployment
  responsibilities in addition to application checks.
- Live adapter timing and failure behavior require staging validation against each supported DBMS.

### Schema Context and Memory

#### CONFIRMED AND IMPLEMENTED

- Cache user-scoped schema context and query history.
- Refresh or delete one schema context, all schema contexts, or query history.
- Compact long conversations into durable summaries.
- Store summary blocks in Firestore and derived embeddings in Qdrant.
- Retrieve, deduplicate, rank, and budget historical context before prompt construction.
- Clean up or record retry state for derived vector memory when conversations are deleted.

#### PARTIALLY IMPLEMENTED / PROPOSED

- VAMP retry/dead-state behavior and hard retrieval token ceilings require the tracked backend
  memory phase.
- Firestore conversation and result storage require sustainable document-growth and byte-budget
  controls.

### Workspace and Artifacts

#### CONFIRMED AND IMPLEMENTED

- Render Markdown/GFM, fenced code, inline execution tables, and agent/tool timelines.
- Provide a CodeMirror-based SQL workspace with query tabs and schema context.
- Render tabular/visual query artifacts through Perspective.
- Render diagram artifacts through React Flow and Dagre.
- Provide desktop resize behavior and narrow-layout full-screen artifact presentation.
- Preserve artifact state while opening, closing, resizing, or entering full-screen presentation.
- Provide keyboard ownership, Escape behavior, and focus restoration for modal/full-screen surfaces.

### Settings and Administration

#### CONFIRMED AND IMPLEMENTED

- Persist user settings across browsers through the authenticated settings API.
- Support query confirmation, timeout, maximum rows, null display, connection persistence, default
  database type, reasoning, response style, task mode, and model preferences.
- Ignore legacy light-theme preference data because the current product contract is dark-only.
- Provide user-scoped context-management actions.
- Provide backend-authorized administrator metrics, metrics streaming, and reset endpoints.

#### KNOWN BEHAVIOR

- “Reset to defaults” currently applies immediately without a confirmation step.
- The frontend's `auto` task-mode wire mapping currently uses `normal`, so it cannot distinguish an
  explicit Standard choice from automatic classification in every request path. This is tracked by
  the backend lifecycle remediation work.

## Frontend Requirements

### Architecture — CONFIRMED

- Keep route composition in `App.jsx`, route protection in `guards/`, HTTP integration in `src/api/`,
  authenticated shell structure in `AppShell`, and chat orchestration in focused controller hooks.
- Use React Context for authentication, settings/theme, and database state; use React Query for
  shared request caching; keep local presentation state local.
- Avoid introducing a second global store, styling framework, or design system without a concrete
  approved need.
- Lazy-load route and heavy artifact boundaries where the current architecture does so.

### Design and Responsive Behavior — CONFIRMED AND IMPLEMENTED

- `front-end/docs/design.md` is the canonical visual specification.
- The production interface is dark-only. A future light theme requires an approved design extension
  before implementation.
- Use Inter as the approved Universal Sans substitute and Geist Mono for technical captions.
- Use semantic tokens, flat surfaces, hairline boundaries, weight-400 typography, 8px standard
  cards/inputs, and pill-shaped interactions.
- Preserve the approved 20px chat-composer and 16px anchored suggestion-panel exceptions recorded
  in `front-end/docs/memory.md`.
- Switch primary mobile/desktop topology at 768px.
- Provide 44px touch targets below the desktop boundary where required.
- Prevent document-level overflow; individual panels own their scrolling.

### Accessibility and UI States — CONFIRMED AND IMPLEMENTED

- Use semantic buttons, links, forms, headings, landmarks, tabs, regions, and dialogs.
- Provide accessible names, keyboard operation, visible focus, deterministic focus entry/return,
  reduced-motion behavior, and non-hover-only access to essential controls.
- Intentionally represent applicable loading, empty, success, error, disabled, partial, paused, and
  permission-denied states.
- Maintain readable behavior with long text, zoom, narrow heights, mobile, tablet, and desktop
  viewports.

## Backend Requirements

### Architecture — CONFIRMED

- Keep transport concerns in controllers, application behavior in services, public schemas and
  protocols in `api_contract/`, agent execution in `langgraph_orchestration/`, provider logic in
  `llm_provider/`, and derived long-context memory in `vamp_memory/`.
- Register cross-subsystem implementations at the composition root and access them through typed
  runtime ports.
- Keep environment parsing and environment-specific validation in `config.py`.
- Initialize and close Firebase, Redis, checkpointing, Bedrock clients, Qdrant/VAMP work, and other
  long-lived resources through the application lifespan.

### API and Error Contracts — CONFIRMED AND IMPLEMENTED

- Keep authentication bootstrap/session routes unversioned for compatibility and mount product
  routes under `/api/v1`.
- Validate external JSON with strict Pydantic contracts where defined.
- Return stable public success/error envelopes and sanitized validation details.
- Encode streaming events as JSON SSE frames with heartbeat comments treated as transport-only.
- Do not expose stack traces, credentials, raw database/provider errors, or internal infrastructure
  details to clients.

### Data Ownership — CONFIRMED

- Firebase Authentication owns user identity.
- Firestore owns durable conversations, messages, execution results, settings/context, summaries,
  and task metadata.
- Redis owns shared expiring session/coordination state, quotas, rate limits, and production
  checkpoints.
- Qdrant owns derived summary vectors, not canonical conversation history.
- Remote relational data remains owned by the connected database.

## Security and Data-Integrity Requirements

### CONFIRMED AND IMPLEMENTED

- Verify Firebase session cookies, including revocation policy, on protected requests.
- Authenticate before reading protected session, database, conversation, or execution-result state.
- Enforce user ownership and administrator authorization on the backend.
- Enforce double-submit CSRF protection on state-changing cookie-authenticated routes except for
  explicit bootstrap exemptions.
- Require an explicit production CORS allowlist and shared production rate-limit storage.
- Apply request-body limits, response-security headers, IP rate limits, per-user quota, provider
  rate limits, and model authorization.
- Redact secrets and sensitive headers/bodies from logs and correlate requests with request IDs.
- Validate database targets against SSRF/blocked-host policy and validate SQL/identifiers before
  execution.
- Fail closed when identity, ownership, authorization, model selection, checkpoint source, or a
  protected mutation cannot be proven.

### IN PROGRESS

- Extend run/fence ownership checks to every protected action, artifact/result write, and terminal
  mutation.
- Make command admission, lease acquisition, and quota reservation one durable, idempotent decision.
- Recover finalization without replaying graph or protected external work.

## Reliability, Performance, and Operations

### CONFIRMED AND IMPLEMENTED

- Staging and production require shared Redis; in-memory session/checkpoint/rate-limit behavior is
  development-only.
- API documentation is available only in debug environments.
- Model selection, output tokens, request bytes, query rows/time, connection pools, context, and
  several agent budgets have configured bounds.
- Owned background tasks and external clients must be drained or closed during cleanup/shutdown.
- Production errors must be safe for users and actionable in correlated server logs.

### PARTIALLY IMPLEMENTED / UNKNOWN

- End-to-end hard bounds for streaming buffers, query-result bytes/chunks, protected effects, and
  recoverable finalization remain in later backend phases.
- Blocking database and Firestore operations are offloaded in many active paths, but the remaining
  synchronous storage paths require the tracked performance remediation.
- No sustained load/soak evidence establishes concurrency, latency, memory, Firestore contention,
  pool, or cost curves.
- Live Firebase, Firestore, Redis checkpoint saver, Qdrant, Bedrock, proxy, and supported-database
  behavior remains a production-shaped staging requirement.
- Dependency ranges are not a fully reproducible lock for the Python environment.

## Current Delivery Status

### Frontend

- Design-compliance Phases 0–6 are complete or complete with explicitly recorded fixture
  limitations.
- Automated component/model tests, focused design audits, ESLint, Knip, production builds, and a
  responsive browser matrix were recorded at phase closure.
- Current unresolved frontend risks are repeatable fixture coverage, the oversized Perspective
  vendor chunk, and large chat/sidebar presentation modules.

### Backend

| Remediation phase | Status |
|---|---|
| Phase 1 — Session and admission-control baseline | Complete |
| Phase 2 — Request, authentication, and security boundaries | Complete |
| Phase 3 — Ownership-safe LangGraph lifecycle and terminal durability | In progress |
| Phase 4 — Bounded streaming, tools, and query artifacts | Not started |
| Phase 5 — VAMP, skills, and typed contracts | Not started |
| Phase 6 — Storage, SOLID boundaries, and reproducible tooling | Not started |

The detailed task-level evidence and review state remain in `back-end/docs/memory.md` and
`back-end/docs/phases.md`.

## Known Limitations and Gaps

- Full agent command idempotency and terminal durability are not complete.
- Protected external actions and every stale-owner persistence path are not yet covered by the final
  common fencing contract.
- Aggregate query-result bytes/chunks and long-term Firestore document growth need hard limits.
- VAMP retry/dead-state handling and hard token budgeting remain scheduled work.
- The browser lacks repeatable live fixtures for connected-database SQL/schema/Perspective states,
  active streaming, guided confirmation, pause/error states, and authorized admin telemetry.
- Screenshot-based visual regression is not automated.
- The Perspective vendor bundle remains unusually large.
- Python dependency installation is not fully reproducible from exact locked versions.
- Production proxy, external-service, multi-worker, and database-role behavior requires staging
  validation.

## Product and Operational Unknowns

- Supported browser and minimum-version policy.
- Formal availability, latency, throughput, recovery, and cost objectives.
- Data-retention, export, deletion, backup, and disaster-recovery policies beyond implemented
  conversation deletion behavior.
- Product analytics, telemetry, consent, and privacy requirements beyond operational metrics.
- Accessibility conformance target and formal audit cadence.
- Supported deployment regions and data-residency requirements.
- Bedrock model availability policy by environment, tenant, or pricing tier.
- User-facing quota/pricing policy and whether quotas vary by account tier.
- Whether and when a canonical light theme should be designed.
- The approved repeatable test accounts and database fixtures for end-to-end validation.

## Proposed Next Priorities

1. Complete backend Phase 3 and prove truthful, recoverable terminal behavior without duplicate work.
2. Complete bounded streaming, protected-tool, and query-artifact controls in backend Phase 4.
3. Complete VAMP, skill, and typed-contract remediation in backend Phase 5.
4. Establish sustainable storage boundaries and reproducible Python tooling in backend Phase 6.
5. Add deterministic frontend fixtures and automated visual/end-to-end coverage for currently
   inaccessible states.
6. Resolve the product and operational unknowns above before treating them as commitments.

## Related Documents

- `front-end/docs/design.md` — canonical frontend design specification.
- `front-end/docs/architecture.md` — current frontend architecture.
- `front-end/docs/rules.md` — frontend engineering constraints.
- `front-end/docs/memory.md` — frontend decisions, evidence, and known limitations.
- `front-end/docs/phases.md` — frontend design-compliance history and status.
- `back-end/docs/architecture.md` — current backend architecture.
- `back-end/docs/design.md` — backend design decisions and target invariants.
- `back-end/docs/rules.md` — backend engineering constraints.
- `back-end/docs/memory.md` — backend audit/remediation evidence and findings.
- `back-end/docs/phases.md` — backend remediation status and sequence.
