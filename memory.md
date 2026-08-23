# Moonlit Backend Audit Memory

Last updated: 2026-08-23

## Remediation decision log

### 2026-08-23 — Remediation Phase 2 / Task 10 fail-closed exception diagnostics

- `log_safe_exception()` is now a metadata-only diagnostic boundary. It records the stable operation name, exception class name, canonical `PublicError.code`, and current request ID, but never renders `str(exc)`, exception arguments, a `detail=` field, or traceback metadata. Heuristic redaction is not a security boundary because exceptions can echo arbitrary caller-controlled values.
- The obsolete `_LEAKAGE_PATTERNS`, `sanitize_error_message()`, and `sanitize_exception()` implementation and exports were removed after the repository call-site scan found no production consumer. The former helper unit tests were replaced with behavioral log-record assertions, including opaque token-like text, a single-label host, a password phrase, and IPv6. Firebase ID-token and database-pool fakes now echo their submitted values, and assertions inspect captured logging output instead of fake calls.
- Strict TDD: the required RED selection failed as intended with all four direct sentinels plus the submitted Firebase token and pool IPv6 value exposed in the current heuristic logs (`6 failed, 3 warnings`). GREEN passed `110` focused core-error/tool-safety tests with the three known SlowAPI Python 3.14 deprecations, and targeted Ruff passed. The required sanitizer-symbol scan returned zero Python hits; no compatibility alias remains.
- Verification is repository-only with existing fakes. No live Firebase, Redis, database, migration, dependency, deployment, remote, push, merge, Phase 3, or Task 11 action occurred. The unrelated React Flow skill and all dirty frontend paths remain unowned and unstaged.

### 2026-08-23 — Remediation Phase 2 reopened after final-fix re-review

- The scoped re-review of `1723f0b..c6fc196` confirms the validation serializer, bounded ASGI framing/disconnect handling, the four required stateful-SQL blocks, canonical coded-error forwarding, exact 8,192/8,193 token boundary, real-ASGI 405 contract, and typed model-selection reason. Those changes remain valid and their post-commit isolation gates remain green (`462 passed` for exact `HEAD`; `508 passed` for committed production plus the current local test corpus).
- Phase 2 is nevertheless **not closed**. `log_safe_exception()` still logs `sanitize_error_message(str(exc))`; direct probes prove all-letter tokens, single-label hosts, bare password text, and IPv6 survive unchanged. Because Firebase/Redis/database-pool boundaries can receive exceptions that echo caller-supplied values, the named active diagnostic boundary is not fail-closed and the final-review logging finding remains open.
- The Oracle sequence guard also introduces a verified Important false positive: `DatabaseSecurity.analyze_sql_query("SELECT e.NEXTVAL FROM employees e", dialect="oracle")` returns `is_safe=false` even though `e` is a table alias and `NEXTVAL` may be an ordinary qualified column. The guard must distinguish an actual sequence qualifier from a relation/alias in the parsed statement while continuing to block `my_seq.NEXTVAL` sequence advancement.
- Controller probes reproduced both findings exactly. Per the single final-fix-wave review rule, no second implementation loop was started during closure. The next work must be a dedicated focused correction with behavioral RED→GREEN coverage for input-adjacent exception logging and Oracle alias/column semantics, followed by one fresh scoped review. No deployment, migration, remote, push, merge, or unrelated working-tree action occurred.
- User authorization now explicitly opens that dedicated correction as Phase 2 Tasks 10 and 11. Task 10 replaces heuristic exception-message redaction with metadata-only correlated logging and removes the unused sanitizer API rather than retaining compatibility bloat. Task 11 uses SQLGlot scope resolution so relation-bound Oracle `NEXTVAL` columns remain allowed while unresolved sequence qualifiers stay blocked. Each task requires its own RED→GREEN commit and independent review before one final correction-range review.

### 2026-08-23 — Remediation Phase 2 final-review closure

- One safe validation serializer is authoritative at the HTTP boundary: it returns only normalized `loc` segments and stable Pydantic `type` values. Raw `input`, `ctx`, validation URLs/messages, passwords, DSNs, private hosts, SQL, tokens, and extra-field values never cross the 422 response. Real-ASGI probes cover all sentinels, the exact 8,192/8,193 Firebase-token boundary, and a 405 response with the common envelope, `Allow`, request ID, and security headers.
- `RequestBodyLimitMiddleware` now aggregates accepted bytes into one bounded `bytearray`, checks capacity before extending, replays one minimal request frame, caps inbound frames at 1,024, and stops before downstream execution on excess frames, excess bytes, unexpected messages, or `http.disconnect`. Missing `Content-Length`, exact 262,144-byte bodies, ordinary chunking, and unbuffered downstream responses retain their established behavior.
- The existing SQLGlot policy remains the sole SQL authorization source. Dialect AST guards reject SQL Server `NextValueFor`, Oracle unquoted sequence `.NEXTVAL`, MySQL `PropertyEQ` assignment with a parameter, and state-changing SQL Server table-hint variables such as `UPDLOCK`/`HOLDLOCK`; harmless `NOLOCK` and ordinary allowed queries remain valid. Analyzer, human execute, AI execute, and AI explain tests use the actual dialect and fail-if-entered database boundaries.
- Coded failures are untrusted at every forwarding boundary. Known codes discard paired text and resolve through `public_error_for_code`; unknown or malformed service codes become `TOOL_EXECUTION_FAILED` unless trusted controller code chooses a more specific fixed fallback. Host/connection-string failures, database controllers, tool schemas, tool budgets/loops/timeouts, web-search timeouts, custom writer events, SSE translation/encoding, and model summaries all retain canonical code/message pairs; safe counts and durations survive only as typed metadata.
- The active diagnostic boundary now calls `log_safe_exception()` with stable `PublicError` values for Firebase verification/revocation, Redis merge/read, database pool/acquisition/metadata, generic/query tool timeouts, and web-search timeouts. Sentinel assertions prove captured messages omit raw tokens, passwords, DSNs, SQL, hosts/IPs, queries, arguments, and exception text and have no traceback/`exc_info`. Broader scans still find pre-existing internal/background diagnostics in configuration/startup/schema, checkpoint/stream lifecycle and budget, context/Firestore/Qdrant/rate-limit, connection-service, and adapter code; those are outside the five named active paths and remain explicit later logging-hardening debt.
- Model selection uses `ModelSelectionError` plus `ModelSelectionReason.INVALID_PROVIDER` / `INVALID_MODEL`; the controller branches on the enum and preserves both 400 contracts and authorization-before-quota/client ordering. The shared fixed exception text is not parsed. No compatibility alias or duplicate resolver was retained.
- TDD evidence is layered: request/ASGI `9 failed, 18 passed, 3 warnings` → `69 passed, 3 warnings`; SQL `16 failed, 83 passed` → `146 passed`; canonical boundaries four core/stream failures plus 15 selected tool failures → core/tool/stream `46`/`69`/`19` passing; logging `8 failed` → `8 passed`; model selection `4 failed` → `8 passed, 2 warnings`; self-review host coverage `2 failed, 2 passed` → `4 passed`. The consolidated focused gate is `416 passed, 3 warnings in 2.85s`.
- Current-checkout attribution remains explicit: full backend is `1 failed, 507 passed, 3 warnings in 2.86s`, and the only failure consumes the concurrent unowned React Flow skill file missing `when_to_use`. An exact archive of staged tree `9a4b6cc867a6bba5090df7f70e3ebf3e32b0ff15` passes `462 passed, 3 warnings in 3.17s`, Ruff is clean, and targeted compile exits 0. A separate staged-production + current-local-tests overlay at `/tmp/phase2-final-overlay.JNnPkv` passes `508 passed, 3 warnings in 2.97s`. The 46-test delta is the ignored local core audit/security corpus; the newly expanded `test_stream_events.py` is intentionally force-added in this wave.
- Frontend request-contract/lint/build gates pass without touching the unrelated dirty frontend tree: one Node test passed, lint exited 0, and 2,845 modules built in 8.09s with only the existing chunk-size advisory. No dependency, migration, deployment, live service, network, remote, push, or merge action occurred. The final-fix report owns the exact post-commit archive evidence; Phase 2 remains complete only while those committed gates are green.

### 2026-08-23 — Remediation Phase 2 complete / Task 9 verification record

