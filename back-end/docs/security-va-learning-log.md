# Security Vulnerability Assessment Learning Log

Last updated: 2026-08-30

This document records each audit finding as it is independently validated against the current
backend. Its purpose is both operational and educational: preserve what was found, show how the
claim was tested, explain the impact, and distinguish a live vulnerability from a stale finding or
a deployment-only risk.

## Status vocabulary

- **VALID — OPEN:** the vulnerable path is reachable in current source and still needs remediation.
- **VALID — FIXED:** the original vulnerability was real, but current controls and tests close the
  demonstrated path.
- **FALSE POSITIVE:** the claimed path was never reachable under the inspected implementation.
- **DEPLOYMENT VERIFICATION:** source controls exist, but infrastructure evidence is required.
- **MORE EVIDENCE REQUIRED:** the available source or environment cannot establish a reliable
  verdict.

## Validation method

For each finding:

1. Restate the claim as an entry-point-to-impact attack path.
2. Identify the untrusted input, trust boundaries, security-sensitive sink, and prerequisites.
3. Trace the current source from the entry point to the sink instead of relying on audit line
   numbers that may be stale.
4. Locate controls and confirm whether they execute before or after the expensive or dangerous
   operation.
5. Reproduce the behavior safely with a focused test or bounded probe when practical.
6. Classify confidentiality, integrity, and availability impact without assuming maximum impact.
7. Select the smallest remediation that closes the demonstrated path and add regression coverage.
8. Record deployment dependencies and residual risks separately from source-code conclusions.

## Findings summary

| Finding | Severity | Current verdict | Primary security property |
|---|---:|---|---|
| DEP-001 | Medium | VALID — FIXED | Dependency integrity and reproducibility |
| DEP-002 | Low | VALID — FIXED | Known-vulnerable dependency exclusion |
| API-001 | Medium | VALID — FIXED | Pre-parse request resource bounds |
| CORE-001 | Medium | VALID — FIXED | Sensitive-data exclusion from logs |

## DEP-001 — Unlocked production dependencies and missing artifact integrity

### Vulnerability class

- CWE-494 — Download of Code Without Integrity Check
- OWASP A08:2021 — Software and Data Integrity Failures
- Primary impact: confidentiality, integrity, and availability during build or deployment

### Original attack path

```text
deployment installs broad version ranges
→ package index selects versions at installation time
→ transitive versions and artifacts differ between builds
→ compromised or newly incompatible package code executes during installation/startup
→ build credentials, source, deployment permissions, or application behavior are exposed
```

### Validation and verdict

The finding was valid. The previous `requirements.txt` contained broad direct ranges, did not pin
the complete transitive graph, and did not authenticate selected artifacts with committed hashes.
The documented production installation path used that mutable resolution.

Verdict: **VALID — FIXED** on 2026-08-28.

### Impact

- A malicious package artifact or build hook could execute with build-runner permissions.
- Different deployments could receive incompatible SDK combinations without a source change.
- Build or runtime secrets could be exposed if dependency code were compromised.
- Availability could regress through unreviewed transitive upgrades.

### Selected remediation

- Made `pyproject.toml` the sole runtime and development dependency source.
- Pinned uv to `0.12.5`.
- Committed the exact universal dependency graph in `uv.lock`.
- Removed the alternate broad `requirements.txt` path.
- Required `uv sync --locked --no-dev --no-build` for production.
- Added a policy test that compares direct declarations with lock metadata and verifies SHA-256
  artifact hashes.

### Verification evidence

- `uv lock --check` accepted the 163-package lock without modification.
- All recorded artifacts for 162 registry packages have SHA-256 hashes.
- A clean production environment contained 136 compatible packages and passed runtime import
  smoke checks.
- A clean development environment contained 159 compatible packages.
- `pip-audit` reported no known vulnerabilities in the synchronized environment.
- Dependency-policy tests passed 2/2.

### Residual risk and VA lesson

CI and deployed images must actually use the committed lock and production flags. A lockfile in
source does not prove that production consumed it. Vulnerability assessment must distinguish
dependency *selection* controls, artifact-integrity controls, vulnerability scanning, and runtime
reachability; none substitutes for all the others.

## DEP-002 — MySQL constraint admitted a known vulnerable connector line

### Vulnerability class

- CWE-1395 — Dependency on Vulnerable Third-Party Component
- OWASP A06:2021 — Vulnerable and Outdated Components
- Advisory evaluated: CVE-2024-21272

### Original attack path

