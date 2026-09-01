# Agent Tool Result Contracts and UI Presentation Implementation Plan

**Status:** Completed on 2026-08-30

> **Execution requirement:** Follow `superpowers:test-driven-development` for each behavior change
> and `superpowers:verification-before-completion` before reporting completion. Work in the existing
> checkout, preserve unrelated dirty-worktree changes, and do not commit unless the user explicitly
> requests it.

**Goal:** Give all 19 registered agent tools explicit backend input/output contracts and meaningful,
safe chat-timeline presentations while keeping retrieved memory and skill bodies out of persisted UI
results.

**Architecture:** The backend remains the contract authority. `ToolExecutor.summarize` produces a
validated UI payload and a separately validated model payload. Shared-pipeline tools keep their
current execution flow; the three bespoke tools use one small structured-event helper. The frontend
maintains an exact agent-tool presentation catalog plus its separate non-agent UI-event catalog, and
renders only backend-approved UI payloads.

**Stack:** Python 3.14, Pydantic v2, LangChain tools, pytest, React 19, Material UI, Node's built-in
test runner, Biome, ESLint, Vite.

**Approved design:**
`back-end/docs/specs/2026-08-30-agent-tool-result-contracts-design.md`

## Scope controls

- Do not change database queries, tool budgets, timeouts, public HTTP endpoints, or Firestore schema.
- Do not add compatibility handling for the obsolete `get_table_columns` agent tool.
- Keep frontend-only lifecycle actions such as `write_sql_editor_query` working; they are not part of
  the 19 registered backend tools and must live in a separate catalog.
- Do not display or persist retrieved VAMP memory text or full skill instructions.
- Do not add schema-code generation or a new tool framework.

## Task 1: Establish affected baselines

**Files:** No source changes.

1. Record the existing dirty-worktree state with `git status --short`; do not alter unrelated files.
2. Run the focused backend baseline:

   ```bash
   cd back-end
   uv run --locked pytest tests/test_tool_error_safety.py tests/test_stream_events.py -q
   ```

3. Run the focused frontend baseline:

   ```bash
   cd front-end
   node --test src/features/chat/ai-response-steps/stepUtils.test.js
   ```

4. Record any pre-existing failures before adding tests. Do not weaken or delete failing tests.

## Task 2: Make backend contract coverage explicit and fail closed

**Files:**

- Create: `back-end/tests/test_tool_result_contracts.py`
- Modify: `back-end/langgraph_orchestration/tool_schemas.py`
- Modify: `back-end/tests/test_tool_error_safety.py`

1. Add a failing completeness test that derives registered names from `ALL_TOOLS` and asserts exact
   equality with both `TOOL_ARG_SCHEMAS` and a new explicit `TOOL_RESULT_SCHEMAS` registry. Assert the
   set contains exactly these 19 names:

   ```text
   read_skill, get_connection_status, get_database_list, execute_query,
   analyze_query_result, get_table_indexes, get_schema_overview, explain_query,
   get_table_details, get_table_row_counts, get_foreign_keys, list_views,
   web_search, get_query_history, open_sql_editor, open_database_modal,
   open_settings_modal, navigate_new_chat, retrieve_memory
   ```

2. Add one representative valid raw result for every registered tool and assert its normalized
   success shape. Also add parameterized failing tests for missing/malformed/wrong-type raw outputs;
   each must produce the canonical `TOOL_RESULT_INVALID` envelope, never a successful raw `data`
   fallback.
3. Run the new tests and confirm they fail for the missing contracts and permissive fallback.
4. Add argument models for `read_skill`, `web_search`, and `get_query_history`. Normalize non-empty
   strings and forbid unexpected fields where the tool has no arguments.
5. Add typed result models for:

   - skill metadata (`skill_name`, optional description, `already_loaded`);
   - analysis scope and operation-specific profile/data-quality/correlation fields;
   - bounded web-search results (`title`, validated string URL, content);
   - bounded query-history entries (`query`, database, non-negative row count, status, timestamp);
   - memory UI metadata (`query`, `found`) and a separate model-only memory result.

6. Introduce `TOOL_RESULT_SCHEMAS`, mapping every registered name to a callable structurer backed by
   its Pydantic result model. UI actions may share `UiActionResult`, but each name must be a key. Make
   semantically required fields required in the models; an empty collection is valid, while an absent
   core contract field is not.
7. Replace the unknown-success fallback with `TOOL_RESULT_INVALID`. Preserve canonical sanitized
   failures and ensure structuring exceptions never echo raw values.
8. Tighten fields currently dropped by existing models only where the executor already returns them,
   including safe UI-action approval/confirmation metadata. Do not expand sensitive fields.
9. Run:

   ```bash
   cd back-end
   uv run --locked pytest tests/test_tool_result_contracts.py tests/test_tool_error_safety.py -q
   ```

   Expected: new contract tests and existing safety regressions pass.