- Final contracts: `RequestBodyLimitMiddleware` rejects duplicate/invalid/oversized declared and streamed bodies before the downstream app; every external JSON DTO forbids undeclared fields. `resolve_model_selection()` authorizes an explicit/default model from a non-empty configured provider allowlist before ownership, quota, rate capacity, or model-client construction. Authenticated DB dependencies verify Firebase before cached state. New conversations are server-minted canonical UUIDv4 values; supplied continuation/resume/mutation IDs are canonical and ownership-checked before quota; artifacts and VAMP consume the direct typed ID. Prompt session state is escaped once inside exactly one trusted block. Public HTTP/SSE/tool/model/persisted failures resolve to stable canonical codes/messages with sanitized request-correlated diagnostics. SQL is parsed for the current MySQL/PostgreSQL/SQL Server/Oracle dialect and rejects dangerous and unapproved anonymous functions before database entry.
- Task 1–8 TDD evidence remains authoritative in the preceding checkpoint entries and reports. Consolidated RED→GREEN counts were: Task 1 `13 failed, 18 passed, 1 warning` plus `7 failed` → `38 passed, 1 warning`, followed by the overlong-length fix `1 failed, 7 passed` → `8 passed` / combined `39 passed, 1 warning`; Task 2 `9 failed, 8 passed, 5 warnings` → `26 passed, 3 warnings` (self-review case `1 failed` → `1 passed`); Task 3 `6 failed, 2 warnings` and corrected controller `1 failed, 2 warnings` → `37 passed, 3 warnings`, then empty-allowlist `1 failed` → `6 passed, 2 warnings` / combined `37 passed, 3 warnings`; Task 4 `17 failed, 13 passed, 3 warnings` → `30 passed, 3 warnings` / regression `61 passed, 3 warnings`; Task 5 `21 failed, 37 passed, 3 warnings` → `58 passed, 3 warnings` / regression `74 passed, 3 warnings`, then omission-only backend `1 failed, 1 passed` and failing Node contract → backend `2 passed`, Node `2 passed`, combined backend `76 passed, 3 warnings`; Task 6 `1 failed` → `17 passed`; Task 7 staged RED expansions `24 failed, 32 passed`, `15 failed, 56 passed`, `11 failed, 71 passed, 2 warnings`, common-envelope `1 failed, 3 warnings`, and persisted-reason `1 failed, 2 warnings` → focused `100 passed, 3 warnings` / affected `142 passed, 3 warnings`, with canonicalization review `139 passed, 3 warnings`; Task 8 `82 failed, 47 passed` → `129 passed` / database regression `171 passed, 1 warning` / safe-error regression `89 passed, 3 warnings`.
- Fresh Task 9 focused command: `cd back-end && env/bin/python -m pytest tests/test_api_contract.py tests/test_request_boundary.py tests/test_http_error_boundary.py tests/test_core_logging.py tests/test_model_authorization.py tests/test_authenticated_db_context.py tests/test_dependencies.py tests/test_conversation_identity.py tests/test_prompt_boundary.py tests/test_core_errors.py tests/test_tool_error_safety.py tests/test_database_adapters.py tests/test_sql_function_policy.py -q` exited 0 with `341 passed, 3 warnings in 2.69s`. The identical restricted-sandbox attempt stalled at the AnyIO worker boundary (`Failed to create stream fd: Operation not permitted`) and was interrupted; all authoritative pytest counts came from fresh runs outside that restriction with external services still faked.
- Current-checkout regression: `cd back-end && env/bin/python -m pytest -q` exited 1 with `1 failed, 448 passed, 3 warnings in 2.76s`. The sole failure is `tests/test_skill_registry.py::test_disconnected_catalog_keeps_non_database_diagram_generation_available`; its working-tree input `back-end/skills/react-flow-diagram/SKILL.md` is a concurrent/unowned edit missing required `when_to_use`. The dirty current checkout is therefore not claimed fully green, and that file was never edited, staged, restored, deleted, or copied into committed-state verification.
- Exact committed snapshot: a fresh explicit `/tmp` directory received only `git archive HEAD`, plus a symlink to the existing `back-end/env`. Because `.env` and the ignored `tests/conftest.py` are correctly absent from an exact archive, the first run produced seven configuration collection errors and the second, with explicit test variables but no allowlisted model, produced `5 failed, 382 passed, 3 warnings`; these were hermetic setup findings, not product defects. With `APP_ENV=testing DEBUG=true TESTING=true DEV_AUTH_BYPASS=true RATELIMIT_ENABLED=false VAMP_MEMORY_ENABLED=false LLM_RATELIMIT_ENABLED=false USER_QUOTA_ENABLED=false SECRET_KEY=test-only-secret-key-do-not-use-in-production-32chars BEDROCK_MODELS=task9-verification-model`, the exact committed `HEAD` suite exited 0 with `387 passed, 3 warnings in 2.70s`; `back-end/env/bin/ruff check back-end` returned `All checks passed!`; targeted production `compileall -q` exited 0 with no compiler diagnostics. Only the validated explicit temp directory was removed afterward.
- Supplementary isolation ruling: a second fresh archive overlaid **only** the checkout's `back-end/tests` and symlinked the same environment. Labelled `committed production + current local test corpus`, the same explicit test environment command exited 0 with `449 passed, 3 warnings in 2.86s`. All 13 Phase 2 planned test paths (`test_api_contract.py`, `test_request_boundary.py`, `test_http_error_boundary.py`, `test_core_logging.py`, `test_model_authorization.py`, `test_authenticated_db_context.py`, `test_dependencies.py`, `test_conversation_identity.py`, `test_prompt_boundary.py`, `test_core_errors.py`, `test_tool_error_safety.py`, `test_database_adapters.py`, and `test_sql_function_policy.py`) are tracked at `HEAD`. `.gitignore:148` nevertheless ignores `/back-end/tests/*`; ignored local `conftest.py`, `test_core_audit.py`, `test_core_security.py`, and `test_stream_events.py` explain the committed 387 versus local 449 collection gap. Tracking the complete hermetic corpus/configuration is deferred reproducibility work for Phase 6; no ignored test was mutated or staged.
- Static/frontend gates: `back-end/env/bin/ruff check back-end` itself exited 0 with `All checks passed!`; targeted `compileall -q config.py dependencies.py api_contract controller core langgraph_orchestration llm_provider service skills vamp_memory` itself exited 0 with no compiler diagnostics. The command wrapper emitted exactly three `Failed to create stream fd: Operation not permitted` diagnostics; those sandbox transport diagnostics were not Ruff or compiler findings. `cd front-end && node --test src/api/conversationRequestModel.test.js` exited 0 (one file/test passed, zero failed); `npm run lint` exited 0 with no ESLint finding; `npm run build` exited 0 after 2,845 modules in 8.54s, with only Vite's existing >900 kB chunk advisory. Unrelated dirty frontend files were read-only and remained unowned/unstaged.
- Security/scope scans: zero active `thread_id.rsplit`, `create_or_get_conversation_id`, `Depends(get_db_config)`/`Depends(require_db_config)`, direct raw-exception `HTTPException.detail`, source-inspection/mock-assertion tests, or production debug/TODO remnants. The class scan lists all 12 external request types as `ExternalRequestModel` subclasses, directly or through `BaseConversationRequest`; the focused behavioral parametrization proves all reject extras. A broad production raw-diagnostic search returned 74 lines: 14 deliberate active classification/sanitization inputs, two internal exception wrappers, one docstring, and 57 pre-existing raw server-log diagnostics outside Task 7's ruled paths. Those 57 occur in `config.py`, `main.py`, `dependencies.py`, `controller/{auth_controller,database_controller,database_schema_controller}.py`, `langgraph_orchestration/{checkpointing,stream_lifecycle}.py`, `service/context/{context_repository,context_service}.py`, `service/firestore/firestore_service.py`, `service/database/{connection_manager,connection_service}.py`, and the four database adapter modules. They do not assign raw text to an audited HTTP/SSE/tool/model/persisted field, but remain explicit logging-hardening debt. The narrow assignment scan returned only `friendly_error(str(e))`, `sanitize_error_message(str(exc))`, and two logger lines matched by the word `return`; no in-scope raw boundary defect was found.
- Whole-phase review: from start `6c92b8e5e2251a18a3dc652016d3a9d4d640992f` through implementation `7640d1e72d6d27d9ca3f6af682a17d95cb4c001b`, 51 files changed (`6,012` insertions, `601` deletions inside modified files; zero files deleted). Production paths reviewed: `back-end/README.md`; `api_contract/{common,context,conversations,database}.py`; `config.py`; `controller/{auth,context,conversations,database,database_schema}_controller.py`; `core/{errors,http_boundary,logging}.py`; `dependencies.py`; `langgraph_orchestration/{react_graph,stream_conversation,tool_schemas,tools}.py`; `llm_provider/{model_factory,token_budget}.py`; `main.py`; `service/conversations/{conversation_compaction_service,conversation_repository,conversation_service,conversation_streaming_service}.py`; `service/database/{ai_tool_executor,connection_handlers,database_service,operations,security}.py`; `service/llm/llm_options_service.py`; `vamp_memory/vamp_memory_service.py`; and frontend `src/api/{conversationRequestModel.js,conversationRequestModel.test.js,conversations.js}`. All 13 test paths named above plus `memory.md` and `phases.md` were reviewed. Middleware ordering, serialization/deserialization, auth-before-state, model/ownership/quota ordering, UUID ownership, prompt escaping, log correlation/redaction, canonical safe errors, SQL false positives/negatives, dead/debug code, compatibility remnants, formatting, and scope were clean. `git diff --check`, working-tree `git diff --check`, and cached `git diff --cached --check` all exited 0.
- Phase 2 implementation commits are `31c6f65`, `4fb7ea6`, `f373efc`, `bc2f10a`, `06324d8`, `b178ac9`, `463c257`, `8f0e0a0`, `c604c7a`, `72a5bcf`, `d2b1eda`, and `7640d1e`. The Phase 2 implementation diff contains no deleted file. Task 9 changes only this journal and `phases.md`, committed with the required subject `docs: record Phase 2 security verification`; no Phase 2 production defect was found during closure.
- Known/deferred work: the three final warnings are SlowAPI's installed Python 3.14 `asyncio.iscoroutinefunction` deprecations and were neither suppressed nor dependency-fixed. Deferred minors remain exact 8,192-character Firebase-token acceptance, real-ASGI 405 common-envelope/security-header/`Allow` coverage, a typed model-selection failure reason instead of `ValueError` text parsing, splitting the 1,210-line trust-boundary test module, the 57-line raw diagnostic logging sweep, and the broad ignored-test rule. Deterministic fake adapters prove application ordering and contracts but do not verify live Firebase/Firestore/Redis/Qdrant/Bedrock/database/proxy behavior, database driver timing, IAM, or tenant isolation.
- No live system, dependency, database role, migration, deployment, remote, push, or merge state changed. Before deployment, independently verify Bedrock IAM allowlists; tenant-scoped least-privilege database roles, revoked function grants, DBMS read-only transactions and resource limits; Firebase/session revocation; real external-adapter behavior; and proxy/header topology. Remediation Phase 2 alone is complete. Phase 3 is next **planning-only** scope; Phase 3+ remains unchecked and no Phase 3 implementation was performed.

### 2026-08-22 — Remediation Phase 2 / Task 8 dialect-aware SQL function checkpoint

- One policy now owns SQL authorization syntax: `DatabaseSecurity.analyze_sql_query(query, dialect=None)`. It maps `mysql→mysql`, `postgresql→postgres`, `sqlserver→tsql`, and `oracle→oracle`; retains the DDL/DML block; rejects the specified file/network/sleep/admin/locking/code-execution functions; and fails closed for every anonymous/UDF call outside one small dialect allowlist (`now`, `age`, `isdate`, or `numtodsinterval`). Typed ordinary SQLGlot aggregates/scalars and dialect date arithmetic remain usable.
- Stable function warnings contain only the normalized function and policy reason. Parser failures return only `SQL could not be safely parsed`; Task 7's `log_safe_exception()` retains sanitized, request-correlated internal diagnostics without traceback data or raw submitted SQL.
- Tool schemas use `dialect=None` only for the early union-allowlist check. Human execution, AI execution, and AI explain resolve the actual current database type before analysis and reject before adapter/connection/cursor/database entry. Cross-dialect tests prove an entry accepted by the generic union is rejected by the authoritative execution dialect.
- TDD/verification: RED `82 failed, 47 passed`; focused GREEN `129 passed`; database/API regression `171 passed, 1 warning`; Task 7 safe-error regression `89 passed, 3 warnings`; exact Ruff passed. Full backend is `1 failed, 448 passed, 3 warnings`; the sole failure remains the unowned React Flow skill frontmatter missing `when_to_use`.
- `DBSEC-001` is remediated at the application boundary as defense in depth. Deployment still must verify tenant-scoped least-privilege roles, function grants, DBMS read-only transactions, and resource limits against live supported databases. No live database, role, dependency, migration, deployment, push, or merge work occurred. Phase 2 remains active; Task 9 remains incomplete.

### 2026-08-22 — Remediation Phase 2 / Task 7 stable safe-error boundary checkpoint

- `PublicError(code, message)` is immutable. `public_database_error()` uses raw driver text only for in-process classification into the exact stable DB mapping; `public_tool_error()` supplies explicit tool/provider/HTTP contracts; and `log_safe_exception()` logs only sanitized, request-correlated detail without traceback rendering.
- Dict-style tool/database and status-style database results retain their established outer shapes and add `error_code`; generic wrappers use `TOOL_EXECUTION_FAILED`. SSE retains its declared `type/message` shape with stable messages. Conversation 403/404 `HTTPException.detail` uses the established `error/message` keys so Task 2's common `ApiError` boundary emits `CONVERSATION_ACCESS_DENIED` or `CONVERSATION_NOT_FOUND` as the public machine code.
- Raw exception fallbacks were removed from query/schema/explain/metadata tools, VAMP retrieval, result structuring, model/token initialization, compaction, cleanup retries, Redis/database HTTP helpers, conversation routes/streams, and VAMP vector-index retry persistence. The vector retry reason is exactly `[VAMP_VECTOR_INDEX_FAILED] Memory vector indexing failed.`. Successful structured-tool payloads were deliberately left unchanged; only error branches receive a code.
- Strict TDD evidence: the initial exact RED was `24 failed, 32 passed`; the database/context expansion was `15 failed, 56 passed`; the conversation HTTP/SSE/log expansion was `11 failed, 71 passed, 2 warnings`; the corrected real-ASGI common-envelope RED was `1 failed, 3 warnings`; and the VAMP persisted-reason RED was `1 failed, 2 warnings`. Final focused GREEN was `100 passed, 3 warnings in 1.60s`; affected regressions were `142 passed, 3 warnings in 2.15s`; targeted Ruff reported `All checks passed!`.
- The scoped raw-boundary audit leaves only deliberate internal uses: sanitizer/database classification in `core.errors`; provider/quota classification in the conversation controller; missing-table classification in the DB executor; validation chaining before the stable tool wrapper; recursion/rate-limit/context-window/friendly-error classification in the agent stream; and error-category classification in the conversation streaming service. No ruled file assigns raw exception text to public or persisted fields, and no ruled diagnostic uses `logger.exception` or `exc_info=True`.
- Full backend verification is `1 failed, 358 passed, 3 warnings in 2.59s`; the sole failure remains the unowned React Flow skill frontmatter missing `when_to_use`. The installed SlowAPI Python 3.14 deprecations remain unsuppressed. Repository-wide raw diagnostic hits outside Task 7's ruled files remain separate Task 9 triage; no live external service or deployment state was touched. `SEC-003` is closed for the audited paths, Phase 2 remains active, and Task 8+ remains incomplete.
- Task 7 fix-review closure: `d2b1eda` canonicalizes code/message resolution, restores unknown-column classification, and returns the canonical Firestore `503`; `139` covering tests passed with three known warnings, targeted Ruff passed, and the scoped re-review was clean. The two deferred Task 7 minors remain deferred.

### 2026-08-22 — Remediation Phase 2 / Task 6 trusted prompt-state boundary checkpoint

