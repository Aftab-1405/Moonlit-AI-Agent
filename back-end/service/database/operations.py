"""
Database Operations - Pure FastAPI Version

Secure database operations that accept db_config as parameter.
No Flask dependencies.

Query execution flow
--------------------
``execute_sql_query`` is the user-facing read-only query path. Before
running the user's SQL, it sets a per-statement timeout via
``adapter.get_set_timeout_sql`` (e.g. ``SET MAX_EXECUTION_TIME=30000`` for
MySQL, ``SET statement_timeout`` for PostgreSQL). This is the primary
defense against long-running queries holding pool connections.

Timeout failure policy (FIX [H7])
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
If the timeout-setting statement itself fails (privilege error, syntax
unsupported by DB version), we abort the user query with ``RuntimeError``.
Previously the failure was silently swallowed, which let the user query
run with NO timeout — exactly the scenario the timeout was meant to
prevent.

Identifier safety (FIX [M14])
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
``get_table_row_counts`` builds one ``UNION ALL`` statement containing a
``SELECT COUNT(*) FROM <identifiers>`` branch per requested table. Identifiers
(schema, table, database) are first validated by
``DatabaseSecurity.validate_*`` against a strict regex; in addition, we
now reject identifiers containing ``-`` (hyphen) or stray ``.`` outside
of a single ``schema.table`` pattern, as a defense-in-depth against
future loosening of the regex.
"""

import logging
import threading
import time
from typing import Dict, List, Optional, Tuple

from config import get_config
from core.audit import audit_log
from core.errors import log_safe_exception, public_database_error, public_tool_error
from service.database.security import DatabaseSecurity

Config = get_config()

logger = logging.getLogger(__name__)


def _public_database_failure(operation: str, exc: BaseException) -> Dict:
    """Return a stable status-style database error and log safe diagnostics."""
    public = public_database_error(exc)
    log_safe_exception(logger, operation, exc, public)
    return {
        "status": "error",
        "error_code": public.code,
        "message": public.message,
    }


# FIX [L10]: unify the query-length limit on a single config constant so
# the API layer, the human-facing service layer, and the AI tool path all
# enforce the same maximum. Previously Config.MAX_QUERY_LENGTH (10000)
# disagreed with Config.SQL_QUERY_MAX_LENGTH (100000), so a 50k-char query
# passed the API and was rejected by the service.
try:
    # Prefer the API-layer constant (the larger, user-facing limit).
    MAX_QUERY_LENGTH = Config.SQL_QUERY_MAX_LENGTH
except AttributeError:
    MAX_QUERY_LENGTH = Config.MAX_QUERY_LENGTH


class DatabaseOperationError(Exception):
    """Specific exception type for database operation failures."""

    pass


