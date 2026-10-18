"""Database connection handlers returning framework-independent result dicts.

Remote hosts must resolve to public addresses. PostgreSQL DSNs use libpq's
parser and pin validated addresses while retaining host names for TLS checks.
Validation borrows use context managers to always release pooled connections.
"""

import ipaddress
import logging
import re
import socket
from typing import Dict

from config import get_config
from core.errors import log_safe_exception, public_database_error, public_error_for_code

logger = logging.getLogger(__name__)
Config = get_config()

# Loopback addresses that resolve to the server itself, not the user's machine.
_LOOPBACK = frozenset(Config.BLOCKED_DB_HOSTS)


def _database_connection_failure(operation: str, exc: BaseException) -> dict:
    """Return a stable connection-handler failure with safe diagnostics."""
    public = public_database_error(exc)
    log_safe_exception(logger, operation, exc, public)
    return {
        "status": "error",
        "error_code": public.code,
        "message": public.message,
    }


def _public_failure(code: str) -> dict:
    """Return the canonical status-style database failure for ``code``."""
    public = public_error_for_code(code)
    return {
        "status": "error",
        "error_code": public.code,
        "message": public.message,
    }


# HELPER FUNCTIONS


def _resolve_public_host(host: str) -> list[str]:
    """Resolve once and reject every non-public or socket destination."""
    clean_host = (host or "").strip().strip("[]")
    if not clean_host or clean_host.lower() in _LOOPBACK or clean_host.startswith(("/", "@")):
        raise ValueError("Invalid database host")
    addresses = [entry[4][0] for entry in socket.getaddrinfo(clean_host, None)]
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise ValueError("Database host must resolve to public addresses")
    return addresses


def _validate_host(host: str) -> dict | None:
    """
    Validate that *host* does not resolve to a private/loopback/link-local IP.

    This is the SSRF defense: the backend runs in the cloud, so a private or
    loopback address would point at the cloud's internal network or metadata
    endpoint (e.g. ``169.254.169.254``), not the user's machine.

    Returns:
        ``None`` if the host is safe to connect to, otherwise an error dict
        of the form ``{"status": "error", "message": ...}``.

    Fail-closed policy
    ------------------
    Previously, DNS resolution errors were swallowed with a bare ``except:
    pass``, which meant a transient DNS hiccup or a DNS-rebinding probe would
    silently disable the SSRF defense and let the DB adapter connect anyway.
    We now return an error dict for ``socket.gaierror`` (DNS failure) and for
    any other unexpected exception, so an unresolvable or transient host can
    never slip through validation.
    """
    if not host:
        return _public_failure("DB_HOST_VALIDATION_FAILED")
    if host.strip().lower() in _LOOPBACK or host.strip().lower() == "[::1]":
        return _public_failure("DB_HOST_VALIDATION_FAILED")

    try:
        _resolve_public_host(host)
    except socket.gaierror as e:
        # FIX [H4]: DNS resolution failed (NXDOMAIN, timeout, transient).
        # Fail closed — never let an unresolvable host bypass SSRF validation.
        public = public_error_for_code("DB_HOST_RESOLUTION_FAILED")
        log_safe_exception(logger, "resolve_database_host", e, public)
        return {
            "status": "error",
            "error_code": public.code,
            "message": public.message,
        }
    except Exception as e:
        # FIX [H4]: Any other unexpected validation error also fails closed
        # rather than silently letting the host through.
        public = public_error_for_code("DB_HOST_VALIDATION_FAILED")
        log_safe_exception(logger, "validate_database_host", e, public)
        return {
            "status": "error",
            "error_code": public.code,
            "message": public.message,
        }

    return None


