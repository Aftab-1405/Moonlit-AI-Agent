# Security findings and evidence

This is the maintained entry point for security findings, historical remediation evidence, and unresolved verification. Current authentication fixes have fixture-based regression evidence recorded below. Historical findings retain their original scope; local tests do not establish live-service or deployment guarantees.

## Evidence and status rules

Use separate labels for an observed source control, a historical test result, a fresh retest, and a deployment guarantee. The recorded labels below preserve previous work; they do not certify that a vulnerability remains present or has been freshly revalidated. An audit marked complete means its review units were visited, not that its findings were remediated.

Original finding IDs can collide between the workflow review and the later module audit (for example `STREAM-001`). Cite the review family and module, where applicable, as well as the ID. Do not merge similarly named IDs without comparing their attack paths.

The workflow findings below retain their historical IDs, severity, and verification targets. The later module review is summarized separately in `docs/security/module-findings.local.md`. That file is Git-ignored because it replaces private local reports; it is unavailable in an ordinary clone and must not be published without approval. `04-core-security-errors-audit-logging` belongs to the module review; its previously public CORE findings are retained below.

Historical reports and progress journals were consolidated after extracting their useful findings and regression requirements. Old line numbers, temporary test counts, and audit-completion checklists are not current evidence. Record a fresh disposition here after verification.

The October 25, 2026 backend review reports and evidence record a specific historical checkout. Read their findings and test counts in that scope. A current disposition requires checking the referenced behavior on the current revision.

## Previously recorded application fixes

The earlier remediation review recorded the following application-source remediations. Corresponding controls remain present in source; a new test pass is not claimed here.

| Finding | Recorded remediation | Remaining boundary |
| --- | --- | --- |
| Module audit `DEP-001` / `DEP-002` | uv lock/artifact-integrity workflow and updated MySQL dependency constraint | CI/production must consume the lock; future advisories need fresh scans |
| `API-001` | Raw ASGI body/frame limits before schema parsing | Edge/proxy limits and end-to-end deployment verification |
| `CORE-001` | SQL omission, structural secret redaction, safe database exception diagnostics | Independently examine other logging sinks and deployed log access/retention |
| `CORE-002` | Correlated privileged HTTP/agent SQL events, dedicated sink, delivery-failure telemetry | Multi-worker collection, tamper-resistant retention, ingestion and alerting |
| Workflow `CONTRACT-003` | Strict tool argument/result coverage, separate UI/model projections, safe legacy presentation | Continue producer/persistence/consumer and historical-fixture regressions |

