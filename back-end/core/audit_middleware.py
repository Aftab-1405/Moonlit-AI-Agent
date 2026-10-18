"""Selective ASGI audit boundary for privileged HTTP actions."""

from __future__ import annotations

import re
from dataclasses import dataclass

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from core.audit import audit_log


@dataclass(frozen=True)
class PrivilegedActionPolicy:
    """Map one HTTP route shape to its privacy-safe audit classification."""

    method: str
    path_pattern: re.Pattern[str]
    action: str
    resource: str


def _policy(
    method: str,
    path_pattern: str,
    action: str,
    resource: str,
) -> PrivilegedActionPolicy:
    return PrivilegedActionPolicy(
        method=method,
        path_pattern=re.compile(path_pattern),
        action=action,
        resource=resource,
    )


PRIVILEGED_ACTION_POLICIES = (
    _policy("POST", r"^/set_authenticated_user_session$", "auth.login", "auth:session"),
    _policy("POST", r"^/logout_authenticated_user_session$", "auth.logout", "auth:session"),
    _policy("POST", r"^/api/v1/connect_db$", "db.connect", "db:connection"),
    _policy("POST", r"^/api/v1/disconnect_db$", "db.disconnect", "db:connection"),
    _policy("POST", r"^/api/v1/switch_remote_database$", "db.switch", "db:selection"),
    _policy("POST", r"^/api/v1/select_database$", "db.select", "db:selection"),
    _policy("POST", r"^/api/v1/run_sql_query$", "sql.execute", "db:query"),
    _policy(
        "DELETE",
        r"^/api/v1/delete_conversation/[^/]+$",
        "conversation.delete",
        "conversation:record",
    ),
    _policy("POST", r"^/api/v1/user/context/refresh$", "context.refresh", "context:schema"),
    _policy(
        "DELETE",
        r"^/api/v1/user/context/schema/[^/]+$",
        "context.schema.delete",
        "context:schema",
    ),
    _policy("DELETE", r"^/api/v1/user/context/schemas$", "context.schemas.delete", "context:schema"),
    _policy(
        "DELETE",
        r"^/api/v1/user/context/queries$",
        "context.queries.delete",
        "context:query-history",
    ),
    _policy("POST", r"^/api/v1/user/settings$", "settings.update", "user:settings"),
    _policy("POST", r"^/api/v1/user/session/close$", "session.close", "user:session"),
    _policy("DELETE", r"^/api/v1/user/account$", "account.delete", "user:account"),
    _policy("POST", r"^/api/v1/context/metrics/reset$", "context.metrics.reset", "context:metrics"),
)


def match_privileged_action(method: str, path: str) -> PrivilegedActionPolicy | None:
    """Return the exact approved policy for a method/path pair, if any."""
    return next(
        (
            policy
            for policy in PRIVILEGED_ACTION_POLICIES
            if policy.method == method and policy.path_pattern.fullmatch(path)
        ),
        None,
    )


def _actor(scope: Scope) -> str:
    """Read the authenticated UID populated downstream without inspecting cookies."""
    state = scope.get("state")
    user = state.get("user") if isinstance(state, dict) else None
    uid = user.get("uid") if isinstance(user, dict) else None
    return f"user:{uid}" if isinstance(uid, str) and uid else "user:anonymous"


def _outcome(status_code: int) -> str:
    """Map an observed HTTP status to the audit outcome vocabulary."""
    if status_code in {401, 403}:
        return "denied"
    if 200 <= status_code < 400:
        return "success"
    return "failure"


class PrivilegedActionAuditMiddleware:
    """Emit one terminal audit event for each explicitly approved route."""

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
            self._emit(scope, policy, status_code=500, outcome="failure")
            raise

        final_status = status_code or 500
        self._emit(
            scope,
            policy,
            status_code=final_status,
            outcome=_outcome(final_status),
        )

    @staticmethod
    def _emit(
        scope: Scope,
        policy: PrivilegedActionPolicy,
        *,
        status_code: int,
        outcome: str,
    ) -> None:
        audit_log(
            actor=_actor(scope),
            action=policy.action,
            resource=policy.resource,
            outcome=outcome,
            details={
                "http_method": policy.method,
                "status_code": status_code,
            },
        )


__all__ = [
    "PRIVILEGED_ACTION_POLICIES",
    "PrivilegedActionAuditMiddleware",
    "PrivilegedActionPolicy",
    "match_privileged_action",
]