def _parse_connection_string(connection_string: str) -> Dict[str, str]:
    """
    Best-effort parse of a connection string into ``database`` and ``host``.

    Used by the ``connect_remote_*`` handlers to extract the user-facing
    database name and the host for SSRF validation. Adapters have their own
    (often stricter) parsers; the host used for SSRF validation should come
    from the adapter's parse, not this helper, to avoid format-mismatch bypass
    (see FIX [C3] in ``connect_remote_oracle``).
    """
    from urllib.parse import unquote, urlparse

    try:
        parsed = urlparse(connection_string)
        host = parsed.hostname
        if not host:
            # Fallback to regex if hostname is empty (e.g. invalid URL structure)
            host_match = re.search(r"@([^/:]+)", connection_string)
            host = host_match.group(1) if host_match else ""

        db = unquote(parsed.path.lstrip("/"))
        if not db:
            db_match = re.search(r"/([^/?]+)(\?|$)", connection_string)
            db = db_match.group(1) if db_match else "remote_db"

        return {
            "database": db,
            "host": host,
        }
    except Exception:
        db_match = re.search(r"/([^/?]+)(\?|$)", connection_string)
        host_match = re.search(r"@([^/:]+)", connection_string)
        return {
            "database": db_match.group(1) if db_match else "remote_db",
            "host": host_match.group(1) if host_match else "",
        }


# HOST/PORT CONNECTION FUNCTIONS
# These support any remote host. Loopback addresses are rejected.


def connect_mysql(
    host: str,
    port: int,
    user: str,
    password: str,
    database: str = None,
    *,
    pool_owner: str | None = None,
) -> dict:
    """
    Connect to a remote MySQL server using host/port credentials.

    Validation is performed inside a ``get_connection_context`` block so the
    pooled connection is always returned, even if validation raises. The
    subsequent ``DatabaseOperations.get_databases`` call acquires (and
    releases) its own connection — we must NOT hold a second connection open
    across it, or the pool will exhaust after a handful of connect attempts.
    """
    err = _validate_host(host)
    if err:
        return err

    from service.database.adapters import get_adapter
    from service.database.connection_manager import get_connection_manager
    from service.database.operations import DatabaseOperations

    db_config = {
        "_pool_owner": pool_owner,
        "db_type": "mysql",
        "host": host,
        "port": int(port) if port else Config.DEFAULT_MYSQL_PORT,
        "user": user,
        "password": password,
    }
    if database:
        db_config["database"] = database

    try:
        manager = get_connection_manager()
        adapter = get_adapter("mysql")

        # FIX [C2]: Previously, manager.get_connection() was called for
        # validate_connection but the connection was NEVER returned to the
        # pool. After ~5 connect attempts (MySQL pool size = 5), the pool was
        # exhausted and every new connection attempt hung. Now we use the
        # context manager so the connection is always returned — and we let
        # get_databases acquire its own connection for the database list.
        with manager.get_connection_context(db_config) as conn:
            if not adapter.validate_connection(conn):
                return {"status": "error", "message": "Failed to connect to MySQL"}

        dbs_result = DatabaseOperations.get_databases(db_config)

        if dbs_result.get("status") == "success":
            logger.info("Connected to MySQL")
            return {
                "status": "connected",
                "message": f"Connected to MySQL at {host}:{port}",
                "databases": dbs_result["databases"],
                "db_type": "mysql",
                "db_config": db_config,
                "selectedDatabase": database,
            }

        return {
            "status": "connected",
            "message": "Connected, but failed to fetch databases",
            "databases": [],
            "db_type": "mysql",
            "db_config": db_config,
        }
    except Exception as err:
        return _database_connection_failure("connect_mysql", err)