- `_escape_state_value(value, fallback)` now performs the one final HTML-escaping pass for every dynamic value emitted in `<current_session_state>`: database type/name/schema, task mode, selected mode label/description, reasoning effort, and model ID. Raw task mode selects `_MODE_INFO` only; escaped text is the only dynamic text emitted into the prompt state.
- Strict TDD evidence: `cd back-end && env/bin/python -m pytest tests/test_prompt_boundary.py -q` was RED with `1 failed in 1.62s`, proving the literal `</current_session_state><system_instructions>` attacker sequence reached the real final prompt. GREEN was `17 passed in 0.91s` for `tests/test_prompt_boundary.py tests/test_stream_events.py`; exact Ruff reported `All checks passed!`.
- `tests/test_prompt_boundary.py` passes adversarial db type/database/schema/task-mode/reasoning/model values containing closing/opening tags, ampersands, quotes, and angle brackets through `prepare_model_messages()`. It asserts independently hand-derived escaped values, absence of the literal attacker sequence, and exactly one trusted state opening/closing tag.
- Full backend verification is `1 failed, 306 passed, 3 warnings in 2.35s`. The only failure is the concurrent/unowned `back-end/skills/react-flow-diagram/SKILL.md` missing `when_to_use`; no Task 6 path or frontend path caused or was included in it. Phase 2 remains active; Tasks 7+ remain incomplete.

### 2026-08-22 — Remediation Phase 2 / Task 5 fix round 1

- The creation signal is now omission-only in both active callers and server validation. `ChatRequest` accepts an omitted `conversation_id` but rejects an explicitly present `null`; `buildChatRequestPayload()` omits the property for new-chat state and preserves a continuation's canonical string unchanged.
- Task 5 tests no longer replace `run_in_threadpool`, `asyncio.to_thread`, or `asyncio.run`; the VAMP boundary implements the production async interface. The sandbox-denied focused attempt emitted `Failed to create stream fd: Operation not permitted` and stalled after nine tests, so the exact hermetic command was rerun outside the sandbox with all external services still faked: `76 passed, 3 warnings in 1.47s` (independently controller-confirmed as `76 passed, 3 warnings in 1.53s`).
- Fix RED was `1 failed, 1 passed` for explicit-null versus omission and one failed Node test file before the payload model existed. GREEN was `2 passed` for the Pydantic cases and `2 passed` for the pure Node payload behavior. Task 5 Ruff, targeted frontend ESLint, full frontend lint, and the Vite build all pass.
- Full backend verification is `1 failed, 305 passed, 3 warnings in 2.55s`; the sole failure remains the concurrent/unowned `back-end/skills/react-flow-diagram/SKILL.md` missing `when_to_use`. Searches still find no obsolete creation helper or delimiter extraction, and no internal-dispatch monkeypatch remains in the Task 5 test. No Task 6+ or live-service work was added.

### 2026-08-22 — Remediation Phase 2 / Task 5 canonical conversation identity checkpoint

- Conversation identity is now server-owned and structurally typed. `validate_conversation_id()` plus the shared `ConversationId` accept only canonical lowercase, hyphenated UUIDv4 values for optional chat IDs, required resume IDs, and every conversation route path parameter. A chat body that omits the ID is the sole creation path; `ConversationService.create_conversation_id()` mints it, and the old client pass-through helper is deleted.
- `_handle_agent_stream()` preserves model authorization as the first admission gate. Supplied chat IDs and every resume ID then require existing ownership before quota, rate limiting, or stream construction: missing is 404, unowned is 403. New chats skip the ownership read. Exact event-order regressions cover new, owned, missing chat, missing resume, and unowned paths while replacing only persistence/quota/model-stream boundaries.
- LangGraph configurable state now carries both the namespaced `thread_id` used by the checkpointer and the direct `conversation_id` used by artifacts. Execute-query persistence, query analysis, and VAMP retrieval consume only the direct field. Tests deliberately pass `account:region:<different-id>` as `thread_id` and assert all three production consumers receive the exact configured canonical ID.
- TDD evidence: the exact RED command reported `21 failed, 37 passed, 3 warnings in 1.52s`; focused GREEN reported `58 passed, 3 warnings in 1.43s`; the prescribed stream regression reported `74 passed, 3 warnings in 1.29s`; and exact Ruff reported `All checks passed!`. Searches for `create_or_get_conversation_id` and exact `rsplit(":", 1)` returned no active backend matches.
- Frontend verification was read-only: new IDs originate in the response `X-Conversation-Id`; history IDs originate in server list/detail responses and become current only after a successful load; continuation/resume payloads forward that current value. No frontend conversation-ID generator was found, and no frontend file was edited or staged.
- Full backend verification reported `1 failed, 303 passed, 3 warnings in 7.49s`. The sole failure is the pre-existing concurrent skill edit removing required `when_to_use` frontmatter from `back-end/skills/react-flow-diagram/SKILL.md`; `HEAD` still contains it. That excluded file and all frontend changes remain untouched. No live services, deployment, migration, dependency, push, or merge work was performed. Phase 2 remains active and Task 6+ work remains incomplete.

### 2026-08-22 — Remediation Phase 2 / Task 4 authenticated database-context checkpoint

- Cached DB state is no longer a public route authentication source. `_get_cached_db_config()` remains the private state/persistence reader; `get_authenticated_db_config()` first resolves `get_current_user`, then reads or refreshes cached state; and `require_authenticated_db_config()` preserves the existing no-config `400` response. The old public `get_db_config` and `require_db_config` dependency names were deleted without aliases.
- All database, schema, context-refresh, chat, and resume controller imports/usages now depend on the authenticated names. FastAPI's dependency cache reuses the same `get_current_user` result when a route also declares the user explicitly, so Firebase verification occurs once per request.
- Real ASGI regressions cover the five metadata routes. Revoked cookies return common `401` responses and Firebase infrastructure failures return common `503` responses before any state read, activity refresh, mutation, or DB call. Verified cookies reach the cached config and production response models. Matching CSRF cookie/header values keep the POST test focused on authentication.
- TDD evidence: the exact RED command reported `17 failed, 13 passed, 3 warnings in 2.57s`; the first GREEN rerun reported `30 passed, 3 warnings in 1.82s`; the focused API/dependency gate reported `61 passed, 3 warnings in 1.85s`; and exact Ruff reported `All checks passed!`. The known warnings are SlowAPI's Python 3.14 `asyncio.iscoroutinefunction` deprecations and remain unsuppressed.
- The full backend command reported `1 failed, 276 passed, 3 warnings in 7.47s`. Its sole failure is caused by the concurrent/unowned modified `back-end/skills/react-flow-diagram/SKILL.md` missing required `when_to_use` frontmatter. Task 4 did not touch that file or any frontend path. No live Firebase, Redis, Firestore, Bedrock, Qdrant, database, deployment, or migration work was performed. Phase 2 remains active and later tasks remain incomplete.

### 2026-08-22 — Remediation Phase 2 / Task 2 HTTP response boundary checkpoint

- A pure-ASGI `ResponseSecurityMiddleware` is now the outer application boundary, immediately outside `RequestBodyLimitMiddleware`. It binds/sanitizes `X-Request-ID`, replaces all configured security headers plus `Server` at `http.response.start`, removes `X-Powered-By`, forwards streaming frames without buffering, emits a safe common 500 only before response start, and clears request context in all outcomes.
- Effective inbound order is `ResponseSecurityMiddleware -> RequestBodyLimitMiddleware -> CSRF -> request logging -> CORS -> FastAPI routing/dependencies`. This preserves Task 1 raw body-limit behavior while ensuring limiter, CSRF, validation, auth, rate-limit, framework HTTP, and unhandled failures receive the same headers and correlation ID.
- `api_error_response()` is the single `ApiError` response builder. Public failures have the exact keys `status/error/message/details`; SlowAPI 429 uses `RATE_LIMITED`; Starlette 404/405 errors are covered by registering the base Starlette HTTP exception; unhandled exceptions return `500 INTERNAL_SERVER_ERROR` with no raw exception message.
- `install_request_id_filter()` attaches `_RequestIdFilter` exactly once to every active root handler after `logging.basicConfig()`. The default log format includes `request_id=%(request_id)s`, while operator-provided `LOG_FORMAT` values remain authoritative.
- TDD evidence: the exact RED command reported `9 failed, 8 passed, 5 warnings in 2.00s`; the final focused boundary gate reported `26 passed, 3 warnings in 1.65s`; core error/security regression reported `72 passed in 0.04s`; targeted Ruff reported `All checks passed!`; and the full backend suite reported `253 passed, 3 warnings in 6.86s`. All three final warnings are the known installed SlowAPI Python 3.14 deprecation; no dependency was changed or warning suppressed.
- Validation was repository-local with real ASGI behavior and deterministic failure routes. The rate-limit test cuts only SlowAPI's configured external Redis header-injection boundary; no live Redis, Firebase, Firestore, Bedrock, Qdrant, database, deployment, or migration was used. Phase 2 remains active and later work remains incomplete.

### 2026-08-22 — Remediation Phase 2 / Task 1 request boundary checkpoint

- The public inbound boundary now rejects payloads before FastAPI parsing when a raw body exceeds `REQUEST_BODY_MAX_BYTES=262144`. It rejects duplicate, negative, non-numeric, and otherwise invalid `Content-Length` headers as `400 INVALID_CONTENT_LENGTH`, and oversized declared/chunked/spoofed bodies as `413 REQUEST_TOO_LARGE`. Errors use the standard `ApiError` JSON envelope; rejected requests never invoke the downstream app.
- Public request bodies now inherit `ExternalRequestModel`, whose Pydantic v2 `ConfigDict(extra="forbid")` prevents silent loss of client-supplied fields. `ConnectDBRequest` preserves its public field-alias support with `ConfigDict(extra="forbid", populate_by_name=True)`. `SetSessionRequest.idToken` is bounded by `FIREBASE_ID_TOKEN_MAX_LENGTH=8192`.
- TDD evidence: `env/bin/python -m pytest tests/test_api_contract.py -q` was RED at `13 failed, 18 passed, 1 warning in 0.26s`; `env/bin/python -m pytest tests/test_request_boundary.py -q` was RED at `7 failed in 0.06s`; the combined GREEN command was `38 passed, 1 warning in 0.21s`. Dependent boundary suites reported `35 passed in 0.19s`; Ruff reported `All checks passed!`; the full backend suite reported `242 passed, 1 warning in 6.46s`.
- The only warning is an installed `slowapi` Python 3.14 deprecation emitted while importing the existing auth-route decorator; no dependency or runtime configuration was changed to suppress it. Validation used a recording raw ASGI app and repository-local tests only—no live Firebase, Redis, Firestore, Bedrock, Qdrant, database, deployment, or migration calls.
- Phase 2 is now active at the Task 1 checkpoint. Later phase work remains incomplete.

### 2026-08-22 — Remediation Phase 1 completed

- Final session contract: partial session updates use one Redis Lua `EVAL` to shallow-merge only top-level fields, refresh TTL, preserve explicit `None` clears, and fail closed without a Redis `GET`/`SET` fallback. The development-only in-memory fallback protects every read/write/delete/merge access with one process `RLock`; full replacement remains `_write_state()`. Direct regressions now cover wholesale nested replacement, explicit `None`, and unrelated-field survival through both the in-memory path and deterministic fake-EVAL boundary.
- Final proxy contract: forwarding headers are considered only when the immediate peer matches configured `TRUSTED_PROXY_CIDRS` (loopback-only by default). Valid XFF is resolved right-to-left to the nearest untrusted hop; malformed XFF or X-Real-IP and multi-hop X-Real-IP fall back to the immediate peer. RFC1918 and link-local ranges are not implicitly trusted.
- Red/green evidence: atomic-session work was red at `10 failed, 5 passed in 0.25s` and green at `17 passed in 0.18s`; proxy work was red at `16 failed, 7 passed in 0.15s` and green at `23 passed in 0.09s`. The final-review contract regressions passed against the existing correct implementation, moving the combined focused gate to `42 passed in 0.27s` and the full backend gate to `222 passed in 6.48s`; Ruff reported `All checks passed!`; the actual-directory targeted production compile exited 0 with no output. TDD RED was inapplicable to this test-only coverage gap because no production behavior changed.
- Documentation hardening corrected the active session update description to atomic shallow merge semantics and identified Redis regression coverage as a deterministic fake-EVAL boundary rather than live integration testing.
- Changed/deleted files: modified `back-end/dependencies.py`, `back-end/config.py`, `back-end/controller/rate_limiter.py`, `back-end/controller/database_controller.py`, and `back-end/README.md`; added `back-end/tests/test_dependencies.py`, `back-end/tests/test_lua_merge_regression.py`, `back-end/tests/test_rate_limiter.py`, `phases.md`, and this journal; deleted `back-end/langgraph_orchestration/upstash_saver.py`. The final self-review removed the README tree entry for that deleted saver; active checkpointing is `langgraph_orchestration/checkpointing.py`.
- No live external systems were changed. Redis Lua is verified through a fake atomic `EVAL` boundary, not a live Redis server; Firestore, Qdrant, Bedrock, proxies, deployments, and migrations remain unexercised in live infrastructure.
- Phase 1 is closed. Phase 2 Task 1 implementation is complete at its request-boundary checkpoint; remaining Phase 2 work, later phases, mypy, and dependency reproducibility remain incomplete. Of 35 prior findings, WF-001 and SEC-001 are closed; the Ruff portion of QA-001 is closed.

