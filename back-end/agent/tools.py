"""
LangGraph tool wrappers — ``@tool``-decorated functions that the agent calls.

Each tool:
  1. Receives its args (visible to LLM) + ``config: RunnableConfig`` (injected).
  2. Validates args via Pydantic schemas.
  3. Checks the per-conversation tool cache.
  4. Calls the matching ``AIToolExecutor._get_*()`` method directly (no dispatcher).
  5. Emits ``tool_start`` / ``tool_end`` SSE events via ``get_stream_writer()``.
  6. Returns the token-efficient LLM summary (``summarize_for_llm``).
"""

import json
import logging
from typing import Optional

from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig

from .tool_executor import ToolExecutor
from services.db_tool_executors import AIToolExecutor as DBTools

logger = logging.getLogger(__name__)

# Tools whose results can be cached within a single conversation turn set.
CACHEABLE_TOOLS = {
    "get_connection_status",
    "get_database_list",
    "get_database_schema",
    "get_table_columns",
    "get_table_indexes",
    "get_foreign_keys",
}


# ── internal helpers ─────────────────────────────────────────────────


def _cfg(config: RunnableConfig) -> dict:
    """Shortcut to ``config["configurable"]``."""
    return config.get("configurable", {})


def _try_writer():
    """Return the LangGraph stream writer, or a no-op if unavailable."""
    try:
        from langgraph.config import get_stream_writer

        return get_stream_writer()
    except Exception:
        return lambda _data: None


def _effective_max_rows(user_max_rows):
    """Return user's max_rows setting, or the server-configured cap if unset."""
    if user_max_rows is not None:
        return user_max_rows
    from config import Config

    return Config.MAX_QUERY_RESULTS


def _execute_tool(
    tool_name: str,
    raw_args: dict,
    config: RunnableConfig,
    executor_fn,
) -> str:
    """
    Shared execution pipeline used by every tool function.

    ``executor_fn(validated, user_id, db_config, max_rows) -> dict``
    is a callable that performs the actual DB work for each specific tool.

    Returns the LLM-efficient summary string (becomes ``ToolMessage.content``).
    """
    cfg = _cfg(config)
    writer = _try_writer()

    # 1. Validate with Pydantic schemas
    validated = ToolExecutor.validate_and_parse_args(tool_name, raw_args)

    # 2. Display args (show effective max_rows for execute_query)
    display_args = dict(validated)
    if tool_name == "execute_query":
        user_max_rows = cfg.get("max_rows")
        if user_max_rows is not None:
            display_args["max_rows"] = user_max_rows
        else:
            from config import Config

            display_args["max_rows"] = (
                f"No Limit (server max: {Config.MAX_QUERY_RESULTS})"
            )

    # 3. Emit tool_start
    writer({"type": "tool_start", "name": tool_name, "args": display_args})

    # 4. Cache check
    cache = cfg.get("tool_cache", {})
    cache_key = None
    if tool_name in CACHEABLE_TOOLS:
        cache_args = {k: v for k, v in validated.items() if k != "rationale"}
        cache_key = f"{tool_name}:{json.dumps(cache_args, sort_keys=True)}"

    if cache_key and cache_key in cache:
        logger.info(f"Cache hit for {tool_name}")
        parsed = cache[cache_key]
    else:
        # 5. Execute directly — no dispatcher
        parsed = executor_fn(
            validated,
            cfg.get("user_id", ""),
            cfg.get("db_config"),
            cfg.get("max_rows"),
        )
        if cache_key:
            cache[cache_key] = parsed
            logger.info(f"Cached result for {tool_name}")

    # 6. Dual summarization
    ui_summary = ToolExecutor.summarize_for_ui(tool_name, parsed)
    llm_summary = ToolExecutor.summarize_for_llm(tool_name, parsed)

    # 7. Emit tool_end with full UI data
    writer(
        {
            "type": "tool_end",
            "name": tool_name,
            "args": display_args,
            "result": json.loads(ui_summary),
        }
    )

    # 8. Return LLM summary (becomes ToolMessage.content)
    return llm_summary


# ── tool definitions ─────────────────────────────────────────────────


@tool
def get_connection_status(rationale: str, *, config: RunnableConfig) -> str:
    """Check if user is connected to a database and get connection details like database type, name, host, and whether it's a remote connection."""
    return _execute_tool(
        "get_connection_status",
        {"rationale": rationale},
        config,
        lambda v, uid, db_cfg, mx: DBTools._get_connection_status(uid),
    )


@tool
def get_database_list(rationale: str, *, config: RunnableConfig) -> str:
    """Get list of all databases available on the connected server."""
    return _execute_tool(
        "get_database_list",
        {"rationale": rationale},
        config,
        lambda v, uid, db_cfg, mx: DBTools._get_database_list(uid, db_config=db_cfg),
    )