class DatabaseOperations:
    """Database operations class - accepts db_config explicitly."""

    # Cache for database and table information
    _info_cache = {}
    _cache_lock = threading.Lock()

    @staticmethod
    def get_databases(db_config: dict) -> Dict:
        """
        Fetch available databases.

        Args:
            db_config: Database configuration dict

        Returns:
            Dict with status and databases list
        """
        try:
            from service.database.adapters import get_adapter
            from service.database.connection_manager import get_connection_manager

            if not db_config:
                return {"status": "error", "message": "Not connected to database"}

            db_type = db_config.get("db_type", "mysql")
            adapter = get_adapter(db_type)
            manager = get_connection_manager()

            # For remote PostgreSQL, use the remote-specific query
            is_remote = bool(db_config.get("connection_string"))
            if db_type == "postgresql" and is_remote:
                query = adapter.get_databases_for_remote()
            else:
                query = adapter.get_databases_query()

            with manager.get_cursor(db_config) as cursor:
                cursor.execute(query)
                raw_rows = cursor.fetchall()
                databases = adapter.extract_database_names(raw_rows)
            system_dbs = adapter.get_system_databases()
            user_databases = [db for db in databases if db.lower() not in system_dbs]

            logger.info(f"Retrieved {len(user_databases)} user databases ({db_type})")
            return {"status": "success", "databases": user_databases}

        except Exception as err:
            return _public_database_failure("get_databases", err)

    @staticmethod
    def get_tables(db_config: dict, db_name: str, schema: str = "public") -> List[str]:
        """
        Get all tables in a database.

        Args:
            db_config: Database configuration dict
            db_name: Database name
            schema: Schema name (for PostgreSQL)

        Returns:
            List of table names
        """
        try:
            from service.database.adapters import get_adapter
            from service.database.connection_manager import get_connection_manager

            validated_db = DatabaseSecurity.validate_database_name(db_name)

            db_type = db_config.get("db_type", "mysql") if db_config else "mysql"
            adapter = get_adapter(db_type)
            manager = get_connection_manager()

            with manager.get_cursor(db_config) as cursor:
                tables_query, tables_params = adapter.get_all_tables_for_cache(validated_db, schema)
                cursor.execute(tables_query, tables_params)
                tables = [table[0] for table in cursor.fetchall()]

            logger.info(f"Retrieved {len(tables)} tables from database {validated_db}")
            return tables

        except ValueError as err:
            public = public_database_error(err)
            log_safe_exception(logger, "validate_get_tables", err, public)
            raise err
        except Exception as err:
            public = public_database_error(err)
            log_safe_exception(logger, "get_tables", err, public)
            raise DatabaseOperationError("Failed to retrieve tables")

    @staticmethod
    def get_table_schema(db_config: dict, table_name: str, db_name: str) -> List[Dict]:
        """Get table schema."""
        try:
            from service.database.adapters import get_adapter
            from service.database.connection_manager import get_connection_manager

            validated_table = DatabaseSecurity.validate_table_name(table_name)
            validated_db = DatabaseSecurity.validate_database_name(db_name)

            db_type = db_config.get("db_type", "mysql") if db_config else "mysql"
            adapter = get_adapter(db_type)
            schema = db_config.get("schema", "public") if db_config else "public"

            manager = get_connection_manager()

            with manager.get_cursor(db_config) as cursor:
                if db_type == "postgresql":
                    validated_schema = DatabaseSecurity.validate_database_name(schema)
                    query = adapter.get_table_schema_query(validated_schema)
                    cursor.execute(query, (validated_table, validated_table))
                else:
                    query = adapter.get_table_schema_query()
                    cursor.execute(query, (validated_db, validated_table))
                columns = cursor.fetchall()

            logger.info(f"Retrieved schema for table {validated_table}")
            return columns

        except ValueError as err:
            public = public_database_error(err)
            log_safe_exception(logger, "validate_get_table_schema", err, public)
            raise err
        except Exception as err:
            public = public_database_error(err)
            log_safe_exception(logger, "get_table_schema", err, public)
            raise DatabaseOperationError("Failed to retrieve table schema")

    @staticmethod
    def get_table_row_counts(
        db_config: dict,
        table_names: List[str],
        db_name: str,
        *,
        timeout_seconds: Optional[int] = None,
    ) -> List[Dict]:
        """Get exact row counts for one to ten tables in one statement.

        FIX [M14]: the table/schema/db identifiers are first validated by
        ``DatabaseSecurity.validate_*`` (strict regex). We additionally
        reject identifiers containing ``-`` (hyphen) or ``.`` because this
        operation receives table names within the already-selected database
        and schema. The identifiers are then interpolated into DBMS-specific
        quoting (PostgreSQL double-quotes, SQL Server brackets, MySQL
        backticks) — never raw into the SQL.
        """
        try:
            from service.database.connection_manager import get_connection_manager

            if not 1 <= len(table_names) <= 10:
                raise ValueError("table_names must contain between 1 and 10 names")

            validated_tables = [DatabaseSecurity.validate_table_name(name) for name in table_names]
            if len({name.casefold() for name in validated_tables}) != len(validated_tables):
                raise ValueError("table_names must contain unique names")
            validated_db = DatabaseSecurity.validate_database_name(db_name)

            # FIX [M14]: tighten the identifier check — reject hyphens and
            # qualified-name patterns. This operation adds the active
            # database/schema itself, so every input must be one identifier
            # component rather than ``schema.table``.
            def _tightened_check(name: str, field: str) -> None:
                if "-" in name:
                    raise ValueError(f"Invalid {field}: hyphen not allowed: {name!r}")
                if "." in name:
                    raise ValueError(f"Invalid {field}: qualified names are not allowed: {name!r}")

            for validated_table in validated_tables:
                _tightened_check(validated_table, "table_name")
            _tightened_check(validated_db, "database_name")

            db_type = db_config.get("db_type", "mysql") if db_config else "mysql"
            schema = db_config.get("schema", "public") if db_config else "public"

            if db_type == "postgresql":
                validated_schema = DatabaseSecurity.validate_database_name(schema)
                _tightened_check(validated_schema, "schema")
                table_references = [f'"{validated_schema}"."{table}"' for table in validated_tables]
            elif db_type == "sqlserver":
                validated_schema = DatabaseSecurity.validate_database_name(schema or "dbo")
                _tightened_check(validated_schema, "schema")
                table_references = [f"[{validated_schema}].[{table}]" for table in validated_tables]
            elif db_type == "oracle":
                table_references = [f'"{validated_db}"."{table}"' for table in validated_tables]
            else:
                table_references = [f"`{validated_db}`.`{table}`" for table in validated_tables]

            query = " UNION ALL ".join(
                f"SELECT '{table}' AS table_name, COUNT(*) AS row_count FROM {table_reference}"
                for table, table_reference in zip(validated_tables, table_references)
            )

            adapter = None
            if timeout_seconds is not None:
                if timeout_seconds <= 0:
                    raise ValueError("timeout_seconds must be positive")
                from service.database.adapters import get_adapter

                adapter = get_adapter(db_type)

            manager = get_connection_manager()
            with manager.get_cursor(db_config) as cursor:
                if timeout_seconds is not None and adapter is not None:
                    set_session_timeout = getattr(adapter, "set_session_timeout", None)
                    timeout_sql = adapter.get_set_timeout_sql(timeout_seconds)
                    if callable(set_session_timeout):
                        connection = getattr(cursor, "connection", None)
                        if connection is None:
                            raise RuntimeError("Database driver timeout could not be applied")
                        set_session_timeout(connection, timeout_seconds)
                    elif timeout_sql:
                        cursor.execute(timeout_sql)
                    else:
                        raise RuntimeError("Database statement timeout is not supported")
                cursor.execute(query)
                rows = cursor.fetchall()

            counts_by_table = {str(row[0]): int(row[1]) for row in rows}
            if set(counts_by_table) != set(validated_tables):
                raise DatabaseOperationError("Database returned an incomplete row-count result")

            return [
                {
                    "table": table,
                    "row_count": counts_by_table[table],
                    "is_estimate": False,
                }
                for table in validated_tables
            ]

        except ValueError as err:
            public = public_database_error(err)
            log_safe_exception(logger, "validate_get_table_row_counts", err, public)
            raise err
        except DatabaseOperationError:
            raise
        except Exception as err:
            public = public_database_error(err)
            log_safe_exception(logger, "get_table_row_counts", err, public)
            raise DatabaseOperationError("Failed to retrieve row counts")

    @staticmethod
    def clear_cache():
        """Clear all cached data."""
        with DatabaseOperations._cache_lock:
            DatabaseOperations._info_cache.clear()
        try:
            DatabaseSecurity.clear_cache()
        except Exception:
            pass