```text
manifest permits an affected MySQL Connector/Python release
→ deployment resolves and installs that release
→ application reaches the affected connector behavior
→ attacker-controlled dictionary parameterization can trigger the advisory path
```

### Validation and verdict

The old version ceiling could select the affected 8.x line, so the dependency finding was valid.
Current `pyproject.toml` requires `mysql-connector-python>=9.1.0,<10.0.0`, and `uv.lock` resolves
version `9.7.0`. Current connection construction also uses `use_pure=True`, while the audited
advisory path concerned the alternate implementation.

Verdict: **VALID — FIXED** before the DEP-001 migration was completed; the uv lock now makes the
selected fixed version reproducible.

### Impact

If both the affected version and vulnerable connector path were present, database input could
reach unsafe connector behavior. Practical impact depended on code-path reachability, so the
advisory alone was not proof of an exploitable application vulnerability.

### Selected remediation

- Exclude the affected connector line with `>=9.1.0,<10.0.0`.
- Lock the exact resolved connector and artifact hashes.
- Preserve and test the expected `use_pure=True` connection behavior.

### Residual risk and VA lesson

Revalidate the advisory when connection construction changes. For dependency CVEs, validate four
separate questions: is the package declared, is an affected version installed, is the vulnerable
feature used, and can attacker-controlled data reach it?

## API-001 — Post-parse validation did not bound raw JSON request bytes

### Vulnerability class

- CWE-400 — Uncontrolled Resource Consumption
- OWASP API4:2023 — Unrestricted Resource Consumption
- Primary impact: availability

### Original attack path

```text
authenticated client sends an oversized JSON body
→ ASGI/framework buffers and decodes the full body
→ duplicate keys collapse or unknown fields are discarded
→ Pydantic sees only the smaller parsed representation
→ memory and CPU are consumed before field validation can reject the request
```

### Validation and verdict

The original finding was valid because field constraints execute after request buffering and JSON
decoding. They cannot serve as raw transport limits.

The current code closes the path:

- `RequestBodyLimitMiddleware` runs at the raw ASGI boundary before route parsing.
- `REQUEST_BODY_MAX_BYTES` defaults to 262,144 bytes.
- Declared-length, missing-length/chunked, and understated-length bodies are measured.
- Malformed and duplicate `Content-Length` headers are rejected.
- Request-frame count is capped to prevent low-byte, high-frame CPU abuse.
- Public request models inherit `ExternalRequestModel(extra="forbid")`.

Verdict: **VALID — FIXED** on current source as verified on 2026-08-30.

### Impact

Without the raw limit, concurrent oversized requests could increase worker memory and JSON-decoding
CPU, degrade API availability, or terminate workers. Authentication and rate limiting reduce who
can repeat the request but do not bound the cost of one admitted request.

### Selected remediation

No additional application-code remediation is required for the demonstrated path. Preserve the
existing raw ASGI byte/frame boundary and strict public request models. At the trusted edge,
configure an equal or smaller request-body limit, request/read timeouts, and concurrency controls.

### Verification evidence

The following focused locked-environment test run passed 70 tests:

```bash
APP_ENV=testing uv run --locked pytest -q \
  tests/test_request_boundary.py \
  tests/test_http_error_boundary.py \
  tests/test_api_contract.py
```

Coverage includes oversized declared bodies, chunked bodies, understated lengths, malformed and
duplicate length headers, excessive frames, disconnects, the HTTP 413 error boundary, and rejection
of undeclared request properties.

### Residual risk and VA lesson

- Reverse-proxy, ingress, load-balancer, request-timeout, and concurrency limits require deployment
  verification.
- Duplicate JSON object keys are not rejected, but their total raw representation is bounded by
  the application limit. A duplicate-key rejection policy is only necessary if contract ambiguity
  creates a separate semantic vulnerability.
- Deeply nested input is byte-bounded but should remain part of edge and parser stress testing.

Schema validation and transport validation protect different boundaries. To validate a body-size
finding, test where bytes are rejected and prove the endpoint or parser is not reached—not merely
that the final Pydantic model rejects a large recognized field.

## CORE-001 — Raw SQL literals and database exceptions reached logs

### Vulnerability class

- CWE-532 — Insertion of Sensitive Information into Log File
- OWASP A09:2021 — Security Logging and Monitoring Failures
- Primary impact: confidentiality

### Original attack paths

```text
authenticated SQL request
→ query execution succeeds, is denied, or fails
→ the first 120 submitted SQL characters are stored as audit details
→ literals become durable application/audit log data
```