@tool
def get_database_schema(
    rationale: str,
    database: Optional[str] = None,
    *,
    config: RunnableConfig,
) -> str:
    """Get all tables and their columns for the current database or a specified database."""
    return _execute_tool(
        "get_database_schema",
        {"rationale": rationale, "database": database},
        config,
        lambda v, uid, db_cfg, mx: DBTools._get_database_schema(
            uid, v.get("database"), db_config=db_cfg
        ),
    )


@tool
def get_table_columns(
    table_name: str,
    rationale: str,
    *,
    config: RunnableConfig,
) -> str:
    """Get detailed column information for a specific table including column names and data types."""
    return _execute_tool(
        "get_table_columns",
        {"table_name": table_name, "rationale": rationale},
        config,
        lambda v, uid, db_cfg, mx: DBTools._get_table_columns(
            uid, v["table_name"], db_config=db_cfg
        ),
    )


@tool
def execute_query(
    query: str,
    rationale: str,
    max_rows: int = 100,
    *,
    config: RunnableConfig,
) -> str:
    """Execute a SQL SELECT query against the connected database. Only SELECT queries are allowed for safety."""
    return _execute_tool(
        "execute_query",
        {"query": query, "rationale": rationale, "max_rows": max_rows},
        config,
        lambda v, uid, db_cfg, mx: DBTools._execute_query(
            uid, v["query"], _effective_max_rows(mx), db_config=db_cfg
        ),
    )


@tool
def get_table_indexes(
    table_name: str,
    rationale: str,
    *,
    config: RunnableConfig,
) -> str:
    """Get all indexes defined on a specific table, including index name, columns, uniqueness, and whether it's a primary key index."""
    return _execute_tool(
        "get_table_indexes",
        {"table_name": table_name, "rationale": rationale},
        config,
        lambda v, uid, db_cfg, mx: DBTools._get_table_indexes(
            uid, v["table_name"], db_config=db_cfg
        ),
    )


@tool
def get_foreign_keys(
    rationale: str,
    table_name: Optional[str] = None,
    *,
    config: RunnableConfig,
) -> str:
    """Get foreign key relationships for a table or all tables in the database. Returns the FK column, referenced table, and referenced column."""
    return _execute_tool(
        "get_foreign_keys",
        {"rationale": rationale, "table_name": table_name},
        config,
        lambda v, uid, db_cfg, mx: DBTools._get_foreign_keys(
            uid, v.get("table_name"), db_config=db_cfg
        ),
    )


@tool
def web_search(query: str, rationale: str, *, config: RunnableConfig) -> str:
    """Search the web for current information, recent news, external documentation, or any topic not available in the connected database. Use this when the user needs up-to-date knowledge, real-world context, or information that cannot be answered from database data alone."""
    writer = _try_writer()
    writer({"type": "tool_start", "name": "web_search", "args": {"query": query}})

    try:
        from langchain_tavily import TavilySearch

        searcher = TavilySearch(max_results=5, topic="general")
        raw = searcher.invoke({"query": query})

        # Normalize: may return a list of result dicts or a dict with a 'results' key
        if isinstance(raw, list):
            results = raw
        elif isinstance(raw, dict):
            results = raw.get("results", [])
        else:
            results = []

        parsed = {
            "success": True,
            "query": query,
            "count": len(results),
            "results": [
                {
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "content": r.get("content", ""),
                }
                for r in results
            ],
        }
    except Exception as e:
        logger.error("web_search failed: %s", e)
        parsed = {
            "success": False,
            "query": query,
            "error": str(e),
            "count": 0,
            "results": [],
        }

    writer(
        {
            "type": "tool_end",
            "name": "web_search",
            "args": {"query": query},
            "result": parsed,
        }
    )

    if not parsed["success"]:
        return f"Web search failed: {parsed.get('error', 'Unknown error')}"

    if not parsed["results"]:
        return f"No results found for: {query}"

    lines = [f"Web search results for '{query}':\n"]
    for i, r in enumerate(parsed["results"], 1):
        title = r["title"] or "Untitled"
        url = r["url"]
        snippet = r["content"][:400].strip() if r["content"] else ""
        lines.append(f"{i}. {title}\n   {url}\n   {snippet}\n")

    return "\n".join(lines)


# ── public list ──────────────────────────────────────────────────────

ALL_TOOLS = [
    get_connection_status,
    get_database_list,
    get_database_schema,
    get_table_columns,
    execute_query,
    get_table_indexes,
    get_foreign_keys,
    web_search,
]
