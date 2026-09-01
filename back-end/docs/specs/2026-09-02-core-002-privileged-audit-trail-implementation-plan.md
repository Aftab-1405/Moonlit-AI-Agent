# CORE-002 Privileged-Action Audit Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a correlated, privacy-safe, observable audit trail for selected privileged HTTP actions and agent-generated SQL while emitting exactly one event per action.

**Architecture:** Keep `core.audit.audit_log()` as the only event emitter, add a dedicated rotating JSON-lines sink, and place a pure-ASGI policy middleware immediately inside the existing request-ID response boundary. The middleware owns human HTTP security events; `AIToolExecutor` owns agent SQL events, while lower database operations retain only execution and query-history responsibilities.

**Tech Stack:** Python 3.12+, FastAPI, Starlette ASGI, Python `logging`/`RotatingFileHandler`, pytest/pytest-asyncio, Ruff, uv 0.12.5.

**Spec:** `back-end/docs/specs/2026-09-02-core-002-privileged-audit-trail-design.md`

## Global Constraints

- Emit exactly one structured security event for each selected privileged HTTP action.
- Preserve every public HTTP request and response contract.
- Never log request/response bodies, raw SQL, database names, route parameters, conversation or memory content, tokens, cookies, passwords, connection strings, or raw exception text.
- Use only the Python standard library and existing project dependencies.
- Audit sink failure must be visible but must not change the user-facing operation result.
- The application sink is a handoff point; centralized immutable retention remains `REQUIRES_DEPLOYMENT_VERIFICATION`.
- Follow test-driven development: add each focused regression first, run it and observe the expected failure, then write the minimum implementation.
- Run commands from `back-end/` with `APP_ENV=testing SECRET_KEY=test-secret-key` unless a step explicitly says otherwise.
- Run every `git add`/`git commit` command from the repository root because those pathspecs include the `back-end/` prefix.

---

## File map

- Create `core/audit_middleware.py`: immutable privileged-route policy, matching, actor extraction, status classification, and streaming-safe ASGI observation.
- Modify `core/audit.py`: request-ID inheritance, dedicated rotating handler, and payload-free delivery-failure telemetry.
- Modify `config.py`: typed audit file/rotation settings.
- Modify `main.py`: configure the audit sink and register middleware in the required order.
- Modify `service/database/database_service.py`: preserve authenticated user plumbing into the lower executor.
- Modify `service/database/operations.py`: remove duplicate human SQL security events.
- Modify `service/database/ai_tool_executor.py`: emit one sanitized terminal agent SQL event.
- Modify/add tests under `tests/`: emitter, middleware, SQL plumbing, privacy, outcome, and no-duplicate regressions.
- Modify `docs/security-va-learning-log.md`, `security-audit/findings/04-core-security-errors-audit-logging.md`, and `README.md`: record the fixed source state, operational settings, verification, and deployment caveat.

---

### Task 1: Correlated emitter and observable rotating audit sink

**Files:**
- Modify: `back-end/core/audit.py`
- Modify: `back-end/config.py`
- Modify: `back-end/tests/test_core_audit.py`

**Interfaces:**
- Consumes: `core.logging.current_request_id() -> str | None` and existing `core.security.redact()`.
- Produces: `configure_audit_logging(path: str, *, max_bytes: int, backup_count: int) -> bool`, `audit_sink_configured() -> bool`, `audit_delivery_failure_count() -> int`, and the existing keyword-only `audit_log() -> None` interface with automatic request-ID inheritance.

- [x] **Step 1: Establish the focused baseline**

Run:

```bash
APP_ENV=testing SECRET_KEY=test-secret-key uv run --locked pytest -q tests/test_core_audit.py tests/test_core_logging.py
```

Expected: the existing focused tests pass before the new tests are added.

- [x] **Step 2: Add failing request-correlation tests**

Append tests that bind and always clear context:

```python
from core.logging import bind_request_id, clear_request_id


def test_inherits_bound_request_id(audit_buffer: io.StringIO) -> None:
    bind_request_id("req-core-002")
    try:
        audit_log(
            actor="user:u-123",
            action="settings.update",
            resource="user:settings",
            outcome="success",
        )
    finally:
        clear_request_id()

    assert _last_audit_record(audit_buffer)["request_id"] == "req-core-002"


def test_explicit_request_id_overrides_bound_context(audit_buffer: io.StringIO) -> None:
    bind_request_id("req-context")
    try:
        audit_log(
            actor="user:u-123",
            action="settings.update",
            resource="user:settings",
            outcome="success",
            request_id="req-explicit",
        )
    finally:
        clear_request_id()

    assert _last_audit_record(audit_buffer)["request_id"] == "req-explicit"
```

- [x] **Step 3: Add failing sink configuration and failure-telemetry tests**

Test a real temporary file, idempotency, and direct safe failure reporting:

