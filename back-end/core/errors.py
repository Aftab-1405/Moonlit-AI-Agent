"""Stable API/LLM errors and fail-closed exception diagnostics.

Two concerns are interleaved in this module:

1. **User-facing / LLM-facing stable errors** — DB driver errors and
   internal tracebacks routinely leak schema names, column names,
   connection strings, and hostnames. Public boundaries therefore expose
   only fixed ``PublicError`` values.

2. **Classified error categories** — the AI tool executor needs a
   stable category string ("table_not_found", "permission_denied",
   "timeout", "syntax_error", "unknown") so it can write a helpful
   retry message instead of dumping the raw exception.

``log_safe_exception`` records stable metadata only. It never renders
exception text or traceback data because heuristic redaction cannot safely
recognize every caller-controlled value an exception might echo.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Literal, Mapping

from core.logging import current_request_id

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
    *,
    level: int = logging.ERROR,
) -> None:
    """Log stable exception metadata with the active request correlation ID."""
    request_id = current_request_id() or "-"
    logger.log(
        level,
        "%s failed: exception_type=%s error_code=%s request_id=%s",
        operation,
        type(exc).__name__,
        public_error.code,
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
]
