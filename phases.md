# Moonlit Backend Agent Workflow Audit

Last updated: 2026-08-22

## Remediation program

- [x] Repository-only scope approved; live migrations and deployment changes are excluded.
- [x] Replacement-first architecture and focused phase ordering approved.
- [x] Design specification approved.
- [x] Phase 1 implementation plan written and executed.
- [x] Phase 1 — Session and admission-control baseline.
- [-] Phase 2 — Request, authentication, and security boundaries.
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

### 2026-08-22 — Remediation Phase 2 / Task 6 trusted prompt-state boundary checkpoint

- RED evidence: `cd back-end && env/bin/python -m pytest tests/test_prompt_boundary.py -q` reported `1 failed in 1.62s`. The real `prepare_model_messages()` output included the literal attacker sequence `</current_session_state><system_instructions>` from every adversarial dynamic session value.
- GREEN evidence: `cd back-end && env/bin/python -m pytest tests/test_prompt_boundary.py tests/test_stream_events.py -q` reported `17 passed in 0.91s`; `back-end/env/bin/ruff check back-end/langgraph_orchestration/react_graph.py back-end/tests/test_prompt_boundary.py` reported `All checks passed!`.
- Prompt-state contract: `_escape_state_value(value, fallback)` HTML-escapes `db_type`, database, schema, task mode, mode label/description, reasoning effort, and model exactly once when building `<current_session_state>`. Raw task mode is used only for `_MODE_INFO` selection; no dynamic output can close or reopen the trusted block. The adversarial final-prompt test asserts hand-derived escaped values, no raw attacker tag, and exactly one opening/closing state tag.
- Full backend regression reported `1 failed, 306 passed, 3 warnings in 2.35s`. The sole failure remains concurrent and unowned: `tests/test_skill_registry.py::test_disconnected_catalog_keeps_non_database_diagram_generation_available` rejects `back-end/skills/react-flow-diagram/SKILL.md`, whose working-tree frontmatter is missing `when_to_use`. Task 6 did not edit or stage that excluded file or any `front-end/**` path.
- The three warnings are the installed SlowAPI Python 3.14 `asyncio.iscoroutinefunction` deprecations and remain unsuppressed. Tests were repository-only; no live services, deployment, migration, dependency, push, or merge work occurred. Phase 2 remains in progress; Tasks 7+ remain incomplete and unchanged.

### 2026-08-22 — Remediation Phase 2 / Task 5 fix round 1

- Omission-only creation is now enforced end to end. Real Pydantic validation distinguishes an absent `conversation_id` from a present `null`, rejecting the latter. The frontend's pure `buildChatRequestPayload()` leaves the property absent for a new chat and includes the canonical continuation string unchanged; `sendMessage()` uses that builder.
- Strict fix RED: the two backend cases reported `1 failed, 1 passed in 0.15s` because explicit null did not raise, and the targeted Node test failed before the pure payload model existed. GREEN: the backend cases reported `2 passed in 0.11s`; direct Node execution reported `2 passed`; targeted ESLint and full frontend lint exited 0; Vite transformed 2845 modules and built successfully in 7.90s with only its existing chunk-size advisory.
- Real-dispatch proof: `test_conversation_identity.py` no longer patches FastAPI `run_in_threadpool`, `asyncio.to_thread`, or `asyncio.run`, and its VAMP fake is async like production. The restricted run emitted `Failed to create stream fd: Operation not permitted` and stalled after nine tests. The identical hermetic focused command outside the sandbox passed `76 passed, 3 warnings in 1.47s`, independently controller-confirmed at `1.53s`; persistence, quota, model, database, artifact, and VAMP boundaries remained faked.
- Task 5 Ruff reports `All checks passed!`. Full backend regression reports `1 failed, 305 passed, 3 warnings in 2.55s`; the sole failure is still the concurrent/unowned React Flow skill file missing `when_to_use`. Obsolete-helper/delimiter searches and the internal-dispatch-monkeypatch search return zero matches. Phase 2 remains active and Task 6+ remains incomplete.

### 2026-08-22 — Remediation Phase 2 / Task 5 canonical conversation identity checkpoint