def connect_postgresql(
    host: str,
    port: int,
    user: str,
    password: str,
    database: str = None,
    *,
    pool_owner: str | None = None,
) -> dict:
    """
    Connect to a remote PostgreSQL server using host/port credentials.

    See ``connect_mysql`` for the connection-lifecycle rationale: validation
    runs inside ``get_connection_context`` so the pooled connection is always
    returned, and ``get_databases`` acquires/releases its own connection.
    """
    err = _validate_host(host)
    if err:
        return err

    from service.database.adapters import get_adapter
    from service.database.connection_manager import get_connection_manager
    from service.database.operations import DatabaseOperations

    db_config = {
        "_pool_owner": pool_owner,
        "db_type": "postgresql",
        "host": host,
        "port": int(port) if port else Config.DEFAULT_POSTGRESQL_PORT,
        "user": user,
        "password": password,
    }
    if database:
        db_config["database"] = database

    try:
        manager = get_connection_manager()
        adapter = get_adapter("postgresql")

        # FIX [C2]: use context manager so the validation connection is
        # always returned to the pool (see connect_mysql for full rationale).
        with manager.get_connection_context(db_config) as conn:
            if not adapter.validate_connection(conn):
                return {"status": "error", "message": "Failed to connect to PostgreSQL"}

        dbs_result = DatabaseOperations.get_databases(db_config)

        if dbs_result.get("status") == "success":
            logger.info("Connected to PostgreSQL")
            return {
                "status": "connected",
                "message": f"Connected to PostgreSQL at {host}:{port}",
                "databases": dbs_result["databases"],
                "db_type": "postgresql",
                "db_config": db_config,
                "selectedDatabase": database,
            }

        return {
            "status": "connected",
            "message": "Connected, but failed to fetch databases",
            "databases": [],
            "db_type": "postgresql",
            "db_config": db_config,
        }
    except Exception as err:
        return _database_connection_failure("connect_postgresql", err)


def connect_sqlserver(
    host: str,
    port: int,
    user: str,
    password: str,
    database: str = None,
    *,
    pool_owner: str | None = None,
) -> dict:
    """
    Connect to a remote SQL Server database using host/port credentials.

    SQL Server (pymssql) has no real pool — each ``get_connection`` opens a
    fresh TCP connection, so the leak in the previous code did not block the
    pool, but it did leave orphaned connections behind. The context manager
    fix ensures each connection is closed.
    """
    err = _validate_host(host)
    if err:
        return err

    from service.database.adapters import get_adapter
    from service.database.connection_manager import get_connection_manager

    db_config = {
        "_pool_owner": pool_owner,
        "db_type": "sqlserver",
        "host": host,
        "port": int(port) if port else Config.DEFAULT_SQLSERVER_PORT,
        "user": user,
        "password": password,
    }
    if database:
        db_config["database"] = database

    try:
        manager = get_connection_manager()
        adapter = get_adapter("sqlserver")

        # FIX [C2]: validation connection must be returned to the pool via
        # the context manager (see connect_mysql for full rationale).
        with manager.get_connection_context(db_config) as conn:
            if not adapter.validate_connection(conn):
                return {"status": "error", "message": "Failed to connect to SQL Server"}

        databases = []
        try:
            with manager.get_cursor(db_config) as cursor:
                cursor.execute(adapter.get_databases_query())
                all_dbs = [row[0] for row in cursor.fetchall()]
                system_dbs = adapter.get_system_databases()
                databases = [db for db in all_dbs if db.lower() not in system_dbs]
        except Exception as e:
            public = public_database_error(e)
            log_safe_exception(logger, "fetch_sqlserver_databases", e, public)
            if database:
                databases = [database]

        logger.info("Connected to SQL Server")
        return {
            "status": "connected",
            "message": f"Connected to SQL Server at {host}:{port}",
            "databases": databases,
            "db_type": "sqlserver",
            "db_config": db_config,
            "selectedDatabase": database,
        }
    except Exception as err:
        return _database_connection_failure("connect_sqlserver", err)


