import datetime as dt
import json
from decimal import Decimal

import pytest

from service.database.query_result import build_query_result


@pytest.mark.asyncio
async def test_saved_result_endpoint_preserves_contract_and_unknown_total(monkeypatch):
    from controller import conversations_controller as controller
    from service.firestore import firestore_service

    canonical = build_query_result(
        ["id", "id", "amount"],
        [[9007199254740993, 2, Decimal("1.00000000000000000001")]],
        db_config={"db_type": "postgresql", "host": "fixture"},
        query="SELECT fixture",
        effective_limit=1,
        truncated=True,
        execution_time_ms=12,
    )
    stored = {
        "columns": canonical["columns"],
        "data": [dict(zip(canonical["columns"], canonical["rows"][0]))],
        "tabular_result": canonical,
        "column_metadata": canonical["column_metadata"],
        "result_metadata": canonical["result_metadata"],
        "row_count": 1,
        "total_rows": None,
        "truncated": True,
        "execution_time_ms": 12,
        "private_internal_field": "must not escape",
    }
    monkeypatch.setattr(controller.ConversationService, "verify_conversation_owner", lambda *_: True)
    monkeypatch.setattr(firestore_service, "get_execution_result", lambda *_: stored)

    async def run_sync(function, *args):
        return function(*args)

    monkeypatch.setattr(controller, "run_in_threadpool", run_sync)
    response = await controller.fetch_execution_result("fixture-conversation", "fixture-execution", {"uid": "owner"})
    payload = response["data"]
    assert payload["tabular_result"] == canonical
    assert payload["column_metadata"] == canonical["column_metadata"]
    assert payload["result_metadata"] == canonical["result_metadata"]
    assert payload["total_rows"] is None
    assert payload["execution_time_ms"] == 12
    assert "private_internal_field" not in payload


def build(labels, rows, description=None, **kwargs):
    return build_query_result(
        labels,
        rows,
        description=description,
        db_config={"db_type": "postgresql", "host": "local", "password": "secret"},
        query="SELECT fixture",
        effective_limit=10,
        truncated=False,
        **kwargs,
    )


def test_duplicate_keys_do_not_collide_with_original_names():
    result = build(["id", "id", "__column_1"], [[1, 2, 3]])
    assert len(set(result["columns"])) == 3
    assert [c["label"] for c in result["column_metadata"]] == ["id", "id", "__column_1"]
    assert result["rows"] == [[1, 2, 3]]


def test_exact_numbers_survive_json_and_types_obey_worker_limits():
    result = build(
        ["big", "decimal", "wide", "small"], [[9007199254740993, Decimal("123456789.123456789012"), 2147483648, 1]]
    )
    assert json.loads(json.dumps(result))["rows"][0] == ["9007199254740993", "123456789.123456789012", 2147483648, 1]
    assert list(result["column_types"].values()) == ["string", "string", "float", "integer"]
    assert "exact" in result["column_metadata"][1]["analysis_semantics"]


def test_temporal_and_null_only_use_driver_metadata():
    desc = [
        ("d", 1082, None, None, None, None, None),
        ("naive", 1114, None, None, None, None, None),
        ("aware", 1184, None, None, None, None, None),
        ("n", 1700, None, None, 30, 12, None),
    ]
    result = build(
        ["d", "naive", "aware", "n"],
        [[dt.date(2020, 1, 2), dt.datetime(2020, 1, 2), dt.datetime(2020, 1, 2, tzinfo=dt.timezone.utc), None]],
        desc,
    )
    cols = result["column_metadata"]
    assert cols[0]["perspective_type"] == "date"
    assert cols[1]["timezone"] == "naive"
    assert cols[1]["perspective_type"] == "string"
    assert cols[2]["timezone"] == "offset"
    assert cols[3]["sql_type"] == "numeric"
    assert cols[3]["precision"] == 30
    assert cols[3]["perspective_type"] == "string"


def test_identity_scope_empty_and_credentials():
    result = build(["id"], [])
    meta = result["result_metadata"]
    assert meta["completeness"] == "complete"
    assert meta["returned_rows"] == 0
    assert meta["effective_limit"] == 10
    assert meta["executed_at"].endswith("Z")
    assert "secret" not in json.dumps(meta)
    assert build(["id"], [])["result_metadata"]["source_id"] == meta["source_id"]