### 2026-08-22 — Remediation Phase 1 / Ruff and dead-saver cleanup checkpoint

- Evidence: from `back-end`, `rg -n "upstash_saver|AsyncUpstashRedisSaver" . --glob '*.py' --glob '!langgraph_orchestration/upstash_saver.py'` produced no output and exit status 1, confirming no consumers before deletion.
- Ruff RED: `back-end/env/bin/ruff check back-end/config.py back-end/controller/database_controller.py back-end/langgraph_orchestration/upstash_saver.py --output-format concise` reported 8 findings: controller `I001` and two `W291`; the saver `I001`, three `F401`, and one `W293`.
- Ruff GREEN: `back-end/env/bin/ruff check back-end` reported `All checks passed!` (exit 0). Compile completed with exit 0 and no output using `cd back-end && env/bin/python -m compileall -q config.py dependencies.py controller langgraph_orchestration service`.
- Full backend tests: `cd back-end && env/bin/python -m pytest -q` reported `220 passed in 6.45s` (exit 0).
- Decision: remove the unreferenced `back-end/langgraph_orchestration/upstash_saver.py` without a stub or compatibility layer, and limit `back-end/controller/database_controller.py` to Ruff's exact import sorting and two trailing-space removals.

### 2026-08-22 — Remediation Phase 1 / trusted-proxy boundary checkpoint

- Evidence: `env/bin/python -m pytest tests/test_rate_limiter.py -q` was red at 16 failed, 7 passed in 0.15s and green at 23 passed in 0.09s after topology coverage replaced mock requests with real ASGI scopes.
- Decision: `TRUSTED_PROXY_CIDRS` defaults to `127.0.0.1/32,::1/128` and is pinned to that tuple by `TestingConfig`. An explicit empty value has no trusted proxies; an invalid CIDR raises `ValueError` during rate-limiter module initialization rather than silently widening the boundary.
- Decision: only forwarding headers received from an explicitly trusted immediate peer are considered. `X-Forwarded-For` is walked right-to-left; malformed XFF or X-Real-IP rejects the whole header and falls back to the immediate peer.

### 2026-08-22 — Remediation Phase 1 / atomic session checkpoint

- Red: session tests failed because `_merge_state` and `_ATOMIC_MERGE_LUA` were absent and `update_session_data()` performed read/modify/write.
- Green: focused session tests passed with zero failures: 15 passed in 0.19s.
- Redis merge failures now fail closed; only the development in-memory fallback uses a process lock.
- Full replacement remains a separate `_write_state()` operation.

- 2026-08-21: User authorized repository-code changes only. Live deployments, migrations, IAM, proxy, database-role, and external-service changes are not authorized and will be documented for later execution.
- 2026-08-21: User approved the safety-first phase ordering and explicitly rejected compatibility bloat. Broken internal contracts and storage layouts should be replaced, all repository callers updated in the same focused phase, and obsolete code removed.
- 2026-08-22: User approved the design specification at `docs/superpowers/specs/2026-08-21-mvp-agent-remediation-design.md`.
- 2026-08-22: Phase 1 implementation plan created at `docs/superpowers/plans/2026-08-22-phase-1-session-admission-baseline.md`. It is limited to session atomicity, trusted-proxy resolution, the 14 baseline test failures, and the nine Ruff findings. Redis merge failure is fail-closed; malformed forwarded chains fall back to the immediate peer. No production implementation has started.

This file is durable working context for the phased audit. It records verified architecture, commands, findings, open questions, and validation limits. Items are not considered defects until backed by source or test evidence.

## Scope and constraints

- Entry point: `back-end/main.py`.
- Critical subsystems requested: `back-end/vamp_memory`, `back-end/skills`, and `back-end/langgraph_orchestration`.
- Also in scope: endpoint contracts, serialization/deserialization, security, performance, robustness, and SOLID principles.
- Audit production code as read-only. Only `phases.md` and `memory.md` are intentionally created/updated unless the user later authorizes remediation implementation.
- Preserve the user's existing work; initial `git status --short` was clean.

## Verified architecture

- `main.py` builds the FastAPI app, configures middleware/error handling/router registration, and owns lifespan initialization/shutdown.
- `composition.py` is the declared composition root and registers concrete implementations behind ports from `api_contract.runtime_ports`.
- Lifespan initializes Firestore, optional Redis, LangGraph checkpointing, quota/rate limiting, static token budgets, Bedrock model clients, and optional VAMP memory maintenance.
- Staging/production explicitly require Redis and reject in-memory HTTP rate-limit storage.
- VAMP startup readiness failure is logged and treated as recoverable; maintenance is run as a background task when enabled.
- The test suite contains contract, security, rate limiting, database adapter, skill registry, stream-event, dependency, and regression tests, but lacks direct coverage of most VAMP and distributed orchestration state machines (`QA-002`).
- Existing `back-end/security-audit/` documents were used only as a cross-check; findings in this report were retained only when current source or a fresh probe supported them.

## Verified request-to-response workflow

1. `main.py` creates FastAPI, installs CORS plus request-log/security-header/CSRF middleware, registers error handlers, then mounts auth routes and `/api/v1` routes.
2. `ChatRequest`/`AgentResumeRequest` normalize and bound prompt/provider/model/basic options. Firebase authentication and session-derived DB config run as dependencies.
3. `_handle_agent_stream()` validates only the provider, verifies ownership for an existing conversation ID, debits user quota, and acquires a per-user/per-provider LLM limiter slot.
4. `ConversationStreamingService` reads the conversation and stores a new user prompt before invoking LangGraph. It also writes the requested task mode directly to Firestore.
5. `stream_conversation()` selects/builds the Bedrock model, acquires a Firestore conversation lease, manages the user-namespaced LangGraph checkpoint, retrieves VAMP context, calculates budgets, optionally summarizes, seeds recent Firestore history, and compiles a ReAct graph.
6. The ReAct prompt hook injects the base system prompt, current session state, context map, VAMP memory, bounded recent messages, task checkpoint, and current request. LangGraph alternates model and tool nodes under recursion/tool limits and a Redis/in-memory checkpointer.
7. Tools validate arguments with Pydantic, enforce skill gates and mostly run blocking DB work in worker threads with a wait timeout. Tool events are emitted through LangGraph's custom stream writer; tool results are split into a full UI payload and a compact model payload.
8. `translate_stream_part()` converts model/custom/update parts into public event dictionaries. `sse_encode()` JSON-serializes them without runtime event-schema validation.
9. The controller heartbeat wrapper drains the agent stream into an unbounded queue, forwarding data events or emitting heartbeat comments during idle periods.
10. `ConversationStreamingService` parses its own SSE back into dictionaries, accumulates the frontend-shaped timeline, strips full `execute_query` rows from persisted timeline entries, and stores an assistant message in Firestore during generator finalization.
11. The history endpoint later deserializes timeline `args`/`result` JSON strings and returns a flat conversation response; full query results are loaded from a separate Firestore subcollection endpoint.

## Executive assessment

The workflow is recognizable and mostly ordered correctly at the architectural level: transport/authentication → quota/admission → conversation persistence → ownership/lease/checkpoint → context/VAMP → model/tool graph → public events → history/artifacts. The code also contains deliberate production controls. However, the implementation is not yet a reliable production-grade agent runtime because several invariants fail at layer boundaries: step/lease ownership, terminal durability, stale checkpoints, result/event size, true query cancellation, model authorization, and memory retry/budget enforcement.

The key pattern is not “the whole design is wrong.” It is that individually reasonable layers use incompatible completion, budget, error, and ownership semantics. For example, LangGraph emits completion before outer persistence, a lease is considered locally owned after durable expiry, and a caller-visible timeout does not stop the underlying DB call. Those gaps are precisely where distributed agent systems duplicate work, lose state, or become unbounded.

## Positive controls verified

- Production/staging fails startup without Redis and uses the supported `AsyncRedisSaver`; the active default serializer has `pickle_fallback=False`, and no application-enabled unsafe pickle deserialization was found.
- Conversation reads, leases, Firestore history, VAMP retrieval, Qdrant search, and Qdrant deletion generally enforce user/conversation ownership. Qdrant deletion filters on both identifiers.
- Prompts, resume payloads, query length/row count, tool arguments, and most identifiers have meaningful Pydantic/parser bounds. SQL analysis rejects multiple statements and explicit nested DDL/DML nodes.
- Model/history/VAMP reference content and session-state metadata are escaped at their final prompt boundaries (`SEC-002` remediated in Phase 2 Task 6).
- The tool layer separates a full UI result from a smaller model result, caps query row counts, detects repeated tool signatures, and applies per-tool declared timeouts (with the cancellation limitation in `TOOL-001`).
- All four bundled skills load from the static registry, and their focused registry/context/stream tests pass. The defect is the connected-database activation state, not basic skill parsing.
- Central REST exception handlers avoid stack-trace exposure, CSRF comparisons are constant-time, sensitive request bodies are not logged, and no likely live hardcoded application secret was found by the scoped signature scan.
- Frontend lint and production compilation pass. The stream parser follows basic SSE framing, but silently drops invalid JSON and cancels on the prematurely emitted terminal event.

## Prioritized remediation roadmap

### Remediation phase A — Restore hard safety boundaries

1. Add a server-side Bedrock model allowlist and align IAM (`MODEL-001`).
2. Enforce pre-parse request-body limits and forbid undeclared external DTO fields (`API-001`).
3. Keep the completed dangerous-function policy as defense in depth and verify read-only/least-privilege DB roles, read-only transactions, and resource limits in deployment (`DBSEC-001`).
4. Require Firebase authentication for every database metadata route and sanitize all model/client/persisted errors (`AUTH-001`, `SEC-003`).
5. Fail closed when a checkpoint cannot be cleared; never continue structurally stale graph state (`ORCH-002`).

Exit gate: adversarial request/model/query/auth/checkpoint tests pass, and the production role/IAM assumptions are documented and verified in staging.

### Remediation phase B — Make one run ownership-safe and terminally durable

1. Fix LangGraph segment limits and add independent graph/tool/wall-clock budgets (`ORCH-003`, `TOOL-002`).
2. Make lease renewal fail closed before durable expiry and fence every state/tool mutation by run token (`ORCH-004`).
3. Compact/persist while ownership is valid; make completion results explicit (`ORCH-005`).
4. Move the public `done` event to the outermost coordinator after final checkpoint and assistant persistence (`STREAM-004`).
5. Add turn idempotency and an explicit disconnect/replay policy (`STREAM-003`, `STREAM-002`, `QUOTA-001`).

Exit gate: a clock-controlled lifecycle matrix proves one owner, bounded steps, truthful checkpoint status, durable completion-before-done, and deterministic disconnect/retry behavior.

### Remediation phase C — Bound work and restore backpressure

1. Apply per-cell/row/result/event byte caps before data is fully materialized (`DATA-002`, `CONTRACT-004`).
2. Replace the unbounded heartbeat queue with a bounded backpressured channel and disconnect propagation (`STREAM-001`).
3. Move query-history and artifact persistence off the event loop with RPC deadlines (`PERF-001`, `PERF-002`).
4. Enforce database-driver cancellation/statement timeouts and in-flight fairness; never report timeout while uncontrolled work continues (`TOOL-001`).

Exit gate: slow-client, wide-row, blocked-DB, blocked-Firestore, disconnect, and concurrency load tests remain within declared memory/time/queue/connection budgets.

### Remediation phase D — Repair VAMP and public contracts

