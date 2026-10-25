"""Offline pool lifecycle and Oracle selection evidence using real adapters."""
from db_reproductions import *
import time
from mysql.connector.connection import MySQLConnection
from service.database.adapters.mysql_adapter import MySQLAdapter
from service.database.connection_manager import ConnectionManager
from service.database.operations import execute_sql_query

def mysql_outstanding_borrow():
    # Real mysql.connector pool and PooledMySQLConnection wrapper. Physical
    # socket methods alone are replaced by an offline MySQLConnection subclass.
    class Physical(MySQLConnection):
        def __init__(self):
            super().__init__()
            self.closed_by_driver = False
        def config(self, **kwargs):
            pass
        def is_connected(self):
            return not self.closed_by_driver
        def reset_session(self, *args, **kwargs):
            pass
        def close(self):
            self.closed_by_driver = True
        disconnect = close
    config = {"db_type": "mysql", "host": "8.8.8.8", "user": "review", "password": "test", "database": "sales"}
    adapter = MySQLAdapter()
    with patch.object(ConnectionManager, "_start_cleanup_thread"), \
         patch("mysql.connector.pooling.connect", side_effect=lambda **kwargs: Physical()):
        manager = ConnectionManager()
        borrowed = manager.get_connection(config)
        key = manager._get_pool_key(config)
        pool = manager._pools[key]
        raw = borrowed._cnx
        assert manager._pool_in_use[key] == 1
        started = time.monotonic()
        closed = manager.close_pool(config)
        elapsed = time.monotonic() - started
        # Explicit interleaving: acquire -> disconnect's bounded 5s wait ->
        # physical query finishes -> manager returns outstanding connection.
        manager.return_connection(key, borrowed)
        assert closed and key not in manager._pools and not raw.closed_by_driver
        assert borrowed._cnx is raw  # manager skipped even the wrapper close.
        # Even manual wrapper.close would only return it to the orphaned pool.
        borrowed.close()
        assert pool._cnx_queue.qsize() == 1 and not raw.closed_by_driver
        emit("mysql_shutdown_abandons_outstanding_borrow", disconnect_returned=closed,
             elapsed_seconds=round(elapsed, 2), manager_tracks_pool=key in manager._pools,
             physical_connection_closed=raw.closed_by_driver, orphan_pool_idle_connections=pool._cnx_queue.qsize(),
             limit="real connector pool/wrapper; physical transport synthetic; no GC or live socket leak claim")
        adapter.close_pool(pool)  # fixture cleanup

def oracle_selection_current_schema():
    adapter = OracleAdapter()
    original = {"db_type": "oracle", "host": "8.8.8.8", "user": "REVIEW", "password": "test", "database": "REVIEW", "service_name": "ORCL"}
    with patch.object(DatabaseOperations, "get_tables", return_value=[]):
        selection = handlers.select_database(original, "OTHER")
    assert selection["status"] == "connected" and selection["db_config"]["database"] == "OTHER"
    calls, pool_users = [], []
    def pool(**kwargs):
        pool_users.append(kwargs["user"])
        return SimpleNamespace(min=2, max=10, opened=2)
    with patch("oracledb.create_pool", pool):
        adapter.create_connection_pool(selection["db_config"])
    class Manager:
        @contextmanager
        def get_cursor(self, config, **kwargs):
            yield SimpleNamespace(connection=SimpleNamespace(call_timeout=0),
                execute=lambda query: calls.append(query), fetchone=lambda: (1,),
                fetchmany=lambda n: [(1,)], description=[("ID", oracledb.DB_TYPE_NUMBER, None, None, None, None, False)])
    with patch("service.database.connection_manager.get_connection_manager", return_value=Manager()):
        result = execute_sql_query(selection["db_config"], "SELECT ID FROM ITEMS")
    assert result["status"] == "success" and pool_users == ["REVIEW"]
    assert calls == ["SELECT 1 FROM DUAL", "SELECT ID FROM ITEMS"]
    emit("oracle_selected_owner_not_applied", selected_owner="OTHER", actual_pool_user=pool_users[0], actual_driver_calls=calls,
         limit="real adapter pool arguments and query setup; actual Oracle table resolution not executed")

if __name__ == "__main__":
    mysql_outstanding_borrow()
    oracle_selection_current_schema()