```python
def test_configures_one_dedicated_rotating_sink(tmp_path) -> None:
    from core.audit import audit_log, audit_sink_configured, configure_audit_logging

    audit_path = tmp_path / "audit.jsonl"
    audit_logger = logging.getLogger("audit")
    try:
        assert configure_audit_logging(str(audit_path), max_bytes=4096, backup_count=2)
        assert configure_audit_logging(str(audit_path), max_bytes=4096, backup_count=2)
        assert audit_sink_configured()
        audit_log(
            actor="user:u-123",
            action="settings.update",
            resource="user:settings",
            outcome="success",
        )

        owned = [
            handler
            for handler in audit_logger.handlers
            if getattr(handler, "_moonlit_audit_handler", False)
        ]
        assert len(owned) == 1
        owned[0].flush()
        assert json.loads(audit_path.read_text(encoding="utf-8"))["action"] == "settings.update"
        assert audit_path.stat().st_mode & 0o777 == 0o600
    finally:
        for handler in list(audit_logger.handlers):
            if getattr(handler, "_moonlit_audit_handler", False):
                audit_logger.removeHandler(handler)
                handler.close()


def test_sink_handler_failure_is_counted_without_payload(
    caplog: pytest.LogCaptureFixture,
) -> None:
    from core.audit import _AuditRotatingFileHandler, audit_delivery_failure_count

    before = audit_delivery_failure_count()
    handler = object.__new__(_AuditRotatingFileHandler)
    record = logging.LogRecord("audit", logging.INFO, __file__, 1, "secret-payload", (), None)

    with caplog.at_level(logging.WARNING, logger="core.audit.delivery"):
        handler.handleError(record)

    assert audit_delivery_failure_count() == before + 1
    rendered = " ".join(item.getMessage() for item in caplog.records)
    assert "secret-payload" not in rendered
    assert "Audit sink write failed" in rendered
```

- [x] **Step 4: Run the new tests and verify RED**

Run:

```bash
APP_ENV=testing SECRET_KEY=test-secret-key uv run --locked pytest -q tests/test_core_audit.py
```

Expected: failures for missing context inheritance and missing sink/telemetry interfaces.

- [x] **Step 5: Implement request-ID inheritance and sink configuration**

In `core/audit.py`:

```python
from logging.handlers import RotatingFileHandler
from threading import Lock

from core.logging import current_request_id

_delivery_logger = logging.getLogger("core.audit.delivery")
_delivery_failure_lock = Lock()
_delivery_failures = 0


def _record_delivery_failure(handler_name: str) -> None:
    global _delivery_failures
    with _delivery_failure_lock:
        _delivery_failures += 1
        failure_count = _delivery_failures
    _delivery_logger.warning(
        "Audit sink write failed: handler=%s failure_count=%d",
        handler_name,
        failure_count,
    )


class _AuditRotatingFileHandler(RotatingFileHandler):
    _moonlit_audit_handler = True

    def _open(self):
        descriptor = os.open(
            self.baseFilename,
            os.O_WRONLY | os.O_APPEND | os.O_CREAT,
            0o600,
        )
        os.chmod(self.baseFilename, 0o600)
        return open(
            descriptor,
            self.mode,
            encoding=self.encoding,
            errors=self.errors,
            closefd=True,
        )

    def handleError(self, record: logging.LogRecord) -> None:
        del record
        _record_delivery_failure(type(self).__name__)


def audit_delivery_failure_count() -> int:
    with _delivery_failure_lock:
        return _delivery_failures


def audit_sink_configured() -> bool:
    return any(
        getattr(handler, "_moonlit_audit_handler", False)
        for handler in _audit_logger.handlers
    )


def configure_audit_logging(
    path: str,
    *,
    max_bytes: int,
    backup_count: int,
) -> bool:
    if max_bytes <= 0 or backup_count < 0:
        raise ValueError("Audit rotation settings are invalid")

    owned = [
        handler
        for handler in _audit_logger.handlers
        if getattr(handler, "_moonlit_audit_handler", False)
    ]
    if (
        len(owned) == 1
        and owned[0].baseFilename == os.path.abspath(path)
        and owned[0].maxBytes == max_bytes
        and owned[0].backupCount == backup_count
    ):
        return True

    try:
        handler = _AuditRotatingFileHandler(
            path,
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8",
        )
    except Exception:
        _record_delivery_failure("configuration")
        return False

    for existing in owned:
        _audit_logger.removeHandler(existing)
        existing.close()
    for existing in list(_audit_logger.handlers):
        if isinstance(existing, logging.NullHandler):
            _audit_logger.removeHandler(existing)
    _audit_logger.addHandler(handler)
    _audit_logger.propagate = False
    return True
```

Inside `audit_log()`, derive correlation before building the payload:

```python
effective_request_id = request_id or current_request_id()
if effective_request_id:
    payload["request_id"] = effective_request_id
```

Move redaction, payload construction, serialization, and logger dispatch inside the existing never-raise boundary so malformed optional metadata cannot break the request.

In `Config`, add:

```python
AUDIT_LOG_FILE = os.getenv("AUDIT_LOG_FILE", "audit.log")
AUDIT_LOG_MAX_BYTES = int(os.getenv("AUDIT_LOG_MAX_BYTES", "10485760"))
AUDIT_LOG_BACKUP_COUNT = int(os.getenv("AUDIT_LOG_BACKUP_COUNT", "10"))
```

Export the three public sink functions from `core.audit.__all__`.

- [x] **Step 6: Run focused tests and format/lint the task files**

Run:

```bash
APP_ENV=testing SECRET_KEY=test-secret-key uv run --locked pytest -q tests/test_core_audit.py tests/test_core_logging.py
uv run --locked ruff format core/audit.py config.py tests/test_core_audit.py
uv run --locked ruff check core/audit.py config.py tests/test_core_audit.py
```

