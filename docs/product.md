# Product scope and outstanding work

Moonlit helps authenticated users explore relational databases through a streaming AI conversation and inspect reproducible query-result artifacts. This document owns requirements, deferred engineering work, and unresolved decisions. [Architecture](architecture.md) and feature guides describe implementation details.

## Users and journeys

Visitors can sign in or register through Firebase at `/` or `/login`. Authenticated users can manage owned conversations, database connections, settings, usage, and account deletion. Administrator telemetry requires the configured backend `ADMIN_UID`; frontend guards are navigation assistance.

The main journey is to sign in, optionally connect a database, choose an authorized model, ask a question, observe progress, inspect SQL/results/diagrams, and continue or revisit the conversation. Users can switch context, recover from supported interruptions, search/rename/delete conversations, and manage personal settings.

Current surfaces include:

- PostgreSQL, MySQL, SQL Server, and Oracle connection/metadata workflows.
- Read-oriented human and AI SQL, saved execution results, query history, and schema context.
- Streaming conversation history with upward page loading, saved outputs, and per-conversation SQL/artifact state.
- Bedrock model selection, capability-aware Low/Medium/High reasoning preferences, and workflow task modes.
- Perspective analysis, SQL editing, Markdown/code rendering, and React Flow diagrams.
- Personal dashboard/usage, account erasure, and backend-authorized administrator metrics.
- Light, dark, and system appearance modes, with runtime accent and profile controls and a 768px primary layout transition.

Database mutation, SQLite connections, additional LLM providers, voice/upload interfaces, branching, sharing, and regeneration/versioning are outside the current implemented scope. A new capability needs supporting behavior and contracts before exposing an affordance for it.

## Behavioral requirements

Identity, ownership, model authorization, database policy, and quotas are enforced on the server. Database metadata and generated output are untrusted. Results preserve execution/source provenance; a historical result must never imply it was executed against the current connection.

Supported AI and database preferences synchronize through the account settings API. Appearance preferences are stored locally in the browser under the signed-in account. The current settings reset applies immediately. The frontend maps `auto` task mode to `normal` on the wire, so it cannot always distinguish automatic classification from an explicit Standard choice. Reasoning effort and agent task mode have different meanings; see [conversations](features/conversations.md#models-and-task-modes).

Loading, empty, disabled, error, partial, and interrupted states must remain understandable and keyboard-accessible. Opening an artifact, changing layout, or navigating back to a cached conversation must preserve the correct session's draft/history/editor state and reject stale asynchronous completions.

Application code cannot establish external database least privilege, provider IAM, data residency, backups, or production availability. Those are deployment/product responsibilities.

## Engineering backlog

These items preserve unresolved work from the retired phase/memory journals. They are verification and remediation targets, not fresh security findings or claims that every subproblem remains unfixed. Historical finding IDs and evidence are retained in the [security register](security/findings.md).

| Area | Remaining work or verification |
| --- | --- |
| Agent lifecycle | Stable command identity and idempotent admission; protected-action reservations and fencing; recoverable finalization; truthful terminal ordering across failure/retry/resume |
| Work budgets | Prove total graph/tool/wall-clock bounds across continuations and provider calls; bound SSE queues/event sizes and maintain backpressure for slow clients |
| Cancellation | Verify per-driver timeout/cancellation behavior and accounting of underlying work after caller cancellation |
| Conversation storage | Migrate growing message arrays to sustainable bounded storage if needed; response pagination alone does not fix Firestore document growth |
| Query artifacts | Establish aggregate result-byte/chunk/storage ceilings; retain exact data semantics and honest truncation/export scope |
| VAMP | Verify bounded aggregate indexing, partial-vector retry/backoff/dead-state behavior, hard retrieval budgets, and cleanup recovery |
| Quota/accounting | Revalidate quota refunds for metadata/heartbeat-only or failed-start streams and provider lease/rate-limit accounting |
| Contract/quality gates | Complete HTTP/SSE schema coverage, remaining event-loop blocking/deadline work, typing debt, and reliable reproducible validation gates |
| Frontend | Maintain history-scroll and Perspective regression fixtures; improve repeatable live database/stream/pause/error/admin coverage and visual regression; investigate measured Perspective bundle cost |
| Production | Validate multi-worker coordination, proxy streaming, database roles/TLS/network policy, external-service failures, audit ingestion, erasure barriers, recovery, and load/cost limits |
| Account erasure | Provide and verify recovery when session cleanup or barrier finalization fails after Firebase identity deletion; define retention for rate-limit records, logs, and backups |

Immutable run policy, fenced leases, checkpoint generations, strict tool-result validation, locked Python dependencies, bounded model evidence, SQL snapshot contracts, and history response pagination exist in the current source. They do not by themselves close broader lifecycle, storage, or production-verification targets.

Debug identity fallback is restricted to absent cookies. Rejected sessions stay unauthenticated, and optional-authentication consumers preserve infrastructure and account-erasure errors. The [authentication regression record](security/findings.md#debug-authentication-bypass) describes the verified boundary and best-effort logout exception.

## Product decisions still needed

- Supported browsers and minimum versions; accessibility conformance target and audit cadence.
- Availability, latency, throughput, recovery, and cost objectives.
- Retention, export, backup, disaster-recovery, and deletion policy beyond implemented erasure behavior.
- Product analytics, consent, privacy, supported regions, and data-residency requirements.
- Bedrock model availability and quota/pricing policy by environment or tenant.
- Approved test accounts and database fixtures for repeatable end-to-end validation.

Track new decisions here or in the owning feature guide. Avoid a second delivery-status table in the README or separate frontend/backend journals.
