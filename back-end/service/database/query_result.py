"""Lossless, positional SQL snapshot contract shared by editor and agent tools."""

import datetime as dt
import enum
import hashlib
import json
import math
import re
import shlex
import uuid
from collections import Counter
from decimal import Decimal
from urllib.parse import unquote, urlsplit

JS_SAFE_INTEGER = 2**53 - 1


def query_timeline_result(result):
    """Keep snapshot identity/metadata in chat; rows live in the execution store."""
    if not isinstance(result, dict):
        return result
    metadata = {key: value for key, value in result.items() if key not in {"data", "preview", "rows"}}
    if isinstance(metadata.get("tabular_result"), dict):
        metadata["tabular_result"] = {key: value for key, value in metadata["tabular_result"].items() if key != "rows"}
    return metadata


PG_TYPES = {
    16: "boolean",
    20: "bigint",
    21: "smallint",
    23: "integer",
    700: "real",
    701: "double precision",
    1700: "numeric",
    1082: "date",
    1083: "time",
    1114: "timestamp",
    1184: "timestamp with time zone",
    1266: "time with time zone",
    17: "bytea",
    25: "text",
    1043: "varchar",
}
MYSQL_TYPES = {
    0: "decimal",
    1: "tinyint",
    2: "smallint",
    3: "integer",
    4: "float",
    5: "double",
    7: "timestamp",
    8: "bigint",
    9: "mediumint",
    10: "date",
    11: "time",
    12: "datetime",
    13: "year",
    16: "bit",
    246: "decimal",
    252: "blob",
    253: "varchar",
    254: "char",
}


