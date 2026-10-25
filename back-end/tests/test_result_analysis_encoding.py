"""Analysis must consume lossless SQL encodings without treating text as numbers."""

import copy
import json
from decimal import Decimal

import pytest

from langgraph_orchestration.result_analysis import analyze_execution_result
from service.database.query_result import build_query_result


def execution(rows):
    table = build_query_result(
        ["x", "y"],
        rows,
        db_config={"db_type": "postgresql"},
        query="select x, y",
        effective_limit=100,
        truncated=False,
    )
    return {
        "columns": table["columns"],
        "data": [dict(zip(table["columns"], row)) for row in table["rows"]],
        "column_metadata": table["column_metadata"],
        "tabular_result": table,
    }


@pytest.mark.parametrize("nested_only", [False, True])
def test_decimal_profile_round_trip(nested_only):
    data = execution([(Decimal("10.25"), 1), (Decimal("20.50"), 2), (None, 3)])
    if nested_only:
        data.pop("column_metadata")
    original = copy.deepcopy(data)
    result = analyze_execution_result(data, operation="profile")
    profile = result["columns"]["x"]
    assert profile["numeric_count"] == 2
    assert profile["null_count"] == 1
    assert profile["numeric"]["mean"] == 15.375
    assert profile["numeric"]["min"] == 10.25
    assert data == original
    json.dumps(result, allow_nan=False)


@pytest.mark.parametrize(
    "rows,expected",
    [
        ([(Decimal("10.25"), 1), (Decimal("20.50"), 2)], 1),
        ([(2**60, 1), (2**60 + 1, 2), (2**60 + 2, 3)], 1),
        ([(Decimal("1e300"), Decimal("-1e300")), (Decimal("-1e300"), Decimal("1e300"))], -1),
    ],
)
def test_encoded_correlation_preserves_variation(rows, expected):
    result = analyze_execution_result(execution(rows), operation="correlation", columns=["x", "y"])
    assert result["success"] is True
    assert result["pearson_correlation"] == pytest.approx(expected)
    json.dumps(result, allow_nan=False)


@pytest.mark.parametrize("encoding", [None, "text", "decimal-string", "integer-string"])
def test_only_declared_numeric_text_is_coerced(encoding):
    data = {
        "columns": ["x"],
        "data": [{"x": value} for value in ["12", "bad", "NaN", "Infinity", "1e9999", "1/2", "", None, True]],
    }
    if encoding:
        data["column_metadata"] = [{"key": "x", "encoding": encoding}]
    result = analyze_execution_result(data, operation="profile")
    assert result["columns"]["x"]["numeric_count"] == (1 if encoding in {"decimal-string", "integer-string"} else 0)
    json.dumps(result, allow_nan=False)


def test_metadata_is_matched_by_key_not_position():
    data = {
        "columns": ["text", "number"],
        "data": [{"text": "10", "number": "20"}],
        "column_metadata": [{"key": "number", "encoding": "decimal-string"}],
    }
    result = analyze_execution_result(data, operation="profile")
    assert result["columns"]["text"]["numeric_count"] == 0
    assert result["columns"]["number"]["numeric_count"] == 1


def test_constant_encoded_column_returns_controlled_error():
    result = analyze_execution_result(execution([(2**60, 1), (2**60, 2)]), operation="correlation")
    assert result["success"] is False
    assert "constant" in result["error"]


def test_large_finite_profile_never_emits_invalid_json():
    result = analyze_execution_result(execution([(Decimal("1e308"), 1), (Decimal("1e308"), 2)]), operation="profile")
    assert result["columns"]["x"]["numeric_count"] == 2
    assert result["columns"]["x"]["numeric"]["mean"] == 1e308
    json.dumps(result, allow_nan=False)


def test_unrepresentable_standard_deviation_is_null():
    result = analyze_execution_result(
        execution([(Decimal("1.7e308"), 1), (Decimal("-1.7e308"), 2)]), operation="profile"
    )
    assert result["columns"]["x"]["numeric"]["sample_stddev"] is None
    json.dumps(result, allow_nan=False)


def test_integer_encoding_does_not_accept_fractional_values():
    data = {
        "columns": ["x"],
        "data": [{"x": "1.5"}, {"x": "2"}],
        "column_metadata": [{"key": "x", "encoding": "integer-string"}],
    }
    assert analyze_execution_result(data, operation="profile")["columns"]["x"]["numeric_count"] == 1


def test_legacy_numbers_and_data_quality_remain_supported():
    data = {"columns": ["x"], "data": [{"x": 1}, {"x": 2}, {"x": 2}, {"x": None}, {"x": True}]}
    profile = analyze_execution_result(data, operation="profile")["columns"]["x"]
    assert profile["numeric_count"] == 3
    assert profile["numeric"]["mean"] == pytest.approx(5 / 3)
    assert profile["numeric"]["median"] == 2
    quality = analyze_execution_result(data, operation="data_quality")
    assert quality["duplicate_row_count"] == 1
    assert quality["columns"]["x"]["null_count"] == 1


def test_analysis_policy_survives_tool_result_validation():
    from langgraph_orchestration.tool_schemas import structure_tool_result

    raw = analyze_execution_result(execution([(Decimal("10.25"), 1)]), operation="profile")
    structured = structure_tool_result("analyze_query_result", raw)
    assert structured["success"] is True
    assert "approximate" in structured["scope_note"]


def test_numeric_underflow_is_excluded_before_rational_conversion():
    data = {
        "columns": ["x"],
        "data": [{"x": "1e-10000"}, {"x": "0"}],
        "column_metadata": [{"key": "x", "encoding": "decimal-string"}],
    }
    assert analyze_execution_result(data, operation="profile")["columns"]["x"]["numeric_count"] == 1


@pytest.mark.parametrize(
    "metadata", ["broken", 1, [{"key": [], "encoding": "decimal-string"}], [{"key": "x", "encoding": []}]]
)
def test_malformed_metadata_does_not_enable_numeric_text(metadata):
    data = {"columns": ["x"], "data": [{"x": "12"}], "column_metadata": metadata}
    result = analyze_execution_result(data, operation="profile")
    assert result["columns"]["x"]["numeric_count"] == 0
