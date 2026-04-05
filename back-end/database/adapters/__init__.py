"""
Database Adapters

Provides abstraction layer for different database types (MySQL, PostgreSQL,
SQL Server, Oracle) using the Adapter Pattern.
"""

from .base_adapter import BaseDatabaseAdapter
from .mysql_adapter import MySQLAdapter
from .postgresql_adapter import PostgreSQLAdapter
from .sqlserver_adapter import SQLServerAdapter
from .oracle_adapter import OracleAdapter

__all__ = [
    'BaseDatabaseAdapter',
    'MySQLAdapter',
    'PostgreSQLAdapter',
    'SQLServerAdapter',
    'OracleAdapter',
]


def get_adapter(db_type: str) -> BaseDatabaseAdapter:
    """
    Factory function to get the appropriate database adapter.

    Args:
        db_type: Database type ('mysql', 'postgresql', 'sqlserver', 'oracle')

    Returns:
        Database adapter instance

    Raises:
        ValueError: If database type is not supported
    """
    adapters = {
        'mysql': MySQLAdapter,
        'postgresql': PostgreSQLAdapter,
        'sqlserver': SQLServerAdapter,
        'oracle': OracleAdapter,
    }

    db_type = db_type.lower()
    if db_type not in adapters:
        raise ValueError(f"Unsupported database type: {db_type}. Supported types: {', '.join(adapters.keys())}")

    return adapters[db_type]()