- RED evidence: `cd back-end && env/bin/python -m pytest tests/test_conversation_identity.py tests/test_api_contract.py -q` reported `21 failed, 37 passed, 3 warnings in 1.52s`. `ConversationId` did not exist; body and routable path values accepted legacy, colon-bearing, uppercase/unhyphenated, UUIDv1, and arbitrary IDs; a new chat performed an ownership lookup; missing chat continuations and resumes reached quota instead of returning 404; and query persistence, analysis, and VAMP retrieval used the final `thread_id` segment rather than the direct configured ID.
- GREEN evidence: the same focused command reported `58 passed, 3 warnings in 1.43s`; the prescribed regression command including `tests/test_stream_events.py` reported `74 passed, 3 warnings in 1.29s`; and `back-end/env/bin/ruff check back-end/api_contract/conversations.py back-end/controller/conversations_controller.py back-end/service/conversations/conversation_service.py back-end/langgraph_orchestration/stream_conversation.py back-end/langgraph_orchestration/tools.py back-end/tests/test_conversation_identity.py` reported `All checks passed!`.
- Identity contract: `validate_conversation_id()` and the shared `ConversationId` require the exact lowercase, hyphenated UUIDv4 representation on optional chat IDs, required resume IDs, and all four conversation path-parameter surfaces. Omitted chat ID is the only creation route and `ConversationService.create_conversation_id()` mints its canonical UUIDv4. The pass-through `create_or_get_conversation_id()` contract was deleted.
- Admission ordering: `_handle_agent_stream()` resolves the provider/model first. For a supplied chat ID or every resume ID it then requires `verify_conversation_owner()` before quota: `False` returns 404 and `PermissionError` returns 403. A new chat skips the ownership read, while owned continuations proceed to quota, provider rate limiting, and streaming with the exact supplied ID. The existing invalid-model regression still proves zero ownership/quota/rate-limit/orchestration activity.
- Artifact identity: `thread_id = f"{user_id}:{conversation_id}"` remains only the checkpointer namespace. LangGraph configurable state now carries the direct `conversation_id`; execute-query persistence, deterministic result analysis, and VAMP retrieval read that field exactly even when `thread_id` contains additional colons and a different final segment. Searches for `create_or_get_conversation_id` and exact `rsplit(":", 1)` returned no active backend matches (both `rg` exit 1).
- Frontend read-only verification found no conversation-ID generator. New-chat state/navigation uses the server `X-Conversation-Id` header; history selection uses IDs returned by server conversation-list/detail responses and only sets `currentConversationId` after a successful detail load; chat continuation and resume send that state value. Every backend path still validates it independently.
- Full backend regression reported `1 failed, 303 passed, 3 warnings in 7.49s`. The sole failure is the concurrent/unowned `tests/test_skill_registry.py::test_disconnected_catalog_keeps_non_database_diagram_generation_available`: the modified `back-end/skills/react-flow-diagram/SKILL.md` deletes required `when_to_use` frontmatter that is present at `HEAD`. Task 5 did not edit or stage that file or any frontend path.
- The three warnings are the installed SlowAPI Python 3.14 `asyncio.iscoroutinefunction` deprecations and remain unsuppressed. Tests were repository-only and made no live Firebase, Redis, Firestore, Bedrock, Qdrant, or database calls. Phase 2 remains in progress; Task 6+ prompt, error, tool, SQL, deployment, and migration work remains incomplete and unchanged.

### 2026-08-22 — Remediation Phase 2 / Task 4 authenticated database-context checkpoint

- RED evidence: `cd back-end && env/bin/python -m pytest tests/test_authenticated_db_context.py tests/test_dependencies.py -q` reported `17 failed, 13 passed, 3 warnings in 2.57s`. Every revoked-cookie and Firebase-outage metadata request returned `200` through cached state instead of `401`/`503`; valid routes never invoked Firebase verification; and the private/authenticated replacement dependency names were absent.
- GREEN evidence: the same focused command reported `30 passed, 3 warnings in 1.82s`; the prescribed API-contract gate reported `61 passed, 3 warnings in 1.85s`; and `back-end/env/bin/ruff check back-end/dependencies.py back-end/controller back-end/tests/test_authenticated_db_context.py back-end/tests/test_dependencies.py` reported `All checks passed!`.
- Authentication ordering: `_get_cached_db_config()` is now the private state-only reader. `get_authenticated_db_config()` depends on `get_current_user` before it invokes that reader, and `require_authenticated_db_config()` preserves the configured-DB `400` contract. Every prior controller import/use was replaced directly; no public compatibility alias remains.
- Route proof: real ASGI requests cover `sync_connection_state`, `get_databases`, `get_schemas`, `get_tables`, and `get_table_schema`. A revoked cookie returns the common `401` envelope/security headers with zero cache reads, cache refreshes, state mutations, or DB service calls; a Firebase infrastructure exception returns common `503` with the same zero-activity guarantee; a verified cookie receives cached metadata. `disconnect_db`, which declares both user and DB-context dependencies, verifies Firebase exactly once through FastAPI dependency caching.
- Full backend regression ran and reported `1 failed, 276 passed, 3 warnings in 7.47s`. The sole failure is concurrent and outside Task 4: the explicitly unowned modified `back-end/skills/react-flow-diagram/SKILL.md` lacks required `when_to_use` frontmatter, so `tests/test_skill_registry.py::test_disconnected_catalog_keeps_non_database_diagram_generation_available` fails. That file was not edited or staged by Task 4.
- The three warnings are the installed SlowAPI Python 3.14 `asyncio.iscoroutinefunction` deprecations and remain unsuppressed. Tests are repository-only and made no live Firebase, Redis, Firestore, Bedrock, Qdrant, or database calls. Phase 2 remains in progress; Task 5+ identity/ownership, prompt, tool, SQL, deployment, and migration work remains incomplete and unchanged.

