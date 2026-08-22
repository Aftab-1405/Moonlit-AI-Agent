"""
Multi-User Connection Manager

Manages database connection pools for multiple users with different configurations.
Each unique database configuration gets its own connection pool.
Supports MySQL, PostgreSQL, SQL Server, and Oracle through the adapter pattern.

Pool lifecycle and locking (FIX [M16])
-------------------------------------
Previously a single ``_global_lock`` was held during ``_create_pool``, which
makes a real network connect (``minconn`` synchronous TCP connects) and can
block every other user's ``get_connection`` for the full ``connect_timeout``
window when the DB is unreachable. We now create the pool *outside* the lock
and only install it into ``_pools`` under the lock (re-checking that no
other thread created one in the meantime).

The cleanup thread used to close pools whose ``_pool_last_used`` was older
than the idle timeout, with no check for in-flight borrows — a connection
still in use by a long-running query would have its pool closed underneath
it. We now track in-flight borrows per pool (``_pool_in_use``) and skip
cleanup for any pool with outstanding borrows.

Finally, the ``_pool_locks`` dict was created and deleted but never
acquired anywhere (dead code). It has been removed in favor of the
per-pool in-flight counter; per-pool serialization (when needed) is now
provided by the adapter's own pool implementation (``oracledb``,
``psycopg2.ThreadedConnectionPool``, mysql-connector's pooling are all
already thread-safe).
"""

import hashlib
import logging
import threading
import time
from contextlib import contextmanager
from functools import lru_cache
from typing import Any, Dict

from core.errors import PublicError, log_safe_exception
from service.database.adapters import get_adapter

logger = logging.getLogger(__name__)

