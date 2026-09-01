# Agent Tool Result Contracts and UI Presentation Design

**Date:** 2026-08-30

**Status:** Implemented and verified

## Purpose

Make every registered agent tool return a validated, structured result that can be represented
meaningfully in the chat timeline. Internal instructions and retrieved historical-memory content
must remain available to the model without being dumped into the user-facing timeline.

This work covers the 19 tools currently registered in
`langgraph_orchestration.tools.ALL_TOOLS`. It does not add tools, change database query behavior,
or alter public HTTP endpoints.

## Current Findings

The shared `_execute_tool` path validates and structures most database-tool results, but coverage
is incomplete:

- `read_skill`, `web_search`, and `get_query_history` emit `tool_end` events through bespoke paths.
- `analyze_query_result` uses `_execute_tool`, but has no dedicated result schema and therefore
  falls through to a generic nested `data` result.
- `get_query_history` sends only a count to the UI even though the model receives the query list.
- `structure_tool_result` treats unknown result types as successful raw data.
- The frontend has detailed renderers only for schema overview, batched row counts, foreign keys,
  and web search. Other tools show a short sentence or `Completed successfully` even when their
  result contains useful structured evidence.
- `get_table_columns` remains in frontend presentation code even though it is not a registered
  backend tool.

## Design Principles

1. Every registered tool has an explicit argument schema and result contract.
2. A registered tool can never silently fall through as an unvalidated success.
3. Backend results remain the authority; the frontend never infers missing facts.
4. Model-facing and UI-facing payloads may differ when disclosure or payload size requires it.
5. Existing specialized presentations are extended, not replaced with a new UI framework.
6. Future unknown structured payloads remain inspectable through a safe generic renderer.
7. Errors use the existing canonical `success`, `error_code`, and `error` envelope.
8. Changes remain bounded to tool contracts, event serialization, presentation, tests, and
   relevant documentation.

## Canonical Result Boundary

`ToolExecutor.summarize(tool_name, raw_result)` remains the canonical boundary for tools using the
shared execution path. It produces two independently derived values:

- `ui_result`: bounded, validated, and safe to persist in the conversation timeline.
- `llm_result`: validated evidence needed by the model, serialized with the existing JSON-safe
  conversion.

The three bespoke tools must call the same result-structuring logic before emitting `tool_end`:

- `read_skill`
- `web_search`
- `get_query_history`

They do not need to be forced through `_execute_tool` when doing so would complicate their existing
sync/async, interrupt, or timeout behavior. A small shared result-emission helper may be introduced
to validate a raw result and emit the canonical `tool_end` event without changing execution
semantics.

The fallback in `structure_tool_result` changes from:

```python
{"success": True, "data": raw_result}
```

to a stable `TOOL_RESULT_INVALID` failure for any registered tool without a result structurer.
Truly unregistered tool names are also rejected rather than presented as successful evidence.

## Result Contracts

### Existing contracts retained

- `get_connection_status`
- `get_database_list`
- `execute_query`
- `get_table_indexes`
- `get_schema_overview`
- `explain_query`
- `get_table_details`
- `get_table_row_counts`
- `get_foreign_keys`
- `list_views`
- `open_sql_editor`
- `open_database_modal`
- `open_settings_modal`
- `navigate_new_chat`
- `retrieve_memory`

Existing result models may be tightened where fields currently returned by executors are silently
dropped. The tool's observable meaning must not change.

### New or completed contracts

#### `read_skill`

```json
{
  "success": true,
  "skill_name": "database-querying",
  "description": "...",
  "already_loaded": false
}
```

An unknown skill uses the canonical failure envelope. The full skill body remains model-only and
is never included in `ui_result`.

#### `analyze_query_result`

Common fields:

```json
{
  "success": true,
  "operation": "profile",
  "analyzed_rows": 100,
  "source_truncated": false,
  "scope_note": "..."
}
```

Operation-specific fields are validated:

- `profile`: per-column count, null, distinct, numeric count, and optional numeric statistics.
- `data_quality`: duplicate-row count and per-column quality counts.
- `correlation`: exactly two column names, paired numeric row count, and Pearson coefficient.

#### `web_search`

```json
{
  "success": true,
  "query": "...",
  "count": 2,
  "results": [
    {"title": "...", "url": "https://...", "content": "..."}
  ]
}
```

The existing five-result bound and canonical timeout/failure behavior remain unchanged.

#### `get_query_history`

```json
{
  "success": true,
  "count": 2,
  "queries": [
    {
      "query": "SELECT ...",
      "database": "analytics",
      "row_count": 10,
      "status": "success",
      "executed_at": "2026-08-30T10:00:00+00:00"
    }
  ]
}
```

The existing maximum of ten history entries and 500-character stored-query bound remain
authoritative.

### Internal-memory visibility

`retrieve_memory` keeps the validated `memories` text in the model-facing result. Its UI result is
restricted to:

```json
{
  "success": true,
  "found": true,
  "query": "..."
}
```

The retrieved historical-context text is not emitted to, or persisted in, the tool timeline.

## Frontend Presentation

Every registered tool receives a deliberate presentation. Existing styling primitives in
`ToolResultDetails.jsx` are reused.

