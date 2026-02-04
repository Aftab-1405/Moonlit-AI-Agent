"""
Multi-User Connection Manager

Manages database connection pools for multiple users with different configurations.
Each unique database configuration gets its own connection pool.
Supports MySQL, PostgreSQL, and SQLite through adapter pattern.
"""

import threading
import hashlib
import time
from contextlib import contextmanager
from functools import lru_cache
from typing import Dict, Any
import logging
from database.adapters import get_adapter

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Connection manager that maintains separate connection pools
    for each unique database configuration.

    Thread-safe and supports multiple concurrent users with different database configs.
    
    Usage:
        Use get_connection_manager() dependency for FastAPI routes.
        For testing, call get_connection_manager.cache_clear() to reset.
    """

    def __init__(self):
        self._pools: Dict[str, Any] = {}  # Supports MySQL, PostgreSQL, SQLite pools
        self._adapters: Dict[str, Any] = {}  # Database adapter per pool
        self._pool_locks: Dict[str, threading.Lock] = {}
        self._pool_last_used: Dict[str, float] = {}
        self._global_lock = threading.Lock()
        self._cleanup_interval = 300  # 5 minutes
        self._pool_idle_timeout = 600  # 10 minutes
        self._thread_local = threading.local()

        # Start cleanup thread
        self._start_cleanup_thread()

        logger.info("ConnectionManager initialized with multi-database support")

    def _get_pool_key(self, config: dict) -> str:
        """
        Generate unique key for a database configuration.
        Uses db_type, host, port, user, and database to create hash.
        For connection strings, uses the connection string itself.
        """
        db_type = config.get('db_type', 'mysql').lower()

        # For connection string based configs
        if config.get('connection_string'):
            key_parts = [
                db_type,
                'connection_string',
                config.get('connection_string')
            ]
        # For SQLite, key is based on file path only
        elif db_type == 'sqlite':
            key_parts = [
                'sqlite',
                config.get('file_path') or config.get('database', ':memory:')
            ]
        else:
            # For server-based databases (MySQL, PostgreSQL)
            adapter = get_adapter(db_type)
            default_port = adapter.default_port
            key_parts = [
                db_type,
                config.get('host', ''),
                str(config.get('port', default_port)),
                config.get('user', ''),
                config.get('database', '')
            ]

        key_string = '|'.join(key_parts)
        return hashlib.md5(key_string.encode()).hexdigest()

    def _create_pool(self, config: dict, pool_key: str) -> Any:
        """
        Create a new connection pool for the given configuration using the appropriate adapter.
        """
        db_type = config.get('db_type', 'mysql').lower()

        try:
            # Get the appropriate database adapter
            adapter = get_adapter(db_type)

            # Create pool using the adapter
            pool = adapter.create_connection_pool(config)

            # Store adapter reference for this pool
            self._adapters[pool_key] = adapter

            if adapter.requires_server:
                logger.info(f"Created {db_type.upper()} connection pool {pool_key[:8]} for {config.get('user')}@{config.get('host')}/{config.get('database', 'N/A')}")
            else:
                logger.info(f"Created {db_type.upper()} connection pool {pool_key[:8]} for {config.get('database', ':memory:')}")

            return pool
        except Exception as e:
            logger.error(f"Failed to create {db_type.upper()} connection pool: {e}")
            raise

    def get_connection(self, config: dict):
        """
        Get a database connection for the given configuration.
        Creates pool if it doesn't exist, reuses existing pool otherwise.

        Args:
            config: Database configuration dict with:
                   - db_type: 'mysql', 'postgresql', or 'sqlite'
                   - host, port, user, password (for MySQL/PostgreSQL)
                   - database (path for SQLite, name for others)

        Returns:
            Database connection from the appropriate pool
        """
        db_type = config.get('db_type', 'mysql').lower()

        # Validate config based on database type
        # Skip validation for connection string based configs
        if config.get('connection_string'):
            pass  # Connection string has all info embedded
        elif db_type != 'sqlite':
            if not config.get('host') or not config.get('user'):
                raise ValueError(f"{db_type.upper()} configuration must include 'host' and 'user'")

        pool_key = self._get_pool_key(config)

        # Get or create pool for this configuration
        if pool_key not in self._pools:
            with self._global_lock:
                if pool_key not in self._pools:
                    self._pools[pool_key] = self._create_pool(config, pool_key)
                    self._pool_locks[pool_key] = threading.Lock()

        # Update last used time
        self._pool_last_used[pool_key] = time.time()

        # Get connection from pool using the appropriate adapter
        try:
            adapter = self._adapters[pool_key]
            connection = adapter.get_connection_from_pool(self._pools[pool_key])
            logger.debug(f"Connection acquired from {db_type.upper()} pool {pool_key[:8]}")
            return connection
        except Exception as e:
            logger.error(f"Failed to get connection from {db_type.upper()} pool {pool_key[:8]}: {e}")
            raise

    @contextmanager
    def get_cursor(self, config: dict, dictionary=False, buffered=True):
        """
        Context manager for getting a cursor with automatic cleanup.
        IMPORTANT: Also returns connection to pool after cursor is closed.

        Args:
            config: Database configuration dict
            dictionary: If True, return rows as dictionaries (if supported)
            buffered: If True, fetch all rows immediately (if supported)

        Yields:
            Database cursor
        """
        pool_key = self._get_pool_key(config)

        # Ensure pool exists
        if pool_key not in self._pools:
            with self._global_lock:
                if pool_key not in self._pools:
                    self._pools[pool_key] = self._create_pool(config, pool_key)
                    self._pool_locks[pool_key] = threading.Lock()

        adapter = self._adapters[pool_key]
        conn = self.get_connection(config)

        try:
            # Use adapter's cursor context manager
            with adapter.get_cursor(conn, dictionary=dictionary, buffered=buffered) as cursor:
                yield cursor
        finally:
            # CRITICAL: Return connection to pool after cursor is closed
            try:
                adapter.return_connection_to_pool(self._pools[pool_key], conn)
                logger.debug(f"Connection returned to pool {pool_key[:8]}")
            except Exception as e:
                logger.warning(f"Failed to return connection to pool: {e}")

    def close_pool(self, config: dict) -> bool:
        """
        Close and remove a specific connection pool.

        Args:
            config: Database configuration dict

        Returns:
            True if pool was closed, False if pool didn't exist
        """
        pool_key = self._get_pool_key(config)

        if pool_key not in self._pools:
            return False

        with self._global_lock:
            if pool_key in self._pools:
                try:
                    # Use adapter to close the pool
                    adapter = self._adapters[pool_key]
                    adapter.close_pool(self._pools[pool_key])

                    del self._pools[pool_key]
                    del self._adapters[pool_key]
                    del self._pool_locks[pool_key]
                    del self._pool_last_used[pool_key]
                    logger.info(f"Closed connection pool {pool_key[:8]}")
                    return True
                except Exception as e:
                    logger.error(f"Error closing pool {pool_key[:8]}: {e}")
                    raise

        return False

    def close_all_pools(self):
        """
        Close all connection pools. Use with caution!
        """
        with self._global_lock:
            pool_keys = list(self._pools.keys())
            for pool_key in pool_keys:
                try:
                    adapter = self._adapters[pool_key]
                    adapter.close_pool(self._pools[pool_key])
                    logger.info(f"Closed pool {pool_key[:8]}")
                except Exception as e:
                    logger.error(f"Error closing pool {pool_key[:8]}: {e}")

            self._pools.clear()
            self._adapters.clear()
            self._pool_locks.clear()
            self._pool_last_used.clear()
            logger.info("All connection pools closed")

    def _cleanup_idle_pools(self):
        """
        Remove connection pools that haven't been used for a while.
        Runs periodically in background thread.
        """
        current_time = time.time()

        with self._global_lock:
            pool_keys_to_remove = []

            for pool_key, last_used in self._pool_last_used.items():
                if current_time - last_used > self._pool_idle_timeout:
                    pool_keys_to_remove.append(pool_key)

            for pool_key in pool_keys_to_remove:
                try:
                    adapter = self._adapters[pool_key]
                    adapter.close_pool(self._pools[pool_key])
                    del self._pools[pool_key]
                    del self._adapters[pool_key]
                    del self._pool_locks[pool_key]
                    del self._pool_last_used[pool_key]
                    logger.info(f"Cleaned up idle pool {pool_key[:8]}")
                except Exception as e:
                    logger.error(f"Error cleaning up pool {pool_key[:8]}: {e}")

    def _start_cleanup_thread(self):
        """
        Start background thread for cleaning up idle pools.
        """
        def cleanup_loop():
            while True:
                time.sleep(self._cleanup_interval)
                try:
                    self._cleanup_idle_pools()
                except Exception as e:
                    logger.error(f"Error in cleanup thread: {e}")

        cleanup_thread = threading.Thread(target=cleanup_loop, daemon=True)
        cleanup_thread.start()
        logger.info("Pool cleanup thread started")

    def get_pool_stats(self) -> Dict[str, dict]:
        """
        Get statistics about all connection pools.

        Returns:
            Dict with pool keys and their stats
        """
        stats = {}
        with self._global_lock:
            for pool_key, pool in self._pools.items():
                try:
                    stats[pool_key[:8]] = {
                        'pool_size': pool.pool_size,
                        'last_used_seconds_ago': int(time.time() - self._pool_last_used.get(pool_key, 0))
                    }
                except Exception as e:
                    logger.error(f"Error getting stats for pool {pool_key[:8]}: {e}")

        return stats


@lru_cache(maxsize=1)
def get_connection_manager() -> ConnectionManager:
    """
    Get the ConnectionManager instance.
    
    Uses @lru_cache for lazy initialization and singleton behavior.
    For testing, call get_connection_manager.cache_clear() to reset.
    """
    return ConnectionManager()
