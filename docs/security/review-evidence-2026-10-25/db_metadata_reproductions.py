"""Additional offline DB evidence; setup and isolation shared with db_reproductions."""
from db_reproductions import *
import sqlite3
from service.database.ai_tool_executor import AIToolExecutor
from service.database.operations import execute_sql_query

@contextmanager
def tool_connection(connection):
    yield connection

def oracle_blob():
    # Real oracledb.LOB object and methods; only its native LOB storage impl
    # is replaced with the documented driver-local read/free method contract.
    def lob(payload, dbtype):
        return oracledb.LOB._from_impl(SimpleNamespace(
            dbtype=dbtype, read=lambda offset, amount: payload,
            get_max_amount=lambda: len(payload), free_lob=lambda: None))
    class Manager:
        def __init__(self, value, dbtype):
            self.value, self.dbtype = value, dbtype
        @contextmanager
        def get_cursor(self, config, **kwargs):
            yield SimpleNamespace(connection=SimpleNamespace(call_timeout=0),
                execute=lambda *a: None, fetchone=lambda: (1,),
                fetchmany=lambda n: [(self.value,)], description=[("PAYLOAD", self.dbtype, None, None, None, None, True)])
    results = []
    for payload, dbtype in [(b"\x00\xff", oracledb.DB_TYPE_BLOB), ("text", oracledb.DB_TYPE_CLOB)]:
        value = lob(payload, dbtype)
        with patch("service.database.connection_manager.get_connection_manager", return_value=Manager(value, dbtype)):
            result = execute_sql_query({"db_type": "oracle", "database": "REVIEW"}, "SELECT PAYLOAD FROM ITEMS")
        results.append(result)
    assert results[0]["status"] == "error", results[0]
    assert results[1]["status"] == "success", results[1]
    emit("oracle_blob_serialization", blob_status=results[0]["status"], blob_error=results[0].get("error_code"),
         clob_control_status=results[1]["status"], clob_rows=results[1]["result"]["rows"])

def composite_foreign_keys():
    connection = sqlite3.connect(":memory:")
    connection.executescript("""
        CREATE TABLE all_constraints (constraint_name TEXT, owner TEXT, r_constraint_name TEXT, r_owner TEXT, constraint_type TEXT, table_name TEXT);
        CREATE TABLE all_cons_columns (constraint_name TEXT, owner TEXT, table_name TEXT, column_name TEXT, position INTEGER);
        INSERT INTO all_constraints VALUES ('FK_CHILD_PARENT','REVIEW','PK_PARENT','REVIEW','R','CHILD');
        INSERT INTO all_constraints VALUES ('PK_PARENT','REVIEW',NULL,NULL,'P','PARENT');
        INSERT INTO all_cons_columns VALUES ('FK_CHILD_PARENT','REVIEW','CHILD','TENANT_ID',1),
            ('FK_CHILD_PARENT','REVIEW','CHILD','PARENT_ID',2),
            ('PK_PARENT','REVIEW','PARENT','TENANT_ID',1),
            ('PK_PARENT','REVIEW','PARENT','ID',2);
    """)
    context = SimpleNamespace(get_connection=lambda uid: {"connected": True, "db_type": "oracle", "database": "REVIEW"})
    class OracleCatalogCursor:
        def __init__(self):
            self.cursor = connection.cursor()
        def execute(self, query, params):
            self.cursor.execute(query, {str(i + 1): value for i, value in enumerate(params)})
        def fetchall(self):
            return self.cursor.fetchall()
        def close(self):
            self.cursor.close()
    with patch("service.database.context_sync.get_default_context_sync", return_value=context), \
         patch("service.database.ai_tool_executor.get_tool_connection", lambda cfg: tool_connection(SimpleNamespace(cursor=OracleCatalogCursor))):
        result = AIToolExecutor._get_foreign_keys("review-user", "CHILD", {"db_type": "oracle", "database": "REVIEW"})
    pairs = [(r["column_name"], r["referenced_column"]) for r in result["foreign_keys"]]
    assert len(pairs) == 4 and ("TENANT_ID", "ID") in pairs and ("PARENT_ID", "TENANT_ID") in pairs
    emit("oracle_composite_fk_cross_product", expected_pairs=[["TENANT_ID", "TENANT_ID"], ["PARENT_ID", "ID"]], actual_pairs=pairs)
    connection.close()

def nullable_and_session_metadata():
    calls, borrowed = [], []
    class Cursor:
        def execute(self, query, params=()):
            calls.append((query, params))
        def fetchall(self):
            return [("OPTIONAL_NOTE", "VARCHAR2", "Y", None, 0, 0, 100)]
        def close(self):
            pass
    connection = SimpleNamespace(cursor=Cursor)
    context = SimpleNamespace(get_connection=lambda uid: {"connected": True, "db_type": "oracle", "database": "BETA"})
    coherent_config = {"db_type": "oracle", "database": "BETA", "host": "8.8.8.8", "user": "review"}
    config = {"db_type": "mysql", "database": "alpha", "host": "8.8.8.8", "user": "review"}
    @contextmanager
    def acquire(cfg):
        borrowed.append(cfg)
        yield connection
    with patch("service.database.context_sync.get_default_context_sync", return_value=context), \
         patch("service.database.ai_tool_executor.get_tool_connection", acquire):
        result = AIToolExecutor._get_table_details("review-user", coherent_config, "items")
        mismatch_result = AIToolExecutor._get_table_details("same-user-in-two-sessions", config, "items")
    assert result["success"] and result["columns"][0]["is_nullable"] is False
    assert borrowed[0]["db_type"] == "oracle" and borrowed[1]["db_type"] == "mysql"
    assert "all_tab_columns" in calls[1][0] and "BETA" in calls[1][1]
    emit("oracle_nullable_flag", catalog_nullable="Y", reported_nullable=result["columns"][0]["is_nullable"])
    emit("account_metadata_session_connection_mismatch", borrowed_driver=borrowed[1]["db_type"],
         borrowed_database=borrowed[1]["database"], metadata_driver="oracle", metadata_owner=calls[1][1][0],
         limit="recorded query/config discrepancy; fixture accepts query and does not establish cross-user access")