def encode_value(value):
    """Preserve source magnitude/offset and binary content before JSON encoding."""
    if value is None or isinstance(value, (str, bool)):
        return value
    if isinstance(value, enum.Enum):
        return encode_value(value.value)
    if isinstance(value, int):
        return str(value) if abs(value) > JS_SAFE_INTEGER else value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, float):
        return value if math.isfinite(value) else str(value)
    if isinstance(value, (dt.datetime, dt.date, dt.time)):
        return value.isoformat()
    if isinstance(value, dt.timedelta):
        return str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return "0x" + bytes(value).hex()
    if isinstance(value, dict):
        return {str(k): encode_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [encode_value(v) for v in value]
    return str(value)


def unique_column_keys(labels):
    counts = Counter(labels)
    reserved = set(labels)
    keys = []
    for index, label in enumerate(labels):
        key = label
        if counts[label] > 1:
            key = f"__column_{index + 1}"
            while key in reserved:
                key = "_" + key
        reserved.add(key)
        keys.append(key)
    return keys


def _source_identity(config):
    # Hash an allowlist of connection identity fields, never credentials or a
    # full DSN. Include the authenticated DB role because permissions can alter
    # the same SQL's output. Explicit selected database/schema override DSNs.
    identity = {
        key: config.get(key) for key in ("db_type", "host", "port", "database", "schema", "service_name", "sid")
    }
    identity["username"] = config.get("user") or config.get("username")
    identity["schema"] = config.get("schema") or config.get("schema_name")
    dsn = config.get("connection_string") or config.get("dsn") or ""
    if isinstance(dsn, str):
        parsed_identity = {}
        try:
            if "://" in dsn and not dsn.startswith("//"):
                parsed = urlsplit(dsn)
                parsed_identity = dict(
                    host=parsed.hostname,
                    port=parsed.port,
                    username=unquote(parsed.username or ""),
                    database=parsed.path.lstrip("/"),
                )
            elif config.get("db_type") == "oracle":
                user_part, separator, address = dsn.rpartition("@")
                if separator:
                    parsed_identity["username"] = user_part.partition("/")[0]
                else:
                    if config.get("connection_string"):
                        raise ValueError("Malformed Oracle connection string")
                    address = dsn
                if address.startswith("("):
                    for field in ("host", "port", "service_name", "sid"):
                        match = re.search(r"\(" + field + r"\s*=\s*([^()]+)\)", address, re.IGNORECASE)
                        if match:
                            parsed_identity[field] = match.group(1).strip()
                else:
                    parsed = urlsplit("//" + address.lstrip("/"))
                    parsed_identity.update(host=parsed.hostname, port=parsed.port, service_name=parsed.path.lstrip("/"))
            else:
                # Select the grammar by driver, not by characters in secrets.
                # A semicolon inside a quoted PostgreSQL password is data.
                aliases = {
                    "host": "host",
                    "server": "host",
                    "data source": "host",
                    "port": "port",
                    "database": "database",
                    "dbname": "database",
                    "user": "username",
                    "uid": "username",
                    "user id": "username",
                    "initial catalog": "database",
                }
                pairs = []
                if config.get("db_type") == "postgresql":
                    lexer = shlex.shlex(dsn, posix=True, punctuation_chars="=")
                    lexer.whitespace_split = True
                    lexer.commenters = ""
                    tokens = list(lexer)
                    if len(tokens) % 3:
                        raise ValueError("Malformed keyword DSN")
                    for index in range(0, len(tokens), 3):
                        key, separator, value = tokens[index : index + 3]
                        if separator != "=":
                            raise ValueError("Malformed keyword DSN")
                        pairs.append((key, value))
                elif config.get("db_type") == "sqlserver":
                    # ODBC braces escape semicolons and doubled closing braces.
                    # Parse the whole string before accepting any identity field,
                    # so malformed credentials cannot inject partial fields.
                    pattern = re.compile(r"\s*([^=;{}]+)=\s*(?:\{((?:[^}]|}})*)\}|([^;{}=]*))\s*(?:;|$)")
                    position = 0
                    while position < len(dsn):
                        if not dsn[position:].strip():
                            break
                        match = pattern.match(dsn, position)
                        if not match:
                            raise ValueError("Malformed ODBC DSN")
                        key, braced, plain = match.groups()
                        pairs.append((key, braced.replace("}}", "}") if braced is not None else plain.strip()))
                        position = match.end()
                for key, value in pairs:
                    canonical = aliases.get(key.strip().lower())
                    if canonical:
                        parsed_identity[canonical] = value
        except ValueError:
            parsed_identity = {}
        for key, value in parsed_identity.items():
            if value is not None and not identity.get(key):
                identity[key] = value
    # Normalize port number and text representations across equivalent configs.
    identity = {key: str(value) if value is not None else None for key, value in identity.items()}
    return hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()


def _column_metadata(key, label, values, desc, db_type):
    code = desc[1] if desc and len(desc) > 1 else None
    # pymssql exposes broad DB-API categories, not the original SQL declaration.
    # Oracle exposes named DbType objects; normalize those even for all-null data.
    if db_type == "sqlserver":
        mapping = {1: "string category", 2: "binary category", 3: "numeric category", 4: "datetime", 5: "decimal"}
        sql_type = mapping.get(getattr(code, "value", code), "unknown")
    elif db_type == "oracle":
        sql_type = str(getattr(code, "name", code) or "unknown").removeprefix("DB_TYPE_").lower()
        sql_type = {
            "date": "oracle date",
            "timestamp_tz": "timestamp with time zone",
            "timestamp_ltz": "timestamp with local time zone",
        }.get(sql_type, sql_type)
    else:
        mapping = PG_TYPES if db_type == "postgresql" else MYSQL_TYPES if db_type == "mysql" else {}
        sql_type = mapping.get(code, str(getattr(code, "__name__", code) or "unknown")).lower()
    vals = [value for value in values if value is not None]
    precision = desc[4] if desc and len(desc) > 4 and isinstance(desc[4], int) else None
    scale = desc[5] if desc and len(desc) > 5 and isinstance(desc[5], int) else None
    kind, encoding, timezone, semantics = "string", "text", None, "Source text; numeric aggregation unavailable."
    if any(isinstance(v, Decimal) for v in vals) or sql_type in ("decimal", "numeric", "number"):
        encoding, semantics = (
            "decimal-string",
            "Exact decimal source text; exact numeric aggregation unavailable in Perspective.",
        )
    elif any(isinstance(v, int) and not isinstance(v, bool) and abs(v) > JS_SAFE_INTEGER for v in vals):
        encoding, semantics = (
            "integer-string",
            "Exact integer source text; exact numeric aggregation unavailable in Perspective.",
        )
    elif (vals and all(isinstance(v, bool) for v in vals)) or sql_type in ("bool", "boolean"):
        kind, encoding, semantics = "boolean", "json", "Boolean values."
    elif vals and all(isinstance(v, int) and not isinstance(v, bool) for v in vals):
        kind = "integer" if all(-(2**31) <= v < 2**31 for v in vals) else "float"
        encoding, semantics = (
            "json",
            "Exact source integers; sufficiently large aggregate arithmetic may lose numeric precision.",
        )
    elif any(isinstance(v, float) and not math.isfinite(v) for v in vals):
        encoding, semantics = "source-text", "Non-finite numeric source text; numeric aggregation unavailable."
    elif any(isinstance(v, float) for v in vals) or any(t in sql_type for t in ("float", "double", "real")):
        kind, encoding, semantics = "float", "json", "Approximate floating point arithmetic."
    elif sql_type in ("smallint", "integer", "tinyint", "mediumint", "year") and not vals:
        kind, encoding, semantics = (
            "integer",
            "json",
            "Declared int32-compatible integer; sufficiently large aggregate arithmetic may lose numeric precision.",
        )
    elif "bigint" in sql_type and not vals:
        encoding, semantics = "integer-string", "Exact integer source text; range unknown for empty/null-only column."
    elif (
        any(isinstance(v, dt.datetime) for v in vals)
        or "timestamp" in sql_type
        or "datetime" in sql_type
        or sql_type == "oracle date"
    ):
        aware = (
            all(v.tzinfo is not None and v.utcoffset() is not None for v in vals if isinstance(v, dt.datetime))
            if vals
            else "with time zone" in sql_type
        )
        timezone = "offset" if aware else "naive"
        # Keep ISO source text: Perspective datetime discards original offsets.
        encoding, semantics = (
            "iso8601",
            "Timestamp source text preserves offsets; naive timestamps have no inferred timezone.",
        )
        if db_type == "oracle" and "time zone" in sql_type and vals and not aware:
            timezone, encoding = "unavailable", "driver-timestamp"
            semantics = (
                "The Oracle driver does not preserve this timestamp's timezone. "
                "Displayed text is the driver's wall-clock value, not an identified instant. "
                "Select an explicit SQL text representation when the original timezone is required."
            )
    elif any(isinstance(v, dt.date) for v in vals) or sql_type == "date":
        kind, encoding, semantics = "date", "iso8601", "Calendar date without timezone."
    elif any(isinstance(v, dt.time) for v in vals) or "time" in sql_type:
        encoding, timezone, semantics = "iso8601", "source", "Time of day source text; no inferred date or timezone."
    elif any(isinstance(v, (bytes, bytearray, memoryview)) for v in vals) or any(
        t in sql_type for t in ("blob", "bytea", "binary")
    ):
        encoding, semantics = "hex", "Exact binary source encoded as hexadecimal; no numeric analysis."
    elif any(isinstance(v, (dict, list, tuple)) for v in vals) or any(t in sql_type for t in ("json", "array")):
        encoding, semantics = (
            "json-text",
            "Structured source encoded as JSON text; source-specific analysis unavailable.",
        )
    elif vals and any(not isinstance(v, str) for v in vals):
        encoding, semantics = (
            "source-text",
            "Unsupported source type rendered as text; source-specific analysis unavailable.",
        )
    return dict(
        key=key,
        label=label,
        sql_type=sql_type,
        precision=precision,
        scale=scale,
        timezone=timezone,
        encoding=encoding,
        perspective_type=kind,
        analysis_semantics=semantics,
    )


def build_query_result(
    labels, rows, *, description=None, db_config, query, effective_limit, truncated, execution_time_ms=0
):
    labels = [str(label) for label in labels]
    keys = unique_column_keys(labels)
    positional = [list(row) if not isinstance(row, dict) else list(row.values()) for row in rows]
    metadata = [
        _column_metadata(
            key,
            label,
            [row[i] for row in positional],
            description[i] if description and i < len(description) else None,
            db_config.get("db_type"),
        )
        for i, (key, label) in enumerate(zip(keys, labels))
    ]
    # Encode all values consistently per column so mixed safe/unsafe integers do
    # not yield mixed numeric/string wire representations.
    encoded = [
        [
            str(value)
            if value is not None and metadata[i]["encoding"] in ("integer-string", "decimal-string")
            else json.dumps(encode_value(value), ensure_ascii=False, allow_nan=False)
            if value is not None and metadata[i]["encoding"] == "json-text"
            else str(value)
            if value is not None and metadata[i]["encoding"] == "source-text"
            else encode_value(value)
            for i, value in enumerate(row)
        ]
        for row in positional
    ]
    result_metadata = dict(
        version=1,
        execution_id=str(uuid.uuid4()),
        executed_at=dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        source_id=_source_identity(db_config),
        query_id=hashlib.sha256(query.encode()).hexdigest(),
        execution_time_ms=execution_time_ms,
        effective_limit=effective_limit,
        returned_rows=len(encoded),
        completeness="truncated" if truncated else "complete",
    )
    return dict(
        columns=keys,
        fields=keys,
        rows=encoded,
        column_types={col["key"]: col["perspective_type"] for col in metadata},
        column_metadata=metadata,
        result_metadata=result_metadata,
    )
