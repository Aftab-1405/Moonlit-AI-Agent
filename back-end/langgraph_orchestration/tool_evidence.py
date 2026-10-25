"""Extractive tool evidence for follow-ups; full SQL rows stay in execution storage."""

from __future__ import annotations

import hashlib
import json
import math
import time
from copy import deepcopy
from html import escape

MAX_EVIDENCE_BYTES = 6144
MAX_HISTORY_EVIDENCE_BYTES = 16384
METADATA_TTL_SECONDS = 300
MAX_CACHE_ENTRIES = 16
METADATA_TOOLS = frozenset(
    {"get_schema_overview", "get_table_details", "get_table_indexes", "get_foreign_keys", "list_views"}
)


def _size(value):
    # ASCII JSON is a conservative upper bound for UTF-8 and tokenized content.
    return len(json.dumps(value, default=str).encode())


def evidence_text_bytes(text):
    """Measure the representation actually inserted into the escaped prompt."""
    return len(escape(text).encode()) + 50 if text else 0


def evidence_scope(configurable):
    cfg = configurable or {}
    db = cfg.get("db_config") or {}
    generation = db.get("_context_generation")
    if not (cfg.get("user_id") and cfg.get("conversation_id") and db.get("db_type") and generation):
        return None
    identity = [
        cfg["user_id"],
        cfg["conversation_id"],
        generation,
        *[db.get(key) for key in ("db_type", "host", "port", "user", "username", "database", "schema")],
    ]
    return hashlib.sha256(json.dumps(identity, default=str).encode()).hexdigest()


def build_evidence(tool_name, args, result, configurable=None, *, observed_at=None):
    """Bound bytes, nesting, collections and cells without changing the UI result."""
    omitted = []
    args = args if isinstance(args, dict) else {}
    try:
        observed_at = float(time.time() if observed_at is None else observed_at)
        if not math.isfinite(observed_at):
            observed_at = 0
    except (ValueError, TypeError):
        observed_at = 0

    def bounded(value, path="", depth=0):
        if depth > 7:
            omitted.append(path)
            return "<omitted>"
        if isinstance(value, dict):
            if len(value) > 64:
                omitted.append(path)
            projected = {}
            for key, item in list(value.items())[:64]:
                name = str(key)
                if len(name) > 256 or name in projected:
                    omitted.append(path + ".column_name")
                    continue
                projected[name] = bounded(item, f"{path}.{name}", depth + 1)
            return projected
        if isinstance(value, (list, tuple)):
            if len(value) > 40:
                omitted.append(path)
            return [bounded(v, f"{path}[{i}]", depth + 1) for i, v in enumerate(value[:40])]
        if value is None or isinstance(value, (bool, int, float)):
            return value
        text = str(value)
        cap = 2048 if path == "arguments.query" else 256
        if len(text) > cap:
            omitted.append(path)
            return text[:cap] + "…"
        return text

    result = result if isinstance(result, dict) else {"value": result}
    projected = result
    if tool_name == "execute_query":
        projected = {key: value for key, value in result.items() if key not in {"data", "rows", "tabular_result"}}
        rows = result.get("preview", result.get("data", []))
        projected["preview"] = rows[:20] if isinstance(rows, list) else []
    db = (configurable or {}).get("db_config") or {}
    evidence = {
        "tool": tool_name,
        "arguments": bounded(args or {}, "arguments"),
        "scope": evidence_scope(configurable),
        "database": str(db.get("database") or result.get("database") or "")[:128],
        "schema": str(db.get("schema") or "")[:128],
        "observed_at": observed_at,
        "result": bounded(projected, "result"),
        "evidence_complete": True,
        "omitted": [],
    }
    try:
        returned_rows = int(result.get("row_count") or 0)
    except (ValueError, TypeError):
        returned_rows = 0
    query_partial = tool_name == "execute_query" and (
        bool(result.get("truncated") or result.get("preview_is_partial")) or returned_rows > len(projected["preview"])
    )
    # Reduce the largest collection first, preserving scalar counts and saved-result IDs.
    while _size(evidence) > MAX_EVIDENCE_BYTES - 512:
        candidates = [
            (key, value) for key, value in evidence["result"].items() if isinstance(value, (dict, list)) and value
        ]
        if not candidates:
            evidence["arguments"] = {"refresh": True} if (args or {}).get("refresh") else {}
            keep = {"success", "error_code", "execution_id", "row_count", "truncated", "table_count"}
            evidence["result"] = {k: v for k, v in evidence["result"].items() if k in keep}
            omitted.append("result")
            break
        key, value = max(candidates, key=lambda pair: _size(pair[1]))
        size = len(value) // 2
        evidence["result"][key] = dict(list(value.items())[:size]) if isinstance(value, dict) else value[:size]
        omitted.append(f"result.{key}")
    if tool_name == "execute_query":
        evidence["result"]["preview_row_count"] = len(evidence["result"].get("preview") or [])
        query_partial = query_partial or returned_rows > evidence["result"]["preview_row_count"]
        evidence["result"]["preview_is_partial"] = bool(omitted or query_partial)
    evidence["evidence_complete"] = not (omitted or query_partial)
    evidence["omitted"] = [path[:100] for path in dict.fromkeys(omitted)][:4]
    return evidence


