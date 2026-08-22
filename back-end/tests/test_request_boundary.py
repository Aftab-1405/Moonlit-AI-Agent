"""Tests for the raw ASGI request-body boundary."""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable

import pytest

ASGIMessage = dict[str, object]
Receive = Callable[[], Awaitable[ASGIMessage]]
Send = Callable[[ASGIMessage], Awaitable[None]]


async def receive_chunks(chunks: list[bytes]) -> Receive:
    """Return an ASGI receive callable that emits the supplied body frames."""
    queue = list(chunks)

    async def receive() -> ASGIMessage:
        body = queue.pop(0)
        return {
            "type": "http.request",
            "body": body,
            "more_body": bool(queue),
        }

    return receive


def http_scope(headers: list[tuple[bytes, bytes]] | None = None) -> ASGIMessage:
    """Build a minimal HTTP ASGI scope for direct middleware tests."""
    return {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/request-boundary-test",
        "raw_path": b"/request-boundary-test",
        "query_string": b"",
        "headers": headers or [],
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    }


def recording_app(markers: list[str], received_bodies: list[bytes]):
    """Build a child app that records whether request parsing could run."""

    async def app(scope: ASGIMessage, receive: Receive, send: Send) -> None:
        body = bytearray()
        while True:
            message = await receive()
            assert message["type"] == "http.request"
            body.extend(message.get("body", b""))
            if not message.get("more_body", False):
                break

        received_bodies.append(bytes(body))
        markers.append("endpoint")
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    return app


async def invoke(
    app,
    scope: ASGIMessage,
    receive: Receive,
) -> list[ASGIMessage]:
    """Run a raw ASGI app and collect its response messages."""
    sent: list[ASGIMessage] = []

    async def send(message: ASGIMessage) -> None:
        sent.append(message)

    await app(scope, receive, send)
    return sent


def response_status(sent: list[ASGIMessage]) -> int:
    """Return the response status from collected ASGI response messages."""
    return sent[0]["status"]


def response_json(sent: list[ASGIMessage]) -> dict[str, object]:
    """Decode the single JSON response body from collected ASGI messages."""
    return json.loads(sent[1]["body"])


def assert_api_error(sent: list[ASGIMessage], *, status_code: int, error: str) -> None:
    """Assert a rejection uses the standard public error envelope."""
    assert response_status(sent) == status_code
    payload = response_json(sent)
    assert payload["status"] == "error"
    assert payload["error"] == error


@pytest.mark.asyncio
async def test_rejects_oversized_declared_body_before_downstream_app() -> None:
    """Catch a proxy/client that declares a body larger than the raw limit."""
    from core.http_boundary import RequestBodyLimitMiddleware

    markers: list[str] = []
    received_bodies: list[bytes] = []
    app = RequestBodyLimitMiddleware(recording_app(markers, received_bodies), max_body_bytes=4)

    sent = await invoke(
        app,
        http_scope(headers=[(b"content-length", b"5")]),
        await receive_chunks([b"12345"]),
    )

    assert_api_error(sent, status_code=413, error="REQUEST_TOO_LARGE")
    assert markers == []
    assert received_bodies == []


@pytest.mark.asyncio
@pytest.mark.parametrize("content_length", [b"five", b"-1"])
async def test_rejects_invalid_content_length_before_downstream_app(content_length: bytes) -> None:
    """Catch malformed lengths instead of accepting ambiguous framing."""
    from core.http_boundary import RequestBodyLimitMiddleware

    markers: list[str] = []
    received_bodies: list[bytes] = []
    app = RequestBodyLimitMiddleware(recording_app(markers, received_bodies), max_body_bytes=4)

    sent = await invoke(
        app,
        http_scope(headers=[(b"content-length", content_length)]),
        await receive_chunks([b"1234"]),
    )

    assert_api_error(sent, status_code=400, error="INVALID_CONTENT_LENGTH")
    assert markers == []
    assert received_bodies == []


@pytest.mark.asyncio
async def test_rejects_duplicate_content_length_before_downstream_app() -> None:
    """Catch duplicate lengths, which can create request-smuggling ambiguity."""
    from core.http_boundary import RequestBodyLimitMiddleware

    markers: list[str] = []
    received_bodies: list[bytes] = []
    app = RequestBodyLimitMiddleware(recording_app(markers, received_bodies), max_body_bytes=4)

    sent = await invoke(
        app,
        http_scope(headers=[(b"content-length", b"4"), (b"content-length", b"4")]),
        await receive_chunks([b"1234"]),
    )

    assert_api_error(sent, status_code=400, error="INVALID_CONTENT_LENGTH")
    assert markers == []
    assert received_bodies == []


@pytest.mark.asyncio
async def test_accepts_under_limit_body_without_content_length() -> None:
    """Keep valid chunked requests available to downstream route parsing."""
    from core.http_boundary import RequestBodyLimitMiddleware

    markers: list[str] = []
    received_bodies: list[bytes] = []
    app = RequestBodyLimitMiddleware(recording_app(markers, received_bodies), max_body_bytes=4)

    sent = await invoke(app, http_scope(), await receive_chunks([b"1234"]))

    assert response_status(sent) == 204
    assert markers == ["endpoint"]
    assert received_bodies == [b"1234"]


@pytest.mark.asyncio
async def test_rejects_chunked_body_over_limit_before_downstream_app() -> None:
    """Catch cumulative chunks that individually fit but exceed the raw limit."""
    from core.http_boundary import RequestBodyLimitMiddleware

    markers: list[str] = []
    received_bodies: list[bytes] = []
    app = RequestBodyLimitMiddleware(recording_app(markers, received_bodies), max_body_bytes=4)

    sent = await invoke(app, http_scope(), await receive_chunks([b"12", b"345"]))

    assert_api_error(sent, status_code=413, error="REQUEST_TOO_LARGE")
    assert markers == []
    assert received_bodies == []


@pytest.mark.asyncio
async def test_rejects_spoofed_under_limit_content_length_before_downstream_app() -> None:
    """Catch clients whose body exceeds a smaller declared Content-Length."""
    from core.http_boundary import RequestBodyLimitMiddleware

    markers: list[str] = []
    received_bodies: list[bytes] = []
    app = RequestBodyLimitMiddleware(recording_app(markers, received_bodies), max_body_bytes=4)

    sent = await invoke(
        app,
        http_scope(headers=[(b"content-length", b"1")]),
        await receive_chunks([b"12", b"345"]),
    )

    assert_api_error(sent, status_code=413, error="REQUEST_TOO_LARGE")
    assert markers == []
    assert received_bodies == []