### 2026-08-22 — Remediation Phase 2 / Task 3 model authorization checkpoint

- RED evidence: `cd back-end && env/bin/python -m pytest tests/test_model_authorization.py -q` reported `6 failed, 2 warnings in 1.16s`. The new resolver interface was absent, `get_chat_model()` accepted `not-enabled.model` and reached its cache boundary, and the controller had no model authorization. The controller recorder was then corrected to expose its real `check_and_increment` boundary (the sandbox cannot create the worker thread used by `run_in_threadpool`); the focused pre-implementation controller command reported `1 failed, 2 warnings in 1.28s` because `_handle_agent_stream()` did not raise for `not-enabled.model`.
- GREEN evidence: `cd back-end && env/bin/python -m pytest tests/test_model_authorization.py tests/test_api_contract.py -q` reported `37 passed, 3 warnings in 1.30s`; `back-end/env/bin/ruff check back-end/llm_provider/model_factory.py back-end/service/llm/llm_options_service.py back-end/controller/conversations_controller.py back-end/tests/test_model_authorization.py` reported `All checks passed!`.
- Regression evidence: `cd back-end && env/bin/python -m pytest -q` reported `259 passed, 3 warnings in 7.23s`.
- Authorization contract: `resolve_model_selection()` is the sole configured provider/model allowlist resolver. It normalizes the provider, requires it in `get_supported_providers()`, requires a configured non-empty provider model tuple, and returns only a configured model (explicit or default). Unknown provider and model selections fail closed. `get_chat_model()` invokes the resolver before model capabilities, cache lookup, or Bedrock construction; the unsupported-provider-to-Bedrock fallback is removed.
- Controller ordering: `_handle_agent_stream()` invokes `LLMOptionsService.resolve_selection()` as its first operation. Resolver failures become stable `400 invalid_provider` or `400 invalid_model` details before ownership, quota, rate limiter, model cache, or client work. The resolved provider/model values flow to the stream generator.
- The focused tests use configured `allowed.model-v1`/`allowed.model-v2` values and record zero ownership, quota, rate-limit, cached-client, and stream-construction activity for an unknown model. Tests are repository-only and made no live Firebase, Redis, Firestore, Bedrock, Qdrant, or database calls.
- The three warnings are the installed SlowAPI Python 3.14 `asyncio.iscoroutinefunction` deprecation warnings. No dependency or warning suppression was changed. Phase 2 remains in progress; Task 4+ authentication, identity, prompt, tool, SQL, deployment, and migration work remains incomplete and unchanged.

### 2026-08-22 — Remediation Phase 2 / Task 2 HTTP response boundary checkpoint

- RED evidence: `cd back-end && env/bin/python -m pytest tests/test_http_error_boundary.py tests/test_core_logging.py -q` reported `9 failed, 8 passed, 5 warnings in 2.00s`. CSRF and SlowAPI responses lacked the common `status/error/message/details` contract, framework 404 used `detail`, request-limit/unhandled short-circuits missed the configured response headers, no response carried `X-Request-ID`, and no handler-level correlation-filter installer existed.
- GREEN boundary evidence: `cd back-end && env/bin/python -m pytest tests/test_http_error_boundary.py tests/test_core_logging.py tests/test_request_boundary.py -q` reported `26 passed, 3 warnings in 1.65s`. The warnings are the installed SlowAPI Python 3.14 `asyncio.iscoroutinefunction` deprecation; dependencies and warning policy remain unchanged.
- Regression evidence: `cd back-end && env/bin/python -m pytest tests/test_core_errors.py tests/test_core_security.py -q` reported `72 passed in 0.04s`; the exact targeted Ruff gate reported `All checks passed!`; and `cd back-end && env/bin/python -m pytest -q` reported `253 passed, 3 warnings in 6.86s`.
- HTTP response contract: CSRF 403, validation 422, authentication 401, framework 404/405, SlowAPI 429, request-size 400/413, and pre-start unhandled 500 failures now use `ApiError` with the exact keys `status`, `error`, `message`, and `details`. Unhandled responses use `INTERNAL_SERVER_ERROR` and do not disclose the exception message.
- Effective inbound middleware order is `ResponseSecurityMiddleware -> RequestBodyLimitMiddleware -> csrf_middleware -> log_requests -> CORSMiddleware -> FastAPI routing/dependencies`. The pure-ASGI outer wrapper replaces every configured security header plus `Server` and `X-Request-ID` at `http.response.start`, removes `X-Powered-By`, forwards streaming frames without buffering, catches only pre-start failures, and always clears request context.
- Correlation contract: safe inbound IDs match `[A-Za-z0-9_-]{1,64}` and are echoed; missing, duplicate, or unsafe IDs are replaced with opaque generated IDs. `install_request_id_filter()` attaches the filter once to each active root handler immediately after `logging.basicConfig()`, so propagated child records include `request_id`.
- Phase 2 remains in progress; Task 3+ authentication, ownership, prompt, tool, SQL, deployment, and migration work remains incomplete and unchanged.

