# Conversations and agent execution

This guide describes conversation identity, streamed execution, history loading, runtime skills, and reusable tool evidence. [Architecture](../architecture.md) explains module boundaries; [product scope](../product.md#engineering-backlog) tracks remaining lifecycle guarantees.

## Identity and request flow

Conversation IDs are canonical UUIDs and every access checks the authenticated owner. Model/provider selection is authorized before expensive work. The controller resolves run policy, applies quota/provider admission, and delegates to the conversation streaming service and LangGraph orchestration.

| Source | Responsibility |
| --- | --- |
| [conversations_controller.py](../../back-end/controller/conversations_controller.py) | Chat/resume admission, history/results, conversation management |
| [conversation_streaming_service.py](../../back-end/service/conversations/conversation_streaming_service.py) | Persisted turns/timeline, SSE translation, private evidence handling |
| [stream_conversation.py](../../back-end/langgraph_orchestration/stream_conversation.py) | Graph lifecycle and provider interaction |
| [run_context.py](../../back-end/service/conversations/run_context.py) | Immutable effective run policy |
| [streaming.py](../../back-end/api_contract/streaming.py) | Declared SSE models |
| [useMessageStreaming.js](../../front-end/src/hooks/chat-page/useMessageStreaming.js) | Browser stream handling |

Chat uses `POST /api/v1/pass_user_prompt_to_llm`; supported interrupted runs resume through `POST /api/v1/resume_agent`. SSE carries JSON `data:` frames and transport heartbeat comments. Content, thinking, tools, usage, task state, interruption, and terminal failures are distinct observations. A heartbeat is not model output or durable completion.

The outer run policy and fenced lease/checkpoint generation must describe the same effective execution. Resume activates a verified copied generation rather than a partially reconstructed checkpoint. Full command idempotency, protected-action reservation, cross-continuation budget enforcement, and recoverable terminal durability remain outstanding verification/remediation targets.

## Models and task modes

`GET /api/v1/llm/options` exposes the authorized provider/model catalog and capabilities. The composer and Settings share capability-aware Low/Medium/High reasoning values. Unknown/unsupported capabilities must not advertise reasoning support. On the supported disabled-reasoning path, the effective effort is Low, not a promise of zero reasoning. Do not advertise fixed token allocations unsupported by the provider contract.

Task mode controls agent workflow budgets independently of reasoning effort. The frontend maps `auto` to `normal` on the wire; the backend may classify a normal request upward before resolving the immutable policy. Explicit Standard and Auto cannot be distinguished in every request path. Changes to model/effort while streaming apply to a subsequent request, not to the already-running response.

## History pagination and scrolling

`GET /api/v1/get_conversation/{conversation_id}` supports optional `limit` (1–100) and a bounded opaque `before` cursor. Omitting both retains the legacy full-history response. Supplying only `before` uses a page size of 30. The response includes `pagination.has_more` and `pagination.before` when pagination is requested.

[page_messages](../../back-end/service/conversations/conversation_history.py) anchors cursors to an exclusive absolute array position and the conversation ID. New appends do not move earlier page boundaries. Message IDs use stable conversation/array-position identity. Invalid, cross-conversation, or out-of-range cursors are rejected; a cursor does not replace ownership authorization.

This pages responses over the existing Firestore message array. The repository still reads the full document internally; it does not implement storage-level pagination or solve Firestore document growth.

[useConversations](../../front-end/src/hooks/chat-page/useConversations.js) scopes history state to the chat session, prevents concurrent duplicate page requests, cancels stale requests, and deduplicates prepended messages without replacing the live response. [useHistoryScroll](../../front-end/src/hooks/chat-page/useHistoryScroll.js) loads older messages near the top and preserves a visible anchor before paint. [useAutoScroll](../../front-end/src/hooks/chat-page/useAutoScroll.js) follows streaming output only while the reader is near the bottom. Preserve existing message DOM identity and suppress history-entry animation on prepend.

## Tool contracts and disclosure

Registered tools, argument schemas, and result schemas must match exactly. Arguments reject undeclared fields; successful raw results require their core fields and must pass the corresponding result model. Unknown or malformed results become `TOOL_RESULT_INVALID`; they must not become successful raw evidence.

[ToolExecutor](../../back-end/langgraph_orchestration/tool_executor.py) and [tool_schemas.py](../../back-end/langgraph_orchestration/tool_schemas.py) own the boundary. Bespoke skill, web-search, query-history, and UI-action emitters use the same structuring rules. Analysis variants, table details, indexes, foreign keys, views, query history, and web citations retain typed useful fields.

UI and model projections have different disclosure rules:

- Retrieved VAMP memory text is untrusted model reference data; UI/timeline results contain lookup metadata rather than the memory body.
- Skill bodies stay in model context; the UI receives skill metadata.
- Query rows live in execution storage. Tool timelines retain execution identity, scope, and column metadata; inline tables fetch results by execution ID.
- Private `model_evidence` can be persisted alongside completed tool steps, but is omitted from UI SSE and conversation GET responses.
- Frontend tool presentation uses an exact registered-tool catalog plus separate lifecycle actions. A bounded generic renderer supports unknown historical structured results without raw HTML. It strips legacy `retrieve_memory.memories` before display.

See [database results](database-querying.md#sql-snapshot-contract) for the shared query representation.

## Evidence across turns

[tool_evidence.py](../../back-end/langgraph_orchestration/tool_evidence.py) creates extractive structured evidence rather than another model-generated summary. Small complete query previews and scalar aggregates retain exact values. Larger results are bounded by rows, cells, nesting, collections, and bytes, with explicit completeness/omission information and saved execution IDs.

The per-result evidence budget is 6 KiB. Historical prompt evidence has a shared 16 KiB ceiling including escaping/envelope overhead, further reduced by the active context budget. Token accounting and summary inputs include the bounded evidence. Historical results describe the earlier execution, not current live rows.

Legacy schema timelines can restore facts already present in their results. Missing legacy SQL previews are never invented. History reconstruction excludes the current persisted user entry by turn position/identity before appending the request once; earlier intentionally repeated prompts stay in history.

Complete metadata results can be reused within the same authenticated user, conversation, and connection/schema scope: at most 16 entries with a five-minute TTL. Eligible tools are `get_schema_overview`, `get_table_details`, `get_table_indexes`, `get_foreign_keys`, and `list_views`. Queries, row counts, connection status, errors, partial evidence, and unknown source identity are excluded.

Connection/database changes rotate the evidence generation without changing pool identity. `refresh=true` on metadata tools invalidates earlier cached metadata and establishes a durable refresh boundary. A source change must never import facts from a previous database connection into the new scope.

## Runtime skills

[skill_registry.py](../../back-end/skills/skill_registry.py) discovers and validates four `SKILL.md` assets in database-querying, query-history, react-flow-diagram, and web-research directories. Their metadata and bodies are application inputs. Invalid assets fail closed; do not relocate them during documentation maintenance.

When connected, database-querying is preloaded with its actual instructions and advertised as loaded. Other skills retain their activation prerequisites. A label claiming activation without loading the body is insufficient. Retrieved web/database content and skill-triggering model output do not replace server authorization.

## Frontend session and output behavior

The composer, searchable model/effort picker, database/schema context bar, transcript, and output/artifact views share the existing session model. Guard Enter during IME composition, preserve Shift+Enter/slash-command behavior, and restore failed prompts without overwriting another session or newer draft.

Completed SQL, diagram, and query-result outputs derive from conversation history. Manually opened results and selection are scoped to the stable chat session. SQL tabs survive supported dashboard navigation/cache restoration. Opening a saved execution preserves its original source and query; the currently connected database must not be substituted as its provenance.

Editor-state restoration does not retain every result in browser memory. Inactive-tab results and artifact rows can be released on close or session cleanup while SQL text and tab metadata remain; the UI distinguishes a released cached result from an empty query result.

Inline results and output selectors open the same saved execution with loading, empty, error, and retry states. Fullscreen/close restores focus. Avoid adding a second composer or unsupported branch/share/regenerate actions as presentation-only changes.

## Regression coverage

Relevant backend modules include [history tests](../../back-end/tests/test_conversation_history.py), [tool-result contracts](../../back-end/tests/test_tool_result_contracts.py), [tool evidence](../../back-end/tests/test_tool_evidence.py), and [stream terminal contracts](../../back-end/tests/test_conversation_streaming_terminal_contract.py). Frontend history, streaming, composer, and artifact tests live beside their modules, with a [history-scroll fixture](../../front-end/tests/fixtures/history-scroll.jsx). These fixtures do not establish live provider/database or production durability guarantees.