_DB_POOL_ERROR = PublicError("DB_POOL_OPERATION_FAILED", "Database pool operation failed.")
_DB_CONNECTION_ERROR = PublicError(
    "DB_CONNECTION_OPERATION_FAILED",
    "Database connection operation failed.",
)


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
        self._pools: Dict[str, Any] = {}
        self._adapters: Dict[str, Any] = {}  # Database adapter per pool
        # FIX [M16]: removed dead ``_pool_locks`` dict (created/deleted but
        # never acquired). Per-pool serialization is provided by the adapters'
        # own pool implementations (oracledb, psycopg2.ThreadedConnectionPool,
        # mysql-connector pooling are all already thread-safe).
        self._pool_last_used: Dict[str, float] = {}
        # FIX [M16]: track in-flight borrows per pool so the cleanup thread
        # does not close a pool out from under a long-running query.
        self._pool_in_use: Dict[str, int] = {}
        self._global_lock = threading.Lock()
        self._cleanup_interval = 300  # 5 minutes
        self._pool_idle_timeout = 600  # 10 minutes
        # FIX [EC6]: connections that raised during use are marked
        # ``_failed=True`` by the caller (operations.execute_sql_query /
        # ai_tool_executor._execute_query_with_db_config) BEFORE the
        # cursor context manager returns them. We track them here so
        # ``return_connection`` can discard+close them instead of
        # handing the broken connection to the next pool borrower.
        # The set holds ``(pool_key, id(conn))`` tuples so we can
        # safely discard entries even after the conn object is GC'd.
        # FIX [AUDIT-2-B]: cap the set size to prevent unbounded growth
        # in long-running processes with flapping connections. When the
        # cap is exceeded, the oldest entries are evicted (FIFO) — they
        # were already closed, so eviction is purely bookkeeping.
        self._suspect_connections: set = set()
        self._suspect_connections_max_size: int = 4096

        # Start cleanup thread
        self._start_cleanup_thread()

        logger.info("ConnectionManager initialized with multi-database support")

    def _get_pool_key(self, config: dict) -> str:
        """
        Generate unique key for a database configuration.
        Uses db_type, host, port, user, and database to create hash.
        For connection strings, uses the connection string itself.
        """
        db_type = config.get("db_type", "mysql").lower()

        # For connection string based configs
        if config.get("connection_string"):
            key_parts = [db_type, "connection_string", config.get("connection_string")]
        else:
            # For server-based databases
            adapter = get_adapter(db_type)
            default_port = adapter.default_port
            key_parts = [
                db_type,
                config.get("host", ""),
                str(config.get("port", default_port)),
                config.get("user", ""),
                config.get("database", ""),
            ]

        key_string = "|".join(key_parts)
        return hashlib.md5(key_string.encode()).hexdigest()

    def _get_or_create_pool(self, config: dict, pool_key: str) -> Any:
        """
        Return the pool for ``pool_key``, creating it if necessary.

        FIX [M16]: pool CREATION happens OUTSIDE the global lock (it makes
        real network connections and can block for ``connect_timeout``).
        We only take the lock to install the freshly-created pool into
        ``_pools`` — and we re-check that no other thread won the race
        while we were connecting. The loser discards its own pool.
        """
        if pool_key in self._pools:
            return self._pools[pool_key]

        # Slow path: create the pool OUTSIDE the lock so other users can
        # keep using their own pools while we connect.
        new_pool = self._create_pool(config, pool_key)

        with self._global_lock:
            existing = self._pools.get(pool_key)
            if existing is not None:
                # Another thread won the race — discard our pool and use
                # theirs. Closing the loser pool is best-effort.
                try:
                    self._adapters[pool_key].close_pool(new_pool)
                except Exception as close_err:
                    log_safe_exception(logger, "discard_duplicate_pool", close_err, _DB_POOL_ERROR)
                return existing
            self._pools[pool_key] = new_pool
            # adapter was registered by _create_pool via self._adapters;
            # ensure in-use counter exists.
            self._pool_in_use.setdefault(pool_key, 0)
            return new_pool

    def _create_pool(self, config: dict, pool_key: str) -> Any:
        """
        Create a new connection pool for the given configuration using the appropriate adapter.

        Note (FIX [M16]): callers must NOT hold ``_global_lock`` when
        invoking this — pool creation makes synchronous network connections
        that can block for ``connect_timeout`` seconds.
        """
        db_type = config.get("db_type", "mysql").lower()

        try:
            adapter = get_adapter(db_type)
            pool = adapter.create_connection_pool(config)
            self._adapters[pool_key] = adapter

            if adapter.requires_server:
                logger.info("Created %s connection pool %s", db_type.upper(), pool_key[:8])
            else:
                logger.info("Created %s connection pool %s", db_type.upper(), pool_key[:8])

            return pool
        except Exception as e:
            log_safe_exception(logger, "create_database_pool", e, _DB_POOL_ERROR)
            raise

    def get_connection(self, config: dict):
        """
        Get a database connection for the given configuration.
        Creates pool if it doesn't exist, reuses existing pool otherwise.

        Args:
            config: Database configuration dict with:
                   - db_type: 'mysql', 'postgresql', 'sqlserver', or 'oracle'
                   - host, port, user, password
                   - database: database name

        Returns:
            Database connection from the appropriate pool

        FIX [M16]: increments ``_pool_in_use`` BEFORE acquiring so the
        cleanup thread can see this borrow is in-flight and skip closing
        the pool. The counter is decremented in ``return_connection_to_pool``
        (and on acquisition failure).
        """
        db_type = config.get("db_type", "mysql").lower()

        # Validate config based on database type
        if not config.get("connection_string"):
            if not config.get("host") or not config.get("user"):
                raise ValueError(f"{db_type.upper()} configuration must include 'host' and 'user'")

        pool_key = self._get_pool_key(config)

        # Get or create pool (creates outside the global lock — see
        # _get_or_create_pool).
        self._get_or_create_pool(config, pool_key)
        self._pool_last_used[pool_key] = time.time()

        # FIX [M16]: mark this borrow as in-flight BEFORE acquiring so the
        # cleanup thread cannot close the pool out from under us.
        with self._global_lock:
            self._pool_in_use[pool_key] = self._pool_in_use.get(pool_key, 0) + 1
        try:
            adapter = self._adapters[pool_key]
            connection = adapter.get_connection_from_pool(self._pools[pool_key])
            logger.debug(f"Connection acquired from {db_type.upper()} pool {pool_key[:8]}")
            return connection
        except Exception as e:
            # FIX [M16]: decrement the in-flight counter on acquisition
            # failure so it does not permanently block cleanup.
            with self._global_lock:
                self._pool_in_use[pool_key] = max(0, self._pool_in_use.get(pool_key, 0) - 1)
            log_safe_exception(logger, "acquire_database_connection", e, _DB_CONNECTION_ERROR)
            raise

    def return_connection(self, pool_key: str, connection: Any) -> None:
        """
        Return a connection to its pool and decrement the in-flight counter.

        FIX [M16]: this is the counterpart to ``get_connection``'s
        in-flight increment. Called by ``get_cursor`` / ``get_connection_context``
        in their ``finally`` blocks.

        FIX [EC6]: if the caller marked the connection with
        ``_failed=True`` (e.g. the pre-query health check raised, or
        the user query raised and the caller wants to discard the
        conn), we do NOT return it to the pool — a broken connection
        handed to the next borrower would just produce another failure
        (cascading pool poisoning). Instead we close the connection
        directly, remove it from the adapter's in-flight tracker, and
        record it in ``_suspect_connections`` for observability.
        """
        # FIX [EC6]: detect caller-marked failed connections.
        is_failed = False
        try:
            is_failed = bool(getattr(connection, "_failed", False))
        except Exception:
            is_failed = False

        try:
            adapter = self._adapters.get(pool_key)
            pool = self._pools.get(pool_key)

            if is_failed:
                # FIX [EC6]: discard + close. Do NOT call
                # ``adapter.return_connection_to_pool`` — that would
                # hand the broken conn to the next borrower. We close
                # it directly; the adapter's
                # ``return_connection_to_pool`` already tolerates a
                # follow-up close on an already-closed conn, but we
                # bypass it entirely by closing the raw conn here.
                try:
                    # FIX [AUDIT-2-B]: bound the suspect set size. Entries
                    # are only used for observability (debugging pool
                    # leaks); they are never read on the hot path. When
                    # the set grows beyond the cap, evict an arbitrary
                    # ~25% to amortize the eviction cost.
                    if len(self._suspect_connections) >= self._suspect_connections_max_size:
                        evict_count = max(1, self._suspect_connections_max_size // 4)
                        for _ in range(evict_count):
                            try:
                                self._suspect_connections.pop()
                            except KeyError:
                                break
                    self._suspect_connections.add((pool_key, id(connection)))
                    if connection is not None and hasattr(connection, "close"):
                        connection.close()
                except Exception as close_err:
                    log_safe_exception(logger, "close_suspect_connection", close_err, _DB_CONNECTION_ERROR)
                # Still let the adapter remove the conn from its own
                # in-flight tracker (e.g. SQL Server's
                # ``_open_connections`` set) so the set doesn't grow
                # unbounded. We pass a sentinel-close path through
                # return_connection_to_pool — for adapters whose
                # ``return_connection_to_pool`` already calls close()
                # (SQL Server, MySQL pooled), the double-close is
                # tolerated by the adapter's own try/except.
                if adapter is not None and pool is not None:
                    try:
                        adapter.return_connection_to_pool(pool, connection)
                    except Exception as track_err:
                        log_safe_exception(
                            logger,
                            "cleanup_suspect_connection_tracker",
                            track_err,
                            _DB_CONNECTION_ERROR,
                        )
                logger.info(
                    "Discarded suspect (failed) connection from pool %s; pool size now replenishes on next acquire.",
                    pool_key[:8],
                )
            elif adapter is not None and pool is not None:
                adapter.return_connection_to_pool(pool, connection)
        except Exception as e:
            log_safe_exception(logger, "return_database_connection", e, _DB_CONNECTION_ERROR)
        finally:
            with self._global_lock:
                self._pool_in_use[pool_key] = max(0, self._pool_in_use.get(pool_key, 0) - 1)

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

        FIX [EC6]: if the user query raises inside the ``yield``, we
        mark the underlying connection ``_failed=True`` BEFORE
        ``return_connection`` runs in the ``finally`` block. This
        ensures the broken connection is discarded (closed) rather than
        returned to the pool for the next borrower to discover. The
        caller may also mark the conn ``_failed`` directly (e.g. on a
        health-check failure) — both paths converge in
        ``return_connection``.
        """
        pool_key = self._get_pool_key(config)

        # Ensure pool exists (FIX [M16]: pool creation happens outside the
        # global lock — see _get_or_create_pool).
        self._get_or_create_pool(config, pool_key)

        adapter = self._adapters[pool_key]
        conn = self.get_connection(config)

        try:
            with adapter.get_cursor(conn, dictionary=dictionary, buffered=buffered) as cursor:
                yield cursor
        except Exception:
            # FIX [EC6]: mark the conn as failed so the finally-block
            # ``return_connection`` discards it instead of pooling it.
            # Best-effort: setattr on some C-extension conn types may
            # raise; the caller's own _failed flag (set explicitly on
            # the health-check path) is the primary signal.
            try:
                setattr(conn, "_failed", True)
            except Exception:
                pass
            raise
        finally:
            # CRITICAL: Return connection to pool after cursor is closed.
            # FIX [M16]: route through return_connection() so the in-flight
            # counter is decremented in lockstep with the borrow.
            self.return_connection(pool_key, conn)

    @contextmanager
    def get_connection_context(self, config: dict):
        """
        Context manager that yields a connection from the pool and returns it
        automatically when the block exits.

        Prefer this over get_connection() for all tool-level usage so connections
        are always returned to the pool even when exceptions occur.

        Usage:
            with manager.get_connection_context(db_config) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT 1")

        FIX [EC6]: same exception-marking logic as ``get_cursor`` — if
        the user's block raises, we mark the conn ``_failed=True`` so
        ``return_connection`` discards it instead of pooling it for the
        next victim. Used by ``ai_tool_executor.get_tool_connection``.
        """
        pool_key = self._get_pool_key(config)

        # Ensure pool exists (FIX [M16]: pool creation happens outside the
        # global lock — see _get_or_create_pool).
        self._get_or_create_pool(config, pool_key)

        conn = self.get_connection(config)
        try:
            yield conn
        except Exception:
            # FIX [EC6]: mark conn as failed so the finally-block
            # return_connection discards it instead of pooling it.
            try:
                setattr(conn, "_failed", True)
            except Exception:
                pass
            raise
        finally:
            # FIX [M16]: route through return_connection() so the in-flight
            # counter is decremented in lockstep with the borrow.
            self.return_connection(pool_key, conn)

    def close_pool(self, config: dict) -> bool:
        """
        Close and remove a specific connection pool.

        FIX [M16]: waits for in-flight borrows to drain before closing the
        pool, so a disconnect call cannot close a pool out from under a
        long-running query. The wait is bounded by a short timeout so a
        stuck connection does not block disconnect indefinitely.

        Args:
            config: Database configuration dict

        Returns:
            True if pool was closed, False if pool didn't exist
        """
        pool_key = self._get_pool_key(config)

        if pool_key not in self._pools:
            return False

        with self._global_lock:
            if pool_key not in self._pools:
                return False
            # FIX [M16]: wait briefly for in-flight borrows to drain so we
            # do not close a pool out from under a long-running query.
            in_use = self._pool_in_use.get(pool_key, 0)
            if in_use > 0:
                logger.info(
                    "Pool %s has %d in-flight connection(s); waiting up to 5s before close.",
                    pool_key[:8],
                    in_use,
                )
                deadline = time.time() + 5.0
                while self._pool_in_use.get(pool_key, 0) > 0 and time.time() < deadline:
                    # Release the lock while sleeping so borrowers can return.
                    self._global_lock.release()
                    try:
                        time.sleep(0.05)
                    finally:
                        self._global_lock.acquire()
            try:
                adapter = self._adapters[pool_key]
                adapter.close_pool(self._pools[pool_key])

                del self._pools[pool_key]
                del self._adapters[pool_key]
                self._pool_in_use.pop(pool_key, None)
                self._pool_last_used.pop(pool_key, None)
                logger.info(f"Closed connection pool {pool_key[:8]}")
                return True
            except Exception as e:
                log_safe_exception(logger, "close_database_pool", e, _DB_POOL_ERROR)
                raise

        return False

    def _cleanup_idle_pools(self):
        """
        Remove connection pools that haven't been used for a while.
        Runs periodically in background thread.

        FIX [M16]: skip pools that still have outstanding borrows so a
        long-running query is not orphaned by cleanup closing its pool.
        """
        current_time = time.time()

        with self._global_lock:
            pool_keys_to_remove = []

            for pool_key, last_used in self._pool_last_used.items():
                if current_time - last_used <= self._pool_idle_timeout:
                    continue
                # FIX [M16]: do not close pools that still have outstanding
                # borrows — the cleanup thread would otherwise close a pool
                # out from under a long-running query, and the next
                # return_connection_to_pool would either raise (Oracle
                # pool.release on a closed pool) or silently leak.
                if self._pool_in_use.get(pool_key, 0) > 0:
                    logger.debug(
                        "Skipping cleanup of pool %s: %d connection(s) in use.",
                        pool_key[:8],
                        self._pool_in_use[pool_key],
                    )
                    continue
                pool_keys_to_remove.append(pool_key)

            for pool_key in pool_keys_to_remove:
                try:
                    adapter = self._adapters[pool_key]
                    adapter.close_pool(self._pools[pool_key])
                    del self._pools[pool_key]
                    del self._adapters[pool_key]
                    self._pool_in_use.pop(pool_key, None)
                    self._pool_last_used.pop(pool_key, None)
                    logger.info(f"Cleaned up idle pool {pool_key[:8]}")
                except Exception as e:
                    log_safe_exception(logger, "cleanup_idle_database_pool", e, _DB_POOL_ERROR)

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
                    log_safe_exception(logger, "database_pool_cleanup_loop", e, _DB_POOL_ERROR)

        cleanup_thread = threading.Thread(target=cleanup_loop, daemon=True)
        cleanup_thread.start()
        logger.info("Pool cleanup thread started")


@lru_cache(maxsize=1)
def get_connection_manager() -> ConnectionManager:
    """
    Get the ConnectionManager instance.

    Uses @lru_cache for lazy initialization and singleton behavior.
    For testing, call get_connection_manager.cache_clear() to reset.
    """
    return ConnectionManager()
