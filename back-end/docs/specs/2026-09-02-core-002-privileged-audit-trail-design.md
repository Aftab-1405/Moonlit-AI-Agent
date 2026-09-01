# CORE-002 Privileged-Action Audit Trail Design

## Status

Approved in chat on 2026-09-02.

## Finding and validated scope

`CORE-002` reports that privileged actions do not have a reliable, correlated security audit trail. The original finding is only partly current:

- HTTP requests already receive a validated `X-Request-ID`, the ID is returned to the client, and ordinary child-logger records receive it through root-handler filters.
- Human SQL execution already attempts to emit audit records, but `DatabaseService.execute_query()` does not forward its `user_id` to the lower-level executor. Those records therefore identify the actor as unknown.
- `audit_log()` does not inherit the request ID bound by the HTTP boundary unless each caller passes it manually.
- Authentication, database connection lifecycle, destructive context operations, settings changes, session closure, and conversation deletion have no consistent structured audit event.
- Agent-generated SQL has no structured audit event.
- The audit logger has no application-configured, dedicated sink or observable handler-failure signal.

This is a detection, attribution, non-repudiation, and incident-response weakness. It is not itself an authorization bypass.

## Requirements

1. Emit exactly one structured security audit event for every selected privileged HTTP action.
2. Record the authenticated actor when available, a stable action and resource category, the outcome, and the current request ID.
3. Record requests rejected by authentication, authorization, or CSRF checks as `denied` when they reach the selective audit boundary.
4. Record successful and failed agent SQL executions separately from human HTTP SQL executions.
5. Never record request or response bodies, session cookies, tokens, passwords, connection strings, raw SQL, database names, conversation content, memory content, or exception text.
6. Configure a dedicated rotating JSON-lines audit file without adding a dependency. Keep audit emission best-effort so a logging outage does not turn a user action into a second application failure.
7. Make audit-delivery failures visible through safe operational telemetry that contains no audit payload.
8. Preserve all public API request and response contracts.
9. Document the validation, impact, implementation, tests, and remaining deployment responsibility in the VA learning log.

## Selected approach

Use a small pure-ASGI selective audit middleware driven by an explicit route-policy table. This provides one checkpoint around privileged HTTP routes and observes the final status even when a dependency or CSRF check rejects the request. It avoids scattering nearly identical audit calls through controllers.

Human `/api/v1/run_sql_query` auditing moves to this middleware so one request cannot create duplicate security events. Lower-level database execution remains responsible for query history, not HTTP security auditing. Agent SQL does not pass through the human SQL route, so `AIToolExecutor` emits its own `agent.sql.execute` event.

Rejected alternatives:

- Per-controller audit calls: they duplicate policy, are easy to omit, and do not consistently observe failures that occur before controller execution.
- Audit every HTTP request: this creates noisy logs, raises storage and privacy exposure, and hides the high-value events this finding is concerned with.
- Add a logging/SIEM dependency: unnecessary for the application boundary; production collection and immutable retention belong to deployment configuration.

## Architecture

### Audit emitter

`core.audit.audit_log()` remains the single public event emitter. When its `request_id` argument is omitted, it reads `core.logging.current_request_id()`. An explicitly supplied request ID continues to take precedence for non-HTTP callers and tests.

The emitted JSON object retains the existing fields:

- `event_id`
- `ts`
- `actor`
- `action`
- `resource`
- `outcome`
- `details`
- `pid`
- `request_id` when a request context exists
- optional `idempotency_key` and `actor_ip` only when explicitly supplied

No raw exception is added to an audit event.

### Selective HTTP middleware

Create `core.audit_middleware.PrivilegedActionAuditMiddleware` as pure ASGI middleware. Its route policy is an immutable mapping keyed by exact HTTP method plus either an exact path or a narrowly matched path template.

The initial policy covers:

| Method and route | Action | Resource |
| --- | --- | --- |
| `POST /set_authenticated_user_session` | `auth.login` | `auth:session` |
| `POST /logout_authenticated_user_session` | `auth.logout` | `auth:session` |
| `POST /api/v1/connect_db` | `db.connect` | `db:connection` |
| `POST /api/v1/disconnect_db` | `db.disconnect` | `db:connection` |
| `POST /api/v1/switch_remote_database` | `db.switch` | `db:selection` |
| `POST /api/v1/select_database` | `db.select` | `db:selection` |
| `POST /api/v1/run_sql_query` | `sql.execute` | `db:query` |
| `DELETE /api/v1/delete_conversation/{conversation_id}` | `conversation.delete` | `conversation:record` |
| `POST /api/v1/user/context/refresh` | `context.refresh` | `context:schema` |
| `DELETE /api/v1/user/context/schema/{database}` | `context.schema.delete` | `context:schema` |
| `DELETE /api/v1/user/context/schemas` | `context.schemas.delete` | `context:schema` |
| `DELETE /api/v1/user/context/queries` | `context.queries.delete` | `context:query-history` |
| `POST /api/v1/user/settings` | `settings.update` | `user:settings` |
| `POST /api/v1/user/session/close` | `session.close` | `user:session` |
| `POST /api/v1/context/metrics/reset` | `context.metrics.reset` | `context:metrics` |

Conversation rename, session-active heartbeats, read-only routes, and chat messages are deliberately excluded because they are not privileged or destructive enough to justify the audit volume for this finding.

The middleware captures the response status without buffering the response body:

- `2xx` and `3xx` -> `success`
- `401` and `403` -> `denied`
- all other `4xx` and `5xx` -> `failure`
- an exception before response start -> emit `failure`, then re-raise so the existing outer error boundary returns the safe `500` response

It reads the actor only after downstream processing, from `scope["state"]["user"]["uid"]`. This lets successful login and authentication dependencies populate the actor. A missing or invalid actor becomes `user:anonymous`; email, name, IP address, and cookie-derived identifiers are not used.

The event's `details` contains only `http_method` and `status_code`. It never derives fields from request body, query string, route parameters, response body, or exception text.

### Middleware order

`ResponseSecurityMiddleware` remains outermost so it binds the request ID before the audit middleware executes and clears it only after the audit event is emitted. The audit middleware sits immediately inside the response boundary and outside `RequestBodyLimitMiddleware`, CSRF, authentication dependencies, and route execution. A body-limit rejection on a listed privileged route therefore produces one anonymous `failure` event with status `413`; the event contains no body metadata. Tests will lock down this Starlette ordering.

### Human SQL actor correction

`DatabaseService.execute_query()` forwards `user_id=user_id` to `execute_sql_query()`. The existing `sql.execute` calls in `service/database/operations.py` are removed to prevent duplication with the HTTP middleware. Query-history recording remains unchanged.

Direct non-HTTP callers of `DatabaseService.execute_query()` will no longer create a human security event implicitly. Current production usage is the HTTP route, and agent SQL uses `AIToolExecutor`; tests will confirm these call paths before removal.

### Agent SQL auditing

`AIToolExecutor._execute_query()` emits one `agent.sql.execute` event after the operation reaches a terminal result:

- actor: `user:<uid>` when the executor receives a valid user ID, otherwise `user:unknown`
- resource: `db:agent-query`
- outcome: `success`, `denied`, or `failure`
- details: statement type when safely available, returned row count on success, and a stable error code or reason category on failure

Security-policy and read-only validation rejections are `denied`. Connection, timeout, and execution problems are `failure`. Raw SQL, warning text, exception text, database name, and connection metadata are excluded.

### Dedicated sink and delivery health

Add standard-library configuration for a dedicated `RotatingFileHandler` on the `audit` logger. The settings are:

- `AUDIT_LOG_FILE`, default `audit.log`
- `AUDIT_LOG_MAX_BYTES`, default `10_485_760` (10 MiB)
- `AUDIT_LOG_BACKUP_COUNT`, default `10`

The configured audit logger does not propagate to the general application log, preventing duplicate or accidental mixed-sink records. Configuration is idempotent so app factories and tests do not accumulate handlers.