def fetch_database_info(db_config: dict, db_name: str) -> Tuple[Optional[str], Optional[str]]:
    """Fetch detailed information about a database."""
    try:
        validated_db = DatabaseSecurity.validate_database_name(db_name)
        tables = DatabaseOperations.get_tables(db_config, validated_db)

        if not tables:
            return f"The database {validated_db} has no tables.", ""

        db_info = f"The database {validated_db} has been selected. It contains {len(tables)} tables:\n"
        detailed_info = ""
        counts_by_table = {}
        count_errors = {}

        for batch_start in range(0, len(tables), 10):
            batch_tables = tables[batch_start : batch_start + 10]
            try:
                batch_counts = DatabaseOperations.get_table_row_counts(
                    db_config,
                    batch_tables,
                    validated_db,
                )
                counts_by_table.update({item["table"]: item["row_count"] for item in batch_counts})
            except Exception as err:
                public = public_database_error(err)
                log_safe_exception(logger, "fetch_database_row_counts", err, public)
                count_errors.update({table: public for table in batch_tables})

        for table in tables:
            db_info += f"Table {table}:\n"
            try:
                schema = DatabaseOperations.get_table_schema(db_config, table, validated_db)

                for column in schema:
                    detailed_info += f"  {column[0]} {column[1]}\n"
                if table in count_errors:
                    public = count_errors[table]
                    detailed_info += f"  Error [{public.code}]: {public.message}\n"
                else:
                    detailed_info += f"  count: {counts_by_table[table]}\n"
            except Exception as e:
                public = public_database_error(e)
                log_safe_exception(logger, "fetch_database_table_info", e, public)
                detailed_info += f"  Error [{public.code}]: {public.message}\n"

        return db_info, detailed_info

    except ValueError as err:
        public = public_database_error(err)
        log_safe_exception(logger, "validate_fetch_database_info", err, public)
        return None, public.message
    except Exception as err:
        public = public_database_error(err)
        log_safe_exception(logger, "fetch_database_info", err, public)
        return None, public.message


