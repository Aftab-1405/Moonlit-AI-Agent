"""
Connection Service

Database connection orchestration and status management.
"""

import logging

logger = logging.getLogger(__name__)


class ConnectionService:
    """Service for managing database connections."""

    @staticmethod
    def connect_database(connection_params: dict, user_id: str = None) -> dict:
        """
        Route connection request to appropriate handler.

        Args:
            connection_params: Dict containing connection parameters
                - db_type: 'mysql', 'postgresql', 'sqlserver', or 'oracle'
                - connection_string: For connection-string-based connections
                - host, port, username, password: For host/port connections
                - database: Database name
            user_id: User ID for context tracking

        Returns:
            Dict with status, message, and db_config if successful
        """
        from database import connection_handlers

        db_type = connection_params.get("db_type", "mysql")
        connection_string = connection_params.get("connection_string")

        _REMOTE_STRING_HANDLERS = {
            "postgresql": connection_handlers.connect_remote_postgresql,
            "mysql": connection_handlers.connect_remote_mysql,
            "sqlserver": connection_handlers.connect_remote_sqlserver,
            "oracle": connection_handlers.connect_remote_oracle,
        }

        _HOST_PORT_HANDLERS = {
            "mysql": connection_handlers.connect_mysql,
            "postgresql": connection_handlers.connect_postgresql,
            "sqlserver": connection_handlers.connect_sqlserver,
            "oracle": connection_handlers.connect_oracle,
        }

        if connection_string:
            handler = _REMOTE_STRING_HANDLERS.get(db_type)
            if not handler:
                return {
                    "status": "error",
                    "message": f"Remote {db_type} via connection string is not supported.",
                }
            return handler(connection_string, user_id)

        handler = _HOST_PORT_HANDLERS.get(db_type)
        if not handler:
            return {"status": "error", "message": f"Unknown database type: {db_type}"}

        return handler(
            connection_params.get("host"),
            connection_params.get("port"),
            connection_params.get("username"),
            connection_params.get("password"),
            connection_params.get("database"),
            user_id,
        )

    @staticmethod
    def get_connection_status(db_config: dict) -> dict:
        """
        Get current connection status.

        Args:
            db_config: Database configuration

        Returns:
            Dict with connection status
        """
        if not db_config:
            return {
                "status": "disconnected",
                "connected": False,
                "message": "Not connected to any database",
            }

        try:
            from database.connection_manager import get_connection_manager
            from database.adapters import get_adapter

            db_type = db_config.get("db_type", "mysql")
            manager = get_connection_manager()
            adapter = get_adapter(db_type)

            conn = manager.get_connection(db_config)
            is_valid = adapter.validate_connection(conn)

            if is_valid:
                return {
                    "status": "connected",
                    "connected": True,
                    "db_type": db_type,
                    "database": db_config.get("database"),
                    "is_remote": db_config.get("is_remote", False),
                }
            return {
                "status": "error",
                "connected": False,
                "message": "Connection validation failed",
            }
        except Exception as e:
            logger.warning(f"Connection status check failed: {e}")
            return {"status": "error", "connected": False, "message": str(e)}

    @staticmethod
    def check_connection_health(db_config: dict) -> dict:
        """
        Lightweight connection health check.

        Args:
            db_config: Database configuration

        Returns:
            Dict with health status
        """
        if not db_config:
            return {"status": "error", "connected": False}

        try:
            from database.connection_manager import get_connection_manager
            from database.adapters import get_adapter

            db_type = db_config.get("db_type", "mysql")
            manager = get_connection_manager()
            adapter = get_adapter(db_type)

            conn = manager.get_connection(db_config)
            is_valid = adapter.validate_connection(conn)

            return {"status": "success", "connected": is_valid}
        except Exception as e:
            logger.debug(f"Health check failed: {e}")
            return {"status": "error", "connected": False}