def connect_oracle(
    host: str,
    port: int,
    user: str,
    password: str,
    service_name: str = None,
    *,
    pool_owner: str | None = None,
) -> dict:
    """
    Connect to a remote Oracle database server using host/port credentials.

    Validation runs inside ``get_connection_context`` so the pooled Oracle
    connection is always released back to the oracledb pool. The Oracle pool
    is small (2-10) so a handful of leaked validation connections would
    exhaust it.
    """
    err = _validate_host(host)
    if err:
        return err

    from service.database.adapters import get_adapter
    from service.database.connection_manager import get_connection_manager

    db_config = {
        "_pool_owner": pool_owner,
        "db_type": "oracle",
        "host": host,
        "port": int(port) if port else Config.DEFAULT_ORACLE_PORT,
        "user": user,
        "password": password,
        "service_name": service_name or "ORCL",
        "database": user.upper() if user else "SYSTEM",  # Oracle schema = user
    }

    try:
        manager = get_connection_manager()
        adapter = get_adapter("oracle")

        # FIX [C2]: use context manager so the validation connection is
        # always released to the oracledb pool (see connect_mysql for full
        # rationale).
        with manager.get_connection_context(db_config) as conn:
            if not adapter.validate_connection(conn):
                return {"status": "error", "message": "Failed to connect to Oracle"}

        schemas = []
        try:
            with manager.get_cursor(db_config) as cursor:
                cursor.execute(adapter.get_databases_query())
                schemas = [row[0] for row in cursor.fetchall()]
        except Exception as e:
            public = public_database_error(e)
            log_safe_exception(logger, "fetch_oracle_schemas", e, public)
            schemas = [user.upper()] if user else []

        schema_name = user.upper() if user else "SYSTEM"
        logger.info("Connected to Oracle")
        return {
            "status": "connected",
            "message": f"Connected to Oracle at {host}:{port}/{service_name}",
            # Oracle schemas are tied to user accounts. We expose them under
            # `databases` so the frontend's "Available Databases" list shows
            # them as switchable accounts (consistent with how the frontend
            # treats MySQL database/schema synonyms). `schemas` is left empty
            # because the frontend reserves that field for PostgreSQL/SQL
            # Server schemas — mixing them here would re-introduce the bug.
            "databases": schemas,
            "schemas": [],
            "db_type": "oracle",
            "db_config": db_config,
            "selectedDatabase": schema_name,
        }
    except Exception as err:
        return _database_connection_failure("connect_oracle", err)


# CONNECTION STRING FUNCTIONS (remote only)


def connect_remote_postgresql(connection_string: str, *, pool_owner: str | None = None) -> dict:
    """Connect using libpq's effective options and pinned public addresses."""
    from psycopg2.extensions import make_dsn, parse_dsn

    from service.database.adapters import get_adapter
    from service.database.connection_manager import get_connection_manager

    try:
        options = parse_dsn(connection_string)
    except Exception:
        return _public_failure("DB_CONNECTION_STRING_INVALID")

    # Service files and omitted hosts can introduce destinations outside the
    # submitted DSN. Validate every effective host/hostaddr, including URL
    # query overrides, and retain host names for TLS certificate validation.
    if options.get("service") or not (options.get("host") or options.get("hostaddr")):
        return _public_failure("DB_CONNECTION_STRING_INVALID")
    hosts = options.get("host", "").split(",")
    supplied_addresses = options.get("hostaddr", "").split(",")
    if options.get("hostaddr") and not options.get("host"):
        hosts = supplied_addresses
    if options.get("hostaddr") and len(supplied_addresses) != len(hosts):
        return _public_failure("DB_CONNECTION_STRING_INVALID")
    try:
        addresses = []
        for index, host in enumerate(hosts):
            resolved = _resolve_public_host(host)
            address = supplied_addresses[index] if options.get("hostaddr") else ""
            if address:
                if not ipaddress.ip_address(address).is_global:
                    raise ValueError("Invalid database address")
            else:
                address = resolved[0]
            addresses.append(address)
    except socket.gaierror:
        return _public_failure("DB_HOST_RESOLUTION_FAILED")
    except Exception:
        return _public_failure("DB_HOST_VALIDATION_FAILED")
    options["host"] = ",".join(hosts)
    options["hostaddr"] = ",".join(addresses)
    db_name = options.get("dbname") or options.get("user") or Config.DEFAULT_POSTGRESQL_DATABASE
    options["dbname"] = db_name
    connection_string = make_dsn(**options)

    db_config = {
        "_pool_owner": pool_owner,
        "db_type": "postgresql",
        "connection_string": connection_string,
        "database": db_name,
        "host": options["host"],
        "is_remote": True,
    }

    try:
        manager = get_connection_manager()
        adapter = get_adapter("postgresql")

        # FIX [C2]: use context manager so the validation connection is
        # always returned to the pool (see connect_mysql for full rationale).
        with manager.get_connection_context(db_config) as conn:
            if not adapter.validate_connection(conn):
                return {"status": "error", "message": "Failed to connect to remote PostgreSQL"}

        logger.info("Connected to remote PostgreSQL")

        all_databases = []
        try:
            with manager.get_cursor(db_config) as cursor:
                cursor.execute(adapter.get_databases_for_remote())
                all_databases = [row[0] for row in cursor.fetchall()]
        except Exception:
            all_databases = [db_name]

        tables = []
        try:
            with manager.get_cursor(db_config) as cursor:
                query, params = adapter.get_all_tables_for_cache(db_name, "public")
                cursor.execute(query, params)
                tables = [row[0] for row in cursor.fetchall()]
        except Exception as e:
            public = public_database_error(e)
            log_safe_exception(logger, "fetch_remote_postgresql_tables", e, public)

        message = f"Connected to remote PostgreSQL: {db_name}"
        if tables:
            message += f" ({len(tables)} tables)"

        return {
            "status": "connected",
            "message": message,
            "databases": all_databases,
            "selectedDatabase": db_name,
            "is_remote": True,
            "tables": tables,
            "db_type": "postgresql",
            "db_config": db_config,
        }
    except Exception as err:
        return _database_connection_failure("connect_remote_postgresql", err)


