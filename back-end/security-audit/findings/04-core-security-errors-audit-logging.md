# Security Audit — 04-core-security-errors-audit-logging

## Scope

Files audited:
- `core/__init__.py`
- `core/security.py`
- `core/errors.py`
- `core/audit.py`
- `core/logging.py`

Supporting files inspected:
- `service/database/operations.py` (SQL logging/audit excerpts)
- `controller/database_controller.py` (`POST /run_sql_query` binding excerpt)
- `main.py` (logging configuration excerpt)
- `config.py` (logging defaults excerpt)
- Production `audit_log` and request-ID call sites were inventoried by symbol search without deep-reading unrelated modules.

Relevant tests inspected:
- `tests/test_core_security.py`
- `tests/test_core_errors.py`
- `tests/test_core_audit.py`
- `tests/test_core_logging.py`

Log-file inspection:
- `backend.log` and `audit.log` were checked only for file metadata and aggregate sensitive-pattern counts; no log lines or possible credential values were loaded or reproduced.
- Both observed files had mode `0600`. The small local sample contained no matches for the selected sensitive markers, but it did not contain evidence of SQL audit traffic and therefore does not invalidate the source-level paths below.

Targeted validation performed:
- `env/bin/pytest -q tests/test_core_security.py tests/test_core_errors.py tests/test_core_audit.py tests/test_core_logging.py` — 86 passed
- `env/bin/ruff check` on the five audited source files — passed
- Direct fabricated-marker probes of audit redaction and request-ID propagation

---

## Findings

### [CORE-001] Raw SQL Literals and Database Exceptions Reach Application/Audit Logs

Status: **FIXED IN APPLICATION SOURCE (2026-08-30)** — deployment logging controls still require
verification.

Severity: MEDIUM
Confidence: HIGH

Category:
Application Security / Sensitive Information in Logs

CWE:
CWE-532 — Insertion of Sensitive Information into Log File

OWASP:
A09:2021 — Security Logging and Monitoring Failures

Location:
`service/database/operations.py:524-585`
`core/audit.py:97-118`
`core/security.py:74-164`
`main.py:34-40`

Entry Point:
`POST /run_sql_query`

Attack Path:

authenticated request `sql_query`
→ `controller.database_controller.run_sql_query`
→ database execution
→ `details.query_preview = sql_query[:120]`
→ `audit_log()` / `redact()`
→ `audit` logger propagation
→ root `FileHandler` and console handler

Separately:

database-driver exception
→ raw `logger.error(..., err)`
→ root handlers
→ only afterward `sanitize_exception(err)` is called for classification

Original Evidence (historical):
Successful, validation-denied, and failed SQL paths include the first 120 characters of the submitted SQL in structured audit details (`service/database/operations.py:525-535`, `550-555`, `580-585`). SQL commonly embeds sensitive literals such as email addresses, account identifiers, tokens, or values used in `INSERT`/`UPDATE` statements. `audit_log` redacts the details mapping structurally, but `query_preview` is not treated as a sensitive key and the string redactor does not parse or remove SQL literals.

The unexpected database-exception path also logs `err` verbatim at line 577 before sanitizing it at line 578. Driver exceptions can include database/schema identifiers, query fragments, hosts, or connection details; the module's own error-sanitization rationale identifies these as leakage risks.

A direct probe using only a fabricated marker confirmed that the marker remained in an emitted `query_preview`. It also confirmed incomplete structural coverage: `accessToken` and `connectionString` keys were not normalized to the snake-case sensitive-key names, and `redact_connection_config` preserved a `connection_string` value. No real secret was used or printed.

Original Security Control Analysis (historical):
`audit_log` applies recursive redaction to `details`, uses JSON encoding that prevents newline-based record injection, and the request schema bounds SQL length. `sanitize_exception` removes several connection/path patterns, and the client response maps database failures to generic categories. These controls do not protect the earlier raw exception log, do not remove SQL literals, and do not cover all common camelCase/connection-config secret keys. The locally observed log files were owner-only (`0600`), but repository code does not establish deployed access controls, retention, forwarding, or backup exposure.