A small handler subclass overrides `handleError()` to increment a process-local failure counter and emit a payload-free warning through the normal application logger. Read-only functions expose the failure count and configured-sink status to startup diagnostics/tests. The request path remains available if the audit sink fails.

The file is an application handoff point, not proof of durable centralized retention. Production must mount or ship it to an access-controlled SIEM/object store with retention, integrity, alerting, and clock-synchronization controls. That deployment portion remains `REQUIRES_DEPLOYMENT_VERIFICATION`.

## Data flow

1. `ResponseSecurityMiddleware` validates or creates a request ID and binds it to the async context.
2. `PrivilegedActionAuditMiddleware` checks the method/path policy. Non-matching requests pass through with no audit work.
3. Authentication, CSRF validation, controller, and service logic execute normally.
4. The audit middleware observes the final response status or exception.
5. It obtains the user ID from request state, maps status to outcome, and calls `audit_log()` once.
6. `audit_log()` inherits the bound request ID, redacts allowed details defensively, serializes one JSON line, and hands it to the dedicated rotating handler.
7. The response boundary returns the same request ID in `X-Request-ID` and clears the context.

Agent SQL starts at step 5 inside `AIToolExecutor` because it is not a separate privileged HTTP endpoint.

## Error and privacy behavior

- Audit logging must never alter the API response status or body.
- A response that has already started is not buffered or rewritten.
- If downstream raises, one failure event is attempted and the exception follows the existing error boundary.
- Audit serialization uses the existing redaction helper as defense in depth, but call sites still use an allow-list of safe fields.
- Logger failure telemetry contains only the handler type and cumulative failure count, not the failed event.
- The actor falls back to a non-sensitive sentinel instead of inspecting cookies or request bodies.

## Testing strategy

Use test-driven development and existing pytest conventions.

1. `core.audit` unit tests:
   - inherits a bound request ID
   - explicit request ID overrides context
   - no request ID is emitted outside a bound context
   - dedicated handler configuration is idempotent
   - delivery failure increments safe telemetry without raising
2. Middleware unit/integration tests:
   - selected success, denied, ordinary failure, and exception outcomes
   - actor present after dependency/login processing
   - anonymous actor on pre-auth denial
   - exact one-event guarantee
   - unlisted routes produce no event
   - dynamic routes match without logging the route parameter
   - body/query/response/exception secrets never appear
   - request ID in event equals `X-Request-ID`
3. Human SQL service regression test:
   - `DatabaseService.execute_query()` forwards `user_id`
   - lower execution layer no longer emits a duplicate audit event
4. Agent SQL tests:
   - success, policy denial, and execution failure each emit one sanitized event
   - raw SQL and database name are absent
5. Focused backend tests, Ruff formatting/lint, and the full indexed backend test suite run before completion.

## Documentation

Update:

- `back-end/docs/security-va-learning-log.md` with the corrected current-state validation, impact, exploit/detection scenario, remediation, verification commands, and deployment caveat.
- Relevant backend operations/setup documentation with the new audit environment variables, file location, rotation behavior, and production shipping requirement.
- The source finding status only if the audit documents use explicit remediation status fields; preserve the original finding text as historical evidence.

## Compatibility and migration

- No HTTP contract changes.
- Existing audit JSON fields remain compatible; correlated HTTP events gain `request_id` automatically.
- Human SQL event resources change from database-specific strings to the privacy-safe `db:query` category.
- Operations must make `AUDIT_LOG_FILE` writable and ship rotated files before treating centralized retention as verified.
- No database schema or data migration is required.

## Acceptance criteria

- Every route in the policy table emits exactly one sanitized event with actor, action, resource, outcome, and the response's request ID.
- Unlisted routes emit no middleware event.
- Human SQL events identify the authenticated user and do not duplicate.
- Agent SQL success, rejection, and failure are auditable without logging raw SQL or database identity.
- A broken audit file sink is observable but does not break the API request.
- Targeted and regression tests pass, and documentation clearly separates application remediation from production deployment verification.