def connect_remote_mysql(connection_string: str, *, pool_owner: str | None = None) -> dict:
    """
    Connect to a remote MySQL database using a connection string.

    SSRF note: the host for validation is taken from this handler's
    ``_parse_connection_string``. Validation runs inside
    ``get_connection_context`` so the pooled connection is always returned
    to the MySQL pool.
    """
    from service.database.adapters import get_adapter
    from service.database.connection_manager import get_connection_manager

    parsed = _parse_connection_string(connection_string)
    db_name = parsed["database"]
    host = parsed["host"]

    # FIX [C3]: Fail closed if the host cannot be extracted — do NOT default
    # to "remote" and skip validation.
    if not host:
        return _public_failure("DB_CONNECTION_STRING_INVALID")
    err = _validate_host(host)
    if err:
        return err

    db_config = {
        "_pool_owner": pool_owner,
        "db_type": "mysql",
        "connection_string": connection_string,
        "database": db_name,
        "is_remote": True,
    }

    try:
        manager = get_connection_manager()
        adapter = get_adapter("mysql")

        # FIX [C2]: use context manager so the validation connection is
        # always returned to the pool (see connect_mysql for full rationale).
        with manager.get_connection_context(db_config) as conn:
            if not adapter.validate_connection(conn):
                return {"status": "error", "message": "Failed to connect to remote MySQL"}

        logger.info("Connected to remote MySQL")

        all_databases = []
        try:
            with manager.get_cursor(db_config) as cursor:
                cursor.execute(adapter.get_databases_query())
                all_databases = [row[0] for row in cursor.fetchall()]
                system_dbs = adapter.get_system_databases()
                all_databases = [db for db in all_databases if db.lower() not in system_dbs]
        except Exception:
            all_databases = [db_name]

        tables = []
        try:
            with manager.get_cursor(db_config) as cursor:
                cursor.execute(
                    """
                    SELECT TABLE_NAME FROM information_schema.TABLES
                    WHERE TABLE_SCHEMA = %s AND TABLE_TYPE = 'BASE TABLE'
                    ORDER BY TABLE_NAME
                    """,
                    (db_name,),
                )
                tables = [row[0] for row in cursor.fetchall()]
        except Exception as e:
            public = public_database_error(e)
            log_safe_exception(logger, "fetch_remote_mysql_tables", e, public)

        message = f"Connected to remote MySQL: {db_name}"
        if tables:
            message += f" ({len(tables)} tables)"

        return {
            "status": "connected",
            "message": message,
            "databases": all_databases,
            "selectedDatabase": db_name,
            "is_remote": True,
            "tables": tables,
            "db_type": "mysql",
            "db_config": db_config,
        }
    except Exception as err:
        return _database_connection_failure("connect_remote_mysql", err)


