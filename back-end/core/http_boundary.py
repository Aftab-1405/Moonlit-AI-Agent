"""Low-level ASGI request boundaries that run before framework parsing."""

from collections import deque

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from api_contract.common import ApiError


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

        buffered_messages = await self._buffer_request(receive)
        if buffered_messages is None:
            await self._send_error(
                scope,
                receive,
                send,
                status_code=413,
                error="REQUEST_TOO_LARGE",
                message="Request body exceeds the configured size limit.",
            )
            return

        replay_messages = deque(buffered_messages)

        async def replay_receive() -> Message:
            if replay_messages:
                return replay_messages.popleft()
            return {"type": "http.disconnect"}

        await self.app(scope, replay_receive, send)

    def _declared_content_length(self, scope: Scope) -> int | None:
        values = [value for name, value in scope.get("headers", []) if name.lower() == b"content-length"]
        if not values:
            return 0
        if len(values) != 1 or not values[0].isdigit():
            return None
        return int(values[0])

    async def _buffer_request(self, receive: Receive) -> list[Message] | None:
        messages: list[Message] = []
        total_bytes = 0

        while True:
            message = await receive()
            messages.append(message)
            if message["type"] != "http.request":
                return messages

            total_bytes += len(message.get("body", b""))
            if total_bytes > self.max_body_bytes:
                return None
            if not message.get("more_body", False):
                return messages

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
        response = JSONResponse(
            status_code=status_code,
            content=ApiError(error=error, message=message).model_dump(),
        )
        await response(scope, receive, send)