def explain_schema():
    from psycopg2 import sql
    calls = []
    class Cursor:
        description = [("schema", 25, None, None, None, None, True)]
        def __init__(self, connection):
            self.connection = connection
        def execute(self, query, params=()):
            if isinstance(query, sql.Composed):
                # The actual set_query_schema generates one Composed with
                # a SQL prefix and quoted Identifier. Preserve its semantics.
                assert query.seq[0].string == "SET search_path TO "
                self.connection.schema = query.seq[1].strings[0]
                calls.append(f'SET search_path TO "{self.connection.schema}"')
            else:
                calls.append(query)
        def fetchone(self):
            return (1,)
        def fetchmany(self, count):
            return [(self.connection.schema,)]
        def fetchall(self):
            return [(json.dumps([{"Plan": {"Schema": self.connection.schema}}]),)]
        def close(self):
            pass
    class Connection:
        def __init__(self):
            self.schema = "public"
        def cursor(self):
            return Cursor(self)
    manual, plan = Connection(), Connection()
    class Manager:
        @contextmanager
        def get_cursor(self, config, **kwargs):
            yield manual.cursor()
    config = {"db_type": "postgresql", "database": "sales", "schema": "analytics"}
    with patch("service.database.connection_manager.get_connection_manager", return_value=Manager()):
        query_result = execute_sql_query(config, "SELECT * FROM orders")
    manual_calls = calls[:]
    calls.clear()
    context = SimpleNamespace(get_connection=lambda uid: {"connected": True, "db_type": "postgresql", "database": "sales", "schema": "analytics"})
    with patch("service.database.context_sync.get_default_context_sync", return_value=context), \
         patch("service.database.ai_tool_executor.get_tool_connection", lambda cfg: tool_connection(plan)):
        result = AIToolExecutor._explain_query("review-user", config, "SELECT * FROM orders")
    assert result["success"] and calls == ["EXPLAIN (FORMAT JSON, VERBOSE) SELECT * FROM orders"]
    assert query_result["status"] == "success" and query_result["result"]["rows"] == [["analytics"]]
    assert manual.schema == "analytics" and plan.schema == "public"
    emit("explain_missing_schema_setup", selected_schema="analytics", manual_effective_schema=manual.schema,
         explain_effective_schema=plan.schema, actual_driver_calls=calls, manual_driver_calls=manual_calls,
         limit="stateful DB-API session double applies actual SET; PostgreSQL optimizer not executed")

def sqlserver_schema_merge():
    connection = sqlite3.connect(":memory:")
    connection.executescript("""
        ATTACH ':memory:' AS INFORMATION_SCHEMA;
        CREATE TABLE INFORMATION_SCHEMA.TABLES (TABLE_NAME TEXT,TABLE_SCHEMA TEXT,TABLE_CATALOG TEXT,TABLE_TYPE TEXT);
        CREATE TABLE INFORMATION_SCHEMA.COLUMNS (COLUMN_NAME TEXT,DATA_TYPE TEXT,IS_NULLABLE TEXT,COLUMN_DEFAULT TEXT,TABLE_CATALOG TEXT,TABLE_NAME TEXT,TABLE_SCHEMA TEXT,ORDINAL_POSITION INTEGER);
        INSERT INTO INFORMATION_SCHEMA.TABLES VALUES ('orders','dbo','sales','BASE TABLE'),('orders','archive','sales','BASE TABLE');
        INSERT INTO INFORMATION_SCHEMA.COLUMNS VALUES ('id','int','NO',NULL,'sales','orders','dbo',1),('archive_note','varchar','YES',NULL,'sales','orders','archive',1);
    """)
    class Cursor:
        def __init__(self):
            self.cursor = connection.cursor()
        def execute(self, query, params=()):
            return self.cursor.execute(query.replace("%s", "?"), params)
        def fetchall(self):
            return self.cursor.fetchall()
    class Manager:
        @contextmanager
        def get_cursor(self, config):
            yield Cursor()
    config = {"db_type": "sqlserver", "database": "sales", "schema": "dbo"}
    with patch("service.database.connection_manager.get_connection_manager", return_value=Manager()):
        tables = DatabaseOperations.get_tables(config, "sales", "dbo")
        columns = DatabaseOperations.get_table_schema(config, "orders", "sales")
    assert tables == ["orders", "orders"] and {r[0] for r in columns} == {"id", "archive_note"}
    emit("sqlserver_schema_metadata_merge", requested_schema="dbo", table_list=tables, column_names=[r[0] for r in columns],
         limit="actual adapter-generated SQL in SQLite catalog fixture; only DB-API placeholders translated")
    connection.close()

if __name__ == "__main__":
    oracle_blob()
    composite_foreign_keys()
    nullable_and_session_metadata()
    explain_schema()
    sqlserver_schema_merge()