def test_editor_ai_and_public_tool_contract_parity(monkeypatch):
    from contextlib import contextmanager

    from controller.database_controller import _normalize_query_response
    from langgraph_orchestration.tool_schemas import structure_tool_result
    from service.database.ai_tool_executor import AIToolExecutor
    from service.database.operations import execute_sql_query

    class Cursor:
        description = [("id", 20, None, None, None, None, None), ("id", 1700, None, None, 30, 10, None)]

        def execute(self, *_args):
            pass

        def fetchone(self):
            return (1,)

        def fetchmany(self, _limit):
            return [(9007199254740993, Decimal("1.0000000001")), (2, Decimal("2.0000000002"))]

        def close(self):
            pass

    class Connection:
        def cursor(self):
            return Cursor()

        def commit(self):
            pass

        def rollback(self):
            pass

    class Manager:
        @contextmanager
        def get_cursor(self, _config, **_options):
            yield Cursor()

    @contextmanager
    def connection(_config):
        yield Connection()

    monkeypatch.setattr("service.database.connection_manager.get_connection_manager", lambda: Manager())
    monkeypatch.setattr("service.database.ai_tool_executor.get_tool_connection", connection)
    config = {"db_type": "postgresql", "schema": "public"}
    editor = execute_sql_query(config, "SELECT 1", max_rows=1)
    ai = AIToolExecutor._execute_query_with_db_config(config, {}, "SELECT 1", 1)
    assert editor["status"] == ai["status"] == "success"
    public = _normalize_query_response(editor).model_dump()["result"]
    assert public["rows"] == ai["tabular_result"]["rows"]
    assert public["column_metadata"] == ai["column_metadata"]
    assert public["result_metadata"]["completeness"] == "truncated"
    assert public["result_metadata"]["query_id"] == ai["result_metadata"]["query_id"]
    structured = structure_tool_result("execute_query", {**ai, "success": True, "data": ai["result"]})
    assert structured["tabular_result"]["rows"] == public["rows"]
    assert structured["result_metadata"] == ai["result_metadata"]
    assert len(structured["data"][0]) == 2


def test_full_binary_and_nonfinite_values_remain_json_safe():
    result = build(["binary", "nonfinite"], [[bytes(range(256)), float("inf")]])
    assert result["rows"][0][0] == "0x" + bytes(range(256)).hex()
    assert json.loads(json.dumps(result, allow_nan=False))["rows"][0][1] == "inf"


def test_source_identity_changes_with_host_but_not_password():
    from service.database.query_result import _source_identity

    config = {"db_type": "postgresql", "connection_string": "postgresql://user:secret@host:5432/db"}
    assert _source_identity(config) == _source_identity(
        {**config, "connection_string": "postgresql://user:new@host:5432/db"}
    )
    assert _source_identity(config) != _source_identity(
        {**config, "connection_string": "postgresql://user:secret@other:5432/db"}
    )


def test_persistence_rebuilds_canonical_rows_without_nested_firestore_arrays(monkeypatch):
    from service.firestore import firestore_service

    documents = {}

    class Reference:
        def __init__(self, path=""):
            self.path = path

        def collection(self, name):
            return Reference(self.path + "/" + name)

        def document(self, name):
            return Reference(self.path + "/" + name)

        def get(self):
            value = documents.get(self.path)
            return type("Snapshot", (), {"exists": value is not None, "to_dict": lambda _self: value})()

    class Batch:
        def set(self, reference, data):
            documents[reference.path] = data

        def commit(self):
            pass

    class Database(Reference):
        def batch(self):
            return Batch()

    monkeypatch.setattr(firestore_service, "get_firestore_db", Database)
    monkeypatch.setattr(firestore_service, "_EXECUTION_INLINE_BYTES", 1)
    result = build(["x", "x"], [[9007199254740993, Decimal("1.00000000001")]])
    objects = [dict(zip(result["columns"], row)) for row in result["rows"]]
    payload = {"tabular_result": result, "data": objects, "result_metadata": result["result_metadata"]}
    firestore_service.store_execution_result("conversation", "execution", payload)
    parent = documents["/conversations/conversation/execution_results/execution"]
    assert "rows" not in parent["tabular_result"]
    loaded = firestore_service.get_execution_result("conversation", "execution")
    assert loaded["tabular_result"] == result
    assert payload["tabular_result"]["rows"] == result["rows"]


def test_null_only_mysql_decimal_and_bigint_types():
    result = build_query_result(
        ["n", "b"],
        [[None, None]],
        description=[("n", 246, None, None, 65, 30, True), ("b", 8)],
        db_config={"db_type": "mysql"},
        query="SELECT fixture",
        effective_limit=10,
        truncated=False,
    )
    assert result["column_types"] == {"n": "string", "b": "string"}
    assert result["column_metadata"][0]["encoding"] == "decimal-string"
    assert result["column_metadata"][1]["encoding"] == "integer-string"


def test_source_role_schema_and_oracle_service_change_identity():
    from service.database.query_result import _source_identity

    base = {"db_type": "oracle", "connection_string": "user/password@host:1521/service", "schema": "A"}
    assert _source_identity(base) == _source_identity({**base, "connection_string": "user/changed@host:1521/service"})
    for patch in (
        {"connection_string": "other/password@host:1521/service"},
        {"connection_string": "user/password@host:1521/other"},
        {"schema": "B"},
    ):
        assert _source_identity(base) != _source_identity({**base, **patch})
    assert _source_identity({"host": "h", "user": "a"}) != _source_identity({"host": "h", "user": "b"})