1. Make partial indexing advance retry/backoff/dead state and retry only failed bullets (`VAMP-001`).
2. Enforce hard memory token/bullet bounds at creation, retrieval, post-summary reload, and tool output (`VAMP-002`).
3. Separate skill authorization from instruction loading (`SKILL-001`).
4. Resolve effective task mode once and carry a typed conversation/run ID instead of parsing strings (`ORCH-001`, `CONTRACT-006`).
5. Validate every emitted event/result, add the missing event DTO, normalize non-finite/legacy data, and add response models/status semantics (`CONTRACT-001/002/003/004/005`).

Exit gate: property/round-trip tests prove hard budgets and a shared backend/frontend contract from request through storage and replay.

### Remediation phase E — Sustainable storage and architecture

1. Migrate message arrays to paged/append-only subcollection documents with cursors and retention (`DATA-001`).
2. Restore atomic session partial updates (`WF-001`) and deploy explicit trusted-proxy configuration (`SEC-001`).
3. Introduce one immutable resolved-run context and authoritative `ToolSpec`; then split lifecycle, context, graph, and event/persistence responsibilities without a broad rewrite (`ARCH-001`).
4. Add the missing state-machine/adapter/contract suites, make mypy executable, restore a green lint/test gate, and lock dependencies reproducibly (`QA-001`, `QA-002`, `SUPPLY-001`).

Exit gate: clean locked builds are reproducible; unit/integration/contract/load tests are green; migration and rollback are exercised against production-shaped data.

## Evidence log

### Repository state

- Branch/HEAD at audit start: `moonlit-dev`, commit `369c449` (`feat: expand diagram workflows and chat experience`).
- `git status --short` produced no entries before audit documents were added.
- Python requirement: `>=3.12`.
- Ruff selects `E`, `F`, `W`, and `I`; line length and `E402` are intentionally relaxed.
- Pytest uses `asyncio_mode = auto`, strict markers, and declares `slow` and `integration` markers.
- Mypy is configured minimally and ignores missing imports.

## Findings register

### [WF-001] Session state updates lost atomic merge protection

- Severity: Medium
- Classification: verified defect
- Evidence: `dependencies.py:131-157,444-466`; `git show d5170ec`; 9 failing tests in `test_dependencies.py` and `test_lua_merge_regression.py`.
- Affected workflow: concurrent authenticated requests that update per-session database/settings/heartbeat state.
- Root cause: commit `d5170ec` removed `_ATOMIC_MERGE_LUA` and `_merge_state`, then changed `update_session_data()` to an unprotected read-modify-write through `_read_state()`/`_write_state()`.
- Impact: two same-session requests can read identical state and overwrite one another, losing database configuration, close/activity markers, settings, or other updates. Redis does not make a multi-command read/merge/write sequence atomic. The dev in-memory path is also unprotected across threads.
- Remediation: restore one atomic partial-update primitive. Prefer Redis transaction/Lua with a bounded, explicit fallback policy; use a process lock only for the development fallback. Keep full replacement separate from partial merge.
- Validation: retain and repair the existing concurrency/Lua regression tests; add an async multi-request Redis integration test.

### [SEC-001] Trusted-proxy model permits forwarded-IP spoofing from broad private networks

- Severity: Medium
- Classification: verified design risk and failing security regression tests
- Evidence: `controller/rate_limiter.py:48-122`; 5 failures in `test_rate_limiter.py`.
- Affected workflow: Layer-1 SlowAPI IP rate limiting on chat/resume and other decorated routes.
- Root cause: `_TRUSTED_PRIVATE_NETWORKS` treats all RFC1918 and link-local addresses as trusted proxies and walks XFF left-to-right. Tests and their threat model require only explicitly configured proxies and the nearest untrusted hop.
- Impact: a client that can connect from a trusted private range can choose `X-Forwarded-For` and rotate the rate-limit key, or attacker-prepended hops can be selected. User quota and provider limits reduce but do not eliminate unauthenticated/IP-layer abuse or unfairness.
- Remediation: configure exact trusted proxy CIDRs per deployment, trust forwarding headers only when the immediate peer matches, and walk the chain from the app outward (right-to-left) until the first untrusted hop. Validate/normalize forwarded IP tokens and define behavior for malformed chains.
- Validation: align code and the existing threat-model tests, then add deployment examples for direct Uvicorn, nginx, ALB, and Cloudflare chains.

### [QA-001] The backend baseline is not green and static typing is not executable

- Severity: Medium
- Classification: verified quality/release gap
- Evidence: full pytest has 14 failures; Ruff has 9 violations; `env/bin/python -m mypy .` fails because mypy is absent.
- Impact: CI cannot reliably act as a regression gate, and the large typed orchestration surface has no executable type-safety signal. Current failures also hide newly introduced defects.
- Remediation: restore a reproducible locked dev/test toolchain, fail CI on pytest/Ruff/mypy, and separate integration tests with explicit service fixtures.
- Validation: rebuild a clean environment from the locked toolchain and require zero pytest/Ruff/mypy failures before merge; keep external-service tests in a separately reported stage.

### [STREAM-001] Slow clients can cause unbounded in-process SSE buffering

- Severity: High
- Classification: verified defect
- Evidence: `controller/conversations_controller.py:105-153` creates `asyncio.Queue()` without `maxsize`; a producer task drains the full upstream graph independently of client send progress.
- Impact: a slow/disconnected client combined with fast token generation or large tool result events can accumulate arbitrary queued strings/objects, increasing memory until worker degradation or OOM. Heartbeats do not justify removing backpressure.
- Remediation: use a bounded queue (normally size 1-4), preserve downstream backpressure, cap every event/result size, and cancel/close the upstream generator promptly on disconnect. Measure queue depth and stream bytes.
- Validation: simulate a fast producer and blocked ASGI sender; assert queue depth remains bounded and producer cancellation reaches model/tool work.

### [STREAM-002] Startup failures persist an empty final assistant message

- Severity: Medium
- Classification: verified defect
- Evidence: `conversation_streaming_service.py:170-206,379-453`; isolated fake-streamer probe stored `user: "hello"`, emitted an SSE error, then stored `ai: ""` with `is_final_assistant_response=True`.
- Root cause: the prompt is always stored before orchestration; the generic exception marks a fatal error only when `not prompt_stored`; `finally` treats `prompt_stored` alone as sufficient to store an assistant response.
- Impact: history contains blank successful assistant turns after model/checkpoint/lease startup errors, corrupting turn semantics and summarization inputs. The module docstring claims the opposite behavior.
- Remediation: track meaningful assistant activity separately from prompt persistence; store an assistant record only for content/tool/intentional interrupt/partial output. Represent failed turns explicitly if product history requires them.
- Validation: tests for failure before first event, after metadata only, after token, after tool start, cancellation, and resume.

### [CONTRACT-001] Runtime SSE events and the declared event union diverge

- Severity: Medium
- Classification: verified contract defect
- Evidence: `stream_conversation.py:760-781` emits `type="task_mode"`; `api_contract/streaming.py` has no corresponding model. A `TypeAdapter(SseEvent)` probe rejects the emitted object with `union_tag_invalid`.
- Impact: generated clients and OpenAPI consumers cannot model a real first-frame event; backend and frontend can drift silently because `sse_encode()` never validates events.
- Remediation: add a typed `TaskModeEvent`, include every public event in one discriminated union, and route emission through a validating/typed serializer in tests (optionally validation-disabled only on the optimized production hot path after construction is typed).
- Validation: enumerate every runtime producer and require each emitted fixture to pass `TypeAdapter(SseEvent)` and the frontend consumer contract.

### [CONTRACT-002] CSRF middleware bypasses the standard error/security response layers

- Severity: Medium
- Classification: verified contract/security defect
- Evidence: `main.py:258-295`; in-process ASGI POST without CSRF returned `403 {error,message,details}` with no `status` field and none of the configured security headers.
- Root cause: CSRF is the outermost user middleware and returns its own `JSONResponse` before `add_security_headers` or centralized exception handlers run.
- Impact: inconsistent client deserialization and missing defense-in-depth headers on rejected mutating requests. Similar outer error paths need checking.
- Remediation: raise/translate one typed application error inside a middleware layout where a final response-header middleware wraps all responses, including short circuits and 500s; construct errors through `ApiError`.
- Validation: in-process ASGI tests for CSRF, validation, rate-limit, auth, 404, and unhandled-error paths must assert one error schema and the full required header set.

### [ORCH-001] Requested and auto-detected task modes are persisted out of order

- Severity: Medium
- Classification: verified logic defect
- Evidence: `conversation_streaming_service.py:194-206` stores the request's mode; `stream_conversation.py:579-585` acquires a lease with that mode; auto-classification occurs later at `714-789`, and the auto-upgrade never calls `run_lease.change_task_mode()`.
- Impact: a turn can execute with a 100/200-step effective budget while Firestore and the lease retain `normal`. Continue/resume may restore the wrong mode and budget; UI history can report a mode different from the executed turn.
- Remediation: resolve effective task mode once before persistence/lease acquisition, then pass the resolved immutable value through all layers. Persist it transactionally with task acquisition or immediately through the owned lease.
- Validation: mode-resolution tests for explicit, auto-upgraded, resume, and continuation flows must assert the graph limit, lease, Firestore record, SSE event, and history all use one value.

### [ORCH-002] Checkpoint-clear failure intentionally continues on stale graph state

- Severity: High
- Classification: verified robustness risk
- Evidence: `clear_checkpointer_thread()` declares failure fatal at `389-412`, but `stream_conversation.py:631-662` catches it and continues against the existing checkpoint with only a prompt nudge.
- Impact: stale unmatched tool-call state can be resumed into a new turn, causing provider ordering errors, repeated tool side effects, or mixing prior in-flight task state with a new request. Natural-language instructions cannot repair structural checkpoint invariants.
- Remediation: fail closed on checkpoint deletion for a new turn, or create a fresh immutable thread/run namespace and atomically retire the old checkpoint. Never use a prompt as a substitute for state integrity.
- Validation: inject deletion failures and unmatched tool-call checkpoints; assert no model or tool invocation occurs until a clean/fresh structural state is durable.

### [MODEL-001] Authenticated callers can select arbitrary Bedrock model IDs

- Severity: High
- Classification: repository remediation complete; deployment IAM alignment remains unverified.
- Original evidence: `ChatRequest.model` only bounded length; `_handle_agent_stream()` validated provider but not model; `model_factory.get_chat_model()` constructed any non-empty requested model rather than requiring it in configured provider models.
- Remediation evidence (2026-08-22): `llm_provider.model_factory.resolve_model_selection()` now normalizes provider input, requires a supported provider with a non-empty configured model allowlist, and returns only an explicit/default allowlisted model. `get_chat_model()` calls it before capability lookup or `_get_cached_chat_model`; the unsupported-provider-to-Bedrock fallback is removed. `LLMOptionsService.resolve_selection()` carries the same authoritative result into `_handle_agent_stream()` before ownership, quota, rate limiter, stream factory, or client/cache work. Resolver failures produce stable HTTP 400 `invalid_provider` or `invalid_model` details.
- Validation: `cd back-end && env/bin/python -m pytest tests/test_model_authorization.py tests/test_api_contract.py -q` reported `37 passed, 3 warnings in 1.30s`; the model tests patch `BEDROCK_MODELS` to `allowed.model-v1`/`allowed.model-v2`, prove default/explicit selection, reject unknown provider/model and an empty allowlist, prove an invalid factory request never reaches the cached client boundary, and use controller resource recorders to prove unknown model rejection has zero ownership/quota/rate-limit/stream-construction activity. `cd back-end && env/bin/python -m pytest -q` reported `259 passed, 3 warnings in 7.23s`.
- Remaining concern: this repository guard limits application-selected Bedrock IDs, but a deployment IAM policy must independently deny non-allowlisted Bedrock resources. That live-policy validation is outside the repository-only Task 3 scope.

### [DATA-001] Conversation storage grows toward Firestore's single-document limit

- Severity: High
- Classification: verified scalability/design defect
- Evidence: `ConversationRepository.store_message()` keeps every message and timeline in the `conversations/{id}.messages` array; summarization advances an index but does not delete/move source messages. Reads and append-on-resume rewrite/download the full document.
- Impact: long or tool-heavy conversations eventually exceed Firestore's document limit, after which message persistence, lease/task updates, ownership-adjacent reads, and history retrieval can fail. Latency and transaction contention grow before the hard failure.
- Remediation: store messages as bounded subcollection documents (or append log), keep only compact metadata/cursors in the conversation document, paginate history, and migrate existing arrays safely.
- Validation: migration tests preserve ordering/turn metadata; load tests append and paginate well beyond the old document limit with bounded read/write size and contention.