| Tool | Expanded presentation |
|---|---|
| `read_skill` | Skill name, description, and already-loaded status |
| `get_connection_status` | Connection state, database type/name, schema, and safe host metadata |
| `get_database_list` | Current database and available database-name list |
| `execute_query` | Existing interactive result table plus timeline execution metadata |
| `analyze_query_result` | Operation-specific profile, quality, or correlation result |
| `get_table_indexes` | Index name, column, unique, and primary flags |
| `get_schema_overview` | Existing schema/table presentation |
| `explain_query` | Plan format, row count, truncation state, and bounded formatted plan |
| `get_table_details` | Canonical column type/nullability/unique/default/length fields plus constraints |
| `get_table_row_counts` | Existing ordered exact-count list |
| `get_foreign_keys` | Existing relationship list |
| `list_views` | Regular and materialized-view lists |
| `web_search` | Existing citation cards |
| `get_query_history` | Query, database, status, row count, and execution time for up to ten entries |
| UI-action tools | Action, confirmation/approval state, and safe action metadata |
| `retrieve_memory` | Query and found/not-found status only |

`get_table_columns` presentation code is removed because it has no registered backend tool and the
development branch does not require legacy conversation compatibility.

## Safe Generic Presentation

`ToolResultDetails` retains a generic renderer as defense in depth, but it no longer reduces a
successful object to `Completed successfully`. It displays bounded structured content:

- scalar values as labeled metadata;
- short scalar arrays as lists;
- nested arrays/maps as formatted, read-only JSON with a display-size limit;
- canonical failures as the existing safe error message.

The backend must still validate every registered tool. The generic renderer is not a substitute
for a result schema and must not display fields removed from `ui_result`. The memory presentation
also strips the obsolete top-level `memories` field from historical persisted results before generic
rendering; this narrow privacy migration is required even though other obsolete tool contracts are
not supported.

## Error and Empty-State Behavior

- Schema conversion failures return `TOOL_RESULT_INVALID` and never raw payload data.
- Bespoke tools emit the same canonical error envelope as shared-pipeline tools.
- Each specialized renderer handles an intentional empty state, such as no databases, no indexes,
  no views, no history, no search results, or no retrieved memory.
- Malformed persisted legacy data is handled by the bounded generic renderer without throwing.
- Frontend semantic-failure detection uses `success: false`/`error_code` as the authority. Empty
  successful collections remain successful and display an empty state rather than a red failure.

## Contract Completeness Invariants

Backend tests enforce:

```text
registered tool names == argument-schema names == result-structurer names
```

UI-action tools may share one argument/result model family, but every registered name must still
be present in the completeness sets.

Frontend tests maintain the same 19-name catalog in the presentation configuration and assert that
each tool has:

- running and completed labels;
- a detailed-result presentation category;
- a deterministic successful summary;
- a safe empty or metadata-only state where applicable.

The safe generic renderer additionally ensures that a future structured result remains visible
while the completeness test forces the developer to add an intentional presentation.

## Files Expected to Change

Backend:

- `langgraph_orchestration/tool_schemas.py`
- `langgraph_orchestration/tool_executor.py`
- `langgraph_orchestration/tools.py`
- `service/conversations/conversation_compaction_service.py`
- focused tests under `tests/test_tool_error_safety.py` and a dedicated tool-contract test module

Frontend:

- `src/config/toolActions.js`
- `src/features/chat/ai-response-steps/stepUtils.js`
- `src/features/chat/ai-response-steps/ToolResultDetails.jsx`
- focused model/presentation tests beside those modules

Documentation:

- backend README tool-contract section
- relevant backend/frontend architecture or design documentation only where the contract boundary
  changes

## Testing Strategy

1. Establish a baseline for affected backend and frontend tests.
2. Add failing backend completeness tests for all 19 tools.
3. Add failing schema tests for valid, malformed, empty, and error results for each new contract.
4. Verify every bespoke tool emits its structured UI result.
5. Add failing frontend coverage for every presentation category and safe generic fallback.
6. Add focused renderer/component tests where existing test infrastructure supports them; keep
   pure normalization and summary logic outside JSX for direct Node testing.
7. Run targeted tests after each tool group, then backend/frontend regression gates, Ruff, Biome,
   ESLint, Python compilation, and the production frontend build.

## Security and Privacy

- No tool result may bypass canonical error sanitization.
- Unknown/malformed raw payloads are not echoed in errors.
- Retrieved VAMP memory and full skill instructions remain model-only.
- Query history is already user-scoped and bounded; the UI receives only the same ten entries
  available to the authenticated user's model context.
- Web-search URLs remain external links with the existing `noreferrer` behavior.
- The generic renderer displays only backend-approved `ui_result` data and applies a display bound.

## Compatibility and Migration

This development branch intentionally does not preserve obsolete tool contracts. No database or
Firestore migration is required. Stored timelines that already contain known structured results
continue to render. Malformed or unknown historical results use the safe generic presentation.

## Non-Goals

- Generating frontend code from Pydantic or JSON Schema.
- Consolidating timeout, cache, skill, and dispatch metadata into a new tool framework.
- Changing tool execution budgets, database queries, or provider behavior.
- Adding new agent tools.
- Displaying full VAMP memory or skill bodies in the UI.

## Acceptance Criteria

1. All 19 registered tools have explicit argument and result-contract coverage.
2. No registered tool result reaches the UI through an unvalidated success fallback.
3. Every tool produces a meaningful timeline summary and expandable presentation.
4. `retrieve_memory` UI/persisted results contain no retrieved memory text.
5. `get_query_history` UI results contain the same bounded entries supplied to the model.
6. Analysis, explain, table detail, index, database, and view results expose their useful
   structured fields rather than only a generic success sentence.
7. Empty and failure states render safely.
8. The stale `get_table_columns` frontend path is removed.
9. Focused and regression validation passes, with unrelated pre-existing failures reported
   separately.