Expected: all commands pass.

- [x] **Step 7: Commit Task 1**

```bash
git add back-end/core/audit.py back-end/config.py back-end/tests/test_core_audit.py
git commit -m "feat: configure correlated audit event sink"
```

---

### Task 2: Selective privileged-action ASGI middleware

**Files:**
- Create: `back-end/core/audit_middleware.py`
- Create: `back-end/tests/test_audit_middleware.py`
- Modify: `back-end/main.py`

**Interfaces:**
- Consumes: the keyword-only `core.audit.audit_log()` interface, request state populated by authentication dependencies, and the request context bound by `ResponseSecurityMiddleware`.
- Produces: `PrivilegedActionAuditMiddleware(app: ASGIApp)` and `match_privileged_action(method: str, path: str) -> PrivilegedActionPolicy | None`.

- [x] **Step 1: Write failing policy and middleware tests**

Create `tests/test_audit_middleware.py` with small raw-ASGI helpers and these essential assertions:

```python
import io
import json
import logging

import pytest

from core.audit_middleware import (
    PrivilegedActionAuditMiddleware,
    match_privileged_action,
)
from core.http_boundary import ResponseSecurityMiddleware


def http_scope(method: str, path: str, *, body: bytes = b"") -> dict:
    return {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [(b"content-length", str(len(body)).encode())],
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    }


def one_body_receive(body: bytes):
    sent = False

    async def receive() -> dict:
        nonlocal sent
        if sent:
            return {"type": "http.disconnect"}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    return receive


async def invoke(app, scope: dict, body: bytes = b"") -> list[dict]:
    sent: list[dict] = []

    async def send(message: dict) -> None:
        sent.append(message)

    await app(scope, one_body_receive(body), send)
    return sent


def response_header(sent: list[dict], name: bytes) -> str:
    start = next(message for message in sent if message["type"] == "http.response.start")
    return next(value.decode() for key, value in start["headers"] if key.lower() == name)


@pytest.mark.parametrize(
    ("method", "path", "action", "resource"),
    [
        ("POST", "/set_authenticated_user_session", "auth.login", "auth:session"),
        ("POST", "/logout_authenticated_user_session", "auth.logout", "auth:session"),
        ("POST", "/api/v1/connect_db", "db.connect", "db:connection"),
        ("POST", "/api/v1/disconnect_db", "db.disconnect", "db:connection"),
        ("POST", "/api/v1/switch_remote_database", "db.switch", "db:selection"),
        ("POST", "/api/v1/select_database", "db.select", "db:selection"),
        ("POST", "/api/v1/run_sql_query", "sql.execute", "db:query"),
        (
            "DELETE",
            "/api/v1/delete_conversation/private-conversation-id",
            "conversation.delete",
            "conversation:record",
        ),
        ("POST", "/api/v1/user/context/refresh", "context.refresh", "context:schema"),
        (
            "DELETE",
            "/api/v1/user/context/schema/private-database",
            "context.schema.delete",
            "context:schema",
        ),
        ("DELETE", "/api/v1/user/context/schemas", "context.schemas.delete", "context:schema"),
        (
            "DELETE",
            "/api/v1/user/context/queries",
            "context.queries.delete",
            "context:query-history",
        ),
        ("POST", "/api/v1/user/settings", "settings.update", "user:settings"),
        ("POST", "/api/v1/user/session/close", "session.close", "user:session"),
        ("POST", "/api/v1/context/metrics/reset", "context.metrics.reset", "context:metrics"),
    ],
)
def test_policy_matches_every_approved_route(
    method: str,
    path: str,
    action: str,
    resource: str,
) -> None:
    policy = match_privileged_action(method, path)
    assert policy is not None
    assert policy.action == action
    assert policy.resource == resource


def test_policy_rejects_wrong_methods_and_unlisted_routes() -> None:
    assert match_privileged_action("GET", "/api/v1/delete_conversation/private-conversation-id") is None
    assert match_privileged_action("POST", "/api/v1/health") is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status_code", "expected_outcome"),
    [(204, "success"), (401, "denied"), (403, "denied"), (422, "failure"), (500, "failure")],
)
async def test_emits_exactly_one_correlated_event_for_selected_route(
    status_code: int,
    expected_outcome: str,
) -> None:
    audit_buffer = io.StringIO()
    handler = logging.StreamHandler(audit_buffer)
    audit_logger = logging.getLogger("audit")
    audit_logger.addHandler(handler)

    async def endpoint(scope, receive, send) -> None:
        del receive
        scope.setdefault("state", {})["user"] = {"uid": "user-1", "email": "private@example.com"}
        await send({"type": "http.response.start", "status": status_code, "headers": []})
        await send({"type": "http.response.body", "body": b"private-response"})

    app = ResponseSecurityMiddleware(
        PrivilegedActionAuditMiddleware(endpoint),
        security_headers={},
        server_header="Moonlit",
    )
    scope = http_scope("POST", "/api/v1/user/settings", body=b"private-request")
    try:
        sent = await invoke(app, scope, b"private-request")
    finally:
        audit_logger.removeHandler(handler)

    payloads = [json.loads(line) for line in audit_buffer.getvalue().splitlines() if line]
    assert len(payloads) == 1
    assert payloads[0]["actor"] == "user:user-1"
    assert payloads[0]["action"] == "settings.update"
    assert payloads[0]["resource"] == "user:settings"
    assert payloads[0]["outcome"] == expected_outcome
    assert payloads[0]["request_id"] == response_header(sent, b"x-request-id")
    rendered = audit_buffer.getvalue()
    assert "private-request" not in rendered
    assert "private-response" not in rendered
    assert "private@example.com" not in rendered
```

