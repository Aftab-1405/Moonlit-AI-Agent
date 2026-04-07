"""
MySQL Connection Utilities

Centralized utilities for parsing MySQL connection strings and creating connections.
Ensures consistent behavior across all MySQL connection points in the codebase.
"""

from typing import Dict
from urllib.parse import urlparse, unquote, parse_qs
import logging

logger = logging.getLogger(__name__)


def parse_mysql_connection_string(connection_string: str) -> Dict:
    """
    Parse a MySQL connection string into connection parameters.

    Supports formats:
    - mysql://user:password@host:port/database?params
    - mysql+pymysql://user:password@host:port/database?params

    Handles:
    - URL-encoded passwords (e.g., %40 → @)
    - Optional port (defaults to 3306)
    - Optional database in path
    - SSL parameters from query string

    Args:
        connection_string: MySQL connection URL

    Returns:
        Dict with keys: host, port, user, password, database, ssl_params
    """
    # Normalize connection string prefix
    cs = connection_string
    if cs.startswith("mysql+pymysql://"):
        cs = cs.replace("mysql+pymysql://", "mysql://")
    elif not cs.startswith("mysql://"):
        cs = "mysql://" + cs

    parsed = urlparse(cs)

    # Extract query parameters for SSL
    query_params = parse_qs(parsed.query)

    # Determine SSL settings
    ssl_enabled = False
    ssl_params = {}
    if any(
        key.lower() in ["ssl", "sslmode", "ssl_ca", "ssl-mode", "ssl_disabled"]
        for key in query_params.keys()
    ):
        ssl_enabled = True
        # Extract specific SSL params if provided
        if "ssl_ca" in query_params:
            ssl_params["ca"] = query_params["ssl_ca"][0]
    elif (
        parsed.hostname
        and parsed.hostname != "localhost"
        and parsed.hostname != "127.0.0.1"
    ):
        # Default: enable SSL for non-localhost connections (cloud providers need it)
        ssl_enabled = True

    result = {
        "host": parsed.hostname or "localhost",
        "port": parsed.port or 3306,
        "user": unquote(parsed.username) if parsed.username else "",
        "password": unquote(parsed.password) if parsed.password else "",
        "database": parsed.path.strip("/") if parsed.path else None,
        "ssl_enabled": ssl_enabled,
        "ssl_params": ssl_params,
    }

    logger.debug(
        f"Parsed MySQL connection string: {result['user']}@{result['host']}:{result['port']}/{result['database']}"
    )
    return result


def get_mysql_connect_kwargs(db_config: Dict, for_pool: bool = False) -> Dict:
    """
    Build MySQL connection kwargs from db_config.

    Handles both connection string and individual parameter configurations.
    Ensures Windows compatibility by forcing TCP/IP over named pipes.

    Args:
        db_config: Database configuration dict
        for_pool: If True, includes pool-specific settings

    Returns:
        Dict of kwargs suitable for mysql.connector.connect() or MySQLConnectionPool()
    """
    connection_string = db_config.get("connection_string")

    if connection_string:
        # Parse connection string
        parsed = parse_mysql_connection_string(connection_string)

        kwargs = {
            "host": parsed["host"],
            "port": parsed["port"],
            "user": parsed["user"],
            "password": parsed["password"],
            "charset": "utf8mb4",
            "use_unicode": True,
            "connect_timeout": 30,  # Longer timeout for remote
            "use_pure": True,  # Force pure Python implementation for better cross-platform support
        }

        if parsed["database"]:
            kwargs["database"] = parsed["database"]

        # Handle SSL for remote connections
        if parsed["ssl_enabled"]:
            kwargs["ssl_disabled"] = False

        if for_pool:
            kwargs["pool_size"] = 5  # Smaller pool for remote
            kwargs["pool_reset_session"] = True
            kwargs["autocommit"] = False
            kwargs["buffered"] = True
    else:
        # Individual parameters
        host = db_config.get("host")

        # Windows named-pipe guard: if host is empty or local-looking, force TCP/IP
        if not host or host == "." or host.lower() == "localhost":
            host = "127.0.0.1"  # Force IPv4 TCP to avoid named pipes on Windows

        kwargs = {
            "host": host,
            "port": db_config.get("port", 3306),
            "user": db_config.get("user", ""),
            "password": db_config.get("password", ""),
            "charset": "utf8mb4",
            "use_unicode": True,
            "connect_timeout": 10,
            "use_pure": True,  # Force pure Python for cross-platform
        }

        if db_config.get("database"):
            kwargs["database"] = db_config["database"]

        if for_pool:
            kwargs["pool_reset_session"] = True
            kwargs["autocommit"] = False
            kwargs["buffered"] = True
            kwargs["collation"] = "utf8mb4_unicode_ci"
            kwargs["sql_mode"] = (
                "STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO"
            )

    return kwargs