```text
database pool or connection operation raises a driver exception
→ adapter interpolates the exception into an ordinary log record
→ driver-supplied query, host, schema, path, token, or credential detail reaches log sinks
```

Separately, structural redaction compared only lowercased snake/kebab keys. Common keys such as
`accessToken` and `connectionString` therefore missed the policy, and the connection-config helper
preserved DSN/connection-string values.

### Validation and verdict

The finding was valid and remained partly open. The main query-operation exception boundary had
already been converted to `log_safe_exception`, but three independent paths were still live.
Fabricated-marker probes established that SQL previews, camel-case secret fields, and connection
strings/DSNs reached rendered output. They also confirmed that the central safe exception logger
did not render exception text.

Test-first verification then reproduced all remaining paths: five audit/redaction tests and four
database-adapter tests failed before the production change and passed afterward.

Verdict: **VALID — FIXED** in application source on 2026-08-30.

### Impact

- SQL literals can contain customer identifiers, email addresses, account values, tokens, or other
  business data not intended for observability systems.
- Driver exceptions can echo database/schema names, filesystem paths, endpoints, credentials, and
  fragments of the failed operation.
- Logs, backups, support bundles, and SIEM platforms commonly have broader readers and longer
  retention than the source database, expanding the confidentiality boundary.
- JSON audit encoding prevents newline-based record injection, so integrity impact from the
  demonstrated path is limited; availability was not the primary impact.

### Selected remediation

- Removed raw SQL and `query_preview` from success, denied, and failure audit events.
- Successful SQL events retain only statement type, row count, truncation status, and execution
  time. Failure events retain stable reason/error codes.
- Added one key canonicalization rule for snake_case, kebab-case, camelCase, and PascalCase before
  sensitive-key comparison.
- Made connection-config redaction fully remove connection strings, DSNs, passwords, credential
  aliases, and nested sensitive values while retaining deliberately safe operational fields.
- Routed MySQL, PostgreSQL, SQL Server, and Oracle adapter diagnostics through
  `log_safe_exception`; normal connection messages no longer print users, hosts, DSNs, or
  connection object representations.
- Extended `log_safe_exception` with an optional log level so warning/debug lifecycle behavior is
  preserved without rendering exception content.

A SQL fingerprint was intentionally not added. Hashes of predictable, low-entropy SQL can be
guessable, and dialect-aware literal normalization would add parser complexity without being
necessary for the current operational contract.

### Verification evidence

Verification completed with the locked uv environment:

- The 9 focused regressions passed, covering successful, denied, and failed SQL audit events;
  mixed-style sensitive keys; DSN/connection-string fields; and acquisition failures in all four
  database adapters.
- The broader core/security/audit/logging and adapter group passed 148 tests.
- The complete unaffected backend suite passed 621 tests with 3 existing SlowAPI/Python 3.14
  deprecation warnings.
- Targeted Ruff and `git diff --check` passed. Core security/error modules passed targeted mypy;
  the wider adapter/operations mypy run still reports the repository's existing 64 typing errors.
- The separate terminal-contract file remains at its pre-existing 9 failures and 2 passes; none of
  its streaming/lifecycle paths overlap this remediation.

### Residual risk and VA lesson

- Deployment must still verify log-file and SIEM access, transport/storage encryption, rotation,
  retention/deletion, backups, and alerting for audit-delivery failures.
- Other subsystems may have independent raw diagnostic sinks and must be assessed in their own
  findings; closing this database path does not prove repository-wide log safety.
- Redacting a structured payload at the final sink is useful defense in depth, but unsafe source
  fields should still be omitted. Redaction policies can miss spelling variants and cannot reliably
  parse every secret embedded in arbitrary exception text or SQL.

The VA lesson is to test the rendered output of every relevant sink with fabricated markers. A
safe client response does not prove safe logs, and a redaction helper does not protect values whose
field names never match its policy.

## CONTRACT-003 — Malformed tool results were relabeled as successful evidence

### Vulnerability class

- CWE-20 — Improper Input Validation
- CWE-754 — Improper Check for Unusual or Exceptional Conditions
- Primary impact: integrity; secondary confidentiality and availability

### Original attack path

```text
database/provider/tool implementation returns a missing or wrong-type field
→ result-model conversion raises or no dedicated result branch exists
→ generic fallback returns success=true with the raw dictionary
→ model, SSE client, and persisted timeline treat malformed data as verified evidence
→ the agent can reason from it, the UI can display it, and later turns can reuse it
```