Also add focused tests using the module-level middleware import so the emitter can be isolated:

```python
@pytest.mark.asyncio
async def test_unlisted_route_emits_no_event(monkeypatch: pytest.MonkeyPatch) -> None:
    import core.audit_middleware as audit_middleware_module

    events: list[dict] = []
    monkeypatch.setattr(audit_middleware_module, "audit_log", lambda **event: events.append(event))

    async def endpoint(scope, receive, send) -> None:
        del scope, receive
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    app = PrivilegedActionAuditMiddleware(endpoint)
    await invoke(app, http_scope("GET", "/api/v1/health"))
    assert events == []


@pytest.mark.asyncio
async def test_pre_auth_denial_uses_anonymous_actor(monkeypatch: pytest.MonkeyPatch) -> None:
    import core.audit_middleware as audit_middleware_module

    events: list[dict] = []
    monkeypatch.setattr(audit_middleware_module, "audit_log", lambda **event: events.append(event))

    async def denied(scope, receive, send) -> None:
        del scope, receive
        await send({"type": "http.response.start", "status": 401, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    app = PrivilegedActionAuditMiddleware(denied)
    await invoke(app, http_scope("POST", "/api/v1/connect_db"))
    assert len(events) == 1
    assert events[0]["actor"] == "user:anonymous"
    assert events[0]["outcome"] == "denied"


@pytest.mark.asyncio
async def test_downstream_exception_emits_one_failure_then_reraises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import core.audit_middleware as audit_middleware_module

    events: list[dict] = []
    monkeypatch.setattr(audit_middleware_module, "audit_log", lambda **event: events.append(event))

    async def failing(scope, receive, send) -> None:
        del scope, receive, send
        raise RuntimeError("private-exception")

    middleware = PrivilegedActionAuditMiddleware(failing)
    scope = http_scope("POST", "/api/v1/user/settings")

    async def send(message: dict) -> None:
        del message

    with pytest.raises(RuntimeError, match="private-exception"):
        await middleware(scope, one_body_receive(b""), send)
    assert len(events) == 1
    assert events[0]["outcome"] == "failure"
    assert "private-exception" not in json.dumps(events)
```

The helper `http_scope()` sets only method/path/body length; no test permits the user-controlled body to enter an audit expectation.

- [x] **Step 2: Run middleware tests and verify RED**

Run:

```bash
APP_ENV=testing SECRET_KEY=test-secret-key uv run --locked pytest -q tests/test_audit_middleware.py
```

Expected: import failure because `core.audit_middleware` does not exist.

- [x] **Step 3: Implement the immutable route policy and ASGI observer**

Create `core/audit_middleware.py`:

```python
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Pattern

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from core.audit import audit_log


@dataclass(frozen=True)
class PrivilegedActionPolicy:
    method: str
    path_pattern: Pattern[str]
    action: str
    resource: str


def _policy(method: str, path_pattern: str, action: str, resource: str) -> PrivilegedActionPolicy:
    return PrivilegedActionPolicy(method, re.compile(path_pattern), action, resource)


PRIVILEGED_ACTION_POLICIES = (
    _policy("POST", r"^/set_authenticated_user_session$", "auth.login", "auth:session"),
    _policy("POST", r"^/logout_authenticated_user_session$", "auth.logout", "auth:session"),
    _policy("POST", r"^/api/v1/connect_db$", "db.connect", "db:connection"),
    _policy("POST", r"^/api/v1/disconnect_db$", "db.disconnect", "db:connection"),
    _policy("POST", r"^/api/v1/switch_remote_database$", "db.switch", "db:selection"),
    _policy("POST", r"^/api/v1/select_database$", "db.select", "db:selection"),
    _policy("POST", r"^/api/v1/run_sql_query$", "sql.execute", "db:query"),
    _policy("DELETE", r"^/api/v1/delete_conversation/[^/]+$", "conversation.delete", "conversation:record"),
    _policy("POST", r"^/api/v1/user/context/refresh$", "context.refresh", "context:schema"),
    _policy("DELETE", r"^/api/v1/user/context/schema/[^/]+$", "context.schema.delete", "context:schema"),
    _policy("DELETE", r"^/api/v1/user/context/schemas$", "context.schemas.delete", "context:schema"),
    _policy("DELETE", r"^/api/v1/user/context/queries$", "context.queries.delete", "context:query-history"),
    _policy("POST", r"^/api/v1/user/settings$", "settings.update", "user:settings"),
    _policy("POST", r"^/api/v1/user/session/close$", "session.close", "user:session"),
    _policy("POST", r"^/api/v1/context/metrics/reset$", "context.metrics.reset", "context:metrics"),
)


def match_privileged_action(method: str, path: str) -> PrivilegedActionPolicy | None:
    return next(
        (
            policy
            for policy in PRIVILEGED_ACTION_POLICIES
            if policy.method == method and policy.path_pattern.fullmatch(path)
        ),
        None,
    )


def _actor(scope: Scope) -> str:
    state = scope.get("state")
    user = state.get("user") if isinstance(state, dict) else None
    uid = user.get("uid") if isinstance(user, dict) else None
    return f"user:{uid}" if isinstance(uid, str) and uid else "user:anonymous"


def _outcome(status_code: int) -> str:
    if status_code in {401, 403}:
        return "denied"
    if 200 <= status_code < 400:
        return "success"
    return "failure"


class PrivilegedActionAuditMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        policy = match_privileged_action(scope["method"], scope.get("path", ""))
        if policy is None:
            await self.app(scope, receive, send)
            return

        status_code: int | None = None

        async def observe_send(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = int(message["status"])
            await send(message)

        try:
            await self.app(scope, receive, observe_send)
        except Exception:
            final_status = 500
            audit_log(
                actor=_actor(scope),
                action=policy.action,
                resource=policy.resource,
                outcome="failure",
                details={"http_method": policy.method, "status_code": final_status},
            )
            raise

        final_status = status_code or 500
        audit_log(
            actor=_actor(scope),
            action=policy.action,
            resource=policy.resource,
            outcome=_outcome(final_status),
            details={"http_method": policy.method, "status_code": final_status},
        )
```

