# Database querying and results

This guide describes supported database operations, SQL safety, saved-result contracts, and analysis/export semantics. It covers both human SQL-editor execution and agent queries. Source implementations remain authoritative for validation and effective limits.

## Connections and policy

Adapters support PostgreSQL, MySQL, SQL Server, and Oracle. Connection services validate supported connection formats and targets, maintain pools, synchronize authenticated session state, and expose database/schema/table discovery. PostgreSQL supports selecting a schema; other dialect behavior remains adapter-specific.

Connection entry points require hosts to resolve to globally routable addresses. Localhost, private-network databases, and socket destinations are rejected by the destination checks. `BLOCKED_DB_HOSTS` is an additional denylist, not a switch for disabling those checks. This restriction concerns user database connections, not the backend's own local Redis or Qdrant services.

Schema overview/refresh requires a named selected database. Index/foreign-key lookups and an uncached overview reject missing connection configuration before adapter work; an already cached overview can still be read without borrowing a connection. These boundaries keep unnamed databases out of the schema cache.

Human SQL uses `POST /api/v1/run_sql_query`; the agent uses `execute_query`. Execution rechecks SQL against the authenticated database dialect. DDL/DML and known file/network/sleep/admin functions are rejected, and unknown anonymous/user-defined calls fail closed outside the dialect-specific allowlist. A leading `SELECT` alone does not prove a query has no side effects. Tool schemas use the union of dialect allowlists as an early generic check; human queries, agent queries, and agent explain operations recheck against the active database dialect before adapter execution.

Application validation complements tenant-scoped least-privilege roles, restricted function execution, read-only transactions, TLS/network policy, and DBMS resource limits. Those deployment controls require separate verification. See [security findings](../security/findings.md).

| Source | Responsibility |
| --- | --- |
| [database_controller.py](../../back-end/controller/database_controller.py) | Authenticated HTTP execution and connection operations |
| [connection_manager.py](../../back-end/service/database/connection_manager.py) | Pool identity/lifecycle and in-flight work |
| [operations.py](../../back-end/service/database/operations.py) | Human-query execution and serialization |
| [ai_tool_executor.py](../../back-end/service/database/ai_tool_executor.py) | Agent database operations |
| [query_guards.py](../../back-end/service/database/query_guards.py) | Query session/deadline/cancellation controls |
| [query_result.py](../../back-end/service/database/query_result.py) | Shared positional snapshot and timeline projection |
| [adapters/](../../back-end/service/database/adapters/) | Per-DBMS connection, metadata, execution, and explain behavior |

## Execution and cancellation

Queries use effective request/settings limits and driver-specific deadlines. PostgreSQL/Oracle cancellation is best effort; unsupported driver paths must not claim that an application timeout stopped the underlying statement. SQL Server uses its configured execution deadline. Cancellation is checked after setup and before executing the user statement, with cursor/session cleanup on exit.

SQL Server uses the fixed `QUERY_TIMEOUT_SECONDS` driver setting even when a request asks for another timeout. Oracle's timeout applies to individual driver round trips, so it does not by itself bound the entire query-and-fetch workflow. Preserve requested/effective timeout metadata rather than presenting either as a universal wall-clock guarantee.

`get_table_row_counts(table_names=[...])` requests exact whole-table counts for 1–10 unique, unqualified tables in the active database/schema. It validates identifiers and executes a dialect-aware batch; the old singular tool is unsupported. Use multiple batches for more tables and `execute_query` for filtered counts. Each table contributes a 20-second database budget; the outer tool adds five seconds to the batch budget for error propagation and cleanup. A required database timeout that cannot be installed fails the operation.

`explain_query` obtains the database's non-ANALYZE explain representation. Explain formats and implementation differ by DBMS, so preserve adapter cleanup and privileges rather than assuming one dialect's statement applies everywhere.

## SQL snapshot contract

Editor results (`result`) and agent results (`tabular_result`, alongside the existing object `data`) share the version 1 snapshot contract. [query_schemas.py](../../back-end/api_contract/query_schemas.py) defines public result schemas; [query_result.py](../../back-end/service/database/query_result.py) owns encoding and provenance.

| Field | Meaning |
| --- | --- |
| `columns` | Unique internal column keys; duplicate display labels do not overwrite values |
| `rows` | Positional values aligned with ordered columns |
| `column_metadata` | Original labels, driver SQL types, precision/scale, timezone, encoding, Perspective type, and analysis semantics |
| `result_metadata` | Execution ID/time, noncredential source fingerprint, query hash, effective limit, returned rows, completeness/truncation, and timing |