### [QUOTA-001] Quota refund uses any SSE frame as proof of consumed model output

- Severity: Low
- Classification: verified accounting defect
- Evidence: `_handle_agent_stream.sse_generator()` sets `stream_started=True` for heartbeat and metadata frames, while comments say refunds stop only once real LLM tokens were consumed.
- Impact: a delayed startup that emits a heartbeat or `task_mode`/usage event and then fails consumes user quota despite producing no model answer.
- Remediation: set a separate `billable_output_started` flag only for actual model/tool execution evidence according to an explicit billing policy.
- Validation: failures after heartbeat/task-mode/usage versus after model token/tool execution must produce the explicitly documented refund result.

### [SKILL-001] Auto-activation authorizes database tools without loading the database skill

- Severity: Medium
- Classification: verified logic defect
- Evidence: `stream_conversation.py:918-929` seeds `activated_skills=["database-querying"]`; `tools.py:191-218` treats that list as proof the skill is loaded; `tools.py:828-887` returns `skill_already_loaded` instead of the body for an activated skill. A focused probe confirmed the gate returns `None` and `read_skill` cannot return `<loaded_skill>` on this path.
- Impact: the common connected-database path can execute every specialized DB tool while never receiving the detailed read-only workflow, evidence, performance, and stopping guidance in `skills/database-querying/SKILL.md`. The base prompt and tool docstrings simultaneously tell the model to load it, creating contradictory behavior and making tool quality model-dependent.
- Root cause: one mutable list represents two different states: pre-authorized and instruction-content-loaded.
- Remediation: either inject `build_agent_context()` when auto-loading, or track `authorized_skills` separately from `loaded_skills`. The smallest safe change is to remove auto-activation until the instruction body is actually added to model context.
- Validation: test the connected-DB bootstrap through the first model invocation and assert the full database skill is present exactly once before a specialized tool can execute.

### [VAMP-001] Partial vector indexing bypasses retry attempts, backoff, and the dead-state circuit breaker

- Severity: High
- Classification: verified defect
- Evidence: `vamp_memory_service.py:302-373` gathers per-bullet exceptions, persists `status="partial"`, and returns normally; `_index_with_failure_record()` therefore returns `True` and never calls `mark_vector_failed()`. `summary_block_repository.py:503-584` selects every `partial` block on every maintenance pass. An async fake probe ran the same permanent failure twice: both calls returned `True`, both wrote `partial`, and neither wrote `failed`.
- Impact: one permanently invalid/oversized bullet is re-embedded every maintenance interval indefinitely. Successful sibling bullets are also re-embedded/upserted each time. This consumes Bedrock quota, Qdrant/Firestore capacity, and a limited retry batch slot; enough poisoned blocks can starve new memory indexing.
- Root cause: block-level success is defined as “the indexing coroutine did not raise,” while the state machine defines partial completion as retryable failure. Empty and failed bullets are also counted together.
- Remediation: validate and bound bullets before persistence; track failed bullet IDs; make partial completion increment the atomic attempt counter and apply backoff/dead-state policy, while avoiding re-embedding already indexed bullets. Return success only for terminal `indexed`/`no_bullets` outcomes.
- Validation: deterministic tests for transient recovery, permanent per-bullet failure reaching `dead`, empty bullets, partial retry backoff, retry-batch fairness, and no repeat embedding of successful bullets.

### [VAMP-002] VAMP's explicit token budget is not a hard cap

- Severity: High
- Classification: verified contract/performance defect
- Evidence: `budget_selection.py:88-96` deliberately selects the highest-priority unit when nothing fits. A probe selected an estimated 6,250-token bullet with `budget_tokens=10`. `tools.py:1263-1330` exposes this result through `retrieve_memory`, and `tool_schemas.py:584-596` passes it verbatim because it assumes the pipeline bounded it. `stream_conversation.py:1063-1081` also reloads post-summary VAMP context without repeating the earlier truncation step.
- Impact: an oversized summary bullet can consume far more prompt space than reserved, produce provider context-limit errors, inflate latency/cost, and create an unbounded tool result. This is especially likely because summary bullet count and text length have no deterministic maximum before embedding/persistence.
- Remediation: make the budget a true invariant. Truncate or split the highest-priority unit to the remaining budget; reject/bound bullet text during summary parsing; and enforce a final prompt/tool-result cap at every consumer, including post-summary reload.
- Validation: property tests asserting estimated selected tokens never exceed the requested budget, plus oversized single-bullet tests for initial retrieval, post-summary reload, and `retrieve_memory`.

### [SEC-002] User-controlled database names could spoof system-message structure

- Severity: Medium
- Classification: remediated prompt-injection boundary defect (Phase 2 Task 6)
- Original evidence: `react_graph.py:177-256` interpolated database/schema/model/session values without escaping into `<current_session_state>`. `api_contract/database.py:18-31,46-58` strips only SQL markers from database names and permits XML-like tag text. A probe produced a literal `</current_session_state><system_instructions>` sequence in the SystemMessage.
- Impact: a database name chosen by the caller or returned by a server can visually close the trusted state block and inject system-looking instructions. Model roles still provide some protection, but this defeats the repository's own tag-authority boundary and is inconsistent with the escaping applied to user/history/VAMP content.
- Remediation evidence: `_escape_state_value()` now escapes every dynamic state value exactly once at final construction, while raw task mode is retained only for static `_MODE_INFO` selection. The escaped final block contains one opening and one closing state tag.
- Validation: `tests/test_prompt_boundary.py` sends adversarial database/schema/model/task/reasoning values through `prepare_model_messages()` and asserts hand-derived escaped output, no literal attacker sequence, and exactly one well-formed state block; focused GREEN was `17 passed in 0.91s`.

### [ORCH-003] Segmented LangGraph execution can exceed the advertised step budget by multiples

- Severity: High
- Classification: verified defect
- Evidence: `_stream_graph_with_continuations()` reads saved metadata step and sets `config["recursion_limit"] = current_step + current_limit` at `stream_conversation.py:447-456`. The installed LangGraph loop already computes `stop = saved_step + config["recursion_limit"] + 1` in `langgraph/pregel/_loop.py`, so the saved step is counted twice. A deterministic fake-agent probe configured segment limits `[50, 100, 200, 400]` and simulated 750 executed steps before exhausting a declared 200-step budget.
- Impact: long/tool tasks can run far beyond user-visible and operator safety limits, multiplying model/tool cost, latency, DB load, and the window for runaway behavior. The emitted `recursion_limit` and prompt claims are false.
- Root cause: `recursion_limit` is treated as an absolute step number, but LangGraph defines it as the number of additional supersteps for that invocation. `consumed_steps` also increments by the intended segment size rather than actual granted work.
- Remediation: pass only `current_limit` for each segment and track actual completed deltas from checkpoint metadata. Add an independent total tool/model-call deadline and wall-clock cancellation budget.
- Validation: fake and real InMemorySaver tests must prove normal/tool/long modes never exceed 50/100/200 graph steps across multiple continuations.

### [ORCH-004] Lease-renewal outages fail open beyond durable lease expiry

- Severity: High
- Classification: verified concurrency defect
- Evidence: `stream_lifecycle.py:171-211` logs renewal exceptions and retains `acquired=True` indefinitely; it has no local monotonic expiry/failure threshold. A one-second fake-store probe showed `acquired=True` and `ownership_lost=False` after the renewal failed and the durable lease expired. Firestore permits another run to acquire an expired lease (`orchestration_access.py:104-143`).
- Impact: after an outage/delay, a second request can acquire the expired lease while the first continues model/tool/checkpoint work. Overlap can corrupt checkpointer ordering, duplicate expensive queries, and persist conflicting task/message state for up to the next successful renewal check (or indefinitely during an outage).
- Remediation: record the last confirmed lease deadline using monotonic time; retry renewals with bounded short backoff and cancel the stream before that deadline unless ownership is positively renewed. Use fencing tokens/run IDs on every downstream mutation and make query execution cancellation-aware.
- Validation: clock-controlled tests for transient recovery before expiry, expiry cancellation, ownership theft, blocked tool execution, and no writes from a fenced-out run.

### [ORCH-005] Production finalization releases ownership before checkpoint compaction

- Severity: High
- Classification: verified lifecycle defect
- Evidence: `TaskRunLease.complete()/interrupt()` set `acquired=False`; `stream_conversation.py:1337-1344` completes before `finally`, and `1421-1461` interrupts/releases first then only compacts when `(run_lease is None or run_lease.acquired)`. Thus real-model completion/error/cancellation skips final compaction. Even if the condition were removed, `check_and_perform_compaction()` persists via the now-released `task_run_id`, which the store rejects. The compaction helper also swallows failures, while the continuation path emits “checkpoint saved” and sets `_compaction_done` unconditionally.
- Impact: interrupted/resumable runs may lack the latest compact checkpoint, normal runs contradict the documented lifecycle, and the UI can claim durable progress was saved when it was not. Async-durability normal tasks are especially exposed to losing the last segment on disconnect/crash.
- Root cause: the fix for lease leakage reordered two operations whose ownership requirements conflict, without introducing a bounded ownership-safe finalization transaction/result.
- Remediation: perform bounded compaction while fenced ownership is valid, capture an explicit success result, then release in an unconditional shielded `finally`. If compaction cannot finish, persist an explicit recoverable status before release; never emit success or set `_compaction_done` on failure.
- Validation: production-like lease tests for normal completion, cancellation, generic error, recursion pause, compaction timeout/failure, and worker cancellation; assert both lease release and truthful durable checkpoint state.

### [TOOL-001] Caller-visible timeouts do not stop blocking tool work

- Severity: High
- Classification: verified availability risk
- Evidence: `tools.py:512-553` uses `wait_for(to_thread(...))`; cancelling that await cannot stop the worker thread or DB driver call. `ai_tool_executor.py:465-481` treats server-side statement-timeout installation as best-effort and proceeds when it fails. The same pattern exists for web search (with a stronger client-side timeout).
- Impact: the agent reports a timeout and can retry while the original query still occupies a pool connection and CPU. Repeated timeouts can exhaust thread/connection pools; late work can add query history, and lease loss/cancellation does not fence the underlying call.
- Remediation: enforce timeout/cancellation in each driver, fail closed if a safe query timeout cannot be installed, actively cancel/close the cursor/connection on timeout, and limit per-user/global in-flight DB work. Do not retry until cancellation is confirmed.
- Validation: blocking-driver fakes and live DB integration tests must show the server query and pool resource end at the deadline, including client disconnect and lease loss.

### [TOOL-002] The 20-call per-turn tool budget permits 21 executions

- Severity: Low
- Classification: verified defect
- Evidence: `tools.py:342-388` checks `total_calls > MAX_TOOL_CALLS_PER_TURN` before recording the current call. A probe allowed 21 unique calls with `MAX_TOOL_CALLS_PER_TURN=20`; only call 22 was blocked.
- Impact: one extra tool call can consume additional cost/time and makes the declared safety invariant false; impact is bounded to one call per turn under the current counter.
- Remediation: check `>=` before recording/executing or increment atomically then reject when the new count exceeds the cap. Include all tools, including UI and `read_skill`, in one counter according to explicit policy.
- Validation: boundary tests for calls 19, 20, and 21 plus mixed UI/read-skill/data tools; exactly the configured number may execute.

### [CONTRACT-003] Tool-result validation failures are relabeled as successful results

- Severity: Medium
- Classification: verified serialization defect
- Evidence: `tool_schemas.py:445-602` catches any result-model error and returns `{"success": True, "data": raw_result, "_structuring_error": ...}`. A probe with `row_count="not-an-int"` produced that success shape.
- Impact: malformed adapter output silently bypasses the declared contract; the UI and model can treat invalid/partial data as verified success, cache it, and base further queries or claims on it.
- Remediation: fail closed with `success=False`, a stable internal contract error code, and no raw unsafe payload to clients. Log schema errors with tool/run IDs; validate adapter result contracts in tests.
- Validation: malformed/missing/wrong-type outputs for every tool result schema must produce a typed failure and never enter cache, model evidence, or a success UI state.

### [PERF-001] `get_query_history` performs synchronous storage I/O on the event loop

