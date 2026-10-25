"""Required session setup shared by manual and AI queries."""

import re
import threading
from contextlib import contextmanager


def set_query_timeout(adapter, cursor, connection, seconds: int) -> dict:
    """Fail closed if the database timeout cannot be installed."""
    if seconds <= 0:
        raise ValueError("Query timeout must be positive")
    requested = seconds
    db_type = getattr(adapter, "db_type", None)
    if db_type == "sqlserver":
        from config import get_config

        seconds = get_config().QUERY_TIMEOUT_SECONDS
    set_session_timeout = getattr(adapter, "set_session_timeout", None)
    if callable(set_session_timeout):
        if connection is None:
            raise RuntimeError("Database driver timeout could not be applied")
        set_session_timeout(connection, seconds)
    else:
        timeout_sql = adapter.get_set_timeout_sql(seconds)
        if not timeout_sql:
            raise RuntimeError("Database statement timeout is not supported")
        cursor.execute(timeout_sql)
    return {
        "requested_timeout_seconds": requested,
        "effective_timeout_seconds": seconds,
        "timeout_scope": "driver-configured"
        if db_type == "sqlserver"
        else "driver-round-trip"
        if db_type == "oracle"
        else "statement",
    }


def set_query_schema(cursor, db_config: dict, db_type: str) -> None:
    """Reapply the selected PostgreSQL schema on every pooled borrow."""
    if db_type != "postgresql":
        return
    schema = db_config.get("schema", "public")
    if not isinstance(schema, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", schema):
        raise ValueError("Invalid schema name")
    from psycopg2 import sql

    cursor.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))


class QueryCancellation:
    """Request-owned cancellation; never retains a connection after its borrow."""

    def __init__(self):
        self._lock = threading.Lock()
        self._cancelled = False
        self._callback = None

    def cancel(self):
        # Hold this lock through driver cancellation: unregister cannot race a
        # cancel into the next borrower of this connection.
        with self._lock:
            if self._cancelled:
                return
            self._cancelled = True
            if self._callback is not None:
                try:
                    self._callback()
                except Exception:
                    # Best effort: a failed driver cancel must not mask the
                    # query's own error or imply database work has stopped.
                    pass

    def raise_if_cancelled(self):
        with self._lock:
            if self._cancelled:
                raise RuntimeError("Query request was cancelled")

    @contextmanager
    def bind(self, connection, db_type):
        with self._lock:
            if self._cancelled:
                raise RuntimeError("Query request was cancelled before execution")
            callback = getattr(connection, "cancel", None)
            self._callback = callback if db_type in {"postgresql", "oracle"} and callable(callback) else None
        try:
            yield
        finally:
            with self._lock:
                self._callback = None


@contextmanager
def query_execution_cursor(adapter, connection, *, dictionary=False, buffered=False, cancellation=None):
    """Use the same streaming cursor, cancellation ownership and reset for both paths."""
    from contextlib import nullcontext

    with adapter.get_cursor(connection, dictionary=dictionary, buffered=buffered) as cursor:
        if adapter.db_type == "oracle":
            from decimal import Decimal

            import oracledb

            # Restrict exact NUMBER fetching to this query cursor. A float
            # conversion by the driver cannot be repaired during JSON encoding.
            def exact_number(cursor, metadata):
                if metadata.type_code is oracledb.DB_TYPE_NUMBER:
                    return cursor.var(Decimal, arraysize=cursor.arraysize)
                return None

            cursor.outputtypehandler = exact_number
        ownership = cancellation.bind(connection, adapter.db_type) if cancellation else nullcontext()
        try:
            with ownership:
                yield cursor
                if cancellation:
                    cancellation.raise_if_cancelled()
                # PostgreSQL SET is transactional: reset on success; on error
                # the adapter rolls back both the query and its timeout SET.
                if adapter.db_type == "postgresql":
                    cursor.execute("RESET statement_timeout")
        finally:
            if adapter.db_type == "oracle":
                connection.call_timeout = 0