Exploit Preconditions:
The query path requires an authenticated user with an active database configuration. Accidental exposure requires only that a legitimate query contain a sensitive literal. Deliberate log planting requires query access. Exception leakage additionally requires a driver/database failure whose message contains sensitive infrastructure or query context.

Impact:
Sensitive customer/business values, database metadata, or credentials can be retained in application and audit logs, expanding access beyond the original database authorization boundary. Log readers, backups, support bundles, or a compromised observability system could expose the retained data.

Recommended Remediation:
Do not log raw SQL. Record a normalized query fingerprint/hash, statement class, parameter count, row count, timing, and stable execution identifier instead. If previewing is essential, use a dialect-aware literal-stripping implementation with deny-by-default tests. Sanitize exceptions before every log sink and log only the safe category/message; retain raw exceptions only in a separately protected diagnostic channel when explicitly justified. Normalize camelCase, kebab-case, and snake-case keys consistently, and make the connection-config helper delegate to the comprehensive secret-key policy rather than preserving DSNs/connection strings.

Implemented Remediation (2026-08-30):
Raw SQL/query previews were removed from every `execute_sql_query` audit outcome. Successful events
retain statement type, row count, truncation state, and execution duration; denied/failed events
retain stable reasons. Sensitive-key checks now canonicalize snake, kebab, camel, and Pascal case,
and connection-config redaction fully removes DSNs, connection strings, passwords, and credential
aliases. MySQL, PostgreSQL, SQL Server, and Oracle adapter exception diagnostics now use
`log_safe_exception`, which emits stable metadata without exception text or traceback. Connection
lifecycle messages no longer print usernames, hosts, DSNs, or connection representations. A raw
SQL fingerprint was omitted because predictable query hashes can be guessable and are unnecessary
for the current operational contract.

Application Verification (2026-08-30):
Nine marker-based regression tests passed after failing against the old behavior. They cover SQL
audit success/denial/failure, mixed-style secret keys, connection-string/DSN redaction, and driver
acquisition failures for all four adapters. The broader relevant group passed 148 tests and the
complete unaffected backend suite passed 621 tests with 3 existing SlowAPI/Python 3.14 warnings.
Targeted Ruff and diff checks passed; core security/error mypy passed, while the wider
adapter/operations run retained 64 pre-existing typing errors. The separate terminal-contract file
remains at its known 9 failures and 2 passes. Deployment controls listed below remain unverified.

Verification:
Capture application and audit logs while executing parameterized test queries containing fabricated email/token/account literals and while raising fabricated driver exceptions containing a DSN, filesystem path, bearer token, and camelCase secret fields. Assert that no marker appears in any handler output, backup/export payload, or structured audit record.

Deployment Classification:
`REQUIRES_DEPLOYMENT_VERIFICATION` — verify deployed log-file permissions, collector access, encryption, backups, retention/deletion, and observability redaction.

---

### [CORE-002] Privileged Actions Lack a Reliable, Correlated Security Audit Trail

Status: **FIXED IN APPLICATION SOURCE (2026-09-02)** — centralized immutable retention still
requires deployment verification.

Severity: MEDIUM
Confidence: HIGH

Category:
Configuration / Operational Security

CWE:
CWE-778 — Insufficient Logging

OWASP:
A09:2021 — Security Logging and Monitoring Failures

Location:
`core/audit.py:47-118`
`core/logging.py:26-88`
`main.py:34-40`
`controller/database_controller.py:509-534`
`service/database/database_service.py:335-371`
`service/database/operations.py:302-307,525-585`
`service/database/ai_tool_executor.py:268-349,352-580`

Entry Point:
Authentication/session operations, database connection lifecycle operations, conversation deletion, context/history deletion, and other privileged HTTP actions

Attack Path:

security-sensitive action or denied attempt
→ controller/service completes or rejects action without `audit_log()`
→ no structured actor/resource/outcome event
→ request-correlation utility is not invoked in production
→ detection, investigation, and attribution rely on incomplete ordinary logs

Evidence:
A production call-site inventory found `audit_log()` only in four branches of SQL execution inside `service/database/operations.py`. No production call sites were found for authentication/session establishment or logout, database connect/disconnect, conversation deletion, context/history deletion, memory mutation, or authorization denials, despite `core/audit.py:3-5` explicitly naming those as required audit categories. Representative sensitive routes exist at `controller/auth_controller.py:101,172`, `controller/database_controller.py:292,333`, `controller/conversations_controller.py:686`, and `controller/context_controller.py:175-206,407`.

Unit 18 confirmed that even the SQL events lose actor attribution on the normal API path. The authenticated controller passes `user_id` into `DatabaseService.execute_query`, but the service omits that argument when it invokes `execute_sql_query`; all success, denial, and failure audit branches consequently record `user:unknown`. Context history separately receives the user ID, but it is not the structured security audit trail and does not repair the missing actor field.

Unit 19 confirmed that model-generated SQL bypasses the audit emitter entirely. `AIToolExecutor` records raw SQL in recent query history and ordinary logs but emits no structured actor/resource/outcome event for successful, denied, timed-out, or failed AI database execution. Query history is product context, not an append-only security audit trail.

`core.logging` states that middleware binds and clears a request ID, but production symbol search found no caller of `bind_request_id`, `clear_request_id`, or `current_request_id`. The default `LOG_FORMAT` also omits `request_id`. Additionally, `_RequestIdFilter` is attached to the root logger rather than its handlers; Python does not apply ancestor logger filters to records propagated from child loggers. A direct probe confirmed a child logger record lacked `request_id`, while the existing test covers only a record emitted directly by the root logger.

Audit delivery is best-effort: a `NullHandler` is installed when no direct handler exists, and all emitter exceptions are silently discarded. The repository configures a general root file/console logger but no dedicated, monitored audit sink or delivery-failure signal.

Security Control Analysis:
SQL execution does emit structured events with random event IDs, timestamps, actor/resource/outcome fields, and redacted details. JSON serialization preserves single-record framing. Request IDs, optional idempotency keys, and actor IP fields exist in the API. These controls are not wired consistently into production request handling, and neither missing event coverage nor silent delivery loss can be repaired solely by the current event shape.

Exploit Preconditions:
An attacker or malicious/compromised authenticated user performs or attempts one of the uninstrumented sensitive actions. Exploitation of another weakness is not required for the logging gap itself; its security impact becomes material during abuse, repudiation, or incident response.

Impact:
Security teams may be unable to reliably detect, correlate, attribute, or reconstruct account/session changes, destructive data actions, connection lifecycle changes, and authorization failures. Silent audit-sink failure can create an undetected monitoring blind spot and undermine non-repudiation and compliance evidence.

Recommended Remediation:
Define a required audit-event matrix and instrument success, failure, and denied outcomes for authentication, logout/session closure, database connect/disconnect/switch, conversation and context deletion, settings/credential changes, memory mutation, and authorization failures. Add ASGI middleware that generates an internal request ID, optionally records a separately validated upstream ID, binds/resets the context with tokens, returns the internal ID in the response, and passes it to audit events. Inject correlation fields with a handler filter or `LogRecordFactory` so child loggers are covered. Route audit events to a dedicated durable sink and expose delivery/drop metrics and alerts; do not silently lose records.

Implemented Remediation (2026-09-02):
The request-ID portion of the original evidence had already become stale: the current outer ASGI
response boundary binds a validated/generated ID, returns it in `X-Request-ID`, clears it after the
request, and root-handler filters cover child loggers. This remediation made `audit_log()` inherit
that context automatically.

