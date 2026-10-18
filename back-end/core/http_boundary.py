"""Low-level ASGI request boundaries that run before framework parsing."""

import logging
from collections.abc import Mapping
from enum import Enum

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from api_contract.common import api_error_response
from core.logging import REQUEST_ID_HEADER, bind_request_id, clear_request_id

logger = logging.getLogger(__name__)

_MAX_REQUEST_FRAMES = 1_024


class _BodyReadStatus(Enum):
    COMPLETE = "complete"
    DISCONNECTED = "disconnected"
    TOO_LARGE = "too_large"


class ResponseSecurityMiddleware:
    """Apply response security headers and correlation IDs without buffering."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        security_headers: Mapping[str, str],
        server_header: str,
    ) -> None:
        self.app = app
        self.response_headers = {
            name.lower().encode("latin-1"): value.encode("latin-1")
            for name, value in security_headers.items()
        }
        self.response_headers[b"server"] = server_header.encode("latin-1")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = bind_request_id(self._inbound_request_id(scope))
        response_started = False

        async def send_with_boundary(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
                replacement_names = {*self.response_headers, REQUEST_ID_HEADER.lower().encode("latin-1")}
                headers = [
                    (name, value)
                    for name, value in message.get("headers", [])
                    if name.lower() not in replacement_names and name.lower() != b"x-powered-by"
                ]
                headers.extend(self.response_headers.items())
                headers.append((REQUEST_ID_HEADER.lower().encode("latin-1"), request_id.encode("latin-1")))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_boundary)
        except Exception as exc:
            if response_started:
                raise
            logger.error(
                "Unhandled exception while processing HTTP request; exception_type=%s",
                type(exc).__name__,
            )
            response = api_error_response(
                status_code=500,
                error="INTERNAL_SERVER_ERROR",
                message="Internal server error",
            )
            await response(scope, receive, send_with_boundary)
        finally:
            clear_request_id()

    @staticmethod
    def _inbound_request_id(scope: Scope) -> str | None:
        values = [
            value
            for name, value in scope.get("headers", [])
            if name.lower() == REQUEST_ID_HEADER.lower().encode("latin-1")
        ]
        if len(values) != 1:
            return None
        return values[0].decode("latin-1")


class RequestBodyLimitMiddleware:
    """Reject malformed or oversized HTTP bodies before downstream application code."""

    def __init__(self, app: ASGIApp, max_body_bytes: int) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared_length = self._declared_content_length(scope)
        if declared_length is None:
            await self._send_error(
                scope,
                receive,
                send,
                status_code=400,
                error="INVALID_CONTENT_LENGTH",
                message="Content-Length must be a single non-negative integer.",
            )
            return

        if declared_length > self.max_body_bytes:
            await self._send_error(
                scope,
                receive,
                send,
                status_code=413,
                error="REQUEST_TOO_LARGE",
                message="Request body exceeds the configured size limit.",
            )
            return

        body_status, body = await self._buffer_request(receive)
        if body_status is _BodyReadStatus.DISCONNECTED:
            return
        if body_status is _BodyReadStatus.TOO_LARGE:
            await self._send_error(
                scope,
                receive,
                send,
                status_code=413,
                error="REQUEST_TOO_LARGE",
                message="Request body exceeds the configured size limit.",
            )
            return

        replayed = False

        async def replay_receive() -> Message:
            nonlocal replayed
            if not replayed:
                replayed = True
                return {
                    "type": "http.request",
                    "body": body,
                    "more_body": False,
                }
            return await receive()

        await self.app(scope, replay_receive, send)

    def _declared_content_length(self, scope: Scope) -> int | None:
        values = [value for name, value in scope.get("headers", []) if name.lower() == b"content-length"]
        if not values:
            return 0
        if len(values) != 1 or not values[0].isdigit():
            return None

        normalized_value = values[0].lstrip(b"0") or b"0"
        maximum_value = str(self.max_body_bytes).encode()
        if len(normalized_value) > len(maximum_value) or (
            len(normalized_value) == len(maximum_value) and normalized_value > maximum_value
        ):
            return self.max_body_bytes + 1
        return int(normalized_value)

    async def _buffer_request(
        self,
        receive: Receive,
    ) -> tuple[_BodyReadStatus, bytes]:
        body = bytearray()
        frame_count = 0

        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return _BodyReadStatus.DISCONNECTED, b""
            if message["type"] != "http.request":
                return _BodyReadStatus.DISCONNECTED, b""

            frame_count += 1
            if frame_count > _MAX_REQUEST_FRAMES:
                return _BodyReadStatus.TOO_LARGE, b""

            chunk = message.get("body", b"")
            if not isinstance(chunk, bytes):
                return _BodyReadStatus.DISCONNECTED, b""
            if len(chunk) > self.max_body_bytes - len(body):
                return _BodyReadStatus.TOO_LARGE, b""
            body.extend(chunk)
            if not message.get("more_body", False):
                return _BodyReadStatus.COMPLETE, bytes(body)

    async def _send_error(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
        *,
        status_code: int,
        error: str,
        message: str,
    ) -> None:
        response = api_error_response(
            status_code=status_code,
            error=error,
            message=message,
        )
        await response(scope, receive, send)