def execute_sql_query(
    db_config: dict,
    sql_query: str,
    max_rows: int = None,
    timeout_seconds: int = None,
    user_id: str | None = None,
) -> Dict:
    """
    Execute a SQL query securely — READ-ONLY.

    Workflow:
      1. Validate query length (FIX [L10]: unified limit).
      2. Parse + walk the SQL with sqlglot to allow only SELECT/WITH.
      3. Acquire a pooled cursor.
      4. Set a per-statement timeout (FIX [H7]: abort if this fails).
      5. Execute the user's SQL, fetch up to ``max_rows + 1`` rows (the
         ``+1`` lets us detect truncation without a second COUNT query).
      6. Serialize rows + column types into the response dict.
      7. Emit a structured audit event (user ID, database resource,
         statement type, row count, execution time) for traceability.
         Submitted SQL and its literals are deliberately excluded.

    Args:
        db_config: Database configuration dict.
        sql_query: SQL query to execute.
        max_rows: Maximum rows to return. Defaults to ``Config.MAX_QUERY_RESULTS``.
        timeout_seconds: Query timeout in seconds. Defaults to
            ``Config.QUERY_TIMEOUT_SECONDS``.
        user_id: Optional actor ID for the audit log. When omitted,
            the audit event uses ``"user:unknown"``.

    Returns:
        Dict with ``status`` (``"success"`` or ``"error"``), and either
        ``result`` (rows + column metadata) or ``message`` (error text).
        Error responses never include raw DB driver messages; they are
        classified into a stable ``error_category`` field instead.
    """
    try:
        from service.database.adapters import get_adapter
        from service.database.connection_manager import get_connection_manager

        if not db_config:
            return {"status": "error", "message": "No database connection"}

        # FIX [L10]: enforce the unified query-length limit (same constant
        # as the AI tool path and the API layer).
        if len(sql_query) > MAX_QUERY_LENGTH:
            return {
                "status": "error",
                "message": f"Query too long. Maximum: {MAX_QUERY_LENGTH} characters.",
            }
        db_type = db_config.get("db_type", "mysql")
        analysis = DatabaseSecurity.analyze_sql_query(sql_query, dialect=db_type)

        if not analysis["is_safe"]:
            return {
                "status": "error",
                "message": f"Query blocked: {', '.join(analysis['warnings'])}",
            }
        if analysis["query_type"] not in ("SELECT", "WITH"):
            return {
                "status": "error",
                "message": f"READ-ONLY: Only SELECT/WITH queries allowed. {analysis['query_type']} blocked.",
                "query_type_blocked": analysis["query_type"],
            }

        start_time = time.time()

        adapter = get_adapter(db_type)
        manager = get_connection_manager()

        with manager.get_cursor(db_config) as cursor:
            # FIX [EC6]: lightweight pre-query health check. A pooled
            # connection that the DB server dropped (idle-timeout,
            # restart, network blip) is only discovered when the user's
            # query fails — and the broken connection is then *returned
            # to the pool* and handed to the next query, producing
            # cascading failures across every user sharing the pool. We
            # issue a no-op SELECT first; if it raises, we surface a
            # clear ConnectionError so the user reconnects, and the
            # cursor's except path marks the conn as ``_failed`` so
            # ``return_connection`` discards it instead of pooling it.
            # We deliberately do NOT auto-retry — retrying a
            # non-idempotent read is risky.
            try:
                cursor.execute(adapter.get_health_check_sql())
                cursor.fetchone()
            except Exception as health_err:
                health_public = public_database_error(health_err)
                log_safe_exception(
                    logger,
                    "database_health_check",
                    health_err,
                    health_public,
                )
                # Mark the underlying connection as failed so
                # ``ConnectionManager.return_connection`` discards it
                # instead of returning it to the pool for the next
                # victim. ``cursor.connection`` is part of PEP 249.
                try:
                    underlying_conn = getattr(cursor, "connection", None)
                    if underlying_conn is not None:
                        setattr(underlying_conn, "_failed", True)
                except Exception:
                    pass
                raise ConnectionError("Connection lost, please reconnect") from health_err

            actual_timeout = timeout_seconds if timeout_seconds else Config.QUERY_TIMEOUT_SECONDS

            # FIX [EC3]: Oracle has no SET TIMEOUT SQL statement — its
            # timeout is enforced via the oracledb driver's per-connection
            # ``call_timeout`` attribute. Detect the method via getattr and
            # apply it directly to the connection exposed by the DB-API
            # cursor (``cursor.connection`` is part of PEP 249). Other
            # adapters (MySQL/PostgreSQL/SQL Server) use the SQL-string
            # path below and do not define ``set_session_timeout``, so
            # this branch is a no-op for them.
            set_session_timeout_fn = getattr(adapter, "set_session_timeout", None)
            if callable(set_session_timeout_fn):
                try:
                    underlying_conn = getattr(cursor, "connection", None)
                    if underlying_conn is not None:
                        set_session_timeout_fn(underlying_conn, actual_timeout)
                except Exception as timeout_err:
                    timeout_public = public_database_error(timeout_err)
                    log_safe_exception(
                        logger,
                        "set_database_session_timeout",
                        timeout_err,
                        timeout_public,
                    )

            timeout_sql = adapter.get_set_timeout_sql(actual_timeout)
            if timeout_sql:
                try:
                    cursor.execute(timeout_sql)
                except Exception as timeout_err:
                    # FIX [H7]: do NOT silently swallow the timeout-set
                    # failure. If we cannot set the statement timeout (privilege
                    # error, syntax unsupported by DB version), the user query
                    # would run with NO timeout — exactly the scenario the
                    # timeout was meant to prevent. Abort with RuntimeError
                    # so the user sees an explicit error instead of a DoS.
                    timeout_public = public_database_error(timeout_err)
                    log_safe_exception(
                        logger,
                        "set_database_statement_timeout",
                        timeout_err,
                        timeout_public,
                    )
                    raise RuntimeError(
                        "Statement timeout could not be set on this connection; query refused for safety."
                    )

            cursor.execute(sql_query)

            actual_max_rows = max_rows if max_rows else Config.MAX_QUERY_RESULTS
            fetch_limit = actual_max_rows + 1
            raw_rows = cursor.fetchmany(fetch_limit)

            truncated = len(raw_rows) > actual_max_rows
            if truncated:
                raw_rows = raw_rows[:actual_max_rows]
            rows = []
            for row in raw_rows:
                if hasattr(row, "keys"):
                    rows.append(list(row))
                elif isinstance(row, (list, tuple)):
                    rows.append(list(row))
                else:
                    rows.append([row])

            end_time = time.time()
            execution_time = round((end_time - start_time) * 1000, 2)

            column_names = adapter.get_column_names_from_cursor(cursor)
            import datetime
            import decimal

            column_types = {}
            for col_idx, col_name in enumerate(column_names):
                detected_type = None
                for row in rows:
                    if col_idx < len(row):
                        val = row[col_idx]
                        if val is not None:
                            if isinstance(val, bool):
                                detected_type = "boolean"
                            elif isinstance(val, int):
                                detected_type = "integer"
                            elif isinstance(val, (float, decimal.Decimal)):
                                detected_type = "float"
                            elif isinstance(val, datetime.datetime):
                                detected_type = "datetime"
                            elif isinstance(val, datetime.date):
                                detected_type = "date"
                            else:
                                detected_type = "string"
                            break
                if detected_type is None and cursor.description and col_idx < len(cursor.description):
                    desc = cursor.description[col_idx]
                    type_code = desc[1]
                    type_name = str(type_code).lower()
                    if "date" in type_name or "time" in type_name:
                        detected_type = "datetime"
                    elif "int" in type_name or "long" in type_name:
                        detected_type = "integer"
                    elif "num" in type_name or "float" in type_name or "decimal" in type_name or "double" in type_name:
                        detected_type = "float"
                    elif "bool" in type_name:
                        detected_type = "boolean"
                    else:
                        detected_type = "string"

                column_types[col_name] = detected_type or "string"

            row_count = len(rows)
            total_rows = None if truncated else row_count

            result = {
                "fields": column_names,
                "column_types": column_types,
                "rows": rows,
            }

            message = f"Query executed in {execution_time}ms. "
            if truncated:
                message += f"Truncated to {row_count} rows. "
            else:
                message += f"{row_count} rows. "

            logger.info(f"Query executed: {row_count} rows in {execution_time}ms")
            audit_log(
                actor=f"user:{user_id}" if user_id else "user:unknown",
                action="sql.execute",
                resource=f"db:{db_config.get('db_type', 'unknown')}/{db_config.get('database', 'unknown')}",
                outcome="success",
                details={
                    "row_count": row_count,
                    "truncated": truncated,
                    "execution_time_ms": execution_time,
                    "statement_type": analysis["query_type"],
                },
            )
            return {
                "status": "success",
                "result": result,
                "message": message,
                "row_count": row_count,
                "total_rows": total_rows,
                "truncated": truncated,
                "execution_time_ms": execution_time,
                "query_type": "SELECT",
            }

    except ValueError as err:
        public = public_database_error(err)
        log_safe_exception(logger, "validate_sql_query", err, public)
        audit_log(
            actor=f"user:{user_id}" if user_id else "user:unknown",
            action="sql.execute",
            resource=f"db:{db_config.get('db_type', 'unknown')}/{db_config.get('database', 'unknown')}",
            outcome="denied",
            details={"reason": "validation_error"},
        )
        return {
            "status": "error",
            "error_code": public.code,
            "message": public.message,
        }
    except ConnectionError as err:
        # FIX [EC6]: surface the health-check failure as a clear
        # "reconnect" message instead of a generic "Database error".
        public = public_tool_error(
            "DB_CONNECTION_ERROR",
            "Database connection failed.",
        )
        log_safe_exception(logger, "execute_sql_query_connection", err, public)
        audit_log(
            actor=f"user:{user_id}" if user_id else "user:unknown",
            action="sql.execute",
            resource=f"db:{db_config.get('db_type', 'unknown')}/{db_config.get('database', 'unknown')}",
            outcome="failure",
            details={"reason": "connection_error"},
        )
        return {
            "status": "error",
            "error_code": public.code,
            "message": public.message,
        }
    except Exception as err:
        # FIX [AUDIT-2-B]: raw DB driver errors leak schema / column /
        # connection-string fragments to the API caller. Classify the
        # error into a stable category and emit a sanitized message.
        public = public_database_error(err)
        log_safe_exception(logger, "execute_sql_query", err, public)
        audit_log(
            actor=f"user:{user_id}" if user_id else "user:unknown",
            action="sql.execute",
            resource=f"db:{db_config.get('db_type', 'unknown')}/{db_config.get('database', 'unknown')}",
            outcome="failure",
            details={"reason": public.code},
        )
        return {
            "status": "error",
            "error_code": public.code,
            "message": public.message,
        }