An explicit 15-route pure-ASGI policy boundary now emits exactly one allow-listed event for
selected authentication, database lifecycle, human SQL, conversation deletion, context/history,
settings, session-close, and metrics-reset actions. It observes success, denial, failure, and
exceptions while reading actor identity only from authenticated request state. Human SQL event
ownership moved out of the lower database operation to prevent duplication. Agent SQL now emits a
separate terminal success/denial/failure event with stable metadata and no raw query or database
identity.

The application configures an idempotent owner-only rotating JSON-lines file through
`AUDIT_LOG_FILE`, `AUDIT_LOG_MAX_BYTES`, and `AUDIT_LOG_BACKUP_COUNT`. Handler/emitter failures
increment a process-local counter and produce a payload-free ordinary warning; even a simultaneous
telemetry failure cannot escape into the user request. Audit records exclude request/response
bodies, route identifiers, raw SQL, database names, tokens, cookies, credentials, conversation or
memory content, and raw exception text.

Application Verification (2026-09-02):
The focused CORE-002 suite passed 331 tests. The complete backend suite passed 747 tests after
excluding only the separately known ignored terminal-contract file; both runs retained 3 existing
SlowAPI/Python 3.14 deprecation warnings. Repository-wide Ruff lint and `git diff --check` passed.
Targeted formatter checks passed for the formatter-clean changed files; the repository-wide
formatter check still identifies 37 pre-existing files and was not mechanically applied because it
would create unrelated churn. The initial full baseline's single lease timing failure passed on an
immediate isolated rerun and in the final 747-test run.

Verification:
Add route/integration tests asserting exactly one structured audit event for each sensitive success/failure/denial path, with actor, resource, outcome, and request ID. Emit records through representative child loggers and confirm correlation fields survive. Simulate sink failure and verify a health metric/alert is generated without leaking event contents.

Deployment Classification:
`REQUIRES_DEPLOYMENT_VERIFICATION` — verify a dedicated centralized audit sink, append-only/tamper-resistant retention, SIEM ingestion/alerting, time synchronization, access controls, and delivery-failure monitoring.

---

## Security Controls Observed

- Event/request identifiers use `secrets.token_urlsafe` rather than predictable randomness.
- Audit events are JSON-encoded as one logical record, preventing user newlines from creating forged JSON audit records.
- The current local log files were mode `0600`.
- Identifier validation allows only conservative ASCII identifiers with at most one schema separator and a 128-character limit.
- `constant_time_eq` uses `secrets.compare_digest` when both values are present.
- Error responses on the inspected database path use stable, generic categories rather than returning the raw database exception.
- Request-ID input is length-bounded and restricted before acceptance, although the production integration is absent.

## Residual Risks and Cross-Module Follow-up

- `XREF-LOG-001`: Confirmed by `CORE-001`; continue checking other raw query, prompt, tool, connection, and exception log sinks in later service/provider/orchestration units.
- `XREF-AUDIT-001`: Confirmed by `CORE-002`; validate and enumerate missing privileged-action events as each controller/service unit is audited.
- `XREF-ERROR-SANITIZE-001`: `sanitize_error_message` does not cover every common secret representation (for example bearer/JSON/camelCase forms). Establish exploitability when API, LLM, tool, and provider error sinks are audited.
- `XREF-CSRF-001`: `constant_time_eq(None, None)` returns true by design, so controller callers must explicitly require both token values before comparison.
- The audit payload fields and details mapping have no explicit size limits. Current callers use small fixed metadata, but future dynamic call sites must not permit logging amplification.

## Items Requiring Deployment/Configuration Verification

- `REQUIRES_DEPLOYMENT_VERIFICATION`: Log rotation, disk quotas, retention, backup handling, encryption, collector transport security, and protection against local disk exhaustion.
- `REQUIRES_DEPLOYMENT_VERIFICATION`: Audit sink durability, immutability/tamper detection, SIEM alert rules, operator access, clock synchronization, and monitoring for dropped events.