The current [privileged-action policy table](../../back-end/core/audit_middleware.py) includes account deletion. Follow the table rather than a copied count. [Operations](../operations.md#audit-logging) owns the current logging deployment contract.

## Current source observations

### Debug authentication bypass

**Application fix verified on 2026-10-24.** The original [dependencies.py](../../back-end/dependencies.py) path replaced expired/invalid/revoked sessions with the development identity when debug bypass was enabled. The guard now requires an absent cookie; presented empty and rejected cookies reach 401. Staging/production configurations also disable debug mode.

The review also reproduced optional authentication swallowing infrastructure and account-erasure failures. It now converts only 401 to an anonymous result and preserves 503/409. [Logout](../../back-end/controller/auth_controller.py) handles verification outages explicitly so best-effort session-state removal and browser-cookie expiration remain available. That local logout does not guarantee Firebase-wide revocation during an outage.

[Authentication boundary tests](../../back-end/tests/test_authentication_boundary.py) cover rejected/empty cookies, absent-cookie bypass conditions, verified identity, Firebase outages, erasure denial, and logout cleanup. Six cases failed against the original code. The typing review also reproduced four malformed decoded-identity cases; projection now requires a nonempty string UID before account admission. All 17 final cases passed. The ASGI tests run real dependencies and account middleware with synthetic Firebase responses; no live Firebase or deployment was exercised.

## Workflow finding register

These titles describe the original findings. The disposition distinguishes later source/remediation evidence from work that still requires reassessment. Severity is historical prioritization, not a fresh exploitability rating. The recheck column preserves the required regression behavior after removing the original journal.

| Workflow ID | Historical severity | Original finding | Current disposition | Required recheck |
| --- | --- | --- | --- | --- |
| `WF-001` | Medium | Session state updates lost atomic merge protection | Atomic session merge remediation recorded; retain concurrency/Redis verification. | Concurrent session patches preserve independent fields in Redis and development fallback. |
| `SEC-001` | Medium | Trusted-proxy model permits forwarded-IP spoofing from broad private networks | Explicit trusted-proxy policy remediation recorded; verify deployed ingress CIDRs. | Test untrusted peers, malformed/spoofed XFF, and the deployed proxy chain against exact trusted CIDRs. |
| `QA-001` | Medium | The backend baseline is not green and static typing is not executable | Current working-tree unit suites, Mypy, Ruff lint/format, ESLint, Biome, and Knip passed after the quality fixes. Clean-clone CI and live integrations remain separate verification targets. | Rebuild the locked development environment; report pytest, lint, format, and typing separately from live integrations. |
| `STREAM-001` | High | Slow clients can cause unbounded in-process SSE buffering | Revalidate against current source before closure; retained in the engineering backlog. | Block the ASGI sender under a fast producer; bound queued events/bytes and propagate disconnect cancellation. |
| `STREAM-002` | Medium | Startup failures persist an empty final assistant message | Revalidate against current source before closure; retained in the engineering backlog. | Fail before output, after metadata/token/tool start, and on cancel/resume; reject empty successful assistant turns. |
| `CONTRACT-001` | Medium | Runtime SSE events and the declared event union diverge | Revalidate against current source before closure; retained in the engineering backlog. | Validate fixtures from every SSE producer against the public event union and frontend consumers. |
| `CONTRACT-002` | Medium | CSRF middleware bypasses the standard error/security response layers | Outer HTTP/error boundary remediation recorded; preserve boundary tests. | Assert common error schema and security headers on CSRF, auth, validation, rate limits, 404s, and unhandled failures. |
| `ORCH-001` | Medium | Requested and auto-detected task modes are persisted out of order | Immutable effective run-policy implementation recorded; retain resume/continuation checks. | Persist one effective mode/policy before execution; resume and continuation must use the same budgets. |
| `ORCH-002` | High | Checkpoint-clear failure intentionally continues on stale graph state | Immutable checkpoint generations implemented; verify failed copy/activation recovery. | Fail checkpoint copy/activation at each boundary; incomplete generations must never become resume sources. |
| `MODEL-001` | High | Authenticated callers can select arbitrary Bedrock model IDs | Application allowlist remediation recorded; deployment IAM verification remains. | Reject disallowed provider/model IDs before model construction, tokenization, quota, or provider work; verify IAM separately. |
| `DATA-001` | High | Conversation storage grows toward Firestore's single-document limit | Revalidate against current source before closure; retained in the engineering backlog. | Exercise long histories near Firestore document limits; response pagination must not be mistaken for bounded storage. |
| `QUOTA-001` | Low | Quota refund uses any SSE frame as proof of consumed model output | Revalidate against current source before closure; retained in the engineering backlog. | Fail before meaningful output and after metadata/heartbeat only; verify refund policy and counter consistency. |
| `SKILL-001` | Medium | Auto-activation authorizes database tools without loading the database skill | Current connected path preloads the database skill body; retain activation/context regressions. | Database auto-activation must load actual instructions before tool access, without duplicate skill/context insertion. |
| `VAMP-001` | High | Partial vector indexing bypasses retry attempts, backoff, and the dead-state circuit breaker | Revalidate against current source before closure; retained in the engineering backlog. | Inject partial embedding/upsert failures; require attempt accounting, backoff, dead state, and explicit recovery. |
| `VAMP-002` | High | VAMP's explicit token budget is not a hard cap | Revalidate against current source before closure; retained in the engineering backlog. | Use long memory bullets and document headers; count the complete rendered context against the requested budget. |
| `SEC-002` | Medium | User-controlled database names could spoof system-message structure | Trusted prompt/context boundary remediation recorded; retain injection regressions. | Use fabricated prompt delimiters in database/schema names; untrusted metadata must not become trusted instructions. |
| `ORCH-003` | High | Segmented LangGraph execution can exceed the advertised step budget by multiples | Revalidate against current source before closure; retained in the engineering backlog. | Force repeated graph segments and resume; total executed steps must not exceed the run budget. |
| `ORCH-004` | High | Lease-renewal outages fail open beyond durable lease expiry | Revalidate against current source before closure; retained in the engineering backlog. | Fail renewal beyond durable expiry; stale workers must stop protected work and cannot finalize a newer owner. |
| `ORCH-005` | High | Production finalization releases ownership before checkpoint compaction | Revalidate against current source before closure; retained in the engineering backlog. | Fail/cancel final compaction while a second run contends; ownership must cover protected checkpoint changes. |
| `TOOL-001` | High | Caller-visible timeouts do not stop blocking tool work | Revalidate against current source before closure; retained in the engineering backlog. | Block a driver past caller timeout; account for ongoing work and prove cancellation or drain before releasing resources. |
| `TOOL-002` | Low | The 20-call per-turn tool budget permits 21 executions | Revalidate against current source before closure; retained in the engineering backlog. | Attempt the configured tool count plus one; the extra call must fail before side effects. |
| `CONTRACT-003` | Medium | Tool-result validation failures are relabeled as successful results | Strict result contracts implemented; preserve UI/model privacy and malformed-result tests. | Probe unknown tools, empty/wrong-type results, private markers, bespoke emitters, and historical UI payloads. |
| `PERF-001` | Medium | `get_query_history` performs synchronous storage I/O on the event loop | Revalidate against current source before closure; retained in the engineering backlog. | Block the query-history repository while an independent heartbeat runs; event-loop progress must continue. |
| `API-001` | High | Request-size controls run only after the server has buffered and parsed the body | Raw request-body boundary remediation recorded; deployment limits remain separate. | Send oversized declared/chunked bodies and disconnect mid-body; reject before parsing and preserve error headers. |
| `DATA-002` | High | Query-result rows have no aggregate byte budget and can exceed the atomic-write envelope | Revalidate against current source before closure; retained in the engineering backlog. | Exercise wide rows, nested values, large binaries, and write batches near limits; enforce total serialized bytes. |
| `CONTRACT-004` | Medium | Non-finite database numbers produce invalid JSON SSE frames that the frontend silently drops | Current snapshot encoder represents non-finite values safely; retain end-to-end serialization coverage. | Serialize NaN/infinity and exact numeric types through live events, stored results, and frontend parsing. |
| `CONTRACT-005` | Medium | Most HTTP response contracts are untyped and some deserialization changes meaning | Revalidate against current source before closure; retained in the engineering backlog. | Validate real route responses, null/missing/error variants, and backward-compatible deserialization. |
| `SEC-003` | Medium | Raw database and tool exception text crosses the trust boundary | Safe database/tool error remediation recorded; revalidate any remaining sinks separately. | Put fabricated SQL/DSN/token markers in nested driver/tool exceptions; public output and selected logs must omit them. |
| `PERF-002` | High | Query-result persistence blocks the event loop and has no deadline | Revalidate against current source before closure; retained in the engineering backlog. | Block result persistence while heartbeat/lease tasks run; bound work and publish only retrievable execution IDs. |
| `QA-002` | Medium | Core agent lifecycle and external-adapter behavior lack regression coverage | Revalidate against current source before closure; retained in the engineering backlog. | Cover critical lifecycle state transitions with deterministic fakes, then opt-in adapter and deployed-proxy tests. |
| `ARCH-001` | Medium | SOLID boundaries exist, but oversized coordinators and duplicated registries defeat them on critical paths | Revalidate against current source before closure; retained in the engineering backlog. | Trace one run through thin boundaries; ensure each policy/registry has one owner and focused contract tests. |
| `SUPPLY-001` | Medium | Dependency installation is non-reproducible despite a clean installed-package vulnerability scan | Committed uv lock and integrity policy replace the old unlocked workflow; deployment consumption must be verified. | Install cleanly from the committed lock with artifact hashes; scan that exact environment and verify deployment consumption. |
| `DBSEC-001` | High | A syntactically read-only query can still execute privileged or side-effecting functions | Dialect-aware function policy implemented; least-privilege roles/UDF grants remain deployment work. | Deny dangerous and unknown functions in all dialects; independently verify database roles, grants, and resource limits. |
| `AUTH-001` | Medium | Several database-metadata endpoints use cached session state without authenticating the Firebase session | Authenticated database-context boundary remediation recorded; retain revoked-session tests. | Revoked sessions/outages must fail before cache reads, refresh, mutation, or DB calls; verified requests authenticate once. |
| `CONTRACT-006` | Medium | Conversation IDs are loosely validated and later parsed from a composite thread string | Canonical conversation UUID/owner validation implemented; preserve resource-boundary tests. | Reject delimiter/path/noncanonical IDs and unowned/missing resume IDs before quota; use direct IDs for artifact ownership. |
| `STREAM-003` | Medium | Chat streaming has no request idempotency or event replay contract | Revalidate against current source before closure; retained in the engineering backlog. | Disconnect at prompt/tool/result/final-write boundaries; retry must not duplicate committed turns or protected actions. |
| `STREAM-004` | High | The terminal `done` event is emitted before final durability and can turn a completed response into an abort | Revalidate against current source before closure; retained in the engineering backlog. | Close immediately before/after internal completion and public done; done must imply durable final state without a stopped marker. |


## Priority verification boundaries

The following regression requirements retain the useful lessons from the retired remediation journals:

- **Dependency integrity:** verify reviewed declarations, lock metadata, artifact hashes, and a clean production install using the locked commands. A clean vulnerability scan does not prove artifact integrity or that deployed images consumed the lock. Preserve MySQL connector implementation and connection-path coverage. See [dependency policy tests](../../back-end/tests/test_dependency_management.py).
- **Request limits:** exercise declared, chunked, understated, malformed and duplicate content lengths, excessive frames, and disconnects. Reject oversized bodies before Firebase/model work, with common error envelopes and security headers. Proxy limits and aggregate concurrency need separate deployed tests.
- **Logging:** send fabricated SQL/DSN/token markers and mixed-case secret keys through relevant application/audit sinks and failure paths. A safe HTTP error does not prove safe logs. Keep SQL previews out of audit records; predictable SQL hashes are not a substitute for sensitive-data exclusion. See [core audit tests](../../back-end/tests/test_core_audit.py) and [core logging tests](../../back-end/tests/test_core_logging.py).
- **Audit delivery:** test selected success/denial/failure paths, actor attribution, request correlation, privacy, and payload-free sink-failure signals. Verify exactly one intended event per action. Multi-worker shipping, access, retention, and alerting are separate deployment checks. See [audit middleware tests](../../back-end/tests/test_audit_middleware.py).
- **Tool contracts:** trace registry → arguments → valid/malformed results → SSE → persistence → model/UI projections. Include unknown tools, empty dictionaries, private markers, unsafe web URLs, historical memory payloads, and canonical table metadata. Recompute driver and outer deadlines when operations become batches. See [tool-result contracts](../../back-end/tests/test_tool_result_contracts.py).
- **Checkpoint lifecycle:** copy every namespace, parent relationship, channel value, and pending write; verify completeness before activation. Unsupported savers fail closed. Publish resumable pauses only after child work is quiescent and required state is durable; test copy failures and fenced ownership transitions.
- **Reproducibility:** state the exact source and test scope. A dirty checkout with local ignored fixtures can pass while a clean clone fails or collects fewer tests. Verify tracked test/configuration coverage and distinguish local results from clean-clone or deployment evidence.

The [engineering backlog](../product.md#engineering-backlog) owns delivery priorities. Security review must still establish total stream/tool/provider budgets, slow-client backpressure, storage-byte ceilings, long-conversation growth, stale-owner effects, retry-safe finalization, and cleanup behavior with underlying work still running.

Production verification includes database TLS/roles/function privileges, SSRF/DNS behavior, Redis/checkpoint integrity and persistence, provider IAM/region behavior, Firestore/Qdrant cleanup, stream session lifetime, audit retention, and account-erasure worker recovery. Local source controls and fabricated regression fixtures do not prove these deployment properties.

The test bootstrap now forces testing configuration, disables dotenv/background memory/debug bypass, and replaces the application secret before imports. A subprocess regression with fabricated production values reproduced the earlier failure and verifies the override. This does not remove every ambient service credential or impose a global network ban; inspect fixtures and use a credential-free environment for local tests. Live integrations need separate controlled resources.

## Updating a finding

Record the review family/ID, reachable entry point and impact, source revision or precise working-tree scope, test/probe command and result, fixture/live-service boundary, remediation, and remaining deployment obligations. A finding is closed only when the relevant path is proven closed; archive age, source renaming, or another passing suite is insufficient.

Use `recorded fixed`, `retest required`, `verified open`, or `deployment verification` with dated evidence. Preserve legitimate unresolved issues when removing superseded plans. Do not convert historical counts or temporary screenshot paths into current assurance claims.
