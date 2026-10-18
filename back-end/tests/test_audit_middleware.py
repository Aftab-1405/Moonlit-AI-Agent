"""Behavioral tests for the selective privileged-action audit boundary."""

from __future__ import annotations

import io
import json
import logging
from collections.abc import Awaitable, Callable

import pytest

from core.audit_middleware import (
    PrivilegedActionAuditMiddleware,
    match_privileged_action,
)
from core.http_boundary import RequestBodyLimitMiddleware, ResponseSecurityMiddleware

ASGIMessage = dict[str, object]
Receive = Callable[[], Awaitable[ASGIMessage]]
Send = Callable[[ASGIMessage], Awaitable[None]]

APPROVED_ROUTE_CASES = [
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
    ("DELETE", "/api/v1/user/account", "account.delete", "user:account"),
    ("POST", "/api/v1/context/metrics/reset", "context.metrics.reset", "context:metrics"),
]


def http_scope(method: str, path: str, *, body: bytes = b"") -> ASGIMessage:
    """Build the minimal real HTTP scope consumed by the middleware."""
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


def one_body_receive(body: bytes) -> Receive:
    """Return one request frame, followed by a disconnect if read again."""
    delivered = False

    async def receive() -> ASGIMessage:
        nonlocal delivered
        if delivered:
            return {"type": "http.disconnect"}
        delivered = True
        return {"type": "http.request", "body": body, "more_body": False}

    return receive


async def invoke(app, scope: ASGIMessage, body: bytes = b"") -> list[ASGIMessage]:
    """Invoke an ASGI application and capture every response frame."""
    sent: list[ASGIMessage] = []

    async def send(message: ASGIMessage) -> None:
        sent.append(message)

    await app(scope, one_body_receive(body), send)
    return sent


def response_header(sent: list[ASGIMessage], name: bytes) -> str:
    """Read one response header value case-insensitively."""
    start = next(message for message in sent if message["type"] == "http.response.start")
    headers = start["headers"]
    return next(value.decode() for key, value in headers if key.lower() == name)


@pytest.fixture
def audit_buffer():
    """Capture records directly because the production audit logger does not propagate."""
    buffer = io.StringIO()
    handler = logging.StreamHandler(buffer)
    audit_logger = logging.getLogger("audit")
    audit_logger.addHandler(handler)
    try:
        yield buffer
    finally:
        audit_logger.removeHandler(handler)


def audit_payloads(buffer: io.StringIO) -> list[dict]:
    """Decode captured JSON-lines records."""
    return [json.loads(line) for line in buffer.getvalue().splitlines() if line]


@pytest.mark.parametrize(("method", "path", "action", "resource"), APPROVED_ROUTE_CASES)
def test_policy_matches_every_approved_route(
    method: str,
    path: str,
    action: str,
    resource: str,
) -> None:
    """Catch an approved privileged route disappearing from the audit matrix."""
    policy = match_privileged_action(method, path)

    assert policy is not None
    assert policy.action == action
    assert policy.resource == resource


def test_policy_rejects_wrong_methods_and_unlisted_routes() -> None:
    """Keep the audit boundary selective instead of logging ordinary traffic."""
    assert match_privileged_action("GET", "/api/v1/delete_conversation/private-id") is None
    assert match_privileged_action("POST", "/api/v1/health") is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status_code", "expected_outcome"),
    [(204, "success"), (302, "success"), (401, "denied"), (403, "denied"), (422, "failure"), (500, "failure")],
)
async def test_selected_route_emits_one_correlated_sanitized_event(
    status_code: int,
    expected_outcome: str,
    audit_buffer: io.StringIO,
) -> None:
    """Catch duplicate, uncorrelated, misclassified, or content-bearing events."""

    async def endpoint(scope: ASGIMessage, receive: Receive, send: Send) -> None:
        del receive
        state = scope.setdefault("state", {})
        state["user"] = {"uid": "user-1", "email": "private@example.com"}
        await send({"type": "http.response.start", "status": status_code, "headers": []})
        await send({"type": "http.response.body", "body": b"private-response"})

    app = ResponseSecurityMiddleware(
        PrivilegedActionAuditMiddleware(endpoint),
        security_headers={},
        server_header="Moonlit",
    )
    body = b'{"password":"private-request"}'
    sent = await invoke(app, http_scope("POST", "/api/v1/user/settings", body=body), body)

    payloads = audit_payloads(audit_buffer)
    assert len(payloads) == 1
    assert payloads[0]["actor"].startswith("user:pseudo_")
    assert "user-1" not in payloads[0]["actor"]
    assert payloads[0]["action"] == "settings.update"
    assert payloads[0]["resource"] == "user:settings"
    assert payloads[0]["outcome"] == expected_outcome
    assert payloads[0]["details"] == {
        "http_method": "POST",
        "status_code": status_code,
    }
    assert payloads[0]["request_id"] == response_header(sent, b"x-request-id")
    rendered = audit_buffer.getvalue()
    assert "private-request" not in rendered
    assert "private-response" not in rendered
    assert "private@example.com" not in rendered