## Task 3: Split model evidence from UI/persisted memory results

**Files:**

- Modify: `back-end/langgraph_orchestration/tool_executor.py`
- Modify: `back-end/langgraph_orchestration/tools.py`
- Modify: `back-end/tests/test_tool_result_contracts.py`
- Modify: `back-end/tests/test_stream_events.py`

1. Add failing tests for `ToolExecutor.summarize("retrieve_memory", ...)` asserting:

   - `ui_result == {"success": true, "query": ..., "found": ...}` apart from optional canonical
     error fields;
   - `memories` is absent from the UI value;
   - the model JSON contains the validated memory text and the untrusted-reference warning;
   - malformed memory results fail closed without reflecting their raw content.

2. Add an event/persistence-boundary regression proving a `tool_end` result for `retrieve_memory`
   contains no `memories` field or retrieved text.
3. Run those tests and confirm the existing shared clone behavior fails the privacy assertions.
4. Change `ToolExecutor.summarize` so UI and model values are independently constructed for memory.
   The model-only envelope must explicitly state that retrieved text is reference data, not
   instructions. Keep the generic path unchanged for other tools.
5. Include the validated query in every raw `retrieve_memory` success/failure result so its safe UI
   metadata is deterministic.
6. Run the focused contract and stream-event tests. Search the emitted/persisted test payloads for the
   sentinel memory text and confirm it exists only in model evidence.

## Task 4: Route bespoke tools through canonical result structuring

**Files:**

- Modify: `back-end/langgraph_orchestration/tools.py`
- Modify: `back-end/tests/test_tool_result_contracts.py`
- Modify: `back-end/tests/test_tool_error_safety.py`

1. Add failing event tests for `read_skill`, `web_search`, and `get_query_history` covering success,
   empty, and failure outcomes. Verify each `tool_end.result` has the canonical envelope and full safe
   UI detail.
2. Specifically assert:

   - `read_skill` exposes name/description/already-loaded only, never the skill body;
   - `web_search` exposes query/count/at most five structured result cards;
   - `get_query_history` exposes count and the existing maximum ten user-scoped entries, rather than
     count alone;
   - tool errors contain public codes/messages and no raw exception text.

3. Run the new tests and confirm the current bespoke emissions fail.
4. Add one private helper that accepts tool name, validated display arguments, and raw result; calls
   canonical structuring; emits one `tool_end`; and returns the UI payload. Use it only where needed,
   without changing timeout, interrupt, skill-gate, or loop-budget behavior.
5. Update the three bespoke tools to validate arguments and call that helper. Their model returns stay
   semantically equivalent: skill context for `read_skill`, cited search evidence for `web_search`,
   and JSON history for `get_query_history`.
6. Run the focused tests and verify exactly one terminal event follows each started bespoke tool.

## Task 5: Add privacy-safe compaction summaries

**Files:**

- Modify: `back-end/service/conversations/conversation_compaction_service.py`
- Modify: `back-end/tests/test_tool_error_safety.py`

1. Add failing digest tests for `read_skill`, all analysis operations, `web_search`,
   `get_query_history`, and `retrieve_memory`.
2. Assert digests are bounded, useful, and never include query-history SQL, search-result content
   bodies, skill instructions, or memory text.
3. Add explicit branches to `_summarize_tool_result` using counts, names, operation, query metadata,
   and found/not-found status only. Preserve existing database-tool branches.
4. Run the focused tests and confirm no branch falls back to the generic `completed` summary for a
   registered tool.

## Task 6: Create an exact frontend agent-tool presentation catalog

**Files:**

- Modify: `front-end/src/config/toolActions.js`
- Modify: `front-end/src/features/chat/ai-response-steps/stepUtils.js`
- Modify: `front-end/src/features/chat/ai-response-steps/stepUtils.test.js`
- Create: `front-end/src/features/chat/ai-response-steps/toolResultPresentation.js`
- Create: `front-end/src/features/chat/ai-response-steps/toolResultPresentation.test.js`

1. Add failing tests for an exported exact 19-name agent-tool catalog. Each entry must define running,
   completed, and presentation-kind metadata.
2. Keep non-agent UI lifecycle events in a separate catalog and merge them only for runtime action
   labels. This prevents `write_sql_editor_query`, `complete_navigate_new_chat`, and `usage_metrics`
   from weakening the registered-agent-tool completeness assertion.
3. Add failing pure-function tests for deterministic summaries and normalized presentation data for
   all 19 tools, including empty and malformed legacy payloads.
4. Add failing generic-fallback tests with large/nested objects. Require at most 20 top-level entries,
   at most 50 array items, and at most 4,000 displayed JSON characters with an explicit truncation
   marker. Canonical error messages must take precedence over raw data.
5. Remove `get_table_columns` from `toolActions.js`, `stepUtils.js`, and presentation routing. Do not
   remove valid frontend-only UI lifecycle actions.