Three bespoke tools (`read_skill`, `web_search`, and `get_query_history`) also emitted their own
terminal events without the shared result boundary. `retrieve_memory` used one structured result for
both audiences, placing historical memory text in the UI/persistence payload even though only the
model required it.

### Validation and verdict

The finding was valid. A fabricated unknown-tool result containing a private marker returned
`success=true` and echoed the marker under `data`. Empty dictionaries for connection, database list,
query, index, schema, explain, table-detail, row-count, foreign-key, and view tools were converted
into plausible empty success results. UI inspection also found registered tools whose useful
structured fields had no deliberate presentation.

Test-first validation reproduced registry drift, unsafe fallback, missing core fields, malformed
analysis metrics, unsafe web URL schemes, count/list mismatch, model-memory disclosure, incomplete
bespoke events, generic compaction leakage, stale frontend tool entries, and unbounded generic
rendering before production changes were applied.

Verdict: **VALID — FIXED** in application source on 2026-08-30.

### Impact

- The model could base answers or follow-up SQL on invalid or partial evidence while reporting it as
  a successful tool result.
- The UI could show misleading empty/success states or omit the actual evidence needed for user
  verification.
- Raw fallback payloads can bypass deliberate field selection, increasing the chance that provider,
  database, skill, or historical-memory data crosses into the persisted timeline.
- Invalid large/nested results can inflate SSE, browser-rendering, persistence, and future-context
  work.

### Selected remediation

- Added exact-equality checks between the 19 registered tools, argument schemas, and result schemas.
- Made argument models reject undeclared fields and added missing contracts for skill loading, web
  search, and query history.
- Added typed result models for skill metadata, all analysis variants, web citations, bounded query
  history, UI actions, and separate UI/model memory results.
- Replaced the raw success fallback with the stable `TOOL_RESULT_INVALID` failure and required core
  fields for database result types.
- Routed bespoke and UI-action terminal events through canonical result structuring while preserving
  their existing execution, timeout, interrupt, and model-return behavior.
- Kept retrieved memory and skill bodies model-only. Timeline persistence receives safe metadata;
  compaction summaries use counts/names/query metadata rather than bodies or SQL.
- Added an exact frontend agent-tool catalog, deliberate summaries/detail kinds, a readable history
  presentation, and a bounded generic structured renderer. Full query rows remain in their existing
  interactive table.
- Removed the obsolete `get_table_columns` presentation path without removing frontend-only editor
  and navigation lifecycle actions.

### VA lesson

A schema class existing in source is not proof of an enforced output contract. Validate the complete
boundary mechanically: registered name → argument validation → real success result → malformed
result → emitted event → persisted representation → model representation → UI rendering. Include a
fabricated marker so disclosure is observable, and test empty dictionaries separately because
permissive defaults often turn missing evidence into a convincing empty success.

### Verification evidence

- The affected backend regression group passed 175 tests, including the new 19-tool contract suite,
  tool safety, stream events, skill registry, and conversation identity tests. Three existing
  SlowAPI/Python 3.14 deprecation warnings remain.
- All 19 frontend Node test files passed. Full Biome and ESLint checks passed, and the Vite production
  build completed with its existing large-chunk warning.
- Targeted Ruff format/lint and Python compilation passed; `git diff --check` is part of the final
  handoff review.
- Targeted mypy remains non-green with 111 existing errors across 25 imported files. No reported
  error is in the new result-schema or tool-executor implementation; repository-wide typing debt is
  tracked separately rather than hidden by this remediation.

### Post-review hardening — 2026-08-31

A review of the completed boundary found three integration defects that contract-presence tests did
not expose:

- historical `retrieve_memory` timeline objects could still contain the former model-only
  `memories` field and reach the generic renderer;
- the table-detail UI consumed legacy `type`/`nullable` names instead of the backend's canonical
  `data_type`/`is_nullable`/`is_unique`/`max_length` fields;
- the new multi-table row-count statement retained the singular tool's fixed 20-second outer
  timeout and did not install a database-side statement/driver timeout.

Regression tests now cover all three paths. The frontend strips the legacy memory field before
generic rendering and normalizes the canonical table-detail metadata for display. Row-count batches
receive 20 seconds per table at the database boundary and five additional seconds at the outer tool
boundary for timeout propagation and connection cleanup.

VA lesson: validate migrations with historical persisted fixtures and realistic producer payloads,
not only newly generated schemas. When several formerly independent operations become one batch,
recalculate resource and cancellation budgets from the batch cardinality and ensure the lower
infrastructure layer terminates work before the application reports a timeout.