def connect_remote_oracle(connection_string: str, *, pool_owner: str | None = None) -> dict:
    """
    Connect to a remote Oracle database using a connection string.

    Expected format: user/password@host:port/service_name

    SSRF note (FIX [C3]): Previously the handler used its own strict regex
    (which required a ``/service_name`` suffix) to extract the host for
    validation. If the connection string did not match (e.g.
    ``user/pass@169.254.169.254:1521`` with no service name), the handler
    set ``_host = ""`` and skipped ``_validate_host`` entirely — but the
    Oracle adapter's looser parser still extracted the host and connected,
    bypassing the SSRF defense. We now parse with the *adapter's* parser
    and validate that host unconditionally; if no host can be extracted we
    fail closed instead of attempting the connection.
    """
    from service.database.adapters import get_adapter
    from service.database.connection_manager import get_connection_manager

    adapter = get_adapter("oracle")

    # FIX [C3]: parse with the adapter's parser (the same one that will be
    # used to create the pool) so the host we validate is exactly the host
    # we will connect to. Fail closed if the parse fails or yields no host.
    try:
        parsed = adapter._parse_connection_string(connection_string)
    except Exception as parse_err:
        public = public_error_for_code("DB_CONNECTION_STRING_INVALID")
        log_safe_exception(logger, "parse_oracle_connection_string", parse_err, public)
        return {
            "status": "error",
            "error_code": public.code,
            "message": public.message,
        }

    # The adapter's _parse_connection_string returns a 'dsn' like
    # 'host:port/service_name' or 'host:port'. Extract the host portion.
    dsn = (parsed.get("dsn") or "").strip()
    user = parsed.get("user") or ""
    host = ""
    if dsn:
        # Strip leading // (Easy Connect Plus)
        dsn_no_slash = dsn[2:] if dsn.startswith("//") else dsn
        # host is everything before the first ':' or '/'
        host_match = re.match(r"^([^:/]+)", dsn_no_slash)
        if host_match:
            host = host_match.group(1).strip()

    if not host:
        # FIX [C3]: fail closed if no host can be extracted — do NOT fall
        # through and let the adapter connect to an unvalidated host.
        return _public_failure("DB_CONNECTION_STRING_INVALID")

    err = _validate_host(host)
    if err:
        return err

    schema_name = user.upper() if user else "REMOTE"

    db_config = {
        "_pool_owner": pool_owner,
        "db_type": "oracle",
        "connection_string": connection_string,
        "database": schema_name,
        "is_remote": True,
    }

    try:
        manager = get_connection_manager()

        # FIX [C2]: use context manager so the validation connection is
        # always released to the oracledb pool (see connect_mysql for full
        # rationale).
        with manager.get_connection_context(db_config) as conn:
            if not adapter.validate_connection(conn):
                return {"status": "error", "message": "Failed to connect to remote Oracle"}

        logger.info("Connected to remote Oracle")

        schemas = []
        try:
            with manager.get_cursor(db_config) as cursor:
                cursor.execute(adapter.get_databases_query())
                schemas = [row[0] for row in cursor.fetchall()]
        except Exception:
            schemas = [schema_name]

        tables = []
        try:
            tables_query, tables_params = adapter.get_all_tables_for_cache(schema_name)
            with manager.get_cursor(db_config) as cursor:
                cursor.execute(tables_query, tables_params)
                tables = [row[0] for row in cursor.fetchall()]
        except Exception as e:
            public = public_database_error(e)
            log_safe_exception(logger, "fetch_remote_oracle_tables", e, public)

        message = f"Connected to remote Oracle: {schema_name}"
        if tables:
            message += f" ({len(tables)} tables)"

        return {
            "status": "connected",
            "message": message,
            # Oracle schemas == users; expose under `databases` for the
            # frontend's switcher (see connect_oracle for full rationale).
            "databases": schemas,
            "schemas": [],
            "selectedDatabase": schema_name,
            "is_remote": True,
            "tables": tables,
            "db_type": "oracle",
            "db_config": db_config,
        }
    except Exception as err:
        return _database_connection_failure("connect_remote_oracle", err)


