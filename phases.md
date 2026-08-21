# Moonlit Backend Agent Workflow Audit

Last updated: 2026-08-22

## Remediation program

- [x] Repository-only scope approved; live migrations and deployment changes are excluded.
- [x] Replacement-first architecture and focused phase ordering approved.
- [x] Design specification approved.
- [x] Phase 1 implementation plan written and executed.
- [x] Phase 1 — Session and admission-control baseline.
- [ ] Phase 2 — Request, authentication, and security boundaries.
- [ ] Phase 3 — Ownership-safe LangGraph lifecycle and terminal durability.
- [ ] Phase 4 — Bounded streaming, tools, and query artifacts.
- [ ] Phase 5 — VAMP, skills, and typed contracts.
- [ ] Phase 6 — Storage, SOLID boundaries, and reproducible tooling.

Remediation rules: one phase at a time; strict TDD; replace broken internal contracts instead of retaining compatibility bloat; update both audit journals at every checkpoint.

## Objective

Review the production workflow from `back-end/main.py` through request handling, conversation services, LangGraph orchestration, tools/skills, VAMP memory, and the final serialized agent response. Assess correctness, logical ordering, endpoint contracts, serialization/deserialization, security, performance, robustness, maintainability, and SOLID adherence. Production code is read-only during this audit; remediation will be proposed with evidence and priority.

## Status legend

- `[ ]` Not started
- `[-]` In progress
- `[x]` Completed
- `[!]` Blocked or validation-limited

## Phase 1 — Inventory and baseline

- [x] Map backend modules, entry points, runtime dependencies, configuration, and tests.
- [x] Record the repository baseline (test, lint, type-check, import/compile status).
- [x] Identify external-service tests that require Firestore, Redis, Qdrant, or Bedrock.
- [x] Record existing audit material without treating it as verified evidence.

Exit criteria: the executable architecture, available validation commands, and baseline health are documented.

## Phase 2 — End-to-end request and response trace

- [x] Trace app creation, lifespan initialization, middleware order, routers, and dependencies.
- [x] Trace the conversation endpoint from request model through service/orchestration boundaries.
- [x] Trace LangGraph graph construction, state transitions, model/tool loop, cancellation, and persistence.
- [x] Trace streaming event generation and final response serialization to the client.

Exit criteria: `memory.md` contains an evidence-backed sequence diagram in prose, with every major interface and state transition identified.

## Phase 3 — Core subsystem audit and focused tests

- [x] Audit and test `back-end/vamp_memory` retrieval, indexing, budget selection, tenancy, failure behavior, and cleanup.
- [x] Audit and test `back-end/skills` discovery, parsing, selection, prompt injection boundaries, and failure behavior.
- [x] Audit and test `back-end/langgraph_orchestration` state, prompts, tools, streaming, budgets, checkpoints, summaries, and task modes.
- [x] Evaluate test quality and add non-mutating probes where existing coverage is insufficient.

Exit criteria: each requested subsystem has explicit passing/failing/untested behaviors and linked evidence.

## Phase 4 — Contracts, security, performance, and robustness

- [x] Validate endpoint request/response models, status codes, error shapes, SSE/event schemas, and OpenAPI behavior.
- [x] Review serialization/deserialization at FastAPI, Firestore, Redis/checkpoint, Qdrant, LangChain message, and tool boundaries.
- [x] Review authentication, authorization, CSRF, CORS, rate/quota enforcement, tenant isolation, secret/log exposure, SQL/tool safety, and denial-of-service controls.
- [x] Identify avoidable startup/request latency, duplicated work, blocking I/O, unbounded data, concurrency races, and resource leaks.

Exit criteria: risks are ranked by severity and likelihood, with user/system impact and concrete remediation.

## Phase 5 — Architecture and SOLID review