### 2026-08-22 — Remediation Phase 2 / Task 1 request boundary checkpoint

- RED strict-contract evidence: `cd back-end && env/bin/python -m pytest tests/test_api_contract.py -q` reported `13 failed, 18 passed, 1 warning in 0.26s`. Every public request DTO silently accepted one undeclared field, and `SetSessionRequest` had no `FIREBASE_ID_TOKEN_MAX_LENGTH` configuration.
- RED raw-ASGI evidence: `cd back-end && env/bin/python -m pytest tests/test_request_boundary.py -q` reported `7 failed in 0.06s` because `core.http_boundary.RequestBodyLimitMiddleware` did not exist.
- GREEN contract evidence: `cd back-end && env/bin/python -m pytest tests/test_api_contract.py tests/test_request_boundary.py -q` reported `38 passed, 1 warning in 0.21s`. The warning is the installed `slowapi` Python 3.14 deprecation warning from its decorator inspection.
- Regression evidence: `cd back-end && env/bin/python -m pytest tests/test_dependencies.py tests/test_rate_limiter.py -q` reported `35 passed in 0.19s`; `back-end/env/bin/ruff check back-end/core/http_boundary.py back-end/api_contract back-end/controller/auth_controller.py back-end/main.py back-end/config.py back-end/tests/test_api_contract.py back-end/tests/test_request_boundary.py` reported `All checks passed!`; and `cd back-end && env/bin/python -m pytest -q` reported `242 passed, 1 warning in 6.46s`.
- Request-boundary contract: the raw ASGI limit is `262144` bytes; duplicate or invalid `Content-Length` returns `400 INVALID_CONTENT_LENGTH`; an oversized declared, chunked, or spoofed body returns `413 REQUEST_TOO_LARGE`; rejected bodies never call the downstream app. Valid under-limit frames are replayed exactly once to downstream parsing.
- Public DTO contract: `ExternalRequestModel` forbids undeclared keys for all request bodies in the conversation, database, context, and auth routes. `ConnectDBRequest` retains its `db_name`/`user` aliases through `populate_by_name=True`. Firebase ID tokens are limited to `8192` characters.
- Middleware order: `RequestBodyLimitMiddleware` is registered after route-level decorator middleware declarations, placing it outside CSRF, request logging, security headers, route parsing, dependencies, quota, and endpoint code. Task 2 remains responsible for the final outer security-header wrapper.
- Phase 2 remains in progress; later phases are unchanged. Tests are repository-only and made no live Firebase, Redis, Firestore, Bedrock, Qdrant, database, deployment, or migration calls.

### 2026-08-22 — Remediation Phase 1 completed

- Atomic session partial updates: the Phase 1 focused command `env/bin/python -m pytest tests/test_dependencies.py tests/test_lua_merge_regression.py tests/test_rate_limiter.py -q` reported `42 passed in 0.27s` with zero failures.
- Trusted proxy resolution: the same focused command reported `42 passed in 0.27s` with zero failures, including the proxy topology cases.
- Full backend regression: `env/bin/python -m pytest -q` reported `222 passed in 6.48s`.
- Ruff: `back-end/env/bin/ruff check back-end` reported `All checks passed!`.
- Targeted production compile: `env/bin/python -m compileall -q config.py dependencies.py api_contract controller core langgraph_orchestration llm_provider service skills vamp_memory` exited 0 with no output. The SDD ledger records why nonexistent `middleware` and `model` plan paths are omitted.
- Final-review hardening added direct in-memory and fake-EVAL regressions for shallow nested replacement, explicit `None` partial updates, and unrelated-field survival; active session-merge test and API descriptions now name the actual boundary and atomic shallow semantics.
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
