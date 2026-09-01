---
name: database-querying
description: Inspect connected schemas and indexes, write read-only SQL, execute queries, and analyze database results.
when_to_use: The task needs connected-database facts, SQL generation, schema inspection, live rows, aggregates, rankings, counts, or database UI actions.
avoid_when: The user is asking about app code, frontend UI, general conversation, external documentation, or a diagram that can be answered from already-visible schema context.
---

# Database Querying

Use the fewest calls that produce verified evidence.

## Workflow

1. Reuse exact active-context evidence only when it answers the request and freshness is not material.
2. Use `get_schema_overview(target_tables?)` before SQL when relevant tables, columns, or relationships are unknown. Do not chain narrower schema calls when one overview is enough.
3. Use `get_table_indexes(table_name)` only for index or query-performance work.
4. Use `execute_query(query, max_rows)` whenever the answer depends on current rows, rankings, counts, totals, revenue, growth, or comparisons.
5. For profiling, trends, correlations, data-quality checks, or exploratory work, run a sequence of focused aggregate queries. Interpret each bounded result, refine the next query, and stop only when the requested analysis is supported.
6. Use `analyze_query_result(execution_id, operation, columns?)` for deterministic descriptive profiles, null/distinct/duplicate checks, or Pearson correlation over a prior bounded query result. If that query was truncated, explicitly treat the computed values as sample/result-window statistics rather than whole-table statistics.
7. Stop when sufficient evidence exists.

Write only read-only `SELECT` or `WITH` SQL. Choose the narrowest query that answers the request. Default `max_rows` to 100; use 10-25 for broad exploration. State a defensible business assumption briefly when it affects the query.

Never answer live-data questions from intuition, naming patterns, examples, or historical summaries. Never invent or extrapolate rows. A preview proves only the visible rows; do not claim a complete top-N result unless the evidence contains it. Run a focused follow-up query when the preview cannot support the requested conclusion.

## Tool Selection Guide

The database-querying skill exposes the following tools. Pick the most specific one that answers the question — broader tools cost more tokens and pool time.

| Situation | Use | Instead of |
|---|---|---|
| Need tables, columns (name + PK), and foreign keys in one call | `get_schema_overview(target_tables?)` | chaining `get_table_indexes` + `get_foreign_keys` |
| Need rich per-column metadata (data type, nullability, default, max length, PK flag, UNIQUE flag) for one table | `get_table_details(table_name)` | a hand-rolled `SELECT * FROM information_schema.columns` via `execute_query` |
| Need only foreign-key relationships (for one table or the whole DB) | `get_foreign_keys(table_name?)` | `get_schema_overview` (which also fetches tables + columns you may not need) |
| Need exact whole-table row counts for 1-10 tables | `get_table_row_counts(table_names=[...])` once | repeated tool calls or `SELECT COUNT(*)` via `execute_query` (slower and consumes the row budget) |
| Need to know whether a relation is a view (or materialized view) | `list_views()` | `get_schema_overview` (which filters `table_type = 'BASE TABLE'` and hides views) |
| Need to know which indexes exist on a table | `get_table_indexes(table_name)` | a hand-rolled `SHOW INDEX` / `pg_indexes` query |
| Need to know WHY a query is slow, or whether it will use an index, before running it | `explain_query(query)` | running the query and observing timing |
| Need actual rows, aggregates, rankings, totals | `execute_query(query, max_rows)` | anything else — only this tool returns real data |

### When to use `explain_query`

`explain_query(query)` returns the optimizer's execution plan for a validated read-only SELECT/WITH statement. The plan is **not** executed (no `ANALYZE`), so it is safe to run on any read-only SQL even if you are unsure of its cost.

Use `explain_query` when:

- The user asks "why is this query slow?" or "does this query use an index?".
- You are about to run a query that joins 3+ tables or filters on non-indexed columns and you want to confirm the plan before consuming the row budget.
- A prior `execute_query` timed out and you need to diagnose the cause (e.g. seq scan on a large table, missing index, bad join order).
- The user asks how to optimize a query, an index, or a schema for performance.

Do NOT use `explain_query` when:

- You need actual rows or aggregate values — `explain_query` returns the plan, not the data. Use `execute_query` instead.
- The query is not read-only. EXPLAIN on DML/DDL is blocked at the schema layer.
- You have already explained the same query in this turn — the plan does not change within a turn.

The `plan_format` field in the result tells you how to interpret the plan: `"json"` (MySQL, PostgreSQL) is a structured plan tree; `"text"` (SQL Server, Oracle) is one line of formatted plan text per row.

### When to use `get_table_details` vs `get_schema_overview`