- [x] Assess module responsibilities and dependency direction.
- [x] Assess interface segregation, substitutability, open/closed extension points, and dependency inversion.
- [x] Identify duplication, hidden global state, import-time side effects, and overly coupled components.

Exit criteria: SOLID findings distinguish pragmatic trade-offs from changes that materially improve reliability or testability.

## Phase 6 — Consolidation and final validation

- [x] Re-run the most relevant validation after all investigative probes.
- [x] Self-review every finding against code/test evidence and remove speculative claims.
- [x] Produce a prioritized remediation roadmap: immediate, near-term, and structural.
- [x] Report validation limits and external-service gaps explicitly.

Exit criteria: final report is evidence-backed, prioritized, actionable, and distinguishes verified defects from risks or coverage gaps.

## Work log

### 2026-08-22 — Remediation Phase 1 completed

- Atomic session partial updates: the Phase 1 focused command `env/bin/python -m pytest tests/test_dependencies.py tests/test_lua_merge_regression.py tests/test_rate_limiter.py -q` reported `40 passed in 0.21s` with zero failures.
- Trusted proxy resolution: the same focused command reported `40 passed in 0.21s` with zero failures, including the proxy topology cases.
- Full backend regression: `env/bin/python -m pytest -q` reported `220 passed in 6.54s`.
- Ruff: `back-end/env/bin/ruff check back-end` reported `All checks passed!`.
- Targeted production compile: `env/bin/python -m compileall -q config.py dependencies.py api_contract controller core langgraph_orchestration llm_provider service skills vamp_memory` exited 0 with no output. The SDD ledger records why nonexistent `middleware` and `model` plan paths are omitted.
- Self-review repaired the stale README tree reference to the deleted `upstash_saver.py`; active checkpointing remains `langgraph_orchestration/checkpointing.py` with `AsyncRedisSaver` in production and `InMemorySaver` in development.
- Remaining findings: 35 open; WF-001 and SEC-001 are closed. The Ruff portion of QA-001 is closed, while mypy and dependency reproducibility remain deferred to Phase 6 as approved.

### 2026-08-22 — Remediation Phase 1 / Ruff and dead-saver cleanup checkpoint

- Reference scan: from `back-end`, `rg -n "upstash_saver|AsyncUpstashRedisSaver" . --glob '*.py' --glob '!langgraph_orchestration/upstash_saver.py'` produced no output and exit status 1.
- Ruff RED: `back-end/env/bin/ruff check back-end/config.py back-end/controller/database_controller.py back-end/langgraph_orchestration/upstash_saver.py --output-format concise` reported 8 findings: controller `I001` and two `W291`; the saver `I001`, three `F401`, and one `W293`.
- Ruff GREEN: `back-end/env/bin/ruff check back-end` reported `All checks passed!` (exit 0).
- Compile: `cd back-end && env/bin/python -m compileall -q config.py dependencies.py controller langgraph_orchestration service` completed with exit 0 and no output.
- Full backend tests: `cd back-end && env/bin/python -m pytest -q` reported `220 passed in 6.45s` (exit 0).
- Changed `back-end/controller/database_controller.py` only for Ruff import sorting and the two documented trailing-space removals; deleted unreferenced `back-end/langgraph_orchestration/upstash_saver.py`; updated this journal and `memory.md`.

### 2026-08-22 — Remediation Phase 1 / trusted-proxy boundary checkpoint

- Red: `env/bin/python -m pytest tests/test_rate_limiter.py -q` reported 16 failed, 7 passed in 0.15s against the prior implicit private-network trust and permissive forwarding-header behavior.
- Green: the same focused proxy suite reported 23 passed in 0.09s after replacing it with real ASGI request topologies.
- `TRUSTED_PROXY_CIDRS` defaults to `127.0.0.1/32,::1/128`; testing pins the same tuple, explicitly empty configuration trusts no proxies, and invalid CIDRs raise during rate-limiter module initialization.
- Forwarded chains now resolve right-to-left to the nearest untrusted hop. Any malformed `X-Forwarded-For` or `X-Real-IP` value fails closed to the immediate peer.

