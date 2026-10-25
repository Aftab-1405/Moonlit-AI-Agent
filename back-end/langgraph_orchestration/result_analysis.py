"""Deterministic analysis over a bounded, persisted SQL execution result.

This module provides statistical profiling, data-quality checks, and correlation
analysis over the bounded result set of a prior ``execute_query`` tool call.
The analysis runs entirely on the persisted rows loaded from Firestore — no
database round-trip is needed.

Row-count safety
----------------
A single ``execute_query`` can return up to ``MAX_QUERY_RESULTS`` rows (1000 by
default). To prevent OOM on very large or very wide results, ``analyze_execution_result``
enforces a :data:`MAX_ANALYZE_ROWS` guard and :func:`_column_profile` accumulates
statistics in a single pass rather than building multiple intermediate lists.
"""

from __future__ import annotations

import json
import math
import statistics
from decimal import Decimal, InvalidOperation
from fractions import Fraction
from typing import Any

# FIX [M9]: Guard against unbounded memory usage. Previously, _column_profile
# iterated the full row set multiple times per column (values, non_null, numeric,
# distinct set), and data_quality built a _hashable(row) list for every row.
# For 1000 rows × 50 columns this was 50,000 cell accesses per profile pass plus
# 1000 json.dumps. Now we cap the total row count and use single-pass accumulation.
MAX_ANALYZE_ROWS = 1000


def _hashable(value: Any) -> str:
    """Serialize a value to a deterministic JSON string for set-based deduplication."""
    return json.dumps(value, sort_keys=True, default=str, separators=(",", ":"))


def _numeric(value: Any, encoding: str | None = None) -> Fraction | None:
    """Decode declared numeric text; retain exact variation before statistics."""
    try:
        if isinstance(value, str):
            if encoding not in {"decimal-string", "integer-string"}:
                return None
            value = Decimal(value)
            if not value.is_finite():
                return None
            if encoding == "integer-string" and value != value.to_integral_value():
                return None
        if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
            return None
        # Statistics are ultimately JSON numbers. Exclude non-finite/out-of-range
        # inputs before constructing a potentially enormous rational number.
        number = float(value)
        if not math.isfinite(number) or (number == 0 and value != 0):
            return None
        return Fraction(value)
    except (ValueError, OverflowError, InvalidOperation):
        return None


def _finite_float(value) -> float | None:
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except OverflowError:
        return None


def _column_profile(rows: list[dict], column: str, encoding: str | None = None) -> dict:
    """Compute per-column statistics in a single pass over the rows.

    FIX [M9]: Previously this function built three intermediate lists (values,
    non_null, numeric) plus a distinct-count set, iterating the full row set
    3-4 times per column. Now we accumulate all metrics in a single pass,
    reducing memory and CPU for wide results.
    """
    count = 0
    non_null_count = 0
    distinct: set[str] = set()
    numeric_values: list[Fraction] = []

    for row in rows:
        count += 1
        value = row.get(column)
        if value is not None:
            non_null_count += 1
            distinct.add(_hashable(value))
            number = _numeric(value, encoding)
            if number is not None:
                numeric_values.append(number)

    result: dict[str, int | dict[str, float | None]] = {
        "count": count,
        "non_null_count": non_null_count,
        "null_count": count - non_null_count,
        "distinct_count": len(distinct),
        "numeric_count": len(numeric_values),
    }
    if numeric_values:
        try:
            stddev = _finite_float(statistics.stdev(numeric_values)) if len(numeric_values) > 1 else None
        except OverflowError:
            stddev = None
        result["numeric"] = {
            "min": _finite_float(min(numeric_values)),
            "max": _finite_float(max(numeric_values)),
            "mean": _finite_float(statistics.mean(numeric_values)),
            "median": _finite_float(statistics.median(numeric_values)),
            "sample_stddev": stddev,
        }
    return result


