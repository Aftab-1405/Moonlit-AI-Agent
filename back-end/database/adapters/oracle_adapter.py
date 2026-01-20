"""
Oracle Database Adapter

Implements database operations for Oracle using oracledb (python-oracledb).
Supports local Oracle instances and cloud providers (AWS RDS Oracle).

Features:
- TRUE connection pooling using oracledb.create_pool()
- Pool of 2-10 connections maintained for efficient reuse
- Connection acquisition is fast (no connect overhead per query)

Note: Oracle Cloud Autonomous DB requires wallet-based authentication which
is not supported in this simple connection string approach.
"""

import logging
import re
from typing import Any, Dict, List, Optional
from contextlib import contextmanager
from .base_adapter import BaseDatabaseAdapter

logger = logging.getLogger(__name__)

# Check if oracledb is available
try:
    import oracledb
    ORACLE_AVAILABLE = True
except ImportError:
    ORACLE_AVAILABLE = False
    logger.warning("oracledb not installed. Oracle support disabled.")


class OracleAdapter(BaseDatabaseAdapter):
    """Oracle database adapter using oracledb with TRUE connection pooling."""

    def __init__(self):
        if not ORACLE_AVAILABLE:
            raise ImportError(
                "oracledb is required for Oracle support. "
                "Install it with: pip install oracledb"
            )

    @property
    def db_type(self) -> str:
        return 'oracle'

    @property
    def default_port(self) -> Optional[int]:
        return 1521

    @property
    def requires_server(self) -> bool:
        return True

    def _parse_connection_string(self, connection_string: str) -> Dict[str, str]:
        """
        Parse Oracle connection string to extract components.
        
        Supported formats:
        - user/password@host:port/service_name
        - user/password@//host:port/service_name (Easy Connect Plus)
        - user/password@host/service_name (default port 1521)
        
        Returns:
            Dict with 'user', 'password', 'dsn' keys
        """
        # Pattern: user/password@[//]host[:port]/service_name
        pattern = r'^([^/]+)/([^@]+)@(.+)$'
        match = re.match(pattern, connection_string)
        
        if match:
            user = match.group(1)
            password = match.group(2)
            dsn = match.group(3)
            
            # Remove leading // if present (Easy Connect Plus format)
            if dsn.startswith('//'):
                dsn = dsn[2:]
            
            return {
                'user': user,
                'password': password,
                'dsn': dsn
            }
        else:
            raise ValueError(
                "Invalid Oracle connection string format. "
                "Expected: user/password@host:port/service_name"
            )

    def create_connection_pool(self, config: Dict) -> Any:
        """
        Create TRUE Oracle connection pool using oracledb.create_pool().
        
        Pool Configuration:
        - min: 2 connections (always maintained)
        - max: 10 connections (scales up under load)
        - increment: 1 (grows gradually)
        
        Supports:
        1. Connection string (Easy Connect format for AWS RDS, local)
        2. Individual parameters (host, port, user, password, service_name/sid)
        
        Note: Oracle Cloud Autonomous DB with wallet is NOT supported.
        """
        
        try:
            connection_string = config.get('connection_string')
            
            if connection_string:
                # Parse connection string to extract user/password/dsn
                parsed = self._parse_connection_string(connection_string)
                user = parsed['user']
                password = parsed['password']
                dsn = parsed['dsn']
                
                logger.info(f"Creating Oracle connection pool using connection string for DSN: {dsn}")
            else:
                # Local connection via individual parameters
                host = config.get('host', 'localhost')
                port = config.get('port', 1521)
                user = config.get('user', '')
                password = config.get('password', '')
                service_name = config.get('service_name') or config.get('database', 'ORCL')
                
                # Easy Connect string format: host:port/service_name
                dsn = f"{host}:{port}/{service_name}"
                
                logger.info(f"Creating Oracle connection pool for {user}@{host}:{port}/{service_name}")
            
            # Create TRUE connection pool with oracledb
            pool = oracledb.create_pool(
                user=user,
                password=password,
                dsn=dsn,
                min=2,          # Minimum connections always maintained
                max=10,         # Maximum connections under load
                increment=1,    # Grow pool by 1 when needed
                timeout=60,     # Wait up to 60s for available connection
                getmode=oracledb.POOL_GETMODE_WAIT  # Wait for connection if pool exhausted
            )
            
            logger.info(f"Created Oracle connection pool: min={pool.min}, max={pool.max}, opened={pool.opened}")
            return pool
                
        except Exception as err:
            logger.error(f"Failed to create Oracle connection pool: {err}")
            raise

    def get_connection_from_pool(self, pool: Any) -> Any:
        """
        Get Oracle connection from pool (reuses existing connection).
        
        This is fast because connections are already established in the pool.
        """
        try:
            # acquire() gets a connection from the pool (fast!)
            # If pool is exhausted, waits up to 'timeout' seconds
            connection = pool.acquire()
            logger.debug(f"Acquired Oracle connection from pool (busy={pool.busy}, opened={pool.opened})")
            return connection
        except Exception as err:
            logger.error(f"Failed to acquire Oracle connection from pool: {err}")
            raise

    def close_pool(self, pool: Any) -> bool:
        """Close Oracle connection pool and all connections in it."""
        try:
            if pool:
                pool.close(force=True)
                logger.info("Oracle connection pool closed successfully")
            return True
        except Exception as err:
            logger.error(f"Failed to close Oracle pool: {err}")
            return False

    def return_connection_to_pool(self, pool: Any, connection: Any) -> None:
        """
        Return Oracle connection back to pool for reuse.
        
        Connection is NOT closed - it stays in the pool for next query.
        """
        try:
            if connection and pool:
                # release() returns connection to pool (does NOT close it)
                pool.release(connection)
                logger.debug(f"Released Oracle connection to pool (busy={pool.busy})")
        except Exception as err:
            logger.warning(f"Failed to release Oracle connection to pool: {err}")

    @contextmanager
    def get_cursor(self, connection: Any, dictionary: bool = False, buffered: bool = True):
        """Get Oracle cursor from connection."""
        cursor = None
        try:
            cursor = connection.cursor()
            yield cursor
            connection.commit()
        except Exception as e:
            if connection:
                connection.rollback()
            raise e
        finally:
            if cursor:
                cursor.close()

    def get_databases_query(self) -> str:
        """SQL query to list Oracle databases (actually schemas/users)."""
        # Oracle doesn't have "databases" like MySQL/PostgreSQL
        # We list user schemas instead
        return """
            SELECT username 
            FROM all_users 
            WHERE username NOT IN ('SYS', 'SYSTEM', 'ORACLE_OCM', 'XDB', 'WMSYS', 
                                   'CTXSYS', 'MDSYS', 'OLAPSYS', 'ORDDATA', 'ORDSYS',
                                   'OUTLN', 'DBSNMP', 'APPQOSSYS', 'ANONYMOUS')
            ORDER BY username
        """

    def get_tables_query(self) -> str:
        """SQL query to list Oracle tables."""
        return """
            SELECT table_name
            FROM all_tables
            WHERE owner = :1
            ORDER BY table_name
        """

    def get_table_schema_query(self) -> str:
        """SQL query to get Oracle table schema."""
        return """
            SELECT 
                column_name,
                data_type,
                nullable,
                data_default
            FROM all_tab_columns
            WHERE owner = :1 AND table_name = :2
            ORDER BY column_id
        """

    def get_system_databases(self) -> set:
        """Oracle system schemas to filter out."""
        return {
            'sys', 'system', 'oracle_ocm', 'xdb', 'wmsys', 
            'ctxsys', 'mdsys', 'olapsys', 'orddata', 'ordsys',
            'outln', 'dbsnmp', 'appqossys', 'anonymous'
        }

    def validate_connection(self, connection: Any) -> bool:
        """Validate Oracle connection is alive."""
        try:
            if connection:
                cursor = connection.cursor()
                cursor.execute("SELECT 1 FROM DUAL")
                cursor.fetchone()
                cursor.close()
                return True
        except Exception as e:
            logger.debug(f"Oracle connection validation failed: {e}")
        return False

    def format_column_info(self, raw_column: Any) -> Dict:
        """Format Oracle column information."""
        if isinstance(raw_column, dict):
            return {
                'name': raw_column.get('COLUMN_NAME', ''),
                'type': raw_column.get('DATA_TYPE', ''),
                'nullable': raw_column.get('NULLABLE', 'N') == 'Y',
                'key': '',
                'default': raw_column.get('DATA_DEFAULT'),
                'extra': ''
            }
        else:
            # Tuple format: (name, type, nullable, default)
            return {
                'name': raw_column[0],
                'type': raw_column[1],
                'nullable': raw_column[2] == 'Y',
                'key': '',
                'default': raw_column[3] if len(raw_column) > 3 else None,
                'extra': ''
            }

    # =========================================================================
    # Schema Caching Methods (for AI context)
    # =========================================================================
    
    def get_all_tables_for_cache(self, db_name: str, schema: str = None) -> tuple:
        """Return SQL query and params to get all tables for schema caching."""
        # In Oracle, db_name is actually the schema/owner
        query = """
            SELECT table_name 
            FROM all_tables 
            WHERE owner = :1
            ORDER BY table_name
        """
        return query, (db_name.upper(),)
    
    def get_columns_for_table_cache(self, db_name: str, table_name: str, schema: str = None) -> tuple:
        """Return SQL query and params to get column names for a table."""
        query = """
            SELECT column_name
            FROM all_tab_columns
            WHERE owner = :1 AND table_name = :2
            ORDER BY column_id
        """
        return query, (db_name.upper(), table_name.upper())
    
    def get_column_details_for_table(self, db_name: str, table_name: str, schema: str = None) -> tuple:
        """Return SQL query and params to get full column details for a table."""
        query = """
            SELECT column_name, data_type, nullable, data_default
            FROM all_tab_columns
            WHERE owner = :1 AND table_name = :2
            ORDER BY column_id
        """
        return query, (db_name.upper(), table_name.upper())
    
    def get_set_timeout_sql(self, timeout_seconds: int) -> Optional[str]:
        """Return Oracle query timeout SQL."""
        # Oracle doesn't support query-level timeout in the same way
        return None
    
    def get_column_names_from_cursor(self, cursor: Any) -> List[str]:
        """Extract column names from Oracle cursor."""
        if hasattr(cursor, 'description') and cursor.description:
            return [desc[0] for desc in cursor.description]
        return []
    
    def get_databases_for_cache(self) -> tuple:
        """Return SQL query and params to get all schemas for caching."""
        return self.get_databases_query(), ()
    
    def get_batch_columns_for_tables(self, db_name: str, tables: List[str], schema: str = None) -> tuple:
        """Return SQL query and params to batch fetch columns for multiple tables."""
        if not tables:
            return None, []
        
        # Oracle uses different placeholder syntax (:1, :2, etc.)
        # Building IN clause with positional params
        table_placeholders = ','.join([f":{i+2}" for i in range(len(tables))])
        query = f"""
            SELECT table_name, column_name
            FROM all_tab_columns
            WHERE owner = :1
            AND table_name IN ({table_placeholders})
            ORDER BY table_name, column_id
        """
        params = [db_name.upper()] + [t.upper() for t in tables]
        return query, params
    
    # =========================================================================
    # Schema Metadata Methods (for AI tools)
    # =========================================================================
    
    def get_indexes_query(self, table_name: str, db_name: str = None, schema: str = None) -> tuple:
        """Return SQL query and params to get indexes for an Oracle table."""
        query = """
            SELECT 
                i.index_name,
                ic.column_name,
                CASE WHEN i.uniqueness = 'UNIQUE' THEN 1 ELSE 0 END AS is_unique,
                0 AS is_primary
            FROM all_indexes i
            JOIN all_ind_columns ic ON i.index_name = ic.index_name AND i.owner = ic.index_owner
            WHERE i.table_name = :1 AND i.owner = :2
            ORDER BY i.index_name, ic.column_position
        """
        owner = db_name.upper() if db_name else schema.upper() if schema else 'PUBLIC'
        return query, (table_name.upper(), owner)
    
    def get_constraints_query(self, table_name: str, db_name: str = None, schema: str = None) -> tuple:
        """Return SQL query and params to get constraints for an Oracle table."""
        query = """
            SELECT 
                c.constraint_name,
                c.constraint_type,
                cc.column_name
            FROM all_constraints c
            JOIN all_cons_columns cc ON c.constraint_name = cc.constraint_name AND c.owner = cc.owner
            WHERE c.table_name = :1 AND c.owner = :2
            ORDER BY c.constraint_type, c.constraint_name, cc.position
        """
        owner = db_name.upper() if db_name else schema.upper() if schema else 'PUBLIC'
        return query, (table_name.upper(), owner)
    
    def get_foreign_keys_query(self, table_name: str = None, db_name: str = None, schema: str = None) -> tuple:
        """Return SQL query and params to get foreign key relationships in Oracle."""
        owner = db_name.upper() if db_name else schema.upper() if schema else 'PUBLIC'
        
        if table_name:
            query = """
                SELECT 
                    a.table_name,
                    a.column_name,
                    c_pk.table_name AS referenced_table,
                    b.column_name AS referenced_column
                FROM all_cons_columns a
                JOIN all_constraints c ON a.constraint_name = c.constraint_name AND a.owner = c.owner
                JOIN all_constraints c_pk ON c.r_constraint_name = c_pk.constraint_name AND c.r_owner = c_pk.owner
                JOIN all_cons_columns b ON c_pk.constraint_name = b.constraint_name AND c_pk.owner = b.owner
                WHERE c.constraint_type = 'R' AND a.table_name = :1 AND a.owner = :2
                ORDER BY a.table_name, a.column_name
            """
            return query, (table_name.upper(), owner)
        else:
            query = """
                SELECT 
                    a.table_name,
                    a.column_name,
                    c_pk.table_name AS referenced_table,
                    b.column_name AS referenced_column
                FROM all_cons_columns a
                JOIN all_constraints c ON a.constraint_name = c.constraint_name AND a.owner = c.owner
                JOIN all_constraints c_pk ON c.r_constraint_name = c_pk.constraint_name AND c.r_owner = c_pk.owner
                JOIN all_cons_columns b ON c_pk.constraint_name = b.constraint_name AND c_pk.owner = b.owner
                WHERE c.constraint_type = 'R' AND a.owner = :1
                ORDER BY a.table_name, a.column_name
            """
            return query, (owner,)