`get_schema_overview` is the right first call for an unfamiliar database: it lists tables, columns (name + PK flag), and foreign keys in one round-trip. Call `get_table_details(table_name)` only when you specifically need:

- The **data type** of a column (to choose `CAST` vs `CONVERT`, to know whether `SUM` will overflow `INT`, to format a date column correctly).
- The **nullability** of a column (to decide whether to add `WHERE col IS NOT NULL`, to know whether `COUNT(col)` will undercount rows).
- The **default value** of a column (to know what `INSERT` will store when the column is omitted).
- The **max character length** of a column (to size `VARCHAR` host variables, to know whether a value will be truncated).
- The **UNIQUE flag** of a column (to know whether `DISTINCT` is redundant, to plan a `JOIN` strategy).

### When to use `get_table_row_counts` vs `execute_query("SELECT COUNT(*)")`

`get_table_row_counts(table_names=[...])` counts every requested table in one database statement. It bypasses the LLM-issued SQL parser and per-conversation row-budget accounting used by `execute_query`. Supply one to ten unique, unqualified names from the active database/schema. Include every table needed in the current batch; if the request needs more than ten tables, use the minimum number of batches. The result preserves input order and returns an exact count for each table.

Prefer `get_table_row_counts` whenever the user asks how many rows are in one or more tables, or you need whole-table cardinalities before choosing a query strategy. Batch up to ten names per call and never invoke it separately for each table. Use `execute_query("SELECT COUNT(*) FROM table WHERE ...")` only when you need a **filtered** count (the dedicated tool counts all rows).

### When to use `list_views`

`get_schema_overview` and `get_tables_query` filter `table_type = 'BASE TABLE'` only — **views are invisible** to those tools. Call `list_views()` when:

- The user mentions a relation by name and `get_schema_overview` does not list it (it may be a view, not a base table).
- You are about to write a complex aggregate query and want to check whether an equivalent view already exists (avoiding redundant work).
- The user asks "what views exist in this database?" or "show me the derived tables".

On PostgreSQL and Oracle, `list_views` also returns materialized views (in the `materialized_views` field). On MySQL and SQL Server, only regular views are returned (those DBMS do not have first-class materialized views).

### When to use `get_foreign_keys`

`get_foreign_keys(table_name?)` is a thin standalone wrapper around the same backend used by `get_schema_overview`. Use it when:

- You already have the schema overview and only need the FK set for one specific table — `get_foreign_keys(table_name)` is cheaper than re-running the full overview.
- You need the complete FK graph for a multi-table join analysis — call `get_foreign_keys()` with no argument to get every FK in the connected database.

<!-- ENH [8]: Smart Workflow decision tree + Anti-patterns cheat-sheet.
     These complement the per-tool "When to use" sections above by giving
     the agent a fast top-down decision procedure and a list of common
     patterns that waste tokens / pool time. -->

## Smart Workflow Decision Tree

1. **Do you know the schema?** If not → `get_schema_overview` (broad) or `get_table_details` (specific table).
2. **Need to know row counts?** → `get_table_row_counts` with up to ten names per call; use the minimum batches for larger sets (NOT one call per table or `SELECT COUNT(*)`).
3. **Writing a query?** → `execute_query` with a reasonable `max_rows` (start with 100).
4. **Query too slow?** → `explain_query` to see the plan, then `get_table_indexes` to check for missing indexes.
5. **Need to understand relationships?** → `get_foreign_keys` for the specific table.
6. **Analyzing results?** → `analyze_query_result` with `execution_id` from step 3.
7. **Looking for views?** → `list_views` to see views and materialized views.

## Anti-patterns (AVOID)
- Calling `execute_query` with an unfiltered `SELECT COUNT(*)`, or counting tables one at a time — use one `get_table_row_counts` batch instead.
- Calling `get_schema_overview` repeatedly — it's cached, but call `get_table_details` for deep info on one table.
- Calling `execute_query` with `max_rows=1000` by default — start with 100, increase only if needed.
- Running the same query twice — check `get_query_history` first.

## Result Presentation

The UI automatically renders every successful `execute_query` result in chat as an interactive Material React Table. A bounded preview is also available to you so you can interpret aggregate values and continue a multi-step analysis. For ordinary requests, synthesize the finding in prose rather than repeating the rows as another table.

Only build a table in the assistant response when the user explicitly requests one. First explain that you can access only preview rows, so the manual table can include only those data points and must not be presented as the complete result. If no suitable fresh query exists, run one so the full available result appears in the interactive chat table. If it already ran, point to that table instead of rerunning it.

## Failures

On a tool failure, retry once only when a clearly safer or corrected call exists. Otherwise report the failure. For a missing table, present verified likely matches and ask one question. For an empty result, say nothing matched and suggest one useful filter adjustment.