def _decoded(value, fallback):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (ValueError, TypeError):
            return fallback
    return value if value is not None else fallback


def timeline_evidence(item, configurable=None):
    if item.get("type") != "tool" or item.get("status") not in (None, "done"):
        return None
    # Skill bodies and semantic memories have their own context paths.
    if item.get("name") in {"read_skill", "load_skill", "retrieve_memory"}:
        return None
    saved = _decoded(item.get("model_evidence"), {})
    if isinstance(saved, dict) and isinstance(saved.get("result"), dict):
        # Re-bound persisted evidence too; do not trust old/unbounded records.
        evidence = build_evidence(
            item.get("name", ""), saved.get("arguments", {}), saved["result"], observed_at=saved.get("observed_at", 0)
        )
        evidence["scope"] = str(saved.get("scope") or "")[:64] or None
        for key in ("database", "schema"):
            evidence[key] = str(saved.get(key) or "")[:128]
        evidence["evidence_complete"] = bool(saved.get("evidence_complete")) and evidence["evidence_complete"]
        saved_omitted = saved.get("omitted")
        if isinstance(saved_omitted, list):
            evidence["omitted"] = list(
                dict.fromkeys([*evidence["omitted"], *[str(v)[:100] for v in saved_omitted[:4]]])
            )[:4]
    else:
        # Legacy timelines can recover schema facts, but cannot invent SQL preview rows.
        evidence = build_evidence(
            item.get("name", ""), _decoded(item.get("args"), {}), _decoded(item.get("result"), {}), observed_at=0
        )
        if item.get("name") == "execute_query" and not evidence["result"].get("preview"):
            evidence["evidence_complete"] = False
    scope = evidence_scope(configurable)
    evidence["source_matches_current"] = evidence["scope"] == scope if evidence["scope"] and scope else None
    return evidence


def history_evidence(message, configurable=None, *, max_bytes=MAX_HISTORY_EVIDENCE_BYTES):
    """Newest results win within a strict shared history budget."""
    retained = []
    omitted = 0
    for item in reversed(message.get("timeline") or []):
        evidence = timeline_evidence(item, configurable)
        if evidence is None:
            continue
        candidate = [evidence, *retained]
        text = json.dumps({"results": candidate, "omitted_results": omitted})
        # If the newest result alone is too wide after escaping, retain a
        # smaller explicit preview rather than losing its execution reference.
        while not retained and evidence_text_bytes(text) > max_bytes:
            values = [(k, v) for k, v in evidence["result"].items() if isinstance(v, (dict, list)) and v]
            if values:
                key, value = max(values, key=lambda pair: _size(pair[1]))
                keep = len(value) // 2
                evidence["result"][key] = dict(list(value.items())[:keep]) if isinstance(value, dict) else value[:keep]
            elif evidence.get("arguments"):
                evidence["arguments"] = {}
            else:
                break
            evidence["evidence_complete"] = False
            evidence["omitted"] = ["history_budget"]
            if evidence["tool"] == "execute_query":
                evidence["result"]["preview_row_count"] = len(evidence["result"].get("preview") or [])
                evidence["result"]["preview_is_partial"] = True
            candidate = [evidence]
            text = json.dumps({"results": candidate, "omitted_results": omitted})
        if evidence_text_bytes(text) > max_bytes:
            omitted += 1
            continue
        retained = candidate
    text = json.dumps({"results": retained, "omitted_results": omitted})
    return text if retained and evidence_text_bytes(text) <= max_bytes else ""


def hydrate_tool_cache(conversation, configurable, *, now=None):
    """Rehydrate only fresh, complete schema metadata from this exact source."""
    now = time.time() if now is None else now
    scope = evidence_scope(configurable)
    cache, timestamps = {}, {}
    if not scope:
        return cache, timestamps
    for message in reversed((conversation or {}).get("messages") or []):
        for item in reversed(message.get("timeline") or []):
            saved = _decoded(item.get("model_evidence"), {})
            if not isinstance(saved, dict) or saved.get("scope") != scope:
                continue
            try:
                age = now - float(saved.get("observed_at", 0))
            except (TypeError, ValueError):
                continue
            if not 0 <= age <= METADATA_TTL_SECONDS:
                continue
            tool = item.get("name")
            if tool not in METADATA_TOOLS:
                continue
            if not isinstance(saved.get("arguments"), dict) or not isinstance(saved.get("result"), dict):
                continue
            args = dict(saved["arguments"])
            refresh = args.pop("refresh", False)
            result = saved.get("result") or {}
            if saved.get("evidence_complete") and result.get("success") is True and not result.get("error"):
                key = f"{tool}:{json.dumps(args, sort_keys=True)}"
                if key not in cache and len(cache) < MAX_CACHE_ENTRIES:
                    cache[key] = {
                        key: deepcopy(value)
                        for key, value in result.items()
                        if key not in {"error", "error_code"} or value is not None
                    }
                    timestamps[key] = saved["observed_at"]
            if refresh:
                return cache, timestamps
    return cache, timestamps