@pytest.mark.asyncio
async def test_dynamic_route_does_not_log_its_identifier(audit_buffer: io.StringIO) -> None:
    """Keep opaque conversation identifiers out of the security event."""

    async def endpoint(scope: ASGIMessage, receive: Receive, send: Send) -> None:
        del scope, receive
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    private_id = "private-conversation-id"
    app = PrivilegedActionAuditMiddleware(endpoint)
    await invoke(app, http_scope("DELETE", f"/api/v1/delete_conversation/{private_id}"))

    payloads = audit_payloads(audit_buffer)
    assert len(payloads) == 1
    assert payloads[0]["resource"] == "conversation:record"
    assert private_id not in audit_buffer.getvalue()


@pytest.mark.asyncio
async def test_unlisted_route_emits_no_event(audit_buffer: io.StringIO) -> None:
    """Catch accidental audit volume expansion to ordinary endpoints."""

    async def endpoint(scope: ASGIMessage, receive: Receive, send: Send) -> None:
        del scope, receive
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    await invoke(
        PrivilegedActionAuditMiddleware(endpoint),
        http_scope("GET", "/api/v1/health"),
    )

    assert audit_buffer.getvalue() == ""


@pytest.mark.asyncio
async def test_pre_auth_denial_uses_anonymous_actor(audit_buffer: io.StringIO) -> None:
    """Audit a rejection that occurs before authentication can populate request state."""

    async def denied(scope: ASGIMessage, receive: Receive, send: Send) -> None:
        del scope, receive
        await send({"type": "http.response.start", "status": 401, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    await invoke(
        PrivilegedActionAuditMiddleware(denied),
        http_scope("POST", "/api/v1/connect_db"),
    )

    payload = audit_payloads(audit_buffer)[0]
    assert payload["actor"] == "user:anonymous"
    assert payload["outcome"] == "denied"


@pytest.mark.asyncio
async def test_downstream_exception_emits_one_safe_failure_then_reraises(
    audit_buffer: io.StringIO,
) -> None:
    """Preserve the HTTP error boundary while recording a payload-free failure."""

    async def failing(scope: ASGIMessage, receive: Receive, send: Send) -> None:
        del scope, receive, send
        raise RuntimeError("private-exception")

    middleware = PrivilegedActionAuditMiddleware(failing)

    async def send(message: ASGIMessage) -> None:
        del message

    with pytest.raises(RuntimeError, match="private-exception"):
        await middleware(
            http_scope("POST", "/api/v1/user/settings"),
            one_body_receive(b""),
            send,
        )

    payloads = audit_payloads(audit_buffer)
    assert len(payloads) == 1
    assert payloads[0]["outcome"] == "failure"
    assert payloads[0]["details"]["status_code"] == 500
    assert "private-exception" not in audit_buffer.getvalue()


def test_application_middleware_order_binds_request_id_before_audit() -> None:
    """Catch Starlette registration changes that clear correlation before audit emission."""
    from main import create_app

    app = create_app()
    middleware_classes = [entry.cls for entry in app.user_middleware]

    response_index = middleware_classes.index(ResponseSecurityMiddleware)
    audit_index = middleware_classes.index(PrivilegedActionAuditMiddleware)
    body_index = middleware_classes.index(RequestBodyLimitMiddleware)
    assert response_index < audit_index < body_index