### 2026-08-22 — Remediation Phase 1 / atomic session checkpoint

- Red: session tests failed because `_merge_state` and `_ATOMIC_MERGE_LUA` were absent and `update_session_data()` performed read/modify/write.
- Green: focused session tests passed with zero failures: 15 passed in 0.19s.
- Redis merge failures now fail closed; only the development in-memory fallback uses a process lock.
- Full replacement remains a separate `_write_state()` operation.

### 2026-08-21 — Audit initialized

- Confirmed a clean Git working tree before creating audit documents.
- Inventoried the backend and found existing unit tests plus prior security-audit documents.
- Identified `main.py` as the FastAPI composition/lifecycle entry and `composition.py` as the runtime-port wiring root.
- No production code has been modified.

### 2026-08-21 — Phase 1 completed

- Located the repository interpreter at `back-end/env/bin/python` (Python 3.14.4); default shell aliases were absent.
- Baseline pytest: 209 collected, 195 passed, 14 failed.
- Baseline Ruff: 9 violations across `config.py`, `controller/database_controller.py`, and `langgraph_orchestration/upstash_saver.py`.
- Baseline compile: passed; the broad command also compiled the virtual environment and surfaced only third-party Python 3.14 syntax warnings.
- Baseline mypy: not runnable because mypy is configured in `pyproject.toml` but not installed in the repository environment.
- Confirmed tests are designed to be hermetic; no current tests exercise live Firestore, Redis, Bedrock, or Qdrant integrations despite declared integration markers.
- Root-caused 9 test failures to removal of the Redis/in-memory atomic merge implementation while its regression tests remained. This is a production concurrency regression, not merely a stale test.
- Root-caused 5 rate-limiter failures to a code/test threat-model conflict: production code trusts every RFC1918/link-local peer while tests require explicit proxy trust and right-to-left XFF evaluation.
- Phase 2 request/response tracing is now active.

### 2026-08-21 — Phase 2 completed

- Traced chat/resume from Pydantic validation through auth, CSRF, ownership, quota, provider throttling, Firestore persistence, the LangGraph lease/checkpoint/context/model/tool loop, SSE translation, and assistant timeline storage.
- Confirmed with an isolated probe that a startup failure after prompt persistence stores both the user prompt and an empty final assistant message.
- Confirmed with Pydantic that the emitted `task_mode` SSE event is rejected by the documented `SseEvent` union.
- Confirmed with an in-process ASGI request that CSRF short-circuit responses omit the standard `status: error` field and all configured security headers.
- Identified an unbounded producer queue between the graph and slow SSE clients, broadening memory/availability risk for large tool events.
- Identified requested-vs-effective task-mode persistence drift and arbitrary model-ID acceptance.
- Recorded the canonical workflow and findings in `memory.md`; Phase 3 focused subsystem audit is active.

### 2026-08-21 — Phase 3 skills and VAMP checkpoint

- All four bundled skills parse successfully; focused skill/context/stream tests passed (26 tests).
- Confirmed the database skill is marked activated when a DB is connected but its instruction body is never injected; `read_skill` then returns `skill_already_loaded`, so the principal database workflow guidance is unreachable on the common path.
- Confirmed with async fakes that one permanent bullet embedding failure repeatedly returns success while persisting `partial`; it never calls the attempt/backoff/dead-state path.
- Confirmed the VAMP selector includes a 6,250-token unit under an explicit 10-token budget. This reaches the mid-turn memory tool verbatim and can also reach the post-summary prompt reload without the normal truncation pass.
- Confirmed session-state database names are interpolated into a system message without escaping; current database-name validation permits closing/injected XML-like tags.
- Confirmed the long-task segment runner configures limits `[50, 100, 200, 400]` and permits a simulated 750 steps under a declared 200-step budget because it adds the saved step twice.
- Confirmed a one-second task lease remains locally `acquired=True` after its renewal fails and the durable lease expires.
- Traced production finalization and found normal completion/interruption clears lease ownership before the ownership-guarded final compaction condition, so that compaction is skipped on real-model streams.
- Confirmed the shared tool budget executes 21 calls despite a declared maximum of 20, and malformed tool result serialization is converted to `success=True`.
- Production code remains unmodified; only the two audit journals have changed.