- [x] **Step 4: Configure the sink and wire middleware in the required order**

In `main.py`, import and configure once after general logging:

```python
from core.audit import configure_audit_logging
from core.audit_middleware import PrivilegedActionAuditMiddleware

configure_audit_logging(
    AppConfig.AUDIT_LOG_FILE,
    max_bytes=AppConfig.AUDIT_LOG_MAX_BYTES,
    backup_count=AppConfig.AUDIT_LOG_BACKUP_COUNT,
)
```

Register `PrivilegedActionAuditMiddleware` after `RequestBodyLimitMiddleware` and before `ResponseSecurityMiddleware`:

```python
app.add_middleware(PrivilegedActionAuditMiddleware)
app.add_middleware(
    ResponseSecurityMiddleware,
    security_headers={
        "X-Content-Type-Options": AppConfig.SECURITY_HEADER_CONTENT_TYPE_OPTIONS,
        "X-Frame-Options": AppConfig.SECURITY_HEADER_FRAME_OPTIONS,
        "X-XSS-Protection": AppConfig.SECURITY_HEADER_XSS_PROTECTION,
        "Strict-Transport-Security": AppConfig.SECURITY_HEADER_HSTS,
        "Referrer-Policy": AppConfig.SECURITY_HEADER_REFERRER_POLICY,
        "Permissions-Policy": AppConfig.SECURITY_HEADER_PERMISSIONS_POLICY,
    },
    server_header=AppConfig.SERVER_HEADER_VALUE,
)
```

Because Starlette prepends newly added middleware, this registration produces response boundary -> audit -> body limit -> CSRF/auth/routes.

- [x] **Step 5: Add and pass an application-order regression**

Add to `tests/test_audit_middleware.py`:

```python
def test_application_middleware_order_binds_request_id_before_audit() -> None:
    from main import create_app

    app = create_app()
    middleware_classes = [entry.cls for entry in app.user_middleware]
    response_index = middleware_classes.index(ResponseSecurityMiddleware)
    audit_index = middleware_classes.index(PrivilegedActionAuditMiddleware)
    body_index = middleware_classes.index(RequestBodyLimitMiddleware)
    assert response_index < audit_index < body_index
```

Run:

```bash
APP_ENV=testing SECRET_KEY=test-secret-key uv run --locked pytest -q tests/test_audit_middleware.py tests/test_request_boundary.py tests/test_http_error_boundary.py tests/test_core_audit.py
uv run --locked ruff format core/audit_middleware.py main.py tests/test_audit_middleware.py
uv run --locked ruff check core/audit_middleware.py main.py tests/test_audit_middleware.py
```

Expected: all commands pass.

- [x] **Step 6: Commit Task 2**

```bash
git add back-end/core/audit_middleware.py back-end/main.py back-end/tests/test_audit_middleware.py
git commit -m "feat: audit privileged HTTP actions"
```

---

### Task 3: Remove duplicate human SQL events and preserve actor plumbing

**Files:**
- Modify: `back-end/service/database/database_service.py`
- Modify: `back-end/service/database/operations.py`
- Modify: `back-end/tests/test_tool_error_safety.py`

**Interfaces:**
- Consumes: existing `DatabaseService.execute_query(db_config, sql_query, user_id, max_rows, timeout)`.
- Produces: `execute_sql_query(db_config, sql_query, user_id=user_id, max_rows=max_rows, timeout_seconds=timeout)` invocation while the privileged HTTP middleware remains the sole human `sql.execute` security-event owner.

- [x] **Step 1: Write failing actor-forwarding and no-lower-event tests**

Add a service plumbing test:

```python
def test_database_service_forwards_sql_actor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def execute_stub(db_config, sql_query, *, user_id, max_rows, timeout_seconds):
        captured.update(
            db_config=db_config,
            sql_query=sql_query,
            user_id=user_id,
            max_rows=max_rows,
            timeout_seconds=timeout_seconds,
        )
        return {"status": "success", "row_count": 0}

    monkeypatch.setattr(database_operations, "execute_sql_query", execute_stub)
    context_sync = _ContextSync()
    monkeypatch.setattr(context_sync_module, "get_default_context_sync", lambda: context_sync)
    result = DatabaseService.execute_query(
        {"db_type": "mysql", "database": "private-db"},
        "SELECT 1",
        "user-1",
        max_rows=25,
        timeout=7,
    )

    assert result["status"] == "success"
    assert captured["user_id"] == "user-1"
```

Convert the existing lower-operation audit assertions into one duplication regression:

```python
@contextmanager
def _capture_direct_audit_records():
    records: list[logging.LogRecord] = []

    class Handler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record)

    handler = Handler()
    audit_logger = logging.getLogger("audit")
    audit_logger.addHandler(handler)
    try:
        yield records
    finally:
        audit_logger.removeHandler(handler)


def test_lower_sql_operation_does_not_emit_http_security_event(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = _SuccessfulQueryCursor()

    class Adapter:
        def get_health_check_sql(self) -> str:
            return "HEALTH CHECK"

        def get_set_timeout_sql(self, timeout_seconds: int):
            del timeout_seconds
            return None

        def get_column_names_from_cursor(self, selected_cursor: Any) -> list[str]:
            assert selected_cursor is cursor
            return ["salary"]

    monkeypatch.setattr("service.database.adapters.get_adapter", lambda _db_type: Adapter())
    monkeypatch.setattr(
        "service.database.connection_manager.get_connection_manager",
        lambda: _QueryManager(cursor),
    )
    with _capture_direct_audit_records() as records:
        result = database_operations.execute_sql_query(
            {"db_type": "mysql", "database": "private-db"},
            "SELECT 'private-sql'",
            user_id="user-1",
        )
    assert result["status"] == "success"
    assert _audit_payloads(records) == []
```

Retain the existing marker-based public-error and safe-log tests; remove only assertions that require `operations.execute_sql_query()` itself to be an audit emitter.

- [x] **Step 2: Run the two tests and verify RED**

Run:

```bash
APP_ENV=testing SECRET_KEY=test-secret-key uv run --locked pytest -q \
  tests/test_tool_error_safety.py::test_database_service_forwards_sql_actor \
  tests/test_tool_error_safety.py::test_lower_sql_operation_does_not_emit_http_security_event
```

Expected: actor-forwarding fails because the keyword is missing; no-lower-event fails because the old audit call remains.

- [x] **Step 3: Make the minimum service and operations changes**

Update `DatabaseService.execute_query()`:

```python
result = execute_sql_query(
    db_config,
    sql_query,
    user_id=user_id,
    max_rows=max_rows,
    timeout_seconds=timeout,
)
```

In `service/database/operations.py`, remove `from core.audit import audit_log` and the four `audit_log` call blocks from success, validation denial, connection failure, and general failure. Do not alter result shapes, timeout behavior, safe ordinary logging, or query execution.

- [x] **Step 4: Run SQL safety and policy regressions**

Run:

```bash
APP_ENV=testing SECRET_KEY=test-secret-key uv run --locked pytest -q \
  tests/test_tool_error_safety.py \
  tests/test_sql_function_policy.py \
  tests/test_audit_middleware.py
uv run --locked ruff format service/database/database_service.py service/database/operations.py tests/test_tool_error_safety.py
uv run --locked ruff check service/database/database_service.py service/database/operations.py tests/test_tool_error_safety.py
```

Expected: all commands pass and middleware tests still prove exactly one human HTTP SQL event.

- [x] **Step 5: Commit Task 3**

```bash
git add back-end/service/database/database_service.py back-end/service/database/operations.py back-end/tests/test_tool_error_safety.py
git commit -m "fix: centralize human SQL audit events"
```

---

### Task 4: Audit agent SQL terminal outcomes without query leakage

**Files:**
- Modify: `back-end/service/database/ai_tool_executor.py`
- Modify: `back-end/tests/test_tool_error_safety.py`

**Interfaces:**
- Consumes: the keyword-only `core.audit.audit_log()` interface and existing `AIToolExecutor._execute_query()` result contracts.
- Produces: one `agent.sql.execute` event per invocation with actor, `db:agent-query`, terminal outcome, and allow-listed details.

- [x] **Step 1: Write failing success, denial, and failure audit tests**

Reuse the direct logger capture helper added in Task 3 so tests remain valid after the audit logger stops propagating:

```python
assert callable(_capture_direct_audit_records)
```

Use the module's `_ContextSync` fake and monkeypatch the inner executor:

```python
@pytest.mark.parametrize(
    ("inner_result", "expected_outcome", "expected_details"),
    [
        (
            {
                "status": "success",
                "columns": ["value"],
                "result": [{"value": 1}],
                "row_count": 1,
                "truncated": False,
                "query_type": "SELECT",
            },
            "success",
            {"statement_type": "SELECT", "row_count": 1},
        ),
        (
            {
                "status": "error",
                "error_code": "QUERY_POLICY_DENIED",
                "message": "Query blocked by policy.",
            },
            "denied",
            {"reason": "QUERY_POLICY_DENIED"},
        ),
        (
            {
                "status": "error",
                "error_code": "DB_PERMISSION_DENIED",
                "message": "Database permission denied.",
            },
            "failure",
            {"reason": "DB_PERMISSION_DENIED"},
        ),
    ],
)
def test_agent_sql_emits_one_sanitized_terminal_event(
    monkeypatch: pytest.MonkeyPatch,
    inner_result: dict,
    expected_outcome: str,
    expected_details: dict,
) -> None:
    context_sync = _ContextSync()
    monkeypatch.setattr(context_sync_module, "get_default_context_sync", lambda: context_sync)
    monkeypatch.setattr(
        AIToolExecutor,
        "_execute_query_with_db_config",
        staticmethod(lambda *_args: dict(inner_result)),
    )
    query = "SELECT 'private-sql' FROM private_table"
    db_config = {"db_type": "mysql", "database": "private-db"}

    with _capture_direct_audit_records() as records:
        AIToolExecutor._execute_query("user-1", query, 100, db_config)

    payloads = _audit_payloads(records)
    assert len(payloads) == 1
    assert payloads[0]["actor"] == "user:user-1"
    assert payloads[0]["action"] == "agent.sql.execute"
    assert payloads[0]["resource"] == "db:agent-query"
    assert payloads[0]["outcome"] == expected_outcome
    assert payloads[0]["details"] == expected_details
    rendered = " ".join(record.getMessage() for record in records)
    assert "private-sql" not in rendered
    assert "private_table" not in rendered
    assert "private-db" not in rendered
```

Add one early-failure assertion for missing connection/config so every terminal return is covered and still emits one `failure` event.

- [x] **Step 2: Run the new agent tests and verify RED**

Run:

```bash
APP_ENV=testing SECRET_KEY=test-secret-key uv run --locked pytest -q tests/test_tool_error_safety.py -k "agent_sql_emits or agent_sql_missing"
```

Expected: no audit records are captured.

- [x] **Step 3: Add one allow-list audit helper and wrap terminal returns**

In `ai_tool_executor.py`, import `audit_log` and add:

```python
def _audited_agent_query_result(
    user_id: str,
    result: Dict,
    *,
    outcome: str,
    details: Dict | None = None,
) -> Dict:
    audit_log(
        actor=f"user:{user_id}" if user_id else "user:unknown",
        action="agent.sql.execute",
        resource="db:agent-query",
        outcome=outcome,
        details=details or {},
    )
    return result
```

Wrap every terminal `_execute_query()` return exactly once:

```python
return _audited_agent_query_result(
    user_id,
    public_result,
    outcome="success",
    details={
        "statement_type": result.get("query_type", "UNKNOWN"),
        "row_count": len(result_data),
    },
)
```

For errors:

```python
error_code = result.get("error_code", "DB_OPERATION_FAILED")
outcome = "denied" if error_code == "QUERY_POLICY_DENIED" else "failure"
return _audited_agent_query_result(
    user_id,
    public_result,
    outcome=outcome,
    details={"reason": error_code},
)
```

Use this terminal mapping; no branch may derive audit details from its human-readable error message:

| `_execute_query()` terminal path | Outcome | Details |
| --- | --- | --- |
| empty query | `failure` | `{"reason": "QUERY_REQUIRED"}` |
| no active connection | `failure` | `{"reason": "DB_CONNECTION_REQUIRED"}` |
| no database config | `failure` | `{"reason": "DB_CONNECTION_REQUIRED"}` |
| inner `status=success` | `success` | `{"statement_type": query_type, "row_count": returned_count}` |
| inner `error_code=QUERY_POLICY_DENIED` | `denied` | `{"reason": "QUERY_POLICY_DENIED"}` |
| any other inner error | `failure` | `{"reason": stable_error_code}` |
| caught outer exception | `failure` | `{"reason": public.code}` |

For example, the empty-query return becomes:

```python
if not query:
    return _audited_agent_query_result(
        user_id,
        {"error": "Query is required"},
        outcome="failure",
        details={"reason": "QUERY_REQUIRED"},
    )
```

Give query-length, unsafe-query, and non-read-only returns from `_execute_query_with_db_config()` the stable `error_code="QUERY_POLICY_DENIED"`. Add `query_type=analysis["query_type"]` only to its internal success result; `_execute_query()` consumes it for audit details and does not add it to the public tool result.

- [x] **Step 4: Run agent, tool-contract, and privacy regressions**

Run:

```bash
APP_ENV=testing SECRET_KEY=test-secret-key uv run --locked pytest -q \
  tests/test_tool_error_safety.py \
  tests/test_tool_result_contracts.py \
  tests/test_sql_function_policy.py
uv run --locked ruff format service/database/ai_tool_executor.py tests/test_tool_error_safety.py
uv run --locked ruff check service/database/ai_tool_executor.py tests/test_tool_error_safety.py
```

Expected: all commands pass; existing UI/tool result shapes remain unchanged except the previously generic policy error code becomes the stable `QUERY_POLICY_DENIED` code.

- [x] **Step 5: Commit Task 4**

```bash
git add back-end/service/database/ai_tool_executor.py back-end/tests/test_tool_error_safety.py
git commit -m "feat: audit agent SQL outcomes"
```

---

### Task 5: Document remediation and run complete validation

**Files:**
- Modify: `back-end/docs/security-va-learning-log.md`
- Modify: `back-end/security-audit/findings/04-core-security-errors-audit-logging.md`
- Modify: `back-end/README.md`