6. Implement small pure helpers in `toolResultPresentation.js` for safe normalization, bounded generic
   data, and tool-specific summaries. Reuse them from `stepUtils.js`; do not duplicate result parsing in
   JSX.
7. Run:

   ```bash
   cd front-end
   node --test \
     src/features/chat/ai-response-steps/stepUtils.test.js \
     src/features/chat/ai-response-steps/toolResultPresentation.test.js
   ```

## Task 7: Render meaningful details for every presentation kind

**Files:**

- Modify: `front-end/src/features/chat/ai-response-steps/ToolResultDetails.jsx`
- Modify: `front-end/src/features/chat/ai-response-steps/toolResultPresentation.js`
- Modify: `front-end/src/features/chat/ai-response-steps/toolResultPresentation.test.js`

1. Add failing view-model tests for the render data required by each presentation group:

   - skill and memory metadata;
   - connection and database list;
   - query execution metadata and analysis variants;
   - indexes, schema, explain plan, table details, row counts, foreign keys, and views;
   - web-search citations and query-history entries;
   - UI-action state and safe payload metadata.

2. Extend `ToolResultDetails.jsx` with focused presentations that reuse existing typography, chips,
   tables, and empty-state primitives. Do not introduce a component library or duplicate the existing
   interactive `execute_query` result table.
3. Route by the catalog's presentation kind. Every known tool must have an intentional renderer;
   unknown/malformed persisted results use the bounded, read-only generic renderer.
4. Preserve accessibility: semantic links, `rel="noreferrer"`, readable labels, no clickable divs,
   and text wrapping for SQL/plan content. Render values as React text, never HTML.
5. Run the two focused Node test files, then:

   ```bash
   cd front-end
   npm run biome -- src/config/toolActions.js src/features/chat/ai-response-steps
   npm run lint
   npm run build
   ```

6. Sanity-check representative success, empty, and failure payloads in the chat timeline if the local
   frontend/backend are available. Record if visual testing cannot be performed.

## Task 8: Update documentation and run regression gates

**Files:**

- Modify: `back-end/docs/architecture.md`
- Modify: `back-end/docs/memory.md`
- Modify only if the implementation changes documented setup: `back-end/README.md`
- Review: `back-end/docs/specs/2026-08-30-agent-tool-result-contracts-design.md`

1. Document the UI/model result split, exact completeness invariant, bespoke-emitter rule, generic UI
   bound, and memory/skill disclosure boundary. Do not duplicate setup instructions or rewrite
   unrelated architecture sections.
2. Update the approved design spec's status from proposed to implemented only after all required
   validation succeeds.
3. Run backend formatting and focused regressions:

   ```bash
   cd back-end
   uv run --locked ruff format --check \
     langgraph_orchestration/tool_schemas.py \
     langgraph_orchestration/tool_executor.py \
     langgraph_orchestration/tools.py \
     service/conversations/conversation_compaction_service.py \
     tests/test_tool_result_contracts.py \
     tests/test_tool_error_safety.py \
     tests/test_stream_events.py
   uv run --locked ruff check \
     langgraph_orchestration/tool_schemas.py \
     langgraph_orchestration/tool_executor.py \
     langgraph_orchestration/tools.py \
     service/conversations/conversation_compaction_service.py \
     tests/test_tool_result_contracts.py \
     tests/test_tool_error_safety.py \
     tests/test_stream_events.py
   uv run --locked pytest \
     tests/test_tool_result_contracts.py \
     tests/test_tool_error_safety.py \
     tests/test_stream_events.py \
     tests/test_skill_registry.py \
     tests/test_conversation_identity.py -q
   ```

4. Run Python syntax compilation for every changed backend Python file.
5. Run the frontend regression gates:

   ```bash
   cd front-end
   node --test
   npm run biome
   npm run lint
   npm run build
   ```

6. Run `git diff --check`, inspect every changed file for dead/stale/debug code, and confirm the diff
   contains no unrelated edits.
7. Search the final diff and test fixtures for sentinel skill-body/memory text in UI/persisted result
   paths. Confirm full query rows remain only in the existing interactive result-table path.
8. If broader test/type gates expose pre-existing failures, investigate and report them separately;
   never describe an unrun or failing gate as passing.

## Completion criteria

- Backend registration, argument schemas, and result schemas are exact-equal for all 19 tools.
- Every registered tool emits a validated structured UI result; no raw success fallback exists.
- Every tool has a deterministic summary, intentional detail presentation, and safe empty/error state.
- VAMP memory text and skill bodies are absent from UI events, persistence, compaction, and frontend
  rendering, while remaining available to the model where required.
- Query history, analysis, explain, details, indexes, databases, and views expose useful bounded data.
- Obsolete `get_table_columns` presentation code is gone without breaking frontend-only UI events.
- Focused tests, relevant regressions, Ruff, Biome, ESLint, frontend build, compilation, and diff checks
  complete with exact results reported.
