"""Sanitized exception formatting for API responses and LLM tool output.

Two concerns are interleaved in this module:

1. **User-facing / LLM-facing error sanitization** — DB driver errors and
   internal tracebacks routinely leak schema names, column names,
   connection strings, and hostnames. When these are surfaced to the LLM
   in tool output, the LLM may quote them back to the user. When they
   are surfaced in HTTP error responses, attackers gain reconnaissance.

2. **Classified error categories** — the AI tool executor needs a
   stable category string ("table_not_found", "permission_denied",
   "timeout", "syntax_error", "unknown") so it can write a helpful
   retry message instead of dumping the raw exception.

Mapping and sanitization helpers are pure; ``log_safe_exception`` is the
single correlated diagnostic side effect.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Literal, Mapping

from core.logging import current_request_id

#: Maximum length of any sanitized error string. Long errors are
#: truncated with an ellipsis; the tail is never kept because driver
#: errors often put the offending SQL fragment at the end.
_MAX_SANITIZED_LEN: int = 280

#: Token bucket of regex patterns matched against the *lower-cased* error
#: message. First match wins. Order matters — more specific patterns first.
_ERROR_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\b(table|view|relation).*does not exist\b"), "table_not_found"),
    (re.compile(r"\bunknown (table|view)\b"), "table_not_found"),
    (re.compile(r"\bunknown column\b"), "column_not_found"),
    (re.compile(r"\binvalid column name\b"), "column_not_found"),
    (re.compile(r"\bcolumn .* does not exist\b"), "column_not_found"),
    (re.compile(r"\bunrecognized column\b"), "column_not_found"),
    (re.compile(r"\bpermission denied\b"), "permission_denied"),
    (re.compile(r"\baccess denied\b"), "permission_denied"),
    (re.compile(r"\binsufficient privilege\b"), "permission_denied"),
    (re.compile(r"\bORA-\d{5}: insufficient privileges\b"), "permission_denied"),
    (re.compile(r"\btimeout expired\b"), "timeout"),
    (re.compile(r"\bmax_execution_time exceeded\b"), "timeout"),
    (re.compile(r"\bstatement timeout\b"), "timeout"),
    (re.compile(r"\bcanceling statement due to timeout\b"), "timeout"),
    (re.compile(r"\bdeadlock\b"), "deadlock"),
    (
        re.compile(r"\bviolates (?:foreign key|unique|primary key|not-null|check) constraint\b"),
        "constraint_violation",
    ),
    (re.compile(r"\bduplicate key\b"), "constraint_violation"),
    (re.compile(r"\bsyntax error\b"), "syntax_error"),
    (re.compile(r"\bORA-01756\b"), "syntax_error"),
    (re.compile(r"\bconnection refused\b"), "connection_error"),
    (re.compile(r"\bconnection reset\b"), "connection_error"),
    (re.compile(r"\bserver closed the connection\b"), "connection_error"),
    (re.compile(r"\blost connection\b"), "connection_error"),
    (re.compile(r"\btoo many connections\b"), "connection_error"),
)

#: Stable outcome type returned to callers.
ErrorCategory = Literal[
    "table_not_found",
    "column_not_found",
    "permission_denied",
    "timeout",
    "deadlock",
    "constraint_violation",
    "syntax_error",
    "connection_error",
    "unknown",
]


def classify_db_error(message: str) -> ErrorCategory:
    """Classify a DB driver error message into a stable category.

    Args:
        message: Raw error message from the DB driver.

    Returns:
        One of the :data:`ErrorCategory` literals. ``"unknown"`` if no
        pattern matched.
    """
    if not message:
        return "unknown"
    lowered = message.lower()
    for pattern, category in _ERROR_PATTERNS:
        if pattern.search(lowered):
            return category  # type: ignore[return-value]
    return "unknown"


#: Substrings removed from sanitized error messages because they reveal
#: infrastructure details (schema names, hosts, paths) that the LLM and
#: end users do not need.
_LEAKAGE_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    # Full database DSNs, including credentials, host, port, and database.
    (
        re.compile(
            r"\b(?:postgres(?:ql)?|mysql|mariadb|oracle|sqlserver|mssql)://[^\s]+",
            re.IGNORECASE,
        ),
        "[connection-string]",
    ),
    # Connection-string fragments: `user:pass@host:port/db`
    (
        re.compile(r"\b[A-Za-z0-9_.-]+:[^@\s]+@[A-Za-z0-9_.-]+(?::\d+)?(?:/\S*)?"),
        "[connection-string]",
    ),
    # `host=...` `password=...` `user=...` key/value fragments
    (
        re.compile(
            r"\b(host|user|username|password|passwd|dsn|port|database|dbname|token|api[_-]?key|secret)\s*=\s*[^\s;]+",
            re.IGNORECASE,
        ),
        "[redacted]",
    ),
    # Provider request identifiers can disclose account and request metadata.
    (
        re.compile(
            r"\b(?:x-amzn-requestid|request[_ -]?id|requestid)\s*[:=]\s*[^\s;,]+",
            re.IGNORECASE,
        ),
        "[request-id]",
    ),
    # Private hosts and RFC1918 addresses that reveal deployment topology.
    (
        re.compile(
            r"\b(?:localhost|[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:internal|local|lan)|"
            r"10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|"
            r"172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b",
            re.IGNORECASE,
        ),
        "[private-host]",
    ),
    # Public IPs and DNS names are also deployment/customer topology and must
    # not appear in diagnostics emitted by request-time boundaries.
    (
        re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
        "[host]",
    ),
    (
        re.compile(r"\b(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,63}\b"),
        "[host]",
    ),
    # JWTs, API tokens, and session cookies are commonly rendered as long
    # URL-safe opaque strings without an identifying ``token=`` prefix.
    (
        re.compile(r"\beyJ[A-Za-z0-9_-]{16,}(?:\.[A-Za-z0-9_-]{8,}){1,2}\b"),
        "[token]",
    ),
    (
        re.compile(r"\b(?=[A-Za-z0-9_-]{32,}\b)(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+\b"),
        "[token]",
    ),
    # Filesystem paths from tracebacks
    (re.compile(r"/(?:[A-Za-z0-9_.-]+/)+[A-Za-z0-9_.-]+"), "[path]"),
    # SQL Server / Oracle bracketed identifiers leaked in errors
    (re.compile(r"'[^']*\.dbo\.[^']*'"), "[schema]"),
    # SQL text can expose schema/data even when individual identifiers look safe.
    (
        re.compile(
            r"\b(?:select|insert|update|delete|merge|alter|create|drop|truncate|"
            r"grant|revoke|call|exec(?:ute)?)\b.*",
            re.IGNORECASE | re.DOTALL,
        ),
        "[sql]",
    ),
)


@dataclass(frozen=True)
class PublicError:
    """Immutable error code and message safe for public boundaries."""

    code: str
    message: str


_PUBLIC_DB_ERRORS = {
    "table_not_found": PublicError("DB_TABLE_NOT_FOUND", "The requested table or view was not found."),
    "column_not_found": PublicError("DB_COLUMN_NOT_FOUND", "The requested column was not found."),
    "permission_denied": PublicError("DB_PERMISSION_DENIED", "Database permission denied."),
    "timeout": PublicError("DB_TIMEOUT", "Database operation timed out."),
    "deadlock": PublicError("DB_DEADLOCK", "Database operation could not complete due to a deadlock."),
    "constraint_violation": PublicError(
        "DB_CONSTRAINT_VIOLATION",
        "Database constraint rejected the operation.",
    ),
    "syntax_error": PublicError("DB_SYNTAX_ERROR", "Database query syntax is invalid."),
    "connection_error": PublicError("DB_CONNECTION_ERROR", "Database connection failed."),
    "unknown": PublicError("DB_OPERATION_FAILED", "Database operation failed."),
}

_DEFAULT_PUBLIC_ERROR = PublicError("TOOL_EXECUTION_FAILED", "Tool execution failed.")

# Codes accepted from persisted/tool result dictionaries. Messages paired with
# those dictionaries are untrusted and must never cross a public or model
# boundary. Add a code here only with its canonical, context-free safe message.
_PUBLIC_ERRORS_BY_CODE = {
    public.code: public
    for public in (
        *_PUBLIC_DB_ERRORS.values(),
        _DEFAULT_PUBLIC_ERROR,
        PublicError("DB_HOST_RESOLUTION_FAILED", "Database host could not be resolved."),
        PublicError("DB_HOST_VALIDATION_FAILED", "Database host validation failed."),
        PublicError("DB_CONNECTION_STRING_INVALID", "Database connection string is invalid."),
        PublicError("TOOL_ARGUMENT_INVALID", "Tool arguments are invalid."),
        PublicError("TOOL_BUDGET_EXCEEDED", "Tool call budget exceeded."),
        PublicError("TOOL_LOOP_DETECTED", "Repeated tool call stopped."),
        PublicError("TOOL_TIMEOUT", "Tool execution timed out."),
        PublicError("TOOL_RESULT_INVALID", "Tool result could not be structured."),
        PublicError("TOOL_RESULT_PERSISTENCE_FAILED", "Tool result persistence failed."),
        PublicError("WEB_SEARCH_TIMEOUT", "Web search timed out."),
        PublicError("WEB_SEARCH_FAILED", "Web search failed."),
        PublicError("MEMORY_CONTEXT_UNAVAILABLE", "Memory context is unavailable."),
        PublicError("MEMORY_ACCESS_DENIED", "Memory access denied."),
        PublicError("MEMORY_RETRIEVAL_FAILED", "Memory retrieval failed."),
    )
}


def sanitize_error_message(message: str, *, max_length: int = _MAX_SANITIZED_LEN) -> str:
    """Return a PII-safe, length-capped version of ``message``.

    Args:
        message: Raw error string (typically ``str(exception)``).
        max_length: Maximum returned length.

    Returns:
        Sanitized message with connection strings, credentials, and
        filesystem paths replaced by ``[redacted]`` / ``[path]``.
        Truncated to ``max_length`` with a trailing ellipsis if needed.
    """
    if not message:
        return ""
    sanitized = message
    for pattern, replacement in _LEAKAGE_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)
    if len(sanitized) > max_length:
        sanitized = sanitized[: max_length - 1] + "…"
    return sanitized


def sanitize_exception(exc: BaseException) -> str:
    """Sanitize an exception for correlated server diagnostics only.

    Args:
        exc: Any exception.

    Returns:
        A sanitized, length-capped string. Never includes the exception
        traceback. Public responses must use a stable ``PublicError``
        instead of this diagnostic string.
    """
    return sanitize_error_message(str(exc))


def public_database_error(exc: BaseException) -> PublicError:
    """Map a database exception to a stable public error."""
    category = classify_db_error(str(exc))
    return _PUBLIC_DB_ERRORS[category]


def public_error_for_code(code: object) -> PublicError:
    """Resolve an untrusted code to its canonical safe public error."""
    if not isinstance(code, str):
        return _DEFAULT_PUBLIC_ERROR
    return _PUBLIC_ERRORS_BY_CODE.get(code, _DEFAULT_PUBLIC_ERROR)


def public_tool_error(code: str, message: str) -> PublicError:
    """Build a trusted error, deferring known codes to the canonical catalog."""
    if code in _PUBLIC_ERRORS_BY_CODE:
        return _PUBLIC_ERRORS_BY_CODE[code]
    return PublicError(code=code, message=message)


def canonicalize_coded_error_payload(payload: Mapping[str, object]) -> dict:
    """Replace paired text on a coded payload with its catalogued message.

    Internal result dictionaries are untrusted at every forwarding boundary.
    The payload's existing text key is preserved (``error`` or ``message``),
    while its value and code are replaced atomically. Unknown and malformed
    codes resolve to the generic tool failure.
    """
    canonical = dict(payload)
    if "error_code" not in canonical:
        return canonical

    public = public_error_for_code(canonical.get("error_code"))
    canonical["error_code"] = public.code
    if "error" in canonical:
        canonical["error"] = public.message
    if "message" in canonical:
        canonical["message"] = public.message
    return canonical


def log_safe_exception(
    logger: logging.Logger,
    operation: str,
    exc: BaseException,
    public_error: PublicError,
) -> None:
    """Log sanitized exception detail with the active request correlation ID."""
    request_id = current_request_id() or "-"
    logger.error(
        "%s failed: exception_type=%s error_code=%s detail=%s request_id=%s",
        operation,
        type(exc).__name__,
        public_error.code,
        sanitize_exception(exc) or "[no-detail]",
        request_id,
        extra={"request_id": request_id},
    )


__all__ = [
    "ErrorCategory",
    "PublicError",
    "classify_db_error",
    "canonicalize_coded_error_payload",
    "log_safe_exception",
    "public_database_error",
    "public_error_for_code",
    "public_tool_error",
    "sanitize_error_message",
    "sanitize_exception",
]