### 2026-08-21 — Phases 3–5 completed

- Completed source and focused-probe coverage of VAMP tenancy, retrieval, indexing, retry, deletion, and prompt/tool consumption; ownership is fail-closed and Qdrant filters both conversation and user, while partial-index retry and token-budget invariants are broken.
- Completed LangGraph lifecycle coverage across mode resolution, graph segmentation, leases, checkpoints, final compaction, tool execution, stream translation, cancellation, and history persistence.
- Generated the live OpenAPI document: only 11 of 37 routes publish concrete response schemas; chat/resume document an SSE schema, but that schema omits a real `task_mode` event.
- Confirmed Pydantic ignores undeclared request fields by default and a one-million-character Firebase token is accepted; no middleware rejects oversized request bodies before JSON parsing.
- Confirmed a bounded-row query can still create 501 Firestore chunks, while one atomic batch is used for every chunk and no aggregate result-byte limit exists.
- Confirmed SSE encoding emits JavaScript-invalid `NaN`/`Infinity`; the frontend's strict `JSON.parse` rejects that event and silently skips it.
- Confirmed full query-result persistence is synchronous inside the async tool pipeline, and raw database/tool exception text can reach the model, SSE client, and stored timeline.
- Confirmed the SQL AST gate accepts privileged, sleeping, file-access, and unknown user-defined functions inside a `SELECT`; safety therefore depends on unverified deployment role grants.
- Confirmed five database-metadata routes resolve cached DB state without Firebase authentication, so a revoked but still-cached session cookie can retain metadata access.
- Confirmed conversation IDs accept delimiter/path characters and are reparsed from a composite thread string, causing artifact-ID drift and late failures.
- Confirmed chat transport recovery has no idempotency/event replay contract; a disconnect retry creates another turn and can repeat tool/model work.
- Confirmed the public `done` frame precedes final persistence; closing at `done` reproduced a completed answer being stored as aborted, so terminal success is not currently a durability guarantee.
- Reviewed SOLID and dependency direction: protocol ports and the composition root are positive, but oversized coordinators, duplicated tool metadata, hidden process globals, import-time wiring, and concrete dependency escapes materially reduce SRP/OCP/DIP and test isolation.
- Installed-environment dependency audit reported no known vulnerabilities, while `pip check` reported version conflicts and requirements remain range-based without a reproducible lock/hashes.
- Phase 6 consolidation and final verification are now active; production code remains untouched.

### 2026-08-21 — Phase 6 completed

- Re-ran the full backend suite: 195 passed and the same 14 baseline regressions failed; no audit files affect runtime behavior.
- Re-ran Ruff: the same 9 baseline issues remain. Targeted compilation of production backend packages passed.
- Ran frontend ESLint and the Vite production build successfully; Vite reported large-chunk warnings, including the lazy analytics vendor bundle.
- Rechecked all 37 findings mechanically: 15 High, 20 Medium, and 2 Low; every entry includes severity, classification, evidence, impact, remediation, and validation.
- Consolidated a five-phase remediation roadmap ordered by hard security boundaries, ownership/durability, bounded work/backpressure, VAMP/contracts, then sustainable storage/architecture/tooling.
- Documented positive controls and the exact external-service, deployment, load-test, and environment limits of this audit.
- `git diff --check` passed. Git status contains only the requested untracked `phases.md` and `memory.md`; no production source was changed.