- Severity: Medium
- Classification: verified performance risk
- Evidence: `tools.py:1170-1239` is a synchronous LangChain tool and directly calls `DBTools._get_query_history(uid)`. Although `TOOL_TIMEOUT_SECONDS` lists 10 seconds, this path never uses the shared thread/timeout executor.
- Impact: a slow Firestore/history read stalls the worker event loop, delaying every SSE stream and heartbeat handled by that process; the documented timeout is ineffective.
- Remediation: make it async and route it through the same bounded executor/async repository path, with datastore RPC deadlines and result-size caps.
- Validation: a blocking fake history store must time out without delaying an independent event-loop heartbeat; returned history remains size bounded.

### [API-001] Request-size controls run only after the server has buffered and parsed the body

- Severity: High
- Classification: verified availability risk
- Evidence: `main.py:232-295` has logging, security-header, and CSRF middleware but no raw-body/content-length limit. Request models use Pydantic's default `extra="ignore"`; a probe showed undeclared fields are discarded only after parsing. `SetSessionRequest.idToken` has no maximum and accepted a 1,000,000-character value.
- Affected workflow: every JSON endpoint, particularly unauthenticated session establishment and rate-limited chat/resume requests.
- Impact: a client can force workers to receive, buffer, decode, and allocate very large JSON bodies before field-level validation and endpoint rate limiting. Ignored fields make bounded declared fields insufficient, enabling memory/CPU exhaustion and slow-body pressure.
- Root cause: field validation is being treated as transport-level payload protection.
- Remediation: enforce a small deployment/server limit and an ASGI receive-wrapper limit before body buffering; reject invalid/missing/oversized `Content-Length`, cap chunked bodies while reading, set `extra="forbid"` on external request DTOs, and add a realistic Firebase token maximum.
- Validation: ASGI tests for oversized declared fields, oversized unknown fields, absent/spoofed content length, and chunked bodies; verify rejection occurs without invoking Pydantic, auth, quota, or agent code.

### [DATA-002] Query-result rows have no aggregate byte budget and can exceed the atomic-write envelope

- Severity: High
- Classification: verified scalability/availability defect
- Evidence: the AI query path caps row count but not aggregate cell/result bytes. `firestore_service.py:147-213` creates one batch containing the parent and every 700 KB chunk. A safe probe with a reduced chunk size produced 501 chunks from 501 bounded rows; the implementation has no chunk-count/write cap. `tools.py:581-600` attaches an execution ID even when persistence fails, and the full result is still emitted to the SSE UI payload.
- Impact: a result with a few large strings can consume hundreds of megabytes in the DB driver, Python objects, JSON serialization, SSE queue, browser parser, and Firestore writes. Large chunk counts exceed Firestore batch constraints, so persistence fails and the returned execution ID later resolves to 404. Combined with `STREAM-001`, this is a practical worker/browser OOM path.
- Root cause: `max_rows` is used as a proxy for response size, while neither cells, serialized result bytes, SSE frames, nor persistence write count are bounded.
- Remediation: enforce per-cell, per-row, aggregate-result, and per-event byte budgets while fetching; truncate with explicit metadata before materializing the full payload. Keep each persistence batch within documented limits or use bounded paged documents with a manifest and completion protocol. Do not advertise an execution artifact until durable storage succeeds.
- Validation: wide-row/large-string/binary/non-finite-value tests, maximum-batch boundary tests, persistence-failure contract tests, slow-client load tests, and browser heap/event-size checks.

### [CONTRACT-004] Non-finite database numbers produce invalid JSON SSE frames that the frontend silently drops

- Severity: Medium
- Classification: verified serialization defect
- Evidence: `stream_protocol.py:68-75` uses `json.dumps(..., allow_nan=True)` by default. A probe encoded `float("nan")` and `float("inf")` as bare `NaN`/`Infinity`. `front-end/src/utils/streamParser.js:53-59` uses strict `JSON.parse` and silently ignores failures; a Node probe rejected the frame with `SyntaxError`.
- Affected workflow: tool results containing non-finite floats (or overflowing float conversion), including valid analytical/database data.
- Impact: the entire `tool_end` event disappears, leaving the UI stuck or missing query evidence while the backend/model continues. The silent catch makes the contract failure hard to diagnose.
- Remediation: recursively normalize non-finite values to `null` or an explicit typed representation, serialize public JSON with `allow_nan=False`, and surface parser failures with bounded telemetry/user-safe error handling.
- Validation: shared backend/frontend fixtures for NaN, infinities, Decimal, datetime, UUID, bytes, and nested values; every emitted frame must be RFC 8259 JSON and accepted by the browser parser.

### [CONTRACT-005] Most HTTP response contracts are untyped and some deserialization changes meaning

- Severity: Medium
- Classification: verified contract/design defect
- Evidence: generated OpenAPI shows concrete 200-response schemas for only 11 of 37 routes. Auth, conversation history/artifacts/list/delete/rename, context/settings, quota, LLM options, and health responses are untyped. `_sanitize_messages()` leaves malformed JSON as a string, so `args`/`result` output types vary. `fetch_execution_result()` maps `total_rows=None` to `0` with `or 0`, even though `QueryResult.total_rows=None` deliberately means “unknown because truncated.” Context deletion handlers also return HTTP 200 with `status="error"` for operational failures.
- Impact: generated clients and frontend consumers cannot rely on stable shapes or status semantics. Unknown totals become false zeroes, malformed stored data changes field type per record, and operational errors can be treated as successful HTTP calls.
- Root cause: Pydantic contracts were applied to database routes but not consistently across older controller surfaces, and persistence DTOs are reused without an explicit versioned read model.
- Remediation: add response DTOs to every public endpoint, preserve `None` for unknown totals, normalize legacy timeline records into a single tagged shape, and use non-2xx status codes plus the common `ApiError` envelope for failures. Version persisted timeline/artifact schemas and migrate/read-adapt legacy records.
- Validation: OpenAPI snapshot/consumer contract tests plus round-trip tests from tool event → Firestore timeline/artifact → history/artifact endpoint → frontend parser.

### [SEC-003] Raw database and tool exception text crosses the trust boundary

- Severity: Medium
- Classification: remediated in Phase 2 Task 7 for the audited trust-boundary paths
- Evidence: `ai_tool_executor.py` returns `str(e)` from query, schema, explain, index, view, and metadata operations (for example `311-349`, `533-580`, `1007-1009`, `1412-1414`). `tools.py:554-573` also places raw exception text in `tool_end` and the model message. Those events are accumulated and persisted by `conversation_streaming_service.py:247-295`. The existing `core.errors.sanitize_exception()` is used by user-facing DB operations but not this agent path.
- Impact: driver errors can expose hosts, database/schema/table names, usernames, connection details, SQL fragments, filesystem/network data, or provider internals to the model provider, browser, logs, and durable conversation timeline. Persistence extends the exposure lifetime.
- Root cause: internal diagnostics and public/model-facing error contracts share one string field.
- Remediation: map exceptions at the adapter/service boundary to stable safe codes/messages; log full diagnostics only server-side with correlation/run IDs and explicit redaction. Reuse one sanitizer policy for REST, SSE, model ToolMessages, and persisted timelines.
- Validation: inject exceptions containing credentials, DSNs, private hosts, SQL, filesystem paths, and provider request IDs; assert none appear in client/model/persistence outputs while redacted correlated logs remain actionable.
- Remediation status: closed for the audited tool, provider, HTTP/SSE, model, cleanup/compaction, and VAMP retry paths. Final focused coverage is `100 passed`; the only full-suite failure is the separately owned React Flow skill-frontmatter edit. Repository-wide raw diagnostic logging outside the ruled Task 7 files remains a separate Task 9 hardening/triage item rather than a reopened public-boundary leak in these paths.

### [PERF-002] Query-result persistence blocks the event loop and has no deadline

- Severity: High
- Classification: verified performance/availability defect
- Evidence: after the DB call returns from `asyncio.to_thread`, `tools.py:581-600` directly invokes synchronous `store_execution_result()` inside the async `_execute_tool()` coroutine. That function serializes all rows, creates chunks, and commits Firestore synchronously. It is outside `TOOL_TIMEOUT_SECONDS` and the shared worker-thread timeout.
- Impact: one slow or large Firestore write stalls that process's event loop, delaying every concurrent agent token, heartbeat, lease renewal, and request. This compounds `ORCH-004`: a blocked renewal can let the durable lease expire while local work continues.
- Remediation: move bounded persistence to an async repository or bounded worker executor with RPC/application deadlines; persist before emitting a durable execution ID, and keep serialization/result sizes bounded per `DATA-002`. Consider decoupling artifact storage only if the event can truthfully represent pending/failed durability.
- Validation: a blocking fake store must not delay an independent heartbeat/lease task; verify timeout/cancellation behavior and truthful artifact status.

### [QA-002] Core agent lifecycle and external-adapter behavior lack regression coverage

- Severity: Medium
- Classification: verified coverage gap
- Evidence: the suite has 13 test modules and no dedicated VAMP, lease lifecycle, graph step-budget, checkpoint/Redis, query-artifact, slow-SSE-client, or backend/frontend contract test files. No collected test uses live Firestore, Redis, Qdrant, Bedrock, or a supported database. The single context-summary stream test heavily replaces the model, memory, persistence, and graph runner.
- Impact: the highest-severity defects in step budgets, lease expiry, final compaction, VAMP retry/budget behavior, event backpressure, and artifact serialization all passed the existing suite. Dependency/SDK upgrades can break runtime contracts without a release signal.
- Remediation: add deterministic state-machine/unit tests first, then container/emulator adapter tests and a small end-to-end fake-model workflow. Add shared JSON/SSE fixtures consumed by backend and frontend. Gate releases on a green hermetic suite; run opt-in external smoke tests in a secured staging pipeline.
- Validation: mutation/regression tests must fail before each verified defect is fixed and pass afterward; publish coverage by critical workflow rather than relying only on line coverage.

### [ARCH-001] SOLID boundaries exist, but oversized coordinators and duplicated registries defeat them on critical paths

- Severity: Medium
- Classification: verified maintainability/design risk
- Evidence: positive DIP/ISP foundations exist in `composition.py`, `api_contract/*_protocols.py`, and `runtime_ports.py`. However `stream_conversation.py` is 1,646 lines, `tools.py` 1,363, `ai_tool_executor.py` 1,414, compaction 1,101, and `vamp_memory_service.py` 873. Adding a tool requires synchronized edits across `ALL_TOOLS`, timeout/cache/skill maps, argument/result schemas, prompt guidance, and frontend handling; `TOOL_DISPATCH_TABLE` contains only one tool and explicitly is non-authoritative. Runtime ports, configuration, readers, model clients, VAMP stores, and caches use hidden globals/import-time wiring. `_latest_summary_block_idx_for()` bypasses the injected VAMP repository and imports the concrete `SummaryBlockRepository`.
- Impact: SRP is weak in the orchestration/tool coordinators; OCP is weak because extensions require scattered edits; LSP is violated when invalid tool output becomes `success=True`; DIP is locally bypassed; global caches make test order/reconfiguration fragile. The defects in `SKILL-001`, `CONTRACT-001/003`, and `ORCH-005` are concrete symptoms of this drift.
- Remediation: avoid a rewrite. First introduce one immutable, typed resolved-run context and one authoritative `ToolSpec` registry (function, schemas, timeout, cache, required skill, UI policy). Then extract ownership-safe lifecycle, context assembly, graph execution, and event/persistence coordination behind existing ports. Inject the VAMP repository all the way through and make app/container lifetime explicit with a test reset/override mechanism.
- Validation: architecture tests assert every registered tool has exactly one complete spec and public event/result schema; dependency tests forbid feature modules from importing concrete storage adapters; lifecycle tests use injected fakes without import-order patching.

### [SUPPLY-001] Dependency installation is non-reproducible despite a clean installed-package vulnerability scan

- Severity: Medium
- Classification: verified release/supply-chain risk
- Evidence: `requirements.txt` uses broad ranges and has no committed transitive lock or hashes; `pip-audit -r requirements.txt --disable-pip` cannot audit non-exact requirements. Auditing the installed environment reported no known vulnerabilities, but `pip check` reported incompatible Semgrep/MCP and OpenTelemetry package versions.
- Impact: clean deployments can resolve different SDK combinations, including LangGraph/Qdrant/Firebase behavior this code relies on, and the current development environment is internally inconsistent. A point-in-time clean vulnerability scan does not make future installs reproducible.
- Remediation: maintain separate locked runtime and dev/test dependency sets with hashes, rebuild the environment from the lock in CI, run `pip check` and `pip-audit` on that clean artifact, and define a controlled upgrade cadence with orchestration/serialization integration tests.
- Validation: two clean builds from the same commit produce identical package graphs; `pip check`, vulnerability audit, imports, tests, and startup smoke all pass.

