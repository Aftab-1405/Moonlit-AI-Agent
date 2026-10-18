"""Required session setup shared by manual and AI queries."""

import re


def set_query_timeout(adapter, cursor, connection, seconds: int) -> None:
    """Fail closed if the database timeout cannot be installed."""
    if seconds <= 0:
        raise ValueError("Query timeout must be positive")
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


def set_query_schema(cursor, db_config: dict, db_type: str) -> None:
    """Reapply the selected PostgreSQL schema on every pooled borrow."""
    if db_type != "postgresql":
        return
    schema = db_config.get("schema", "public")
    if not isinstance(schema, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", schema):
        raise ValueError("Invalid schema name")
    from psycopg2 import sql

    cursor.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