def analyze_execution_result(
    execution: dict,
    *,
    operation: str,
    columns: list[str] | None = None,
) -> dict:
    """Analyze a persisted SQL execution result.

    Args:
        execution: The full execution result dict (columns + data + metadata)
            loaded from Firestore.
        operation: One of ``"profile"``, ``"data_quality"``, ``"correlation"``.
        columns: Optional subset of columns to analyze. Defaults to all
            available columns.

    Returns:
        Analysis result dict with ``success`` flag and operation-specific
        metrics. All errors are returned as ``{"success": False, "error": ...}``
        rather than raised.
    """
    rows = execution.get("data") or []
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        return {"success": False, "error": "Execution result rows are unavailable"}

    # FIX [M9]: Row-count guard prevents OOM on very large persisted results.
    # If MAX_QUERY_RESULTS is ever raised or if the result contains very wide
    # rows (e.g., 200 columns), the multi-pass profiling would spike memory and
    # CPU. We refuse to analyze results exceeding MAX_ANALYZE_ROWS.
    if len(rows) > MAX_ANALYZE_ROWS:
        return {
            "success": False,
            "error": (
                f"Analysis supports at most {MAX_ANALYZE_ROWS} rows; "
                f"got {len(rows)}. Narrow the query or reduce the result set."
            ),
            "row_count": len(rows),
            "max_analyze_rows": MAX_ANALYZE_ROWS,
        }

    available = list(execution.get("columns") or (list(rows[0]) if rows else []))
    selected = list(columns or available)
    unknown = [column for column in selected if column not in available]
    if unknown:
        return {
            "success": False,
            "error": "Unknown columns: " + ", ".join(unknown),
            "available_columns": available,
        }

    tabular = execution.get("tabular_result")
    metadata = execution.get("column_metadata") or (tabular.get("column_metadata") if isinstance(tabular, dict) else [])
    encodings = {
        item["key"]: item["encoding"]
        for item in (metadata if isinstance(metadata, list) else [])
        if isinstance(item, dict) and isinstance(item.get("key"), str) and isinstance(item.get("encoding"), str)
    }
    scope_note = (
        "Statistics cover only the bounded query result, not all database rows."
        if execution.get("truncated")
        else "Statistics cover every row returned by the source query."
    )
    if operation in {"profile", "correlation"}:
        scope_note += (
            " Statistics are approximate JSON numbers. Non-finite/out-of-range inputs "
            "are excluded; unrepresentable statistics are null."
        )
    scope = {
        "analyzed_rows": len(rows),
        "source_truncated": bool(execution.get("truncated")),
        "scope_note": scope_note,
    }

    if operation == "profile":
        if len(selected) > 50:
            return {"success": False, "error": "Profile at most 50 columns per call"}
        return {
            "success": True,
            "operation": operation,
            **scope,
            "columns": {column: _column_profile(rows, column, encodings.get(column)) for column in selected},
        }

    if operation == "data_quality":
        row_keys = [_hashable(row) for row in rows]
        return {
            "success": True,
            "operation": operation,
            **scope,
            "duplicate_row_count": len(row_keys) - len(set(row_keys)),
            "columns": {
                column: {
                    key: value
                    for key, value in _column_profile(rows, column, encodings.get(column)).items()
                    if key in {"count", "non_null_count", "null_count", "distinct_count"}
                }
                for column in selected
            },
        }

    if operation == "correlation":
        if len(selected) != 2:
            return {
                "success": False,
                "error": "Correlation requires exactly two columns",
            }
        left, right = selected
        pairs = []
        for row in rows:
            x, y = _numeric(row.get(left), encodings.get(left)), _numeric(row.get(right), encodings.get(right))
            if x is not None and y is not None:
                pairs.append((x, y))
        if len(pairs) < 2:
            return {
                "success": False,
                "error": "At least two numeric pairs are required",
            }
        xs, ys = zip(*pairs)
        mean_x, mean_y = statistics.mean(xs), statistics.mean(ys)
        centered_x = [x - mean_x for x in xs]
        centered_y = [y - mean_y for y in ys]
        scale_x, scale_y = max(map(abs, centered_x)), max(map(abs, centered_y))
        if not scale_x or not scale_y:
            return {
                "success": False,
                "error": "Correlation is undefined for a constant column",
            }
        # Center exactly before conversion, then scale to avoid overflow in
        # products. Adjacent int64 values must not collapse to a constant.
        correlation = statistics.correlation(
            [float(x / scale_x) for x in centered_x],
            [float(y / scale_y) for y in centered_y],
        )
        return {
            "success": True,
            "operation": operation,
            **scope,
            "columns": selected,
            "paired_numeric_rows": len(pairs),
            "pearson_correlation": max(-1.0, min(1.0, correlation)),
        }

    return {"success": False, "error": f"Unsupported analysis operation: {operation}"}