Completeness refers to the submitted SQL output, not all rows in an underlying table. Unknown totals remain unknown. Source identity is derived from allowlisted connection identity fields and never includes a password or full credential-bearing DSN. Preserve explicit database/schema selections and the authenticated DB role when identifying the source.

### Value semantics

- Decimals and integers outside JavaScript's safe integer range are exact strings.
- Perspective integer columns are used only within int32; larger safe integers use floats with explicit aggregate-precision limitations.
- Exact string columns do not support exact numeric aggregation in Perspective. Separately labelled approximate numeric measures can be offered where conversion is useful.
- Date-only values preserve calendar-date semantics. Timestamps retain source ISO text and offsets; timezone-naive values acquire no invented timezone.
- Oracle driver-lost timezone information is reported as unavailable. Query cursors request Decimal for Oracle NUMBER values.
- Binary values use full hex; structured values preserve JSON/text semantics. Non-finite numbers must not produce invalid JSON. Unsupported values have explicit text semantics rather than silent numerical coercion.

The UI must retain labels and types when columns are duplicated, long, null-only, or replaced by another query. Do not infer types solely from the first non-null displayed value when canonical metadata exists.

## Persistence and history

Execution storage retains full results and metadata, including chunked results. `GET /api/v1/get_execution_result/{conversation_id}/{execution_id}` checks ownership and returns the allowed canonical fields; private internal fields remain excluded. Failed persistence must not publish an execution ID that claims the result can be reloaded.

Live/persisted chat timelines retain query identity, scope, and column metadata rather than full object and positional rows. `query_timeline_result` applies at tool publication and the conversation streaming boundary so alternate streamers cannot reintroduce full datasets into timelines. Inline tables load results by execution ID.

Bounded private model previews are described in [conversation evidence](conversations.md#evidence-across-turns). Their byte caps do not constitute aggregate query-result or Firestore storage limits; those remain separate backlog items.

## SQL workspace and analysis

SQL tabs and selected outputs are scoped to the conversation/session. Source changes invalidate stale query/viewer work; a late result from another query or connection must not overwrite the selected execution. A saved result can reopen its SQL and original snapshot without relabelling it as data from the current database.

Perspective sessions own their worker/table/viewer resources and discard stale asynchronous completions. Retry after worker/table/viewer failure or a timed-out action creates a fresh session. The chart renderer has an intentional library-wide worker until page teardown; React route navigation does not release it. Relevant ownership logic is in [perspectiveSession.js](../../front-end/src/features/sidebar-right/artifacts/data-visualization/perspectiveSession.js) and [perspectiveWorker.js](../../front-end/src/features/sidebar-right/artifacts/data-visualization/perspectiveWorker.js).

Diagnostics, precision caveats, and provenance appear in collapsed result details. Analysis configuration is scoped to user/source/query/schema identity. Preserve the distinction between the returned snapshot, the filtered/pivoted current view, and the full underlying database.

## Exports

[PerspectiveDashboard.jsx](../../front-end/src/features/sidebar-right/artifacts/data-visualization/PerspectiveDashboard.jsx) owns provenance-bearing exports. Current-view CSV and visualization exports include a metadata sidecar identifying source/execution, result completeness, and viewer configuration. Copy includes metadata with the current CSV view. A truncated result or filtered view must not be labelled a full-dataset export.

[DataVisualizationPanel.jsx](../../front-end/src/features/sidebar-right/artifacts/data-visualization/DataVisualizationPanel.jsx) also exports the source snapshot as CSV with metadata. That export preserves original canonical values; current-view CSV reflects active filters, pivots, and any approximate analysis measures.

The pinned viewer's duplicate raw export/copy controls are intentionally hidden so the application toolbar owns this contract. This is version-specific integration behavior; verify it before a Perspective upgrade. Keep exact source strings available even when analysis uses approximate measures.

## Regression coverage and limits

See [query-result contract tests](../../back-end/tests/test_query_result_contract.py), [execution-control tests](../../back-end/tests/test_query_execution_controls.py), frontend query/result/session tests, and the [Perspective browser fixtures](../../front-end/tests/fixtures/). They cover duplicate/type/null values, source changes, stale results, retries, exports, and installed Perspective behavior with controlled data.

Live DBMS timeout/TLS behavior, real Firestore persistence limits, sustained memory/load costs, and production query execution still need staging evidence. Storage byte ceilings and conversation growth remain in the [engineering backlog](../product.md#engineering-backlog).