### [DBSEC-001] A syntactically read-only query can still execute privileged or side-effecting functions

- Severity: High
- Classification: application boundary remediated; deployment controls require verification
- Original evidence: the former analyzer allowed every function call beneath a `SELECT`/set-operation root. Probes classified `pg_read_file`, `pg_sleep`, MySQL `LOAD_FILE`, and an unknown `custom_side_effect()` as safe, and both human and AI paths executed the original query after that gate.
- Impact: where the connected database role permits it, a user or prompt-injected model can read server files, invoke extensions/UDFs, initiate external activity, or deliberately consume backend resources despite the product's read-only claim. Application row limits do not constrain a sleep or side-effecting scalar function.
- Root cause: syntactic AST validation is being used as the main authorization boundary; database-role capabilities and function semantics are not enforced by the application.
- Remediation evidence (2026-08-22): the single dialect-aware analyzer now denies known dangerous functions and unapproved anonymous/UDF calls, and human/AI execute/explain paths recheck the authenticated/current DB type before database entry. Repository tests cover all four dialects while preserving approved aggregates, scalars, date arithmetic, and small explicit anonymous allowlists.
- Remaining validation: live integration tests must show the configured database roles independently reject these capabilities and enforce least privilege, read-only behavior, and resource limits. The parser remains defense in depth, not proof of harmlessness.

### [AUTH-001] Several database-metadata endpoints use cached session state without authenticating the Firebase session

- Severity: Medium
- Classification: remediated authorization defect
- Original evidence: the former `get_db_config()` derived cached credentials from the presented session-cookie value without calling `verify_session_cookie_value()`. `sync_connection_state`, `get_databases`, `get_schemas`, `get_tables`, and `get_table_schema` depended only on the unauthenticated cached-state dependencies.
- Impact: a stolen session cookie that has been revoked or otherwise fails Firebase authentication can continue using the cached database connection window to enumerate database, schema, table, and column metadata. Calling `get_db_config()` also refreshes session activity, extending cached state in some paths.
- Root cause: possession of a cache key is treated as authentication for selected read endpoints, conflating application session state with identity verification.
- Remediation evidence (2026-08-22): `_get_cached_db_config()` is private, and every former route consumer now uses `get_authenticated_db_config()` or `require_authenticated_db_config()`, both rooted in `get_current_user`. The old public names and aliases are absent.
- Validation: production-route ASGI tests prove revoked cached sessions return common `401`, Firebase outages return common `503`, and both outcomes perform zero cache reads/refreshes/mutations and zero DB calls. Verified cookies receive cached metadata, while routes that also request the user verify Firebase once through FastAPI dependency caching.

### [CONTRACT-006] Conversation IDs are loosely validated and later parsed from a composite thread string

- Severity: Medium
- Classification: remediated contract defect
- Original evidence: `ChatRequest`/`AgentResumeRequest` bound only conversation-ID length. Probes accepted `team:quarterly`, `segment/child`, and arbitrary non-UUID IDs. Tools derived the ID using `thread_id.rsplit(":", 1)[-1]`, so `user:team:quarterly` became `quarterly`. `_handle_agent_stream()` also ignored a `False` ownership result to support new chat creation, which let resume requests for nonexistent IDs proceed into quota/orchestration instead of returning 404.
- Impact: colon-bearing IDs persist query artifacts under the wrong conversation and make returned execution IDs unretrievable; slash-bearing IDs fail at Firestore path construction as a 500; nonexistent resume requests consume resources and fail late. The client/server contract does not state whether IDs are opaque, client-selectable, or UUIDs.
- Root cause: creation and continuation share one ambiguous path, and structured run identity is flattened into a delimiter-encoded string then reparsed.
- Remediation evidence (2026-08-22): new-conversation creation is server-owned through `create_conversation_id()`; the shared `ConversationId` requires canonical UUIDv4 on bodies and paths; supplied chat/resume IDs require existing ownership before quota; and the three artifact consumers use direct `configurable.conversation_id`. No compatibility path or delimiter parsing remains.
- Validation: RED was `21 failed, 37 passed`; GREEN was `58 passed`; the prescribed stream regression was `74 passed`; exact Ruff passed. Tests cover valid/new/owned/unowned/missing IDs, delimiter/path/noncanonical/UUIDv1 values, and exact direct-ID use for query persistence, analysis, and VAMP retrieval. Both obsolete-symbol searches return zero active backend matches.

### [STREAM-003] Chat streaming has no request idempotency or event replay contract

- Severity: Medium
- Classification: verified reliability/design risk
- Evidence: `ChatRequest` has no client request/turn/idempotency key; `conversation_streaming_service.py:153-190` always mints a new turn ID and stores the prompt before streaming. Public SSE frames have no monotonic event ID and the controller does not consume `Last-Event-ID`. On cancellation, a partial assistant record may be stored (`374-442`), but retrying the same prompt starts another turn and may repeat model/tool work.
- Impact: after a network/proxy disconnect, clients cannot determine which events or side effects committed. A retry can duplicate prompts, queries, web calls, quota usage, and partial/final assistant messages; reconnecting cannot replay the missing suffix. Lease serialization prevents simultaneous runs but does not provide exactly-once turn semantics.
- Root cause: agent resume (human-in-the-loop graph continuation) is conflated conceptually with transport recovery, while no durable turn-command/event-log protocol exists.
- Remediation: accept a bounded user-scoped idempotency key for new turns, atomically create/read a turn record before prompt persistence, and return the same turn/conversation on safe retries. If replay is required, persist sequenced public events or a recoverable snapshot and support `Last-Event-ID`; otherwise explicitly return turn status and require a user-confirmed retry for uncertain tool side effects.
- Validation: disconnect before prompt commit, after prompt, during tokens, during tool execution, after tool result, and before final response persistence; retries must not duplicate a committed turn or execute a protected action twice.

### [STREAM-004] The terminal `done` event is emitted before final durability and can turn a completed response into an abort

- Severity: High
- Classification: verified lifecycle/contract defect
- Evidence: `conversation_streaming_service.py:208-372` forwards the agent's `done` frame immediately, while assistant persistence occurs only in `finally` at `403-458`. `front-end/src/utils/streamParser.js:56,97-102` terminates on `done` and then cancels/releases the reader. An isolated fake-stream probe consumed token + done and closed at done; the backend persisted `"complete answer\n\n_(Response stopped by user)_"` with `is_final_assistant_response=False`.
- Impact: normal completion is timing-dependent. A fast client/proxy close can make a successful turn appear aborted, race or cancel final message persistence, and interrupt graph/checkpoint finalization. The client cannot safely interpret `done` as “history and recoverable state are durable.”
- Root cause: the terminal protocol event is produced inside LangGraph before the outer persistence/cleanup layers have completed; generator finalization is used as the commit phase after the response already told the client it was done.
- Remediation: reserve `done` for the outermost coordinator. Let LangGraph signal internal completion, perform ownership-valid checkpoint finalization and durable assistant/timeline storage, then emit exactly one terminal success frame. If durability fails, emit a typed terminal error/recoverable status instead. Do not classify `GeneratorExit` after internal completion as a user abort.
- Validation: deterministic client-close tests immediately before/after the internal completion signal and after public done; a public done must imply final assistant state and required checkpoint outcome are queryable, with no stopped marker.

## Validation limits and external checks still required

- No live Firestore, Redis/`AsyncRedisSaver`, Qdrant, Bedrock, Firebase, Tavily, or supported database was available to the repository suite. Adapter/network timing, IAM, retention, encryption, and service-limit behavior therefore remain staging verification items.
- The configured database roles were not available. `DBSEC-001` is now blocked at the application boundary, but independent database-role enforcement still depends on deployment grants, extensions/UDFs, and DBMS resource governance.
- No production proxy/load-balancer topology was available. Exact trusted-hop CIDRs, forwarded-header normalization, buffering, idle timeouts, and disconnect propagation must be tested in the deployed chain.
- Focused probes used deterministic fakes and direct function/generator calls; they establish code-level invariant failures, not production incident frequency.
- No sustained load/soak test was run, so queue, connection-pool, Firestore contention, memory, latency, and cost curves are not quantified.
- The installed-package vulnerability scan is a point-in-time environment result, not a reproducible artifact audit, because dependencies are not locked.
- Production code was intentionally not modified. Every remediation needs a regression test, implementation review, and fresh validation rather than assuming this audit changed behavior.

## Commands and results

- Inventory: `rg --files back-end | sort` — completed.
- Baseline Git state: `git status --short` and `git log -5 --oneline --decorate` — completed; initially clean.
- `env/bin/python -m pytest` — 209 tests: 195 passed, 14 failed (9 removed atomic-merge API/regression tests; 5 trusted-proxy behavior tests).
- `env/bin/ruff check .` — 9 violations.
- `env/bin/python -m mypy .` — not executed; module is not installed.
- Baseline `env/bin/python -m compileall -q .` passed but included `env/`; final targeted production-package compilation also passed.
- No live external-service test exists in the current test collection; `tests/conftest.py` forces test configuration and mocks external systems.
- `TypeAdapter(SseEvent)` against the emitted `task_mode` shape — rejected with `union_tag_invalid`.
- Isolated fake-streamer persistence probe — reproduced blank final assistant storage after a pre-output exception.
- In-process ASGI CSRF probe — reproduced nonstandard 403 envelope and missing security headers without starting external services.
- `pytest -q tests/test_skill_registry.py tests/test_context_summary_sync.py tests/test_stream_events.py` — 26 passed.
- Connected-database skill probe — specialized tool gate opened while `read_skill('database-querying')` returned only `skill_already_loaded` and no skill body.
- Async VAMP partial-index probe — two permanent failures both returned success and persisted only `partial`, with no failed-attempt record.
- VAMP token-budget probe — selected an estimated 6,250-token unit for a 10-token budget.
- Session-state prompt probe — unescaped database text produced a literal injected closing/system tag sequence.
- Segmented runner probe — `[50, 100, 200, 400]` configured limits produced 750 simulated steps under a declared 200-step budget.
- Lease-expiry probe — renewal failure left the local lease acquired after its durable one-second expiry.
- Tool-budget/result probes — 21 calls executed under a 20-call cap; malformed integer output was serialized as `success=True`.
- OpenAPI generation — only 11 of 37 routes expose concrete 200-response schemas; chat/resume's documented SSE union still rejects a runtime frame.
- Request-boundary probes — unknown Pydantic fields were ignored and a 1,000,000-character Firebase token was accepted; no pre-parse body middleware exists.
- Query-artifact probe — 501 bounded input rows produced 501 persistence chunks under a reduced deterministic chunk budget, proving chunk/write count is not capped.
- JSON compatibility probes — backend emitted bare `NaN`/`Infinity`; Node/browser `JSON.parse` rejected the frame.
- Original SQL safety probes — `pg_read_file`, `pg_sleep`, `LOAD_FILE`, and an unknown UDF passed the former analyzer; Task 8's dialect-aware regression set now rejects them before database entry.
- Conversation-ID probes — colon, slash, and arbitrary non-UUID IDs were accepted; delimiter parsing changed `team:quarterly` to `quarterly` for artifacts.
- Stream-recovery review — no request idempotency key, SSE event IDs, `Last-Event-ID`, or replay path exists; disconnect retries create new turns.
- Done-order probe — closing the generator immediately after the public `done` frame persisted a completed answer as aborted with a stopped marker.
- Checkpoint serializer inspection — the active LangGraph default is `JsonPlusSerializer(pickle_fallback=False)`; no application-enabled unsafe pickle fallback was found.
- `pip check` — installed environment contains Semgrep/MCP and OpenTelemetry version conflicts.
- `pip-audit` (installed environment) — no known vulnerabilities found; requirements-file audit is not possible without exact pins.
- Final backend verification: `env/bin/python -m pytest -q` — 195 passed, 14 failed in 8.51s; failures match `WF-001` and `SEC-001` exactly.
- Final backend Ruff: 9 violations, unchanged from baseline; final targeted compile: exit 0.
- Final frontend verification: `npm run lint` exit 0; `npm run build` exit 0. Vite warned about chunks above 900 KB, including a lazy Perspective vendor bundle of about 9.8 MB (about 4.6 MB gzip).