def test_structured_and_unknown_values_are_explicit_analysis_text():
    import uuid

    value = {"id": 9007199254740993, "amount": Decimal("1.00000000001")}
    result = build(["j", "uuid"], [[value, uuid.UUID(int=1)]])
    assert json.loads(result["rows"][0][0]) == {"id": "9007199254740993", "amount": "1.00000000001"}
    assert result["column_metadata"][0]["encoding"] == "json-text"
    assert result["column_metadata"][1]["encoding"] == "source-text"


def test_postgres_keyword_password_semicolon_does_not_change_source_identity():
    from service.database.query_result import _source_identity

    config = {"db_type": "postgresql", "connection_string": "host=h dbname=d user=u password='a;b'"}
    assert _source_identity(config) == _source_identity(
        {**config, "connection_string": "host=h dbname=d user=u password='c;d'"}
    )
    assert _source_identity(config) != _source_identity(
        {**config, "connection_string": "host=other dbname=d user=u password='a;b'"}
    )


def test_sqlserver_data_source_and_braced_password_identity():
    from service.database.query_result import _source_identity

    config = {
        "db_type": "sqlserver",
        "connection_string": "Data Source=serverA;Initial Catalog=db;User ID=user;PWD={secret;Data Source=forged;escaped}}value};",
    }
    changed = {
        **config,
        "connection_string": "Data Source=serverA;Initial Catalog=db;User ID=user;PWD={changed;Data Source=other};",
    }
    assert _source_identity(config) == _source_identity(changed)
    assert _source_identity(config) != _source_identity(
        {**changed, "connection_string": changed["connection_string"].replace("serverA", "serverB")}
    )


def test_malformed_keyword_dsns_do_not_retain_credential_fragments():
    from service.database.query_result import _source_identity

    for db_type, first, second in [
        ("sqlserver", "Data Source=server PWD=secret", "Data Source=server PWD=changed"),
        ("oracle", "user/secret", "user/changed"),
        ("postgresql", "host=h password='secret", "host=h password='changed"),
        (
            "sqlserver",
            "Data Source=server;PWD={secret;Data Source=forged;",
            "Data Source=server;PWD={changed;Data Source=other;",
        ),
    ]:
        assert _source_identity({"db_type": db_type, "connection_string": first}) == _source_identity(
            {"db_type": db_type, "connection_string": second}
        )


@pytest.mark.parametrize(
    "code, expected_type, encoding",
    [
        (1, "string", "text"),
        (2, "string", "hex"),
        (3, "string", "text"),
        (4, "string", "iso8601"),
        (5, "string", "decimal-string"),
    ],
)
def test_sqlserver_null_columns_use_driver_categories(code, expected_type, encoding):
    import pymssql

    category = [pymssql.STRING, pymssql.BINARY, pymssql.NUMBER, pymssql.DATETIME, pymssql.DECIMAL][code - 1]
    for type_code in (code, category):
        result = build_query_result(
            ["v"],
            [[None]],
            description=[("v", type_code, None, None, None, None, None)],
            db_config={"db_type": "sqlserver"},
            query="SELECT fixture",
            effective_limit=1,
            truncated=False,
        )
        column = result["column_metadata"][0]
        assert column["perspective_type"] == expected_type
        assert column["encoding"] == encoding
        assert not column["sql_type"].isdigit()


def test_oracle_null_columns_use_installed_driver_metadata():
    import oracledb

    codes = [
        oracledb.DB_TYPE_NUMBER,
        oracledb.DB_TYPE_BOOLEAN,
        oracledb.DB_TYPE_DATE,
        oracledb.DB_TYPE_TIMESTAMP_TZ,
        oracledb.DB_TYPE_BINARY_DOUBLE,
    ]
    result = build_query_result(
        [str(i) for i in range(len(codes))],
        [[None] * len(codes)],
        description=[(str(i), code, None, None, None, None, None) for i, code in enumerate(codes)],
        db_config={"db_type": "oracle"},
        query="SELECT fixture",
        effective_limit=1,
        truncated=False,
    )
    columns = result["column_metadata"]
    assert columns[0]["encoding"] == "decimal-string"
    assert columns[1]["perspective_type"] == "boolean"
    assert columns[2]["encoding"] == "iso8601"  # Oracle DATE includes a time of day.
    assert columns[2]["timezone"] == "naive"
    assert columns[3]["timezone"] == "offset"
    assert columns[4]["perspective_type"] == "float"


def test_oracle_timestamp_timezone_loss_is_not_mislabelled_as_naive_source():
    import oracledb

    result = build_query_result(
        ["stamp"],
        [[dt.datetime(2026, 10, 23, 12, 30)]],
        description=[("stamp", oracledb.DB_TYPE_TIMESTAMP_TZ, None, None, None, None, None)],
        db_config={"db_type": "oracle"},
        query="SELECT fixture",
        effective_limit=1,
        truncated=False,
    )
    column = result["column_metadata"][0]
    assert column["timezone"] == "unavailable"
    assert column["encoding"] == "driver-timestamp"
    assert "does not preserve" in column["analysis_semantics"]
    assert result["rows"][0][0] == "2026-10-23T12:30:00"