**Interfaces:**
- Consumes: verified test output and final source behavior from Tasks 1-4.
- Produces: operational instructions and a durable VA validation record that distinguishes application remediation from deployment verification.

- [x] **Step 1: Update the VA learning log**

Set `Last updated: 2026-09-02`, add CORE-002 to the summary as `VALID — FIXED`, and add a section containing:

```markdown
## CORE-002 — Privileged actions lacked a reliable correlated audit trail

### Validation and verdict

The request-ID portion of the original finding had already been fixed, but event coverage,
SQL actor attribution, agent SQL auditing, and audit-sink observability remained valid.

Verdict: **VALID — FIXED** in application source on 2026-09-02.

### Selected remediation

- Added an explicit privileged-route audit matrix and pure-ASGI outcome middleware.
- Correlated HTTP audit events with the validated response `X-Request-ID`.
- Centralized human SQL HTTP auditing to prevent duplicate events.
- Added sanitized terminal events for agent-generated SQL.
- Configured a dedicated rotating JSON-lines file and payload-free failure telemetry.
- Excluded raw SQL, bodies, database names, route identifiers, tokens, cookies, and exceptions.

### Residual risk and VA lesson

The file sink is not evidence of centralized immutable retention. Production collection,
access controls, tamper resistance, retention, alerts, disk capacity, and clock synchronization
remain `REQUIRES_DEPLOYMENT_VERIFICATION`.
```

Add the exact final test counts only after Step 4 supplies them; do not estimate or copy old counts.

- [x] **Step 2: Update the source finding without erasing history**

Under `[CORE-002]`, add:

```markdown
Status: **FIXED IN APPLICATION SOURCE (2026-09-02)** — centralized immutable retention still
requires deployment verification.
```

Append `Implemented Remediation` and `Application Verification` subsections. Preserve the original evidence as historical audit material and explicitly note that its request-ID claims became stale before this remediation.

- [x] **Step 3: Document audit operations in the backend README**

Add the settings and usage:

````markdown
### Security audit log

Privileged security events are written as JSON Lines to `AUDIT_LOG_FILE` (`audit.log` by default).
Rotation defaults to 10 MiB with 10 backups:

```env
AUDIT_LOG_FILE=audit.log
AUDIT_LOG_MAX_BYTES=10485760
AUDIT_LOG_BACKUP_COUNT=10
```

The application file is a local handoff point. Production must mount or ship every rotated file
to an access-controlled, tamper-resistant centralized sink and alert on delivery failures.
Never treat the presence of `audit.log` alone as compliance evidence.
````

Add `audit.log` beside `backend.log` in the operational notes and explain that both target paths must be writable.

- [x] **Step 4: Run focused, full indexed, lint, formatting, and diff validation**

Run targeted tests first:

```bash
APP_ENV=testing SECRET_KEY=test-secret-key uv run --locked pytest -q \
  tests/test_core_audit.py \
  tests/test_core_logging.py \
  tests/test_audit_middleware.py \
  tests/test_request_boundary.py \
  tests/test_http_error_boundary.py \
  tests/test_tool_error_safety.py \
  tests/test_tool_result_contracts.py \
  tests/test_sql_function_policy.py
```

Run the tracked suite while excluding the known ignored local terminal-contract file:

```bash
APP_ENV=testing SECRET_KEY=test-secret-key uv run --locked pytest -q \
  tests --ignore=tests/test_conversation_streaming_terminal_contract.py
```

Run static validation:

```bash
uv run --locked ruff format --check .
uv run --locked ruff check .
git diff --check
```

Recorded outcome: both pytest commands and repository-wide `ruff check .` passed. Repository-wide
`ruff format --check .` identified 37 pre-existing files; formatter-clean CORE-002 files passed a
targeted check, and unrelated mechanical formatting was deliberately not introduced. The exact
evidence and caveat are recorded in both security documents.

- [x] **Step 5: Perform mandatory changed-file cleanup and self-review**

Inspect:

```bash
git diff --stat
git diff -- core/audit.py core/audit_middleware.py config.py main.py
git diff -- service/database/database_service.py service/database/operations.py service/database/ai_tool_executor.py
git diff -- tests/test_core_audit.py tests/test_audit_middleware.py tests/test_tool_error_safety.py
git diff -- docs/security-va-learning-log.md security-audit/findings/04-core-security-errors-audit-logging.md README.md
```

Confirm no debug output, dead imports, duplicate audit ownership, broad path matching, raw sensitive values, unrelated formatting, or stale finding claims remain. Re-run the relevant focused command after any correction.

- [x] **Step 6: Record exact evidence and commit documentation**

Insert the actual test counts and command outcomes from Step 4 into both security documents, then run `git diff --check` again.

```bash
git add \
  back-end/docs/specs/2026-09-02-core-002-privileged-audit-trail-implementation-plan.md \
  back-end/docs/security-va-learning-log.md \
  back-end/security-audit/findings/04-core-security-errors-audit-logging.md \
  back-end/README.md
git commit -m "docs: record CORE-002 audit remediation"
```

- [ ] **Step 7: Final branch verification**

Run:

```bash
git status --short
git log -6 --oneline
```

Expected: no unstaged implementation changes; report commits, exact validation commands/counts, and the remaining production SIEM/retention verification requirement.