def connect_remote_sqlserver(connection_string: str, *, pool_owner: str | None = None) -> dict:
    """
    Connect to a remote SQL Server database using a connection string.

    Expected format: Driver={ODBC Driver 17 for SQL Server};Server=xxx;Database=xxx;UID=xxx;PWD=xxx

    SSRF note (FIX [C3]): the host is taken from the ``Server=`` portion of
    the connection string and validated unconditionally. Fail closed if no
    host can be extracted. Validation runs inside ``get_connection_context``
    so the (un-pooled) connection is always closed.
    """
    import re as _re

    from service.database.adapters import get_adapter
    from service.database.connection_manager import get_connection_manager

    db_match = _re.search(r"(?:Database|Initial Catalog)=([^;]+)", connection_string, _re.IGNORECASE)
    server_match = _re.search(r"(?:Server|Data Source)=([^;,]+)", connection_string, _re.IGNORECASE)

    db_name = db_match.group(1).strip() if db_match else "master"
    host = server_match.group(1).strip() if server_match else ""

    # FIX [C3]: Fail closed if no host can be extracted — do NOT default to
    # "remote" and skip validation.
    if not host:
        return _public_failure("DB_CONNECTION_STRING_INVALID")
    err = _validate_host(host)
    if err:
        return err

    db_config = {
        "_pool_owner": pool_owner,
        "db_type": "sqlserver",
        "connection_string": connection_string,
        "database": db_name,
        "is_remote": True,
    }

    try:
        manager = get_connection_manager()
        adapter = get_adapter("sqlserver")

        # FIX [C2]: use context manager so the validation connection is
        # always closed (see connect_mysql for full rationale).
        with manager.get_connection_context(db_config) as conn:
            if not adapter.validate_connection(conn):
                return {"status": "error", "message": "Failed to connect to remote SQL Server"}

        logger.info("Connected to remote SQL Server")

        all_databases = []
        try:
            with manager.get_cursor(db_config) as cursor:
                cursor.execute(adapter.get_databases_query())
                all_dbs = [row[0] for row in cursor.fetchall()]
                system_dbs = adapter.get_system_databases()
                all_databases = [db for db in all_dbs if db.lower() not in system_dbs]
        except Exception:
            all_databases = [db_name]

        tables = []
        try:
            tables_query, tables_params = adapter.get_all_tables_for_cache(db_name)
            with manager.get_cursor(db_config) as cursor:
                cursor.execute(tables_query, tables_params)
                tables = [row[0] for row in cursor.fetchall()]
        except Exception as e:
            public = public_database_error(e)
            log_safe_exception(logger, "fetch_remote_sqlserver_tables", e, public)

        message = f"Connected to remote SQL Server: {db_name}"
        if tables:
            message += f" ({len(tables)} tables)"

        return {
            "status": "connected",
            "message": message,
            "databases": all_databases,
            "selectedDatabase": db_name,
            "is_remote": True,
            "tables": tables,
            "db_type": "sqlserver",
            "db_config": db_config,
        }
    except Exception as err:
        return _database_connection_failure("connect_remote_sqlserver", err)


# DATABASE SELECTION


def select_database(db_config: dict, db_name: str) -> dict:
    """
    Select a database on an existing connection.

    Args:
        db_config: Current database configuration
        db_name: Name of database to select
        Returns:
        Dict with status and updated db_config
    """
    from service.database.operations import fetch_database_info

    if not db_name:
        return {"status": "error", "message": "Database name required"}

    if not db_config:
        return {"status": "error", "message": "No database connected"}

    new_config = db_config.copy()
    new_config["database"] = db_name

    try:
        fetch_database_info(new_config, db_name)

        logger.info("Database selection completed")
        return {
            "status": "connected",
            "message": f"Connected to database {db_name}",
            "db_config": new_config,
        }
    except Exception as err:
        return _database_connection_failure("select_database", err)
