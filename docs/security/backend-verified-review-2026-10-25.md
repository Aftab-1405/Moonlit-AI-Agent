# Verified backend behavior review — 2026-10-25

## Executive summary

The coordinated review confirmed **37 root-cause findings: 1 High (P1), 33 Medium (P2), and 3 Low (P3)**. Every confirmed finding below has an executable specialist reproduction and an independent coordinator rerun against the recorded working tree. The strongest effects are an authenticated Oracle destination-validation bypass, conversation data reappearing after deletion, retained checkpoints, lost partial responses on disconnect, effective database selections differing from driver settings, and incorrect resource/budget accounting. These are local, synthetic reproductions of application behavior, not observed customer incidents. Total and partial embedding failures (prior F24/F25) are consolidated into F24 because both lose the failed-work signal before the same retry state machine; their different consequences and executable evidence are preserved.

Prioritize the Oracle destination boundary (F12), deletion/write fencing and checkpoint cleanup (F33/F32), abort persistence and cleanup (N01/F01/F02), and selected-database fidelity (F14/F23/F21). Long canonical transcripts also need bounded storage records (F37). Other findings cover incorrect metadata, settings races, retry state and measured worker blocking/buffering. Proposed remediation is **not implemented or validated as a fix**; application code and existing tests were not changed.

This review revisits [the earlier source report](backend-source-review-2026-10-25.md) as leads, without importing its confidence labels. F08's earlier zero-defaults explanation was corrected: installed SlowAPI reads the environment default, but the undecorated route still does not enforce it. F29 is narrowed to actual ReAct **resume** evidence; generic StateGraph excess-step figures are not ordinary ReAct claims. F31 is Medium, based on the measured synthetic worker stall. The PostgreSQL DSN-selection extension is withdrawn by its passing control; PostgreSQL composite-FK behavior remains unverified. N01 is newly reproduced partial-history loss. Early ReAct segment termination (N02) remains unverified at the realistic application-workflow level.

## Review coverage and snapshot

Reviewed commit: **`c139e11c8fc2c07b36d5525646c46117ab4c131c` plus the existing staged and unstaged working tree**, not clean HEAD. The initial inventory records **304 dirty Git entries**, including 127 under `back-end/`. There were no applicable repository/ancestor AGENTS.md files found. No checkout, commit, application remediation, or external deployment was performed.

[snapshot.json](review-evidence-2026-10-25/snapshot.json) preserves the complete initial porcelain status and SHA-256 hashes of 185 backend source/config/test/dependency files, including **124 production Python files**. [snapshot-verification.json](review-evidence-2026-10-25/snapshot-verification.json) records the final comparison. Reproductions and this report are isolated under `docs/security/`; the earlier report is preserved. The coordinator mapped architecture/ownership, inspected submitted findings and callers, challenged safeguards, reran probes, and consolidated results; substantive review was delegated, not duplicated as a standalone coordinator review.

| Specialist | Assigned files | Owned components and boundaries |
|---|---:|---|
| API/services/infrastructure | 54 | `main`, configuration/composition/router, dependencies, controllers, API contracts, core middleware/auth/erasure/audit; context/settings/dashboard/quota and HTTP streaming business services |
| Database/persistence | 22 | Four SQL adapters, connection parsing/security/pools, query execution and guards, metadata tools, result encoding, Firestore/context/usage repositories |
| Graph/providers/memory | 48 | LangGraph state/checkpoints/leases/routing/streaming/tools, Bedrock/model/token/limiter layer, VAMP/Qdrant memory, conversation persistence/history/compaction/deletion bridges |

The three reviewers worked concurrently with no recursive delegation. [assignments.json](review-evidence-2026-10-25/assignments.json) lists each file and its single primary owner. All assigned files received source inspection; depth varied, with detailed execution-path review around findings and targeted inspection of adjacent helpers. This is not exhaustive branch or dynamic coverage. Cross-layer issues have one root-cause owner: API owns admission/refund/HTTP cleanup; graph owns limiter internals/checkpoints/compaction; database owns driver/session selection and metadata fidelity. N01 and F01 require separate cleanup changes, despite sharing the disconnect trigger.

Actual entry points: `main:create_app` mounts the authentication router and `api_router.combined_router` under `/api/v1`. Protected routes use Firebase session dependencies; mutating requests pass CSRF middleware. Database handlers call threadpool-backed services and pool adapters; session state is Redis-backed with a testing/development in-memory path. Chat/resume call the streaming service, LangGraph ReAct graph, Bedrock and tools; Firestore owns canonical history; Redis owns production checkpoints/limits; optional VAMP uses Firestore summary blocks, Bedrock embeddings and Qdrant. These actual registrations and caller paths were inspected before accepting findings.

Each specialist invoked the available **`fastapi-code-review`** skill (the requested `/fast-api-code-review` workflow) by reading `/home/aftab-1405/.codex/skills/fastapi-code-review/SKILL.md` and its four reference guides before review. Their per-finding route/decorator/signature/auth/validation/blocking gates are retained in the coverage appendix below. **Skill limitation:** its required linked `/home/aftab-1405/.codex/skills/review-verification-protocol/SKILL.md` is missing. That companion could not be invoked and was not used; the available skill's own gates and the user's independent-reproduction requirements were applied. This is an explicit workflow limitation, not a claim of using the missing protocol.

Material exclusions: no production resources, dotenv or credential-store inspection, live Firebase/Firestore/Redis/Bedrock/Qdrant/SQL connections, deployed egress/TLS/proxy policies, cloud billing, or broad frontend audit. Frontend tab-ID callers were checked only for reachability. Provider failure fixtures prove application handling of those outcomes, not that a live provider produced them. Installed driver/LangGraph behavior was exercised where stated. No broad regression-suite result from the earlier report is claimed as a fresh run here.

## Reproduction setup and interpretation

Use the exact recorded working tree and installed backend environment. [environment.json](review-evidence-2026-10-25/environment.json) records Python **3.14.4**, FastAPI **0.141.1**, Starlette **1.6.0**, Pydantic **2.13.5**, LangGraph **1.2.11**, langchain-aws **1.7.4**, and all relevant SDK/driver versions. From repository root run `mkdir -p /tmp/moonlit-review-20261025`, then the commands listed per finding or in the [evidence README](review-evidence-2026-10-25/README.md). Scripts set testing configuration and disable dotenv before imports, use only synthetic local fixtures, and redirect logs to `/tmp`.

The probes assert **current defective behavior**: exit 0 means the reproduction succeeded, not that the application passed regression validation. Each proposed regression below describes assertions to invert/add after a fix. Real functions/classes and ASGI responses are used, with clearly stated external-boundary substitutions. Database route probes use inline threadpool dispatch for functional checks; API drivers use a local 5ms scheduling timer to avoid a sandbox selector wakeup hang. Neither fixture proves production throughput. Initial failed/hung attempts are not counted as successful evidence. The final stable probes completed successfully in this environment.

[verification.json](review-evidence-2026-10-25/verification.json) maps every confirmed ID to the exact independently rerun command, exit status, script/output fingerprints and limitations. Captured coordinator `.out` files are separate from specialist outputs; they are the authoritative rerun evidence, including measured timings. Timing/protobuf details can vary slightly between runs. Synthetic latency/burst measurements are not live-service benchmarks. All user stories below are **illustrative scenarios supported by reproduction, not customer incidents**.

## Confirmed findings

| ID | Severity | Finding | Primary reviewer |
|---|---|---|---|
| F12 | P1 / High | Oracle failover DSN bypasses destination validation | Database |
| F33 | P2 / Medium | Compaction finishing after deletion recreates parent, summary and vectors | Graph/providers |
| N01 | P2 / Medium | Disconnect loses already-delivered partial assistant history | API/services |
| F32 | P2 / Medium | Ordinary conversation deletion leaves actual checkpoint transcript data | Graph/providers |
| F37 | P2 / Medium | Canonical message appends exceed the single-document storage bound | Graph/providers |
| F14 | P2 / Medium | MySQL and SQL Server DSNs override the selected database | Database |
| F23 | P2 / Medium | selecting an Oracle owner does not set the query's current schema | Database |
| F21 | P2 / Medium | metadata uses account context while borrowing the session's different connection | Database |
| F29 | P2 / Medium | Actual ReAct resume adds checkpoint progress to its fresh allowance twice | Graph/providers |
| F30 | P2 / Medium | Tool limit ignores the resolved policy and admits21 when configured20 | Graph/providers |
| F31 | P2 / Medium | Async compaction synchronously blocks the worker loop on document reads | Graph/providers |
| F20 | P2 / Medium | EXPLAIN omits the selected PostgreSQL schema | Database |
| F16 | P2 / Medium | closing a MySQL pool abandons an outstanding borrow | Database |
| F10 | P2 / Medium | Failed disconnect deletes its retry configuration | API/services |
| F01 | P2 / Medium | SSE disconnect interrupts limiter release | API/services |
| F02 | P2 / Medium | Cancellation while waiting for model admission leaves quota charged | API/services |
| F27 | P2 / Medium | Cancellation after Redis commit leaks an unowned concurrency reservation | Graph/providers |
| F28 | P2 / Medium | Aggregate concurrency expires while supported requests are still running | Graph/providers |
| F24 | P2 / Medium | Embedding failures bypass retry eligibility and bounded backoff (includes prior F25) | Graph/providers |
| F26 | P2 / Medium | Idempotent summary replay schedules duplicate indexing | Graph/providers |
| F06 | P2 / Medium | Concurrent independent settings patches overwrite each other | API/services |
| F07 | P2 / Medium | Rejected settings write is returned as success and mirrored into session | API/services |
| F05 | P2 / Medium | A second browser tab disconnects the active first tab | API/services |
| F09 | P2 / Medium | Middleware errors omit CORS for an allowed frontend | API/services |
| F11 | P2 / Medium | Login infrastructure failure is mislabeled invalid credentials | API/services |
| F13 | P2 / Medium | failed selection is saved and returned as connected | Database |
| F17 | P2 / Medium | Oracle BLOBs fail the query serializer | Database |
| F18 | P2 / Medium | Oracle composite foreign keys become a cross product | Database |
| F19 | P2 / Medium | Oracle nullable columns are reported as required | Database |
| F22 | P2 / Medium | SQL Server introspection merges same-name tables across schemas | Database |
| F03 | P2 / Medium | Bulk schema deletion counts failed deletions as cleared | API/services |
| F08 | P2 / Medium | Configured default HTTP limits are not enforced on undecorated routes | API/services |
| F15 | P2 / Medium | default SQL Server row counts query the public schema | Database |
| F34 | P2 / Medium | Heartbeat producer consumes an unbounded queue | API/services |
| F04 | P3 / Low | Administrative metrics reset blocks the event loop | API/services |
| F35 | P3 / Low | Cache timestamps are normalized incorrectly | API/services |
| F36 | P3 / Low | Oracle error-code patterns cannot match lowercased input | API/services |

### [F12] [P1 / High] Oracle failover DSN bypasses destination validation

**User story — illustrative scenario:**

> As an operator restricting database connections to public destinations, when I allow an authenticated user to submit an Oracle failover DSN, I expect every effective destination to be checked, but instead a loopback failover destination reaches the driver configuration unchecked, causing a bypass of the intended destination boundary.

**Location:** back-end/service/database/connection_handlers.py:674-690 — connect_remote_oracle; back-end/service/database/adapters/oracle_adapter.py:122-148 — create_connection_pool.

**Defect and root cause:** `service/database/connection_handlers.py:674-690`, `connect_remote_oracle`, extracts and validates only the prefix before the first colon/slash. `OracleAdapter._parse_connection_string`, `adapters/oracle_adapter.py:74-101`, preserves the rest of the DSN, and `create_connection_pool:122-148` forwards it intact to oracledb. The driver supports additional host destinations after the first host's port. `_resolve_public_host:48-56` correctly rejects private addresses **when asked about them**; it is never asked about the later host.

**Concrete example:** An authenticated app user submits `POST /api/v1/connect_db` with `{"db_type":"oracle","connection_string":"review/test@8.8.8.8:1521,127.0.0.1:1521/ORCL"}`. Gate C passes the request model. The service validates only public `8.8.8.8`, while the real installed driver's parser sees public and loopback destinations. If the first destination fails, the configured failover includes a server-local destination. Authentication is a prerequisite; this is not an unauthenticated exploit.

**Reproduced proof:** Command `back-end/.venv/bin/python -u docs/security/review-evidence-2026-10-25/db_reproductions.py`, case `oracle_failover_destination_bypass`, actually prints `http_status:200`, `validated_hosts:["8.8.8.8"]`, `actual_driver_parsed_hosts:["8.8.8.8","127.0.0.1"]`. Controls: the same request without authentication returns 401, and a private-only Oracle DSN returns 400. Actual handler/model/service/adapter and actual `oracledb.ConnectParams.parse_connect_string` are used. The network-opening pool factory is replaced with a capture; there is **no claim that a local Oracle service was reached or authenticated**. Expected behavior is reject before pool creation if any effective destination is private, consistent with the explicit SSRF policy in `_validate_host` and config `BLOCKED_DB_HOSTS` at `config.py:411-412`.

**Severity rationale:** P1 because an ordinary authenticated caller can bypass an explicit server-network boundary and cause a DB driver to be configured for private/loopback TCP destinations. Server availability, egress restrictions, actual failover order/timeouts, and DB listener credentials constrain exploitation. This does not prove HTTP metadata extraction, arbitrary SQL access, or arbitrary protocol responses.

**Remediation:** Until every Oracle Easy Connect/descriptor option can be validated and pinned, reject multi-destination/proxy/descriptor syntax and accept one strict host/port/service grammar; resolve and validate that exact host and build the driver parameters from the validated values. Alternatively parse with the driver, validate **every** host/proxy endpoint, and pass the canonical validated parameters rather than the original string. Pseudocode: `params=parse_driver_dsn(dsn); for host in all_effective_destinations(params): require_public_and_pin(host); create_pool(params=canonical_params)`. This removes the parser-prefix mismatch. 

**Regression validation:** the reproduced multi-host input must fail before `create_pool`; cover all public/private permutations, direct loopback, IPv6, proxies, and ensure a supported single public endpoint remains accepted.

**Why this remediation:** Validating the same complete destination representation that the driver consumes closes the parser mismatch at the connection boundary. Restricting grammar is a compatible interim tradeoff only if unsupported forms fail explicitly.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/db_reproductions.py` (exit **0**). Observed: **mixed DSN returned 200; only 8.8.8.8 checked; real driver parsed 127.0.0.1 too; unauthenticated 401/private-only 400 controls**. [Captured coordinator output](review-evidence-2026-10-25/db_coordinator.out); [executable fixture](review-evidence-2026-10-25/db_reproductions.py). Limits: offline driver/parser/pool boundaries; inline threadpool dispatch for route functional assertions; no real DB. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F33] [P2 / Medium] Compaction finishing after deletion recreates parent, summary and vectors

**User story — illustrative scenario:**

> As a conversation owner, when I delete a chat while its summarizer waits for the model, I expect the completed deletion to remain effective, but instead late compaction recreates its parent, summary and vector entry, causing deleted derived memory returning.

**Location:** back-end/service/conversations/conversation_compaction_service.py:978 and :1114-1126 — check_and_summarize; back-end/vamp_memory/summary_block_repository.py:189-201 and :286-297 — create_block.

**Defect and root cause:** The summary LLM await splits claim acquisition from storage. Storage happens before `_commit_summary_claim` checks whether the claim survived. The summary repository accepts a missing parent (`idx=0`) and later `transaction.set(...,merge=True)` creates it. Only afterward does the claim-commit check fail, leaving a recreated conversation, fresh summary and scheduled vectors.

**Concrete example:** a long conversation crosses summary threshold; while summarization waits for its model, the user deletes the conversation from another tab. After deletion returns, the old summary operation completes and recreates private derived memory.

**Reproduced proof:** `graph_compaction.py` performs this exact interleaving with actual compaction, claim/commit helpers, delete service/repository, VAMP store/index and summary repository. Only model/SDK/embed/vector boundaries are synthetic; local account-admission code remains active. VAMP is enabled only within this fully mocked case.

Actual F33 output: `{"compaction_reason":"claim_commit_skipped","conversation_recreated":true,"order":["compaction_claimed_and_model_waiting","delete_finished_parent_absent","model_returns_after_deletion"],"summary_blocks_after_deletion":1,"vectors_upserted_after_deletion":1}`. Parent absence is asserted before the model is released. Thus this is a deterministic **executed** deletion/model race, not a source-only hypothesis. It does not measure distributed contention or a live vector service.

Expected basis: deletion success removes the conversation; claim ownership is intended to fence delayed summary work. **Remediation:** require an existing owned parent plus still-current summary claim and conversation deletion generation in the **same transaction that stores the summary**, before indexing is scheduled. Also coordinate conversation deletion with late indexed writes: a valid summary commit immediately before deletion must not allow a delayed vector task to recreate pointers after cleanup. Use a conversation tombstone/fence or a drain barrier covering all summary/index work. A naked preflight existence check is insufficient (TOCTOU). **Regression validation:** delete during model wait, delete after valid summary commit/before vector completion, claim turnover during model wait; no parent/summary/vector recreation and no orphan index scheduling; successful nondeleted compaction still commits once.

**Why this remediation:** Transactional claim/deletion checks prevent pre-delete work from storing after deletion; fencing asynchronous indexing also covers work scheduled before cleanup completes. A separate existence check is racy.

**Severity rationale:** Medium. The same owner can delete while normal summarization waits, after which late work recreates parent, summary and vector state. This violates deletion semantics with a deterministic local interleaving; cross-user access is not claimed.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_compaction.py` (exit **0**). Observed: **claimed/model-wait → delete-parent-absent → model-return recreated parent, one summary and one vector; claim_commit_skipped**. [Captured coordinator output](review-evidence-2026-10-25/graph_compaction_coordinator.out); [executable fixture](review-evidence-2026-10-25/graph_compaction.py). Limits: real compaction/service/repositories, local document transactions, real InMemorySaver, synthetic model/embed/vector;5x80ms workload. The proposed remediation was checked against the root cause but was not implemented or tested.

### [N01] [P2 / Medium] Disconnect loses already-delivered partial assistant history

**User story — illustrative scenario:**

> As a chat user, when I read partial assistant text and then disconnect, I expect the promised partial response to remain in history, but instead only the user turn is saved, causing loss of delivered assistant content on reload or continuation.

**Location:** back-end/service/conversations/conversation_streaming_service.py:418-421 and :443-484, especially :468 — abort persistence; back-end/controller/conversations_controller.py:161-165 — producer cancellation.

**Defect and root cause:** `service/conversations/conversation_streaming_service.py:418-421`, :443-484, especially unshielded await run_in_threadpool at :468, plus wrapper producer cancellation conversations_controller.py:161-165. Abort path builds a partial timeline but cancellation interrupts the asynchronous persistence boundary before the repository write starts.

**Concrete example:** a user reads partial assistant text then closes/stops the stream. Chat/resume real controller -> ConversationService facade -> real ConversationStreamingService -> heartbeat wrapper -> actual Starlette2.3 disconnect. Source emits token `Partial assistant output` then blocks. Model/provider approval and policy are synthetic valid values; production route validation/auth reachability is source-established as for F01/F02.

**Expectation/basis:** streaming service module lines17-18 and partial-response-persistence documentation explicitly promise saving accumulated response plus stopped marker on abort; existing normal behavior persists assistant output. Losing delivered content breaks conversation continuity and reload/resume.

**Reproduced proof:** `api_stream_persistence_probe.py`, api_stream_persistence_probe.py function run. Uses real controller, service, StreamingResponse and threadpool boundary. Repository get/store_message, Firestore task-mode update, usage persistence and agent source are local doubles. Actual disconnected result: partial_token_delivered=true, stored_roles=[user], assistant_saved=false. Same fixture normal completion control: stored_roles=[user,ai], assistant_saved=true. Explicit assertions enforce both. No direct fire-and-forget persistence/task patch, live DB or LLM used.

**Remediation:** protect abort persistence (and necessary inner shutdown/usage recording) with a bounded cancellation-safe scope, preserving original cancellation and account-erasure ownership. Do not yield terminal SSE during cleanup. **Why this remediation:** allows the partial-write await to execute after disconnect without converting abort into success. Shielding limiter.release alone (F01) does not repair this earlier service write, so N01 is independently actionable. **Regression validation:** real ASGI2.3 disconnect after token; assert exactly one assistant partial write with stopped marker, no done frame after disconnect; normal completion and repeated cancellation controls. **Severity rationale:** reproducible loss of already-delivered conversation content on routine user abort; no cross-account access established.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/api_stream_persistence_probe.py` (exit **0**). Observed: **delivered partial text saved only user; same-fixture normal completion saved user and ai**. [Captured coordinator output](review-evidence-2026-10-25/api_stream_persistence_coordinator.out); [executable fixture](review-evidence-2026-10-25/api_stream_persistence_probe.py). Limits: repository write observer; synthetic agent; real service and ASGI disconnect with normal completion control. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F32] [P2 / Medium] Ordinary conversation deletion leaves actual checkpoint transcript data

**User story — illustrative scenario:**

> As a conversation owner, when I delete a conversation, I expect associated checkpoint transcript state to be removed, but instead the parent is gone while a checkpoint still contains the transcript, causing retained application-owned conversation data.

**Location:** back-end/service/conversations/conversation_service.py:48-71 — delete_user_conversation; back-end/service/conversations/conversation_repository.py:595-650 — delete; back-end/langgraph_orchestration/checkpointing.py:390 — saver construction.

**Defect and root cause:** Deletion removes memory pointers, summary subcollections, execution data and parent document but never invokes the checkpoint saver for this conversation's physical generations. The Redis saver is constructed without a retention TTL. Account-wide cleanup exists separately (`checkpoint_savers.py:FullCopyInMemorySaver.adelete_user_threads`59 and Redis equivalent146), so it does not repair ordinary deletion immediately.

**Concrete example:** a user deletes a chat containing confidential query context and receives success. They reasonably expect associated transcript state to be removed; checkpoint snapshots still retain it.

**Reproduced proof:** `graph_compaction.py` F32 creates an actual LangGraph checkpoint containing `Sensitive synthetic transcript`, installs that saver at the real global checkpointer boundary, then calls actual `ConversationService.delete_user_conversation` and actual `ConversationRepository.delete` with a local Firestore/vector boundary. Actual output: `{"checkpoint_exists_after_delete":true,"checkpoint_transcript":"Sensitive synthetic transcript","conversation_exists_after_delete":false}`.

Limit: this uses actual InMemorySaver, not live Redis. It proves the application's omitted cleanup call and retained transcript; source construction shows production saver has no configured TTL. No unauthorized retrieval, cross-user access or deletion of account-wide data is claimed. The test's synthetic physical thread identifies one generation; production generation creation gives each run another immutable physical namespace, so cleanup must enumerate all conversation generations.

**Remediation:** add conversation-level checkpoint erasure across all physical generations and durable retry tracking if that backend fails; fence conversation writes during erasure so active requests cannot restore them afterward. Use structured generation ownership, not an ambiguous prefix that could cross conversation boundaries. **Regression validation:** checkpoint messages/blobs/pending writes/latest pointers removed for old and active generations; another conversation/account unaffected; interrupted cleanup retries; concurrent stream/deletion cannot write back after success.

**Why this remediation:** Conversation-scoped generation cleanup removes storage omitted by ordinary deletion. Durable retries and write fencing prevent a successful response from concealing unfinished cleanup.

**Severity rationale:** Medium. A conversation owner receives successful ordinary deletion while checkpoint transcript data remains in application-owned storage. Account-wide erasure is a separate safeguard; unauthorized retrieval is not demonstrated.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_compaction.py` (exit **0**). Observed: **actual deletion removed the parent while actual InMemorySaver retained the synthetic checkpoint transcript**. [Captured coordinator output](review-evidence-2026-10-25/graph_compaction_coordinator.out); [executable fixture](review-evidence-2026-10-25/graph_compaction.py). Limits: real compaction/service/repositories, local document transactions, real InMemorySaver, synthetic model/embed/vector;5x80ms workload. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F37] [P2 / Medium] Canonical message appends exceed the single-document storage bound

**User story — illustrative scenario:**

> As an analyst in a long conversation, when I keep adding individually valid 16KiB excerpts after earlier turns are summarized, I expect canonical history to remain persistable in bounded records, but instead the parent message array grows beyond the store document limit, causing a rejected subsequent write.

**Location:** back-end/service/conversations/conversation_repository.py:448-495 and :528-534 — store_message; back-end/service/conversations/conversation_compaction_service.py:139-164 — _commit_summary_claim.

**Defect and root cause:** The complete canonical transcript stays in `conversations/{id}.messages`. Appending a normal-sized message eventually exceeds Firestore's1MiB per-document bound even when all prior turns have been summarized. No shard/chunk/rollover path handles this canonical array.

**Concrete example:** an analyst repeatedly pastes16KiB database excerpts and receives16KiB answers over a32turn session. `ChatRequest` permits50,000-character prompts (`api_contract/conversations.py:62`; config417), so these payloads individually validate. Summarization advances last_summarized_idx but leaves the same document content in place.

**Reproduced proof:** Command actually run:

```sh
back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_history_size.py
```

Actual output: `{"accepted_messages_before_rejection":64,"boundary_error":"InvalidArgument","completed_turns":32,"document_limit_bytes":1048576,"last_summarized_idx":64,"per_message_chars":16384,"rejected_candidate":{"content_bytes_alone":1064960,"messages":65,"protobuf_wire_bytes":1073712},"request_validation":"accepted"}`.

This runs actual ChatRequest validation and actual store_message transaction logic/ArrayUnion appends, then encodes the resulting candidate with the installed Firestore `_helpers.encode_dict` + actual Document protobuf. A conservative local SDK boundary rejects when **content strings alone** exceed1MiB. It is deliberately **not the exact Firestore storage-size formula** and not a real server rejection at precisely65messages. Firestore metadata/field-value limits may reject earlier;64accepted here is only modeled fixture capacity. The measured65message candidate is necessarily oversized because its content alone exceeds the bound. The probe explicitly advances cursor metadata to show that complete summarization does not truncate the canonical array; it does not invoke a real model32times.

Expected basis: individually valid messages in an ordinary multi-turn conversation should remain persistable; the backing store has a fixed maximum document size. **Remediation:** store canonical messages in bounded immutable message/chunk documents, keep owner/cursors/task metadata in the parent, and page/restore history through those records. A guard with explicit rollover can be an interim fix, but silently dropping canonical transcript is not. **Regression validation:** append beyond1MiB total transcript while every individual document remains below a conservative size bound; history pagination and summarization cursors preserve ordering; ownership checks, retries and conversation/account deletion cover all chunks.

**Why this remediation:** Moving canonical messages out of one ever-growing parent removes the fixed single-document bottleneck while retaining paginated history and stable cursors; this needs migration and deletion coverage.

**Severity rationale:** Medium. Long conversations with individually valid messages eventually cannot append to the fixed-size canonical parent document. The limit fixture is conservative and does not establish the exact real-server turn count.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_history_size.py` (exit **0**). Observed: **actual append built 65-message candidate with 1,064,960 content bytes alone; modeled SDK boundary raised InvalidArgument**. [Captured coordinator output](review-evidence-2026-10-25/graph_history_size_coordinator.out); [executable fixture](review-evidence-2026-10-25/graph_history_size.py). Limits: real request validation/store and protobuf; synthetic conservative content-only limit, actual Firestore may reject sooner. The proposed remediation was checked against the root cause but was not implemented or tested.

**External contract source:** Firestore limits a document to 1 MiB. The content-only rejection fixture is conservative and may allow modeled writes a real server would reject sooner. [Official Firestore limits](https://firebase.google.com/docs/firestore/quotas#collections_documents_and_fields).

### [F14] [P2 / Medium] MySQL and SQL Server DSNs override the selected database

**User story — illustrative scenario:**

> As a database user, when I select target after connecting through a MySQL or SQL Server DSN naming source, I expect driver connections to use target, but instead their effective database remains source, causing results associated with the wrong selected database.

**Location:** back-end/service/database/mysql_utils.py:88-103 — get_mysql_connect_kwargs; back-end/service/database/adapters/sqlserver_adapter.py:69-83 — create_connection_pool; back-end/service/database/database_service.py:61-83 — switch_remote_database.

**Defect and root cause:** `service/database/mysql_utils.py:88-103`, `get_mysql_connect_kwargs`, takes database solely from the original DSN when present. `adapters/sqlserver_adapter.py:69-83`, `create_connection_pool`, overwrites `config["database"]` with its DSN's Database/Initial Catalog. Gate S changes only the config's `database` in `connection_handlers.py:865-866`. Additionally, `DatabaseService.switch_remote_database`, `database_service.py:61-83`, applies a slash-path substitution to every non-PostgreSQL DSN; normal semicolon-form SQL Server DSNs do not contain that path, so Gate W can report another selection while preserving the original DSN database.

**Concrete example:** A user connected by `mysql://review:test@8.8.8.8/source` or `Server=8.8.8.8;Database=source;UID=review;PWD=test` selects `target`. Display/session config now says target; the adapter still opens source. Expected: explicit selection overrides the initial DSN database, as PostgreSQL already implements at `postgresql_adapter.py:77-82`.

**Reproduced proof:** Run `back-end/.venv/bin/python -u docs/security/review-evidence-2026-10-25/db_reproductions.py`, case `dsn_overrides_selected_database`. Actual MySQL driver kwargs and actual SQL Server pool config both output database `source` from config `database:"target"`; actual PostgreSQL factory with only the network pool constructor intercepted outputs `target` as a positive control. No SQL statements were executed against live servers, so the demonstration is the exact connection-factory contract rather than an asserted live query response.

**Severity rationale:** P2: silent query/metadata target mismatch can produce plausible answers from the wrong accessible database and a misleading query `source_id` whose identity uses the selected config. No cross-user or privilege escalation is demonstrated.

**Remediation:** Normalize the effective DSN once and make `config.database` authoritative for MySQL and SQL Server: `kwargs["database"] = config.get("database") or parsed.database`. For SQL Server, preserve host/credentials while selecting the explicit database; remove the URL substitution assumption for ODBC DSNs. 

**Regression validation:** for each supported DSN grammar, selected target equals the actual driver `database` argument; include PostgreSQL as a passing control and verify connection rejection does not update session state. Gates S and W complete.

**Why this remediation:** Making explicit selection authoritative at driver-parameter construction aligns execution with the persisted selection while retaining the DSN host and credentials.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/db_reproductions.py` (exit **0**). Observed: **MySQL and SQL Server effective database stayed source while selected target; PostgreSQL control used target**. [Captured coordinator output](review-evidence-2026-10-25/db_coordinator.out); [executable fixture](review-evidence-2026-10-25/db_reproductions.py). Limits: offline driver/parser/pool boundaries; inline threadpool dispatch for route functional assertions; no real DB. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F23] [P2 / Medium] selecting an Oracle owner does not set the query's current schema

**User story — illustrative scenario:**

> As an Oracle user, when I select owner OTHER and issue an unqualified query using my REVIEW login, I expect the selected owner to be applied to the SQL session, but instead the driver keeps REVIEW with no current-schema assignment, causing metadata and query name-resolution settings that disagree.

**Location:** back-end/service/database/connection_handlers.py:865-866 — select_database; back-end/service/database/query_guards.py:39-42 — set_query_schema; back-end/service/database/adapters/oracle_adapter.py:122-148 — create_connection_pool.

**Defect and root cause:** `connection_handlers.select_database:865-866` only updates config.database; Oracle metadata methods use that field as catalog owner, e.g. `oracle_adapter.py:313-322`. `OracleAdapter.create_connection_pool:122-148` still authenticates as original `user` and never assigns `current_schema`. `query_guards.set_query_schema:39-42` explicitly returns for every non-PostgreSQL DB type. Consequently an accepted new owner affects the schema explorer but no setup reaches Oracle before an unqualified SQL query.

**Concrete example:** Oracle login REVIEW can read owner OTHER. User selects OTHER, then executes `SELECT ID FROM ITEMS`, expecting the selected owner's ITEMS. Oracle connection still authenticates as REVIEW, and no current-schema assignment changes unqualified lookup. Metadata calls using OTHER may look correct while execution uses the login's schema/default name resolution.

**Reproduced proof:** Run `back-end/.venv/bin/python -u docs/security/review-evidence-2026-10-25/db_pool_reproductions.py`, case `oracle_selected_owner_not_applied`. Actual selection with a successful empty metadata result reports connected and config OTHER. Actual Oracle pool factory arguments are captured: user remains REVIEW. Actual query execution calls exactly `SELECT 1 FROM DUAL` and `SELECT ID FROM ITEMS`; there is no ALTER SESSION or connection.current_schema assignment. Output `selected_owner:"OTHER"`, `actual_pool_user:"REVIEW"`. Pool networking/cursor values are synthetic; **actual Oracle table resolution and returned owner data are not executed**. This is precise missing driver/session configuration evidence, supported by Oracle's existing adapter distinction between login and metadata owner, not a claimed live wrong-result trace.

**Severity rationale:** P2 inconsistent selected database/owner across metadata and query execution; impact requires unqualified queries against accessible different owners. Authorization remains Oracle's configured privileges.

**Remediation:** Apply an explicit selected current_schema on every Oracle pool borrow, using the driver's `connection.current_schema` setter or an adapter-generated safely quoted ALTER SESSION; preserve service_name independently. Pseudocode: `conn.current_schema = validated_selected_owner` before health/query, and reset before pool reuse if isolation requires it. 

**Regression validation:** two accessible owners with distinct ITEMS; selecting OTHER must resolve OTHER for normal and AI queries, including reuse/back-to-back owner changes, while metadata agrees. Gates S and Q complete.

**Why this remediation:** Applying current_schema on each Oracle borrow changes unqualified resolution independently of login credentials and service identity, matching the selected owner.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/db_pool_reproductions.py` (exit **0**). Observed: **selection OTHER preserved driver user REVIEW and sent no current-schema setup before unqualified SELECT**. [Captured coordinator output](review-evidence-2026-10-25/db_pool_coordinator.out); [executable fixture](review-evidence-2026-10-25/db_pool_reproductions.py). Limits: real connector pool/wrapper with offline transport;5second actual drain; Oracle driver args and commands captured, no live table resolution. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F21] [P2 / Medium] metadata uses account context while borrowing the session's different connection

**User story — illustrative scenario:**

> As an user with two database sessions, when I connect session B to Oracle BETA after session A connected to MySQL alpha, then inspect a table in A, I expect metadata SQL matching session A, but instead Oracle catalog SQL is prepared for the MySQL connection, causing a wrong-dialect metadata request.

**Location:** back-end/service/database/ai_tool_executor.py:1203-1223 — _get_table_details (also indexes, foreign keys, EXPLAIN and views); back-end/service/database/context_sync.py:15-19.

**Defect and root cause:** `AIToolExecutor._get_table_details`, `ai_tool_executor.py:1203-1223`, reads DB type/database/schema from account-wide context and creates that adapter/query, then calls `get_tool_connection(db_config)` with the session-supplied config. Same pattern exists in `_get_table_indexes:677-696`, `_get_foreign_keys:993-1012`, `_explain_query:1093-1121`, `_list_views:1341-1359`. UserContextDatabaseSync reads `ContextService.get_connection(user_id)` at `context_sync.py:15-19`; `ContextRepository.get_ref`, `context_repository.py:78-92`, keys one document by UID; `ContextService.set_connection:203-215` replaces that single current_connection. Gate A passes session config separately. Authentication ownership isolation does not ensure account context describes that particular session connection.

**Concrete example:** Same authenticated user has session A connected to MySQL alpha. Session B later connects to Oracle BETA, overwriting account-wide current_connection. Session A asks the get_table_details tool about items. Expected: MySQL metadata for alpha, or a clear stale-context error. Actual code prepares Oracle all_tab_columns SQL for owner BETA and sends it through the MySQL alpha session connection.

**Reproduced proof:** Run `back-end/.venv/bin/python -u docs/security/review-evidence-2026-10-25/db_metadata_reproductions.py`, case `account_metadata_session_connection_mismatch`. Actual method and actual Oracle adapter run with account context `oracle/BETA` and supplied session config `mysql/alpha`. Captures show `borrowed_driver:"mysql"`, `borrowed_database:"alpha"`, `metadata_driver:"oracle"`, `metadata_owner:"BETA"`. The row fixture accepts the query only to permit capture; **its returned row is not evidence that a real MySQL driver accepts Oracle syntax or retrieves Oracle metadata**. This is a same-user, two-session correctness issue, not demonstrated cross-user access.

**Severity rationale:** P2 predictable metadata failures or wrong same-user catalog context after concurrent sessions change connection. For matching DB dialects, returned metadata could be plausibly wrong, but that additional live-server result was not executed.

**Remediation:** Treat passed authenticated session db_config as the authoritative DB identity for every executor; context is advisory and usable only when its connection identity matches. Scope schema caches to that identity (host/database/schema/role) rather than a single account current_connection. Pseudocode: `db_type,database,schema = identity_from(db_config); context = matching_context_or_refresh(identity)`. 

**Regression validation:** two sessions sharing one UID with different driver/database/schema; alternately call each and assert adapter SQL plus borrowed driver/config always match its own session. Gate A complete.

**Why this remediation:** Executable database identity belongs to the authenticated session connection; account-wide context must be matched to that identity before reuse.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/db_metadata_reproductions.py` (exit **0**). Observed: **recorded Oracle BETA metadata SQL with borrowed MySQL alpha config for the same UID**. [Captured coordinator output](review-evidence-2026-10-25/db_metadata_coordinator.out); [executable fixture](review-evidence-2026-10-25/db_metadata_reproductions.py). Limits: real driver LOB over synthetic storage; Oracle/SQLServer SQL executed in SQLite catalog fixtures; stateful PostgreSQL cursor double; no optimizer or cross-user disclosure proved. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F29] [P2 / Medium] Actual ReAct resume adds checkpoint progress to its fresh allowance twice

**User story — illustrative scenario:**

> As a chat user approving an interrupted run, when I resume a normal 50-step policy from checkpoint 39 while the model keeps requesting tools, I expect at most the fresh graph allowance, but instead the real ReAct run executes 90 additional graph steps, causing extra model iterations beyond the declared run budget.

**Location:** back-end/langgraph_orchestration/stream_conversation.py:429-439 and :465-468 — _stream_graph_with_continuations; back-end/langgraph_orchestration/react_graph.py:464-470 — build_react_agent.

**Defect and root cause:** The helper reads current checkpoint step and passes `recursion_limit=current_step+current_limit`. Installed LangGraph already bases loop-stop/remaining-steps on the restored starting step. The checkpoint's old progress therefore enlarges this new run's allowance; built-in RemainingSteps protects only that enlarged allowance.

**Concrete example:** a standard conversation reaches a human confirmation after earlier tool activity; user approves through `/resume_agent`. The resumed run has a fresh normal50step ceiling but inherits checkpoint39. A model that keeps requesting tools can receive45 additional model iterations and90 additional graph steps before the installed safeguard terminates it, despite a50step policy.

**Reproduced proof:** Command actually run:

```sh
back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_react_budget.py
```

The script uses the **real application ReAct builder**, production continuation helper, real policy resolver, real InMemorySaver and installed create_react_agent. A synthetic BaseChatModel deterministically requests a local async tool, which interrupts at invocation20. Initial checkpoint39; on `Command(resume={approved:true})` actual final checkpoint129, **90 steps during resume**,45 additional model calls. Actual resumed output: `{"budget":50,"segment":50,"mode":"normal","initial_checkpoint_step":39,"initial_model_calls":20,"model_calls_after_resume":45,"final_checkpoint_step":129,"final_content":"Sorry, need more steps to process this request."}`.

Important limits: synthetic tool is a provider/tool boundary and does not run the application's hardcoded tool-budget guard. This proves excess **graph/model iterations**, not65 successful production DB calls. Production's tool guard can return budget-error outputs while graph/model iterations continue; run-control ownership, cancellation and deadline fences still apply. The raw generic-StateGraph probe `graph_budget.py` also executes20nodes for6/2 and152/764 for100/50 and200/50, but **do not use152/764 as ordinary production ReAct claims**: installed RemainingSteps ends the normal no-interrupt ReAct loop before GraphRecursionError. In the actual ReAct control, long_task200/segment50 ends atcheckpoint49 with25model calls and the safeguard apology. The old report's generic continuation claim is materially narrowed by this safeguard.

Expected basis: `RunBudgets` documents hard ceilings and the resolved policy advertises graph50 for this resumed run. **Remediation:** pass the remaining **relative segment allowance** to LangGraph and account actual executed steps across resumptions, rather than adding checkpoint offset. Do not assume a one-line change alone proves strict node ceilings: installed initial/resume boundary semantics must be checked. **Regression validation:** initial runs, human resumes at multiple nonzero checkpoints, internal segment continuations, compacted checkpoints; count actual supersteps, not requested allowances; additional executed nodes must never exceed the declared fresh-run budget and total accounting must not undercount. Preserve provider tool/message ordering.

**Why this remediation:** Relative limits remove the restored checkpoint offset from the fresh allowance. Counting actual supersteps across initial/resumed runs is necessary to avoid replacing this bug with boundary-count errors.

**Severity rationale:** Medium. A reachable human resume from a nonzero checkpoint permits extra graph/model iterations beyond the fresh policy. The synthetic tool does not prove65 successful DB calls; tool, cancellation and wall-clock controls remain.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_react_budget.py` (exit **0**). Observed: **actual normal policy 50 and production ReAct resume moved checkpoint 39 to 129 with 45 more model calls**. [Captured coordinator output](review-evidence-2026-10-25/graph_react_budget_coordinator.out); [executable fixture](review-evidence-2026-10-25/graph_react_budget.py). Limits: real production ReAct builder, policy resolver, continuation wrapper; synthetic chat model/tool; normal50 resume checkpoint39to129; no claim65 successful production tool calls; N02 early termination remains unverified. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F30] [P2 / Medium] Tool limit ignores the resolved policy and admits21 when configured20

**User story — illustrative scenario:**

> As an operator, when I configure a two-call tool budget, I expect the third guarded call to be rejected, but instead 21 unique calls pass the guard, causing tool admission that ignores the configured ceiling.

**Location:** back-end/langgraph_orchestration/tools.py:392-405 and :429-437 — _check_tool_budget_and_loop; back-end/langgraph_orchestration/stream_conversation.py:804 — resolved config.

**Defect and root cause:** The resolved `tool_call_budget` is placed in config but the guard always compares the old log total with hardcoded20 using `>` before recording the attempted call. Limits2,20,50 therefore each admit21 unique guarded calls. `RunControl.reserve_tool_call` has no production caller in this pipeline.

**Concrete example:** an operator lowers AGENT_TOOL_CALLS_PER_RUN to2 to bound expensive query/search work; a model varies query arguments. The21call guard still applies. At the default20 it admits one extra guarded call; raising the configured limit still stops at21.

**Reproduced proof:** Command actually run:

```sh
back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_budget.py
```

Actual F30 output `{"2":21,"20":21,"50":21}`. It calls the actual guard for distinct `execute_query` arguments `SELECT0`…`SELECT59` with a real shared configurable log; only the event writer is a sink. It does not execute SQL or prove live spend. Graph/time/identical-signature guards remain separate limits.

Expected basis: `ResolvedRunPolicy.budgets.tool_calls` is the stated per-run ceiling and is wired into the actual stream config. **Remediation:** atomically reserve against the shared resolved limit before external work, rejecting when used>=limit. Use a shared mutable run-control object for LangGraph shallow config copies and define whether cache hits/denied repeats consume a reservation. Pseudocode `if not run_control.reserve_tool_call(action_id): return budget_error`. **Regression validation:** configured2/20/50 admit no more than their limits; shared parallel calls cannot over-admit; identical-loop and cache semantics remain correct; resume gets the intended new-run policy.

**Why this remediation:** Reserving atomically before external work makes the resolved shared budget the admission authority and prevents both the ignored setting and off-by-one.

**Severity rationale:** Medium. An operator-configured tool ceiling is ignored in both restrictive and permissive directions, with an additional default off-by-one. The executed guard shows admission error; no actual provider spend or SQL mutation is inferred.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_budget.py` (exit **0**). Observed: **configured tool limits 2/20/50 each admitted 21 unique guarded calls**. [Captured coordinator output](review-evidence-2026-10-25/graph_budget_coordinator.out); [executable fixture](review-evidence-2026-10-25/graph_budget.py). Limits: actual guard, synthetic config and unique query args; generic graph figures in same script are diagnostic only and excluded from ordinary ReAct impact. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F31] [P2 / Medium] Async compaction synchronously blocks the worker loop on document reads

**User story — illustrative scenario:**

> As an user streaming a response, when I share a worker with five compaction checks whose synchronous reads each take 80ms, I expect my 10ms heartbeat to progress independently, but instead it runs after about 403ms, causing delayed concurrent work on that worker.

**Location:** back-end/service/conversations/conversation_compaction_service.py:805, :896 and :1126 — check_and_summarize and synchronous claim helpers; back-end/langgraph_orchestration/stream_conversation.py:873 — awaiting caller.

**Defect and root cause:** The async method directly calls synchronous Firestore DocumentReference.get and transaction callbacks. Other request/task timers cannot run during these blocking SDK calls. This is a measured event-loop effect, not a claim that declaring an async function alone is wrong.

**Concrete example:** five compaction checks arrive while Firestore document reads each take80ms; an unrelated stream heartbeat is due after10ms. The production method synchronously reads existing owned conversations with empty tails; no provider work is involved. Expected: blocking SDK work runs in worker threads or an async client, so the independent heartbeat remains timely.

**Reproduced proof:** `graph_compaction.py` command above, F31 actual output: `{"heartbeat_due_seconds":0.01,"heartbeat_observed_seconds":0.403,"requests":5,"results":["empty_tail","empty_tail","empty_tail","empty_tail","empty_tail"],"synthetic_sync_rpc_seconds_each":0.08}`. The SDK `.get` boundary deliberately sleeps80ms to model synchronous RPC latency; production check_and_summarize code is unchanged. This is five requests with an observed403ms timer delay. It is not a live Firestore benchmark, a measured P1 outage, or proof of a particular deployment's throughput.

**Remediation:** move all synchronous Firestore operations/transaction units in this async workflow to a threadpool or async client while preserving claim/transaction ordering and cancellation ownership. Offload the entire small transaction unit, not individual writes that break atomicity. **Regression validation:** the same deterministic workload must allow heartbeat progress near10ms; read/claim/commit errors retain existing outcomes; cancellation never abandons mutating native work without account/claim fencing.

**Why this remediation:** Offloading complete synchronous read/transaction units lets the event loop schedule unrelated requests while preserving transaction ordering; native work still needs ownership fences during cancellation.

**Severity rationale:** Medium. Normal chat compaction calls share the worker event loop with other streams. The five-request80ms latency fixture delayed an unrelated10ms timer to about403ms. This proves worker blocking under that workload, without measuring a live outage.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_compaction.py` (exit **0**). Observed: **five injected 80ms synchronous reads delayed a 10ms timer to approximately 402–403ms**. [Captured coordinator output](review-evidence-2026-10-25/graph_compaction_coordinator.out); [executable fixture](review-evidence-2026-10-25/graph_compaction.py). Limits: real compaction/service/repositories, local document transactions, real InMemorySaver, synthetic model/embed/vector;5x80ms workload. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F20] [P2 / Medium] EXPLAIN omits the selected PostgreSQL schema

**User story — illustrative scenario:**

> As a PostgreSQL user, when I request an EXPLAIN after selecting analytics, I expect the same schema setup used for normal execution, but instead EXPLAIN leaves the fresh connection in public, causing a plan context that differs from execution.

**Location:** back-end/service/database/ai_tool_executor.py:1115-1129 — _explain_query; back-end/service/database/query_guards.py:39-48 — set_query_schema; back-end/service/database/connection_manager.py:84-87 — pool key.

**Defect and root cause:** `AIToolExecutor._explain_query`, `service/database/ai_tool_executor.py:1115-1129`, directly opens a cursor and calls `adapter.run_explain` at `:1121`, without `set_query_schema`. The normal path applies it at `operations.py:471` and AI query path at `ai_tool_executor.py:551`. `query_guards.set_query_schema:39-48` is where the configured selected PostgreSQL schema becomes effective. Pool key generation intentionally excludes schema at `connection_manager.py:84-87`, so config/schema alone cannot imply a connection has that search_path.

**Concrete example:** User selects analytics on sales and asks for the plan of `SELECT * FROM orders`. A fresh pooled physical connection starts with public search_path. Expected: plan the same table that normal execution selects under analytics; otherwise the optimizer may report costs/indexes for another table or fail to resolve it.

**Reproduced proof:** Run `back-end/.venv/bin/python -u docs/security/review-evidence-2026-10-25/db_metadata_reproductions.py`, case `explain_missing_schema_setup`. A stateful DB-API session double starts both connections at public and consumes the **actual** psycopg2 Composed SET generated by the normal query's real `set_query_schema`. Actual normal query control issues health check, timeout SET, `SET search_path TO "analytics"`, then SELECT, and observes effective analytics. Actual `_explain_query` issues only `EXPLAIN (FORMAT JSON, VERBOSE) SELECT * FROM orders`, leaving the other connection public. Output records `manual_effective_schema:"analytics"`, `explain_effective_schema:"public"`. A real PostgreSQL optimizer was not run; plan JSON is derived from the double's session state, not independent optimizer evidence.

**Severity rationale:** P2 supported-feature correctness when using nondefault schemas; no arbitrary SQL/ANALYZE execution claim. Missing timeout setup is observable but not reported here as a separate proven resource-exhaustion finding.

**Remediation:** Apply shared query setup before run_explain, including selected schema and configured timeout, and use the normal reset/rollback path when returning the connection. Pseudocode: `with query_execution_cursor(...): set_query_timeout(...); set_query_schema(cursor,cfg,"postgresql"); run_explain(...)`. 

**Regression validation:** fresh and reused connections where public.orders and analytics.orders differ; verify plan relation namespace matches actual execution and state cleanup on failure. Gate A complete; explain dispatch `tools.py:840`.

**Why this remediation:** Shared session setup applies the selected namespace to the actual borrowed cursor, so config metadata and EXPLAIN execution agree even for fresh or reused pools.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/db_metadata_reproductions.py` (exit **0**). Observed: **normal execution applied actual analytics SET; real EXPLAIN path left the stateful session double public**. [Captured coordinator output](review-evidence-2026-10-25/db_metadata_coordinator.out); [executable fixture](review-evidence-2026-10-25/db_metadata_reproductions.py). Limits: real driver LOB over synthetic storage; Oracle/SQLServer SQL executed in SQLite catalog fixtures; stateful PostgreSQL cursor double; no optimizer or cross-user disclosure proved. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F16] [P2 / Medium] closing a MySQL pool abandons an outstanding borrow

**User story — illustrative scenario:**

> As a MySQL user, when I disconnect while a query keeps a connection borrowed beyond five seconds, I expect cleanup to retain ownership until disposal completes, but instead the manager discards the pool owner and skips the late return, causing missed explicit closure despite reported disconnect.

**Location:** back-end/service/database/connection_manager.py:405-430 — close_pool and :275-276 — return_connection; back-end/service/database/adapters/mysql_adapter.py:130-151 — close_pool.

**Defect and root cause:** `ConnectionManager.close_pool`, `service/database/connection_manager.py:405-430`, waits five seconds, then removes pool/adapter state even if `_pool_in_use` remains positive. `MySQLAdapter.close_pool`, `adapters/mysql_adapter.py:130-151`, can only drain **idle** raw connections from the connector queue; checked-out connections are absent. Later `ConnectionManager.return_connection:275-276` calls the adapter only if both map entries still exist, so it skips closing or returning the outstanding wrapper. A connector pooled wrapper's `.close()` itself only requeues the raw connection, as actually implemented in installed `mysql/connector/pooling.py:398-415`.

**Concrete example:** User starts a query, then disconnects in another request. Explicit ordering in the executable is acquire → disconnect waits its real five-second limit → pool removed and close returns true → query finishes → late return. Expected: successful disconnect owns and closes every live socket, or preserves a draining state until late returns can be physically disposed. Gate D's successful `disconnected=True` otherwise overstates cleanup.

**Reproduced proof:** Run `back-end/.venv/bin/python -u docs/security/review-evidence-2026-10-25/db_pool_reproductions.py`, case `mysql_shutdown_abandons_outstanding_borrow`. Actual ConnectionManager, actual adapter, real mysql-connector pool and real PooledMySQLConnection wrapper are used. Only the physical transport is an offline MySQLConnection subclass. Output: `disconnect_returned:true`, elapsed about `5.02` seconds, `manager_tracks_pool:false`, `physical_connection_closed:false`. Manual wrapper close then puts one still-open connection into the orphaned real pool (`orphan_pool_idle_connections:1`). Fixture cleanup explicitly drains it afterward.

**Severity rationale:** P2 lifecycle correctness: in-use connection disposal loses its owner while disconnect claims completion. A query may continue after disconnect. This proves missed explicit socket closure and missing tracked ownership; it does **not** prove an indefinitely retained live socket after all Python references are garbage-collected. A live DB/socket longevity test remains outside this review.

**Remediation:** Keep a closing pool record until borrow count reaches zero, reject new borrows, and physically close late-returned MySQL connections using their raw transport instead of returning them to the idle queue. Alternatively return an explicit failure on close timeout and preserve state for retry. Pseudocode: `pool.closing=True; if deadline_expired and borrows: retain_draining_record(); on_return: disconnect_raw_if_closing(); remove_after_last_return()`. 

**Regression validation:** force the same ordered interleaving, verify every raw close exactly once, prevent pool reuse after closure, and retain account-erasure/disconnect retry semantics. Gate D complete; related controller error-state erasure is API-owned prior F10.

**Why this remediation:** A retained draining owner gives every late borrow a disposal path. Reporting timeout as failure is the smaller alternative if callers preserve retry configuration.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/db_pool_reproductions.py` (exit **0**). Observed: **actual five-second close removed pool ownership; late return skipped physical close in real connector pool/wrapper**. [Captured coordinator output](review-evidence-2026-10-25/db_pool_coordinator.out); [executable fixture](review-evidence-2026-10-25/db_pool_reproductions.py). Limits: real connector pool/wrapper with offline transport;5second actual drain; Oracle driver args and commands captured, no live table resolution. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F10] [P2 / Medium] Failed disconnect deletes its retry configuration

**User story — illustrative scenario:**

> As a database user, when I retry disconnect after a pool-close failure, I expect the retry to close the outstanding resource, but instead the first failure has already erased its session configuration, causing a false successful retry without another close attempt.

**Location:** back-end/controller/database_controller.py:286-297 — disconnect_db.

**Defect and root cause:** database_controller.py:278-297, disconnect_db clears session state at :287 before checking service error :296; dependencies._expire_db_config :323-335 independently ignores the disconnect result before clearing.

**Concrete example:** authenticated POST `/api/v1/disconnect_db` with existing sales configuration; pool close raises RuntimeError. User retries disconnect after HTTP500.

**Expectation/basis:** a failed cleanup must retain its ownership/configuration or transfer it to a retry mechanism. Actual DatabaseService.disconnect catches pool close failure into status:error; None config skips close and returns success, :317-350.

**Reproduced proof:** `api_reproduce.py`, disconnect_and_login F10 uses the real route, actual DatabaseService.disconnect, real session store; only connection manager close_pool is a raising double and Firestore context sync is local no-op. Actual statuses500 then200, pool_close_attempts=1, db_config=null. No real driver-close failure or pool leak duration is measured. Expiry-helper sibling root is source-traced, not independently exercised in this case.

**Remediation:** clear matching configuration only after confirmed closure; alternatively record failed cleanup in an owned retry queue before losing session ownership. **Why this remediation:** retries still target the unfinished resource. **Regression validation:** close fails then succeeds; preserve config after first failure and verify second call actually retries pool closure. **Severity rationale:** operational resource cleanup becomes unreachable and UI incorrectly reports recovered disconnect.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/api_reproduce.py` (exit **0**). Observed: **actual disconnect service close failure yielded 500, then a 200 retry with only one close attempt and config=null**. [Captured coordinator output](review-evidence-2026-10-25/api_coordinator_rerun.out); [executable fixture](review-evidence-2026-10-25/api_reproduce.py). Limits: synthetic service boundaries; ASGI2.3 real disconnect; local5ms scheduler polling; synthetic120ms latency and burst workloads. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F01] [P2 / Medium] SSE disconnect interrupts limiter release

**User story — illustrative scenario:**

> As a chat user, when I close a tab after receiving a streamed token, I expect my provider slot to be released, but instead its asynchronous release is cancelled, causing temporarily reduced capacity for my later requests.

**Location:** back-end/controller/conversations_controller.py:395 — _handle_agent_stream.sse_generator, release in finally.

**Defect and root cause:** `back-end/controller/conversations_controller.py:388-396`, `_handle_agent_stream.sse_generator`; release is awaited inside the cancelled streaming scope, without cancellation shielding. Outer handler cleanup at :404-408 cannot rescue asynchronous body iteration after the StreamingResponse was returned.

**Concrete example:** authenticated chat or resume; a user closes an actively streaming tab after receiving a token. Test source yields `data: first\n\n` then waits. Starlette receives `http.disconnect` under ASGI HTTP spec 2.3, the actual spec emitted by installed Uvicorn h11_impl.py:207. The local limiter's asynchronous release sets an entry flag then awaits a checkpoint, matching a real Redis I/O boundary.

**Expectation/basis:** acquired provider/user capacity must be released on disconnect, as controller module documentation and :208-209 explicitly promise. No model/ownership authorization defect is claimed.

**Reproduced proof:** `api_reproduce.py`, function `stream_cleanup_and_admission`, JSON `F01` in api_reproduce.out. Actual: release_entered=true, release_finished=false, quota_used=1. The real StreamingResponse cancellation implementation at installed starlette/responses.py:265-285 was inspected. Limitations: no Redis reservation is created; cancellation failure of the controller's awaited cleanup is proven with an async release double, not a measured live Redis outage.

**Remediation:** run essential release in a bounded shielded cleanup scope and mark ownership released only on completion, preserving cancellation afterward. **Why this remediation:** lets the release await survive the response's cancelled scope without suppressing the original disconnect. **Regression validation:** real StreamingResponse ASGI2.3 disconnect with a release checkpoint; assert exactly one completed release; normal completion and pre-token failure controls. **Severity rationale:** ordinary browser disconnect can temporarily reduce concurrency until limiter expiry; no cross-account access claim.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/api_reproduce.py` (exit **0**). Observed: **release_entered=true and release_finished=false on actual Starlette ASGI 2.3 disconnect**. [Captured coordinator output](review-evidence-2026-10-25/api_coordinator_rerun.out); [executable fixture](review-evidence-2026-10-25/api_reproduce.py). Limits: synthetic service boundaries; ASGI2.3 real disconnect; local5ms scheduler polling; synthetic120ms latency and burst workloads. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F02] [P2 / Medium] Cancellation while waiting for model admission leaves quota charged

**User story — illustrative scenario:**

> As a chat user, when I cancel while waiting for model admission, I expect a turn that never started to refund its quota debit, but instead the debit remains, causing less quota for subsequent requests.

**Location:** back-end/controller/conversations_controller.py:307 and :329 — _handle_agent_stream debit/acquire lifetime.

**Defect and root cause:** conversations_controller.py:306-329, `_handle_agent_stream`. Debit completes at :307; the await at :329 precedes the protected stream block at :351. Cancellation never reaches refund logic.

**Concrete example:** authenticated new-chat POST, prompt `Hello`, valid server-authorized provider/model. Admission blocks waiting for capacity; caller cancels before acquisition returns. The driver substitutes valid selection/policy resolution and a blocking limiter, retaining the real quota/debit/refund order.

**Expectation/basis:** controller :202-208 and UserQuotaService refund contract say turns with no LLM output refund their debit. Acquisition has not returned and the agent source is never invoked.

**Reproduced proof:** `api_reproduce.py`, `stream_cleanup_and_admission`, JSON F02. Actual used_after_cancel=1, refunds=0 after a completed debit. Limitation: quota double counts debits/refunds; no uncertain Redis increment outcome is claimed.

**Remediation:** establish debit ownership and a cancellation-safe refund path covering the entire subsequent acquire/stream lifecycle, including CancelledError before acquire returns. Release a limiter slot only when its ownership is known. **Why this remediation:** closes the unprotected gap without releasing another request's slot or double-refunding. **Regression validation:** cancel at an acquire barrier after debit; assert one refund and no agent invocation, plus rejection/success controls. **Severity rationale:** repeated cancelled admissions consume a user's finite windows without running a model.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/api_reproduce.py` (exit **0**). Observed: **used_after_cancel=1 and refunds=0 before any agent output**. [Captured coordinator output](review-evidence-2026-10-25/api_coordinator_rerun.out); [executable fixture](review-evidence-2026-10-25/api_reproduce.py). Limits: synthetic service boundaries; ASGI2.3 real disconnect; local5ms scheduler polling; synthetic120ms latency and burst workloads. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F27] [P2 / Medium] Cancellation after Redis commit leaks an unowned concurrency reservation

**User story — illustrative scenario:**

> As a chat user, when I cancel admission after Redis commits its concurrency increment but before its reply, I expect no unowned reservation to remain, but instead the concurrency counter stays incremented, causing temporarily unavailable admission capacity.

**Location:** back-end/llm_provider/rate_limiter.py:305-322 — ProviderRateLimiter._acquire_redis.

**Defect and root cause:** `acquired` becomes True only after awaiting the concurrency Lua response. If Redis executes its atomic increment but cancellation interrupts the reply, finally refunds the unique RPM member only; concurrency remains reserved although the caller never received ownership. This is independent of HTTP post-acquisition release behavior owned by the API reviewer.

**Concrete example:** a browser cancels while its admission response is in flight. A brief cancellation leaves the user's available slot consumed until counter expiry, potentially denying subsequent legitimate requests.

**Reproduced proof:** Command actually run:

```sh
back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_limiter.py
```

Exact interleaving: public `acquire` reserves RPM; fake Redis executes the same concurrency-INCR+PEXPIRE effect and sets an event; its reply awaits; the script observes that event then cancels the caller; real finally runs. Actual F27 output: `{"caller_received_ownership":false,"redis_concurrency_after_cancel":1,"redis_concurrency_before_cancel":1,"rpm_after_cancel":0}`. Synthetic credential marker avoids all credential resolution; no Redis server is contacted.

Expected basis is the acquire docstring: exactly one release is required **after success**. An interrupted acquisition must not leave unowned capacity behind. **Remediation:** represent concurrency with uniquely identified per-request leases and idempotent cleanup for uncertain results, e.g. `SADD/ZADD(request_id)`, cleanup `ZREM(request_id)` regardless of whether a successful response was received. Do not blindly DECR on uncertainty because a noncommitted acquisition could release another owner's slot. **Regression validation:** commit-then-cancel, reject-then-cancel, transport-failure-before/after-commit; all cleanup must remove only the attempted lease and preserve other owners.

**Why this remediation:** An idempotent request-specific lease can be safely removed after an uncertain response; an unconditional aggregate decrement could release another request instead.

**Severity rationale:** Medium. A cancellation in the commit/reply window temporarily consumes the same user/provider concurrency capacity without an owner. Counter expiry limits duration; this does not grant access to another user.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_limiter.py` (exit **0**). Observed: **commit-then-cancel left concurrency 1/RPM 0 with no ownership returned**. [Captured coordinator output](review-evidence-2026-10-25/graph_limiter_coordinator.out); [executable fixture](review-evidence-2026-10-25/graph_limiter.py). Limits: real acquire/release; deterministic Redis command effects and expiry clock double, not real Redis server. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F28] [P2 / Medium] Aggregate concurrency expires while supported requests are still running

**User story — illustrative scenario:**

> As an user running a long report, when I keep a request active beyond 120 seconds and start another, I expect the active-request concurrency cap to hold, but instead the expired aggregate admits another and a late release clears its accounting, causing more active streams than the configured cap.

**Location:** back-end/llm_provider/rate_limiter.py:77-82 — _CONCURRENCY_ACQUIRE_LUA and :371-382 — ProviderRateLimiter.release.

**Defect and root cause:** The shared aggregate counter always expires120s after its latest accepted acquisition and is never renewed. An admitted normal/tool/long request can still be active when it expires. New requests acquire a fresh aggregate generation; release from an old request then decrements that new generation and can admit another request despite the concurrency cap.

**Concrete example:** a legitimate long database report remains active after two minutes. A second tab starts another conversation. With max_concurrent1, two streams can run; when the older stream completes it wipes the newer stream's accounting and permits a third.

**Reproduced proof:** Same `graph_limiter.py` command. Exact fake-clock sequence: A acquires at0; at121 (A active) B acquires; A releases while B active; C acquires. Actual F28 output: `{"A_at_0":true,"B_at_121_A_still_active":true,"C_while_B_still_active":true,"counter_after_A_release_B_still_active":0,"counter_after_B":1,"max_concurrent":1}`. Clock advancement avoids a121s sleep; atomic Lua expiry effects are modeled, not server-tested.

Expected basis: configured max_concurrent remains a bound on **active** streams, not only their first120s. Wall-clock/run-lease safeguards still exist but permit durations beyond120s; this does not claim unlimited parallelism. **Remediation:** renewable per-request leases with owner-specific release, purge expired leases atomically during admission, and renew while the owner is active. **Regression validation:** A remains leased beyond120s; B is denied; an expired-A late release never removes B; concurrent acquisition/renewal remains atomic.

**Why this remediation:** Renewable owner-specific leases represent active requests across long runs and prevent an old owner from decrementing a newer generation.

**Severity rationale:** Medium. Legitimate supported runs longer than120 seconds can defeat the configured same-user concurrency cap, and old releases corrupt current accounting. Other wall-clock and RPM safeguards still bound execution.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_limiter.py` (exit **0**). Observed: **A 0/B 121/late-release-A/C interleaving admitted B and C despite max_concurrent 1**. [Captured coordinator output](review-evidence-2026-10-25/graph_limiter_coordinator.out); [executable fixture](review-evidence-2026-10-25/graph_limiter.py). Limits: real acquire/release; deterministic Redis command effects and expiry clock double, not real Redis server. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F24] [P2 / Medium] Embedding failures bypass retry eligibility and bounded backoff (includes prior F25)

**User story — illustrative scenario:**

> As an user relying on long-term conversation memory, when I create a summary while every eligible embedding temporarily fails, I expect retryable indexing failure, but instead the block becomes terminal no_bullets, causing loss of semantic-index eligibility for retained summary text.

**Location:** back-end/vamp_memory/vamp_memory_service.py:420-453 — index_summary_block and :248-275 — _index_and_record_failure; back-end/vamp_memory/summary_block_repository.py:421-425, :556-580 — mark_vector_indexed/get_vector_retry_blocks. Includes prior F25 partial-success branch.

**Defect and root cause:** One nonempty eligible memory bullet fails during embedding. `gather(return_exceptions=True)` collects the failure; zero successes becomes `vector_status="no_bullets"` at434–435. The wrapper returns True rather than entering its exception/failure branch. The actual retry query includes only pending/partial/due-failed, so this eligible work becomes nonretryable after a transient total provider outage.

**Concrete example:** a user discusses a durable schema decision; its summary has `schema_version=2`, one bullet `{bullet_id:"bad", text:"fails"}`. The embedding provider temporarily raises RuntimeError. Expected: mark failed/due for retry, because nonempty work failed and the repository explicitly provides a bounded retry/backoff state machine. Observed: `reported_success=true`, `no_bullets`, retry selection0, attempts0, no failure-state call.

**Reproduced proof:** Command actually run:

```sh
back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_index_retry.py
```

Actual F24 output: `{"embedding_calls":["fails"],"mark_vector_failed_calls":0,"passes":[{"attempts":0,"next_retry_at":null,"reported_success":true,"retry_selected":0,"status":"no_bullets"}],"upserts":0}`. Script invokes actual index wrapper, index method, mark-vector-indexed and retry-selection query; only embedding, vector and Firestore command boundaries are synthetic.

Impact is loss of semantic-index eligibility, **not loss of canonical summary text**. Newest-block pinning and recent-block fallback (`retrieve_blocks`592–650, `_recent_block_fallback`704 onward) can temporarily mask the missing vectors; older matching facts then become unavailable through semantic search. No live provider/storage behavior was measured.

**Remediation:** distinguish empty inputs from failed eligible work, e.g. `eligible=[b for b in bullets if b.text]; if not eligible: no_bullets; elif failures: mark_vector_failed(...); else: indexed`. Propagate an outcome reflecting incomplete work instead of success. This preserves eligibility and invokes the existing bounded retry transition. **Regression validation:** empty bullets → no_bullets; all nonempty embeds fail → attempts increment + due retry; provider recovery → indexed and searchable; assert canonical summaries remain unchanged.

#### Partial-success branch (prior F25; same root cause)

**Severity: P2 / Medium.** Location: `vamp_memory/vamp_memory_service.py:index_summary_block`416–453, `_index_and_record_failure`248–275; `summary_block_repository.py:mark_vector_indexed`421–425 and `get_vector_retry_blocks`556–580. Routes C/R + maintenance.

The same result-state bug has a distinct partial-success effect: one good and one persistently bad bullet produce `partial`, clear next_retry_at, and leave attempts0. Partial blocks are always due. Every pass embeds both bullets again and upserts the good point again, bypassing the documented MAX_VECTOR_ATTEMPTS10 circuit breaker.

**Concrete example:** one summary includes a normal durable fact plus an unembeddable/provider-rejected bullet. Expect bounded retry of incomplete work, with backoff and eventual terminal failure according to `mark_vector_failed`439–518. Actual measured workload in the same command above: **3 passes, 2 bullets, 6 embedding calls, 3 successful upserts**, attempts0 and retry-selected1 after every pass; mark_vector_failed calls0. F25 output statuses are `[partial,partial,partial]`, embedding inputs `[works,fails,works,fails,works,fails]`, every `reported_success=true`, every `next_retry_at=null`.

This demonstrates repeated eligible work and no backoff. It does **not** quantify a live bill, prove a provider outage, or imply Qdrant duplicates: deterministic point IDs overwrite the same successful point. Persistently partial blocks also continue occupying retry-batch capacity.

**Remediation:** persist completed/pending bullet IDs; retry only outstanding eligible IDs and increment the existing atomic failure/backoff state for any failed eligible work. Never reset next_retry_at simply because one bullet succeeded. Pseudocode: `todo=eligible-completed; results=embed(todo); persist_success_ids(); if failures: mark_vector_failed(); else: indexed`. **Regression validation:** repeated mixed outcomes must eventually back off/dead after the configured failure bound; good bullet embeds once; a recovering bullet completes; genuinely empty text does not cause endless partial retries.

**Why this remediation:** Separating empty inputs from failed eligible work preserves retry eligibility instead of treating an outage as successful no-work completion.

**Severity rationale:** Medium. Enabled long-term-memory indexing loses retry eligibility on a total transient failure; a persistently partial block instead repeats completed work with no backoff. Canonical summaries remain, and recent-block fallback can mask missing semantic vectors. This is bounded memory-reliability/resource correctness impact, not measured live cost.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_index_retry.py` (exit **0**). Observed: **nonempty failed bullet became no_bullets/reported_success=true/attempts 0/retry_selected 0; partial branch: three passes over two bullets made six embeddings and three upserts, with attempts 0 and no backoff**. [Captured coordinator output](review-evidence-2026-10-25/graph_index_retry_coordinator.out); [executable fixture](review-evidence-2026-10-25/graph_index_retry.py). Limits: actual indexing/retry selection on local Firestore command double; synthetic embed/upsert; async port avoids threads. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F26] [P2 / Medium] Idempotent summary replay schedules duplicate indexing

**User story — illustrative scenario:**

> As an operator, when I replay an already stored deterministic summary range after an uncertain response, I expect the existing block to skip indexing, but instead the replay still reports created and schedules indexing again, causing duplicate scheduled work.

**Location:** back-end/vamp_memory/summary_block_repository.py:209-215 and :247-250 — create_block; back-end/vamp_memory/vamp_memory_service.py:334-340 — store_summary_block.

**Defect and root cause:** Fresh summary documents persist `created=True`. The existing-document branch uses `setdefault("created",False)`, preserving the stored True. The caller then schedules indexing again although the range was already stored.

**Concrete example:** a summary for range0–1 was durably stored, but the caller lost its response or did not commit its claim. A retry writes the same deterministic range. Expected per method docstring163–175: existing result carries created=False and skips new indexing. Actual production store method replay schedules a second index task.

**Reproduced proof:** Command actually run:

```sh
back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_compaction.py
```

F26 actual output: `{"first_created":true,"replayed_created":true,"scheduled_index_count":2,"stored_created":true,"summary_count":1}`. The script calls real `VampMemoryService.store_summary_block` twice, real `SummaryBlockRepository.create_block`, the real account-work guard, and observes `_schedule_index` through a signature-compatible recording callback. It proves duplicate scheduling, not extra live embedding spend. Firestore transaction boundary is a local successful-transaction double; atomic-contention/retry behavior is excluded.

**Remediation:** keep operation metadata outside persisted block fields, set `existing["created"]=False` unconditionally on replay, and set True only in the returned fresh-operation result. **Regression validation:** fresh + replay → one schedule, one stored block; replay legacy documents containing either created value; replay preserves immutable payload.

**Why this remediation:** Creation is metadata of this operation, not a permanent property of the stored block. Returning false on replay stops duplicate scheduling without changing the immutable summary.

**Severity rationale:** Medium. A replay after an uncertain summary response schedules redundant background indexing for the same owned block. Deterministic IDs protect stored identity; the demonstrated effect is extra scheduling, not corrupted duplicate points or measured live spend.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/graph_compaction.py` (exit **0**). Observed: **same deterministic block replay scheduled twice while summary_count stayed 1**. [Captured coordinator output](review-evidence-2026-10-25/graph_compaction_coordinator.out); [executable fixture](review-evidence-2026-10-25/graph_compaction.py). Limits: real compaction/service/repositories, local document transactions, real InMemorySaver, synthetic model/embed/vector;5x80ms workload. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F06] [P2 / Medium] Concurrent independent settings patches overwrite each other

**User story — illustrative scenario:**

> As an user with two settings panels, when I save queryTimeout=60 and maxRows=2000 concurrently, I expect both disjoint changes to survive, but instead one acknowledged change is overwritten, causing settings that disagree with my saved choices.

**Location:** back-end/service/user_settings/user_settings_service.py:155-157 — UserSettingsService.save; back-end/controller/context_controller.py:405.

**Defect and root cause:** `service/user_settings/user_settings_service.py:146-159`, save reads complete preferences at :155 then writes the complete merged map at :157; caller context_controller.py:405 offloads saves concurrently. Firestore merge=True merges supplied leaves, so supplying stale values for all leaves still overwrites them.

**Concrete example:** two settings panels/tabs issue valid POST `/api/v1/user/settings`: `{queryTimeout:60}` and `{maxRows:2000}`, starting from30/1000. Both saves read the same baseline.

**Expectation/basis:** request model/documentation defines partial settings updates; disjoint patches should preserve both edits. Pydantic already validates these values; no validation finding.

**Reproduced proof:** `api_reproduce.py`, settings_interleaving F06, real UserSettingsService.save in two threads. A barrier forces both baseline reads; maxRows write completes before timeout write. Actual trace read/read/write maxRows/write timeout; both calls return, final queryTimeout=60,maxRows=1000. Boundary double implements nested preference-leaf merge; no Firestore transaction emulator/live SDK is used.

**Remediation:** atomically update only supplied nested preference fields, or perform the read/merge/write in a conflict-retrying transaction. **Why this remediation:** a stale request no longer writes unrelated keys. **Regression validation:** explicitly interleave disjoint patches and assert final60/2000; test same-key last-writer policy separately. **Severity rationale:** silently loses acknowledged user settings in normal concurrent use.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/api_reproduce.py` (exit **0**). Observed: **forced read/read/write-maxRows/write-timeout interleaving persisted 60/1000 instead of 60/2000**. [Captured coordinator output](review-evidence-2026-10-25/api_coordinator_rerun.out); [executable fixture](review-evidence-2026-10-25/api_reproduce.py). Limits: synthetic service boundaries; ASGI2.3 real disconnect; local5ms scheduler polling; synthetic120ms latency and burst workloads. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F07] [P2 / Medium] Rejected settings write is returned as success and mirrored into session

**User story — illustrative scenario:**

> As an user, when I save connectionPersistence=60 when the repository rejects the write, I expect an error and unchanged session behavior, but instead the API reports success and changes the session mirror, causing different current and durable connection settings.

**Location:** back-end/service/user_settings/user_settings_service.py:157 — UserSettingsService.save; back-end/controller/context_controller.py:405-406.

**Defect and root cause:** UserSettingsService.save at :157 ignores ContextRepository.update's False; context_controller.py:405-406 mirrors its return value regardless of durable persistence.

**Concrete example:** stored connectionPersistence=0. Authenticated POST `{connectionPersistence:60}` to `/api/v1/user/settings` while repository returns False for a non-transient write error. User believes connection lifetime was saved.

**Expectation/basis:** repository.update explicitly returns True only on successful write and False for non-transient failure. Session mirroring should follow confirmed persistence, not attempted preferences.

**Reproduced proof:** `api_reproduce.py`, context_routes F07. Real service, POST/GET handlers, and real session store; repository read returns stored0, update returnsFalse. Actual POST200/report60/session mirror60; next GET returns0. A repeat POST observes session before GET overwrites its mirror. Transient exceptions, which repository correctly propagates, are not the tested failure class.

**Remediation:** propagate False as save failure; mirror only after successful persistence; return a retryable error as appropriate to the actual cause. **Why this remediation:** prevents claimed and session-only settings changes after rejected writes. **Regression validation:** rejected write gives non-success and leaves session unchanged; successful save/GET agree. **Severity rationale:** changes effective connection lifecycle while durable settings remain different.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/api_reproduce.py` (exit **0**). Observed: **POST 200 reported 60 and mirrored 60; subsequent GET returned stored 0**. [Captured coordinator output](review-evidence-2026-10-25/api_coordinator_rerun.out); [executable fixture](review-evidence-2026-10-25/api_reproduce.py). Limits: synthetic service boundaries; ASGI2.3 real disconnect; local5ms scheduler polling; synthetic120ms latency and burst workloads. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F05] [P2 / Medium] A second browser tab disconnects the active first tab

**User story — illustrative scenario:**

> As a database user, when I open a second tab while the first tab is actively connected and persistence is zero, I expect the existing connection to remain usable, but instead the second tab heartbeat clears it, causing an unexpected database disconnect.

**Location:** back-end/controller/context_controller.py:475-480 — mark_user_session_active.

**Defect and root cause:** context_controller.py:458-497, mark_user_session_active, unfamiliar tab ID branch :475-480 equates a second tab with a reopened browser even with a fresh shared heartbeat.

**Concrete example:** tab A connected to sales, connectionPersistenceMinutes=0, session_instance_id=tab-A, session_active_at=now. Tab B shares the Firebase cookie and posts `{sessionInstanceId:tab-B}` to `/api/v1/user/session/active`. Frontend DatabaseContext.jsx:53-65 stores IDs in sessionStorage, and :368-370 sends them; independent tabs legitimately have distinct IDs.

**Expectation/basis:** connection persistence describes keeping a connection after closing the tab; `_get_cached_db_config` documentation explicitly protects an actively open tab from false closure. A new tab does not establish closure of A.

**Reproduced proof:** `api_reproduce.py`, context_routes F05, real heartbeat/_expire_db_config and real in-memory session store, DatabaseService.disconnect success double. Actual HTTP200, disconnect_calls=1, db_config=null despite approximately zero heartbeat age. Browser automation is not used; frontend ID creation is source-traced.

**Remediation:** base shared connection expiry on explicit close/inactivity across tracked active tab IDs, or conservatively never disconnect solely for an unfamiliar ID while activity remains fresh. **Why this remediation:** restores the distinction between parallel tabs and expired sessions. **Regression validation:** two IDs on one cookie with a connected fresh session; both remain usable; actual close/expiry still disconnects. **Severity rationale:** ordinary multi-tab use unexpectedly drops a working database session.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/api_reproduce.py` (exit **0**). Observed: **a fresh tab-A session was cleared by tab-B heartbeat; disconnect_calls=1**. [Captured coordinator output](review-evidence-2026-10-25/api_coordinator_rerun.out); [executable fixture](review-evidence-2026-10-25/api_reproduce.py). Limits: synthetic service boundaries; ASGI2.3 real disconnect; local5ms scheduler polling; synthetic120ms latency and burst workloads. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F09] [P2 / Medium] Middleware errors omit CORS for an allowed frontend

**User story — illustrative scenario:**

> As an user of an allowed separate frontend origin, when I submit a request rejected by CSRF or body-size middleware, I expect the frontend to read its structured error, but instead the response omits the allowed-origin CORS header, causing a browser network error that obscures recovery.

**Location:** back-end/main.py:371-378, :407-425 and :433 — create_app middleware ordering; back-end/core/http_boundary.py — outer error responses.

**Defect and root cause:** main.py:371-378 installs CORS before middleware registered at :407, :425, :433; these later/outer layers return errors before traversing CORS. ResponseSecurityMiddleware produces unhandled-error JSON outside CORS too.

**Concrete example:** cross-origin allowed frontend sends Origin=https://frontend.example; settings POST lacks CSRF, or payload exceeds262144 bytes. A browser cannot read the structured error and presents a network/CORS failure.

**Expectation/basis:** allowed origin can read application error contracts as well as success. Security rejection is correct; its missing CORS headers break client handling, not authorization.

**Reproduced proof:** `api_reproduce.py`, middleware_routes F09, actual create_app. Normal GET/api/v1/ has status200 and allow-origin. Settings CSRF403 and oversized body413 omit it; a local synthetic throwing endpoint produces outer500 and also omits it. Actual statuses200/403/413/500, allow-origin present/null/null/null. 500 trigger is added only to the local test app; production middleware/error conversion is unchanged. Browser enforcement is inferred from the observed missing headers, not browser automation.

**Remediation:** wrap all response-generating middleware/error handling in CORS for allowed origins, preserving preflight, request IDs, and security headers. **Why this remediation:** every response passes the CORS response boundary. **Regression validation:** test allowed/disallowed origins on normal, validation, CSRF, oversized, rate-limited and unhandled-error responses. **Severity rationale:** obscures actionable errors and breaks frontend recovery across supported separate origins.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/api_reproduce.py` (exit **0**). Observed: **allowed-origin header present on 200, absent on actual 403/413 middleware responses and injected-endpoint 500**. [Captured coordinator output](review-evidence-2026-10-25/api_coordinator_rerun.out); [executable fixture](review-evidence-2026-10-25/api_reproduce.py). Limits: synthetic service boundaries; ASGI2.3 real disconnect; local5ms scheduler polling; synthetic120ms latency and burst workloads. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F11] [P2 / Medium] Login infrastructure failure is mislabeled invalid credentials

**User story — illustrative scenario:**

> As a valid user signing in, when I log in during a Firebase session-cookie creation outage, I expect a retryable service error, but instead the API reports invalid credentials with 401, causing incorrect sign-in failure and retry handling.

**Location:** back-end/controller/auth_controller.py:121-172 — set_authenticated_user_session.

**Defect and root cause:** auth_controller.py:121-172, set_authenticated_user_session broad except includes Firebase cookie creation and session persistence, then unconditionally returns401.

**Concrete example:** login POST `/set_authenticated_user_session`, idToken=synthetic-valid-token, valid matching CSRF cookie/header. ID verification succeeds; Firebase create_session_cookie raises ConnectionError. A valid user is told credentials are invalid during a backend outage.

**Expectation/basis:**401 denotes authentication failure; an infrastructure failure after valid verification should be distinguished with retryable service failure. Existing get_current_user at dependencies.py:370-390 already separates typed invalid cookies from infrastructure503.

**Reproduced proof:** `api_reproduce.py`, disconnect_and_login F11: real auth ASGI route/CSRF verification/account admission, verify_id_token synthetic success and create_session_cookie raises local ConnectionError. Actual id_token_verified=true, HTTP401 `Invalid or expired token`. No live token/Firebase dependency.

**Remediation:** catch concrete invalid/expired/revoked token exceptions separately; map infrastructure/session-storage failure to503 with safe message. **Why this remediation:** preserves credential/error semantics without exposing exception text. **Regression validation:** valid verification plus creation/storage outage503; genuinely bad token401; success still sets cookies/state. **Severity rationale:** incorrect client auth/retry handling during outages, with no demonstrated auth bypass.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/api_reproduce.py` (exit **0**). Observed: **successful ID-token verification followed by cookie-creation ConnectionError returned 401**. [Captured coordinator output](review-evidence-2026-10-25/api_coordinator_rerun.out); [executable fixture](review-evidence-2026-10-25/api_reproduce.py). Limits: synthetic service boundaries; ASGI2.3 real disconnect; local5ms scheduler polling; synthetic120ms latency and burst workloads. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F13] [P2 / Medium] failed selection is saved and returned as connected

**User story — illustrative scenario:**

> As a database user, when I select an inaccessible database from a working connection, I expect the selection to fail while retaining the working configuration, but instead the failed target is saved and reported connected, causing subsequent query and metadata failures.

**Location:** back-end/service/database/connection_handlers.py:862-875 — select_database; back-end/service/database/operations.py:303-357 — fetch_database_info; back-end/controller/database_controller.py:427-435.

**Defect and root cause:** `connection_handlers.select_database`, `service/database/connection_handlers.py:862-875`, ignores the return from `fetch_database_info(new_config, db_name)`. That actual helper at `service/database/operations.py:303-357` catches retrieval errors and returns `(None, public.message)`, so the handler's exception branch does not execute. `ConnectionService.select_database`, `connection_service.py:78-96`, then synchronizes the falsely successful result. Gate S's handler saves that config at `controller/database_controller.py:427-435` and returns success.

**Concrete example:** An authenticated user with working MySQL database `old` selects `{"database":"inaccessible"}` after its permission was removed or a network error occurs. Expected: return a failure and retain `old`; the selection API promises the chosen connection is usable, and its error path exists for that purpose.

**Reproduced proof:** Run `back-end/.venv/bin/python -u docs/security/review-evidence-2026-10-25/db_reproductions.py`, case `failed_database_selection_accepted`. The real helper catches a synthetic `DatabaseOperationError` raised at the `get_tables` I/O boundary. Actual ASGI handler returns `http_status:200`, `selected:"inaccessible"`, and captured session write `saved_database:"inaccessible"`. Only I/O, auth principal, context-sync writes, and session persistence are replaced; tuple handling and route serialization are actual code. No real permission outage was induced.

**Severity rationale:** P2: loses the user's working selection and emits success after a known failure, causing subsequent metadata and query failures. It combines with DB03 to label queries as belonging to a database that is not actually selected.

**Remediation:** Use a structured success/error result, or minimally unpack and check `info, error = fetch_database_info(...)` and return error when `info is None` before sync/session writes. Do not treat an empty but successfully retrieved table list as a failure. 

**Regression validation:** forced metadata exception yields error/non-200 and no session/context update; valid empty database still succeeds. Gate S complete; no missing auth/validation/blocking claim.

**Why this remediation:** Checking the helper result before context/session writes prevents known failures from becoming successful state transitions; empty successful table lists must still be accepted.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/db_reproductions.py` (exit **0**). Observed: **metadata error was swallowed, and inaccessible was reported selected and captured in the session update**. [Captured coordinator output](review-evidence-2026-10-25/db_coordinator.out); [executable fixture](review-evidence-2026-10-25/db_reproductions.py). Limits: offline driver/parser/pool boundaries; inline threadpool dispatch for route functional assertions; no real DB. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F17] [P2 / Medium] Oracle BLOBs fail the query serializer

**User story — illustrative scenario:**

> As an Oracle user, when I select a BLOB containing bytes 00 ff, I expect the documented binary encoding 0x00ff, but instead result serialization fails, causing a query error after successful SQL execution.

**Location:** back-end/service/database/query_result.py:67-89 — encode_value; back-end/service/database/operations.py:497-508 — execute_sql_query.

**Defect and root cause:** `service/database/query_result.py:67-89`, `encode_value`, handles bytes but falls back to `str(value)` for real `oracledb.LOB` objects; `build_query_result:307-337` calls it for BLOB/hex values. Installed oracledb 4.0.2 `lob.py:108-109`, `LOB.__str__`, returns `self.read()`, which is bytes for BLOB. Python rejects a non-string result from `__str__`. `operations.execute_sql_query` builds the result at `operations.py:497-508` and catches this TypeError as `DB_OPERATION_FAILED`.

**Concrete example:** An authenticated user runs `SELECT PAYLOAD FROM ITEMS` where PAYLOAD is BLOB with bytes `00 ff`. Expected: existing binary contract `0x00ff`, preserving exact bytes, not query failure; ordinary bytes already get hexadecimal encoding at `query_result.py:83-84`.

**Reproduced proof:** Run `back-end/.venv/bin/python -u docs/security/review-evidence-2026-10-25/db_metadata_reproductions.py`, case `oracle_blob_serialization`. A **real installed oracledb.LOB** is constructed through `_from_impl` with an offline native-implementation double obeying `read`, `get_max_amount`, `dbtype`, `free_lob` contracts. Actual query function/serializer produce `blob_status:"error"`, `blob_error:"DB_OPERATION_FAILED"`; CLOB text using the same mechanism succeeds with rows `[["text"]]`. Actual LOB fetch/locator lifetime against Oracle is not tested. Gate Q complete; synchronous database work is offloaded in production handler.

**Severity rationale:** P2: supported binary-column queries fail despite successful SQL execution. No broad claim that every Oracle native type fails.

**Remediation:** Materialize supported LOBs **while the connection is borrowed**, then pass their read values back through `encode_value`: `if isinstance(v, oracledb.LOB): return encode_value(v.read())`. Bound LOB size consistently with result persistence limits. 

**Regression validation:** actual LOB class with BLOB bytes and CLOB string; null; returned bytes equal `0x00ff`; materialization occurs before return to pool, including the AI query path which currently builds results after its connection context ends.

**Why this remediation:** Reading native LOB values before returning the connection converts the driver locator into supported bytes/text and uses the existing encoding contract; size bounds avoid loading arbitrary large LOBs.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/db_metadata_reproductions.py` (exit **0**). Observed: **real oracledb.BLOB serialization became DB_OPERATION_FAILED; matching CLOB control succeeded**. [Captured coordinator output](review-evidence-2026-10-25/db_metadata_coordinator.out); [executable fixture](review-evidence-2026-10-25/db_metadata_reproductions.py). Limits: real driver LOB over synthetic storage; Oracle/SQLServer SQL executed in SQLite catalog fixtures; stateful PostgreSQL cursor double; no optimizer or cross-user disclosure proved. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F18] [P2 / Medium] Oracle composite foreign keys become a cross product

**User story — illustrative scenario:**

> As an Oracle user, when I inspect a two-column tenant foreign key, I expect two position-matched column relationships, but instead the tool emits four cross-product pairs, causing incorrect relationship information for joins and diagrams.

**Location:** back-end/service/database/adapters/oracle_adapter.py:442-476 — get_foreign_keys_query; back-end/service/database/ai_tool_executor.py:1006-1036 — _get_foreign_keys.

**Defect and root cause:** `OracleAdapter.get_foreign_keys_query`, `service/database/adapters/oracle_adapter.py:442-476`, joins referenced `all_cons_columns b` by referenced constraint and owner at `:458` / `:473`, without matching `a.position = b.position`. For two-column keys, both local columns match both referenced columns. `AIToolExecutor._get_foreign_keys`, `ai_tool_executor.py:1006-1036`, emits every returned pair as an actual relationship.

**Concrete example:** CHILD `(TENANT_ID,PARENT_ID)` references PARENT `(TENANT_ID,ID)` in owner REVIEW. The get_foreign_keys tool should return two ordered mappings, preserving tenant scoping. It instead tells the model that TENANT_ID also references ID and PARENT_ID also references TENANT_ID, potentially yielding false joins.

**Reproduced proof:** Run `back-end/.venv/bin/python -u docs/security/review-evidence-2026-10-25/db_metadata_reproductions.py`, case `oracle_composite_fk_cross_product`. The **actual adapter-generated Oracle SQL** runs in SQLite against synthetic all_constraints/all_cons_columns rows including correct owner/constraint/position fields. Oracle positional binds are supplied as equivalent SQLite named-bind mappings. Actual executor returns four pairs: `(PARENT_ID,ID)`, `(PARENT_ID,TENANT_ID)`, `(TENANT_ID,ID)`, `(TENANT_ID,TENANT_ID)`; expected only the first and last. Real Oracle catalogs/server were not queried. The PostgreSQL adapter has a suspicious analogous join, but that path is not promoted as independently reproduced here.

**Severity rationale:** P2 metadata corruption; model may produce wrong joins/aggregates on common composite tenant keys. Model behavior itself is not asserted or measured.

**Remediation:** Add `AND a.position = b.position` to both Oracle branches and retain referenced owner/constraint matching. This restores one-to-one ordinal pairing. 

**Regression validation:** two- and three-column FKs, table-specific and all-table calls, reordered column names, identical constraint names in different owners, single-column passing control. Gate A complete; tool dispatch is `tools.py:893`.

**Why this remediation:** Matching ordinal positions removes false pairings without losing constraint/owner isolation or changing valid single-column relationships.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/db_metadata_reproductions.py` (exit **0**). Observed: **actual Oracle catalog SQL returned four pairs instead of the two ordinal matches**. [Captured coordinator output](review-evidence-2026-10-25/db_metadata_coordinator.out); [executable fixture](review-evidence-2026-10-25/db_metadata_reproductions.py). Limits: real driver LOB over synthetic storage; Oracle/SQLServer SQL executed in SQLite catalog fixtures; stateful PostgreSQL cursor double; no optimizer or cross-user disclosure proved. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F19] [P2 / Medium] Oracle nullable columns are reported as required

**User story — illustrative scenario:**

> As an Oracle user, when I ask for table details containing a nullable Y column, I expect is_nullable=true, but instead the AI tool reports false, causing incorrect schema constraints in its context.

**Location:** back-end/service/database/ai_tool_executor.py:1230 — _get_table_details; back-end/service/database/adapters/oracle_adapter.py:543-548 — get_table_details_query.

**Defect and root cause:** `OracleAdapter.get_table_details_query`, `adapters/oracle_adapter.py:543-548`, returns raw `c.nullable` (`Y`/`N`). `AIToolExecutor._get_table_details`, `ai_tool_executor.py:1230`, treats only uppercase `YES` as true. A Y value therefore becomes false. The separate schema HTTP normalizer at `controller/database_schema_controller.py:47-55` already recognizes Y, but is not used on this AI tool path.

**Concrete example:** In an Oracle session and matching Oracle context owner BETA, user asks about ITEMS. OPTIONAL_NOTE VARCHAR2(100) has nullable `Y`. Expected `is_nullable:true` per the adapter's catalog field contract. Tool emits false, giving the assistant incorrect schema constraints.

**Reproduced proof:** Run `back-end/.venv/bin/python -u docs/security/review-evidence-2026-10-25/db_metadata_reproductions.py`, case `oracle_nullable_flag`. A coherent Oracle config/context and a real Oracle adapter with a catalog-row cursor double produce `catalog_nullable:"Y"`, `reported_nullable:false`. This coherent run is separate from the deliberate mismatched-session case for DB10. Driver-native catalog fetching is not exercised.

**Severity rationale:** P2 correctness of supported metadata: null handling and schema explanations can be wrong. No claim of data mutation, SQL execution bypass, or actual model-generated wrong answer.

**Remediation:** Normalize at adapter boundary to common YES/NO or accept established true forms in the shared column decoder: `nullable = value if isinstance(value,bool) else str(value).upper() in {"YES","Y","TRUE","1"}` with a defined None policy. 

**Regression validation:** Oracle Y/N, PostgreSQL/MySQL YES/NO, bool and null controls. Gate A complete; details dispatch `tools.py:856`.

**Why this remediation:** A shared, explicitly defined native-nullability decoder preserves Oracle Y/N semantics and prevents differing HTTP and AI interpretations.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/db_metadata_reproductions.py` (exit **0**). Observed: **coherent Oracle config/context reported catalog Y as is_nullable=false**. [Captured coordinator output](review-evidence-2026-10-25/db_metadata_coordinator.out); [executable fixture](review-evidence-2026-10-25/db_metadata_reproductions.py). Limits: real driver LOB over synthetic storage; Oracle/SQLServer SQL executed in SQLite catalog fixtures; stateful PostgreSQL cursor double; no optimizer or cross-user disclosure proved. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F22] [P2 / Medium] SQL Server introspection merges same-name tables across schemas

**User story — illustrative scenario:**

> As a SQL Server user, when I inspect dbo.orders alongside a separate archive.orders, I expect one correctly scoped table and its columns, but instead the metadata combines their names and columns, causing an inaccurate schema description.

**Location:** back-end/service/database/adapters/sqlserver_adapter.py:222-233 — get_table_schema_query and :274-283 — get_all_tables_for_cache.

**Defect and root cause:** `SQLServerAdapter.get_all_tables_for_cache`, `adapters/sqlserver_adapter.py:274-283`, ignores its schema argument and returns TABLE_NAME only for the whole catalog. `get_table_schema_query:222-233` filters by catalog/table name but omits TABLE_SCHEMA. Related batch/detail/index/FK methods also lack consistent schema qualifiers. `DatabaseOperations.get_table_schema`, `operations.py:173-184`, supplies only db/table for non-PostgreSQL adapters. Thus two distinct qualified tables collapse into the same unqualified name and columns merge.

**Concrete example:** In sales, `dbo.orders(id)` and `archive.orders(archive_note)` are separate tables. The normal schema explorer or AI context for dbo should include dbo.orders once and its actual columns. Instead it gets duplicate `orders` names and describes one impossible table containing both columns.

**Reproduced proof:** Run `back-end/.venv/bin/python -u docs/security/review-evidence-2026-10-25/db_metadata_reproductions.py`, case `sqlserver_schema_metadata_merge`. Actual get_tables/get_table_schema operations and actual adapter SQL execute against an in-memory SQLite INFORMATION_SCHEMA fixture. Only DB-API `%s` placeholders are translated to `?`. With config schema dbo, actual output is `table_list:["orders","orders"]`, `column_names:["id","archive_note"]`. Catalog join/filter semantics execute locally; no real SQL Server instance or query plan was used.

**Severity rationale:** P2 metadata fidelity for ordinary databases using multiple schemas; can cause wrong queries or unavailable schema panels. Schema changes are not unauthorized access here; the configured DB user still controls available metadata.

**Remediation:** Carry schema explicitly into every SQL Server metadata query and filter TABLE_SCHEMA; preserve schema-qualified table identities whenever listing multiple schemas, rather than keying by TABLE_NAME. Qualify PK/index/FK joins by schema/object identity. 

**Regression validation:** the reproduced two-schema fixture returns exactly dbo.orders/id for dbo and archive.orders/archive_note for archive; same-named PK constraints do not mix. Gates T and M complete; AI counterpart Gate A.

**Why this remediation:** Preserving schema identity through lists, cache keys and metadata predicates keeps separate SQL Server objects separate; merely deduplicating table names would still describe the wrong columns.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/db_metadata_reproductions.py` (exit **0**). Observed: **actual SQL returned orders twice and combined id/archive_note across schemas**. [Captured coordinator output](review-evidence-2026-10-25/db_metadata_coordinator.out); [executable fixture](review-evidence-2026-10-25/db_metadata_reproductions.py). Limits: real driver LOB over synthetic storage; Oracle/SQLServer SQL executed in SQLite catalog fixtures; stateful PostgreSQL cursor double; no optimizer or cross-user disclosure proved. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F03] [P2 / Medium] Bulk schema deletion counts failed deletions as cleared

**User story — illustrative scenario:**

> As a database user, when I clear the sales and analytics schema contexts while their deletions fail, I expect a failure or accurate partial result, but instead the API says both were cleared, causing continued use of stale context.

**Location:** back-end/controller/context_controller.py:197-208 — delete_all_schema_contexts.

**Defect and root cause:** `back-end/controller/context_controller.py:197-208`, `delete_all_schema_contexts`, ignores each boolean at :206 and counts attempted schema keys.

**Concrete example:** authenticated user clears stale schemas `sales` and `analytics`; repository deletion returns False for each non-transient failure. DELETE `/api/v1/user/context/schemas`, no body.

**Expectation/basis:** success should indicate actual deletion; single-schema route at :179-194 already distinguishes the False contract. Real ContextService.clear_schema_context propagates ContextRepository.delete_field's boolean, :373-382.

**Reproduced proof:** `api_reproduce.py`, `context_routes`, F03. Real route and ContextService; only repository get/delete boundaries doubled. Actual HTTP200 `{status:success,message:Cleared 2 schema contexts}` while failed fields are database_schemas.sales and database_schemas.analytics. No live Firestore permissions error is created.

**Remediation:** collect successful/failed deletion results, return an error or explicit partial completion when any fails; report successful count only. **Why this remediation:** preserves failure information already supplied by the repository. **Regression validation:** all-false, mixed, all-true outcomes with exact response counts. **Severity rationale:** users are told stale schema data was removed when it remains available to subsequent use.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/api_reproduce.py` (exit **0**). Observed: **HTTP 200 said Cleared 2 schema contexts although both repository deletions returned false**. [Captured coordinator output](review-evidence-2026-10-25/api_coordinator_rerun.out); [executable fixture](review-evidence-2026-10-25/api_reproduce.py). Limits: synthetic service boundaries; ASGI2.3 real disconnect; local5ms scheduler polling; synthetic120ms latency and burst workloads. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F08] [P2 / Medium] Configured default HTTP limits are not enforced on undecorated routes

**User story — illustrative scenario:**

> As an operator, when I configure a default of one HTTP request per minute, I expect undecorated protected routes to enforce it, but instead three same-client table-list requests all succeed, causing missing configured request protection.

**Location:** back-end/main.py:446-449 — create_app limiter registration; back-end/controller/rate_limiter.py:109-113; back-end/controller/database_schema_controller.py:216-232 — get_tables.

**Defect and root cause:** main.py:446-449 registers limiter and error handler but no SlowAPI enforcement middleware; controller/rate_limiter.py:109-113 creates the shared limiter. Undecorated `controller/database_schema_controller.py:216-232` GET get_tables has no mechanism calling the limiter.

**Concrete example:** authenticated connected user or their automated client sends three same-IP GET `/api/v1/get_tables` under RATELIMIT_DEFAULT=1 per minute. Explicit chat/login decorators are existing safeguards; this finding concerns defaults for other routes, not absence of every limit.

**Expectation/basis:** config.py documents defaults and main logs them as enabled protection. Installed SlowAPI middleware.py performs default-limit checks for undecorated endpoints. Important correction: installed SlowAPI extension.py:293-308 **does** read RATELIMIT_DEFAULT from environment, yielding one default group in this run; prior report's zero-default assertion is not supported here.

**Reproduced proof:** `api_reproduce.py`, middleware_routes F08, actual create_app middleware stack and real get_tables route, synthetic authenticated DB dependency and get_tables service result. Actual limiter_enabled=true, registered_default_groups=1, statuses200/200/200, no SlowAPI middleware in captured stack. TestingConfig normally disables limiter; driver locally explicitly enables it without starting lifespan. No production Redis load test.

**Remediation:** supply configured defaults explicitly (including Config defaults when env is absent) and install SlowAPI's compatible default-limit middleware; define exemptions/route override policy. **Why this remediation:** executes checks on routes without decorators. **Regression validation:** undeclared route hits configured1/min on second request; explicit decorators and selected exemptions retain intended behavior. **Severity rationale:** documented resource protection does not constrain metadata and other undecorated traffic; auth still applies.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/api_reproduce.py` (exit **0**). Observed: **one registered default group and an enabled limiter still yielded three 200 table responses under 1/min**. [Captured coordinator output](review-evidence-2026-10-25/api_coordinator_rerun.out); [executable fixture](review-evidence-2026-10-25/api_reproduce.py). Limits: synthetic service boundaries; ASGI2.3 real disconnect; local5ms scheduler polling; synthetic120ms latency and burst workloads. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F15] [P2 / Medium] default SQL Server row counts query the public schema

**User story — illustrative scenario:**

> As a SQL Server user, when I inspect orders without an explicit schema setting, I expect the intended dbo.orders row count, but instead the generated query counts public.orders, causing a wrong count or a failed schema panel.

**Location:** back-end/service/database/operations.py:242-252 — DatabaseOperations.get_table_row_counts.

**Defect and root cause:** `DatabaseOperations.get_table_row_counts`, `service/database/operations.py:242-252`, defaults `schema` to `"public"` before the SQL Server branch applies `schema or "dbo"`. Missing schema therefore remains the nonempty PostgreSQL default. Connections created by `connect_sqlserver`, `connection_handlers.py:321-330`, do not set a schema. `DatabaseService.get_table_info`, `database_service.py:291-307`, invokes these counts from Gate M.

**Concrete example:** A normal SQL Server connection with `{"db_type":"sqlserver","database":"sales"}` has a default `dbo.orders` containing three rows. Another `public.orders` contains seven. Opening the schema/details panel for `orders` should count dbo.orders, but the query targets public.orders. If public schema does not exist, the panel fails instead.

**Reproduced proof:** Run `back-end/.venv/bin/python -u docs/security/review-evidence-2026-10-25/db_reproductions.py`, case `sqlserver_default_count_schema`. Actual operation generates `SELECT 'orders' AS table_name, COUNT(*) AS row_count FROM [public].[orders]`; that exact query is executed in an in-memory SQLite fixture with attached dbo/public schemas. It returns row_count 7 against intended dbo count 3. The real SQL Server parser/server was not run; bracket-qualified SQL and COUNT semantics are exercised locally.

**Severity rationale:** P2 correctness/availability for standard SQL Server connections. No attacker prerequisites or unauthorized data access are asserted.

**Remediation:** Compute schema after DB type: `schema = config.get("schema") or ("dbo" if db_type == "sqlserver" else "public")`. Prefer the actual selected/default schema consistently with introspection. 

**Regression validation:** missing, None, and explicit schema values; dbo/public objects of the same name with distinct counts. Gate M complete.

**Why this remediation:** Choosing the fallback after the dialect removes the accidental PostgreSQL default from the SQL Server branch without overriding an explicit schema.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/db_reproductions.py` (exit **0**). Observed: **actual generated COUNT on public.orders returned 7 against the fixture intended dbo count 3**. [Captured coordinator output](review-evidence-2026-10-25/db_coordinator.out); [executable fixture](review-evidence-2026-10-25/db_reproductions.py). Limits: offline driver/parser/pool boundaries; inline threadpool dispatch for route functional assertions; no real DB. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F34] [P2 / Medium] Heartbeat producer consumes an unbounded queue

**User story — illustrative scenario:**

> As an operator serving a slow streaming client, when I allow output to arrive faster than the client consumes it, I expect bounded pending output, but instead the heartbeat producer buffers the entire burst, causing memory proportional to pending stream output.

**Location:** back-end/controller/conversations_controller.py:116-165, especially :133 — _stream_with_heartbeats.

**Defect and root cause:** conversations_controller.py:116-165, _stream_with_heartbeats creates asyncio.Queue without maxsize :133 and puts from detached producer :136-143. Consumer backpressure does not reach producer.

**Concrete example:** authenticated chat/resume to a slow/stalled client while a tool emits large/rapid result events. Driver sources produce1000 and10000 distinct1041-byte frames with no source wait, then consumer takes only its first item.

**Expectation/basis:** queued output must be bounded independently of network-client speed and stream volume. **Reproduced proof:** `api_reproduce.py`, queue_and_context_errors F34, exact production wrapper and tracemalloc. At first delivery, produced counts equal1000 and10000; retained bytes1,158,840 and11,483,784, respectively; peaks1,160,600/11,485,536, elapsed3.56ms/30.21ms. These are synthetic burst workloads demonstrating proportional queue growth, not claimed model emission rates or full production OOM.

**Remediation:** bound queued events/bytes and await capacity. Also change cancellation/termination: re-raise cancellation without queuing error/finished markers; current except BaseException and finally both await queue.put, which would deadlock a naive bounded queue after consumer cancellation. Use cancellation-aware producer shutdown and terminal protocol that always unblocks consumer. **Why this remediation:** creates real backpressure without introducing close hangs. **Regression validation:** slow consumer bounded retained bytes, normal/error EOF, consumer.aclose with full queue, no orphan producer. **Severity rationale:** supported high-volume/slow-client streams amplify worker memory without an output-queue bound; authentication/concurrency limits constrain but do not remove per-stream growth.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/api_reproduce.py` (exit **0**). Observed: **first delivery followed 1000/10000 produced 1041-byte events, retaining approximately 1.16MB/11.48MB**. [Captured coordinator output](review-evidence-2026-10-25/api_coordinator_rerun.out); [executable fixture](review-evidence-2026-10-25/api_reproduce.py). Limits: synthetic service boundaries; ASGI2.3 real disconnect; local5ms scheduler polling; synthetic120ms latency and burst workloads. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F04] [P3 / Low] Administrative metrics reset blocks the event loop

**User story — illustrative scenario:**

> As an administrator, when I reset metrics in an enabled debug environment during a slow Firestore write, I expect other requests to keep progressing, but instead the worker event loop pauses, causing delayed concurrent streams and timers.

**Location:** back-end/controller/context_controller.py:367 — reset_context_metrics; back-end/service/context/context_service.py:97 — ContextMetrics.reset.

**Defect and root cause:** context_controller.py:353-368, reset_context_metrics calls ContextMetrics.reset synchronously at :367; `service/context/context_service.py:90-109` invokes synchronous Firestore ref.set at :97.

**Concrete example:** authorized administrator in DEBUG or TESTING requests POST `/api/v1/context/metrics/reset`; a slow Firestore write pauses concurrent work on that worker. Production DEBUG=false/TESTING=false correctly blocks this action; this safeguard limits severity.

**Expectation/basis:** async route should offload actual synchronous RPCs; neighboring context handlers use run_in_threadpool. **Reproduced proof:** `api_reproduce.py`, context_routes F04. Real handler/reset implementation with a ref.set double sleeping120ms, three trials; independent10ms timers observed 121.999ms,122.544ms,122.118ms, HTTP200. This measures the injected120ms blocking workload, not actual cloud latency.

**Remediation:** await run_in_threadpool(ContextMetrics.reset, uid). **Why this remediation:** keeps the synchronous Firestore RPC off the event loop. **Regression validation:** slow ref.set plus concurrent timer/health request, assert unrelated work progresses. **Severity rationale:** worker-level delay is real but route is administrator-only and environment-gated.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/api_reproduce.py` (exit **0**). Observed: **three injected 120ms writes delayed independent 10ms timers to approximately 122ms**. [Captured coordinator output](review-evidence-2026-10-25/api_coordinator_rerun.out); [executable fixture](review-evidence-2026-10-25/api_reproduce.py). Limits: synthetic service boundaries; ASGI2.3 real disconnect; local5ms scheduler polling; synthetic120ms latency and burst workloads. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F35] [P3 / Low] Cache timestamps are normalized incorrectly

**User story — illustrative scenario:**

> As an user with legacy schema-cache timestamps, when I load equivalent fresh or expired timestamps in datetime and offset ISO forms, I expect equal instants to have equal TTL decisions, but instead the cache misses a fresh datetime and accepts an expired offset string, causing unnecessary refreshes or stale schema context.

**Location:** back-end/service/context/context_service.py:303-314 — ContextService.get_schema_context.

**Defect and root cause:** service/context/context_service.py:303-314, get_schema_context: datetime.fromtimestamp lacks tz; ISO offsets use replace(tzinfo=UTC), which relabels instead of converting the instant.

**Concrete example:** schema cached by an older writer as a Firestore/Python aware datetime, or an offset-bearing ISO timestamp. AI schema context flows via database/context_sync.py:21-25 and ai_tool_executor.py:756. New store_schema_context currently writes UTC ISO, limiting exposure to legacy/external representations.

**Expectation/basis:** method accepts datetime/Firestore timestamps explicitly and must honor configured TTL for equal instants regardless of representation.

**Reproduced proof:** `api_reproduce.py`, queue_and_context_errors F35, real get_schema_context with repository-context and metric boundary doubles. Fresh aware datetime misses with naive/aware subtraction warning; equivalent UTC ISO hits. TTL86400; a timestamp86460s old misses as UTC ISO but hits as +05:30 ISO. Same logical instant, different cache decision. No Firestore Timestamp SDK instance is required; datetime exercises the same .timestamp branch.

**Remediation:** use datetime.fromtimestamp(value.timestamp(), tz=timezone.utc); astimezone(UTC) for aware parsed values; explicitly define treatment of naive legacy input. **Why this remediation:** preserves the instant and makes subtraction timezone-consistent. **Regression validation:** fresh/expired datetime, UTC ISO, Z, positive/negative offset forms must agree. **Severity rationale:** legacy cache misses and stale-schema TTL extension; current UTC writes avoid the affected representations.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/api_reproduce.py` (exit **0**). Observed: **fresh datetime missed while UTC ISO hit; expired UTC ISO missed while equal+05:30 ISO hit**. [Captured coordinator output](review-evidence-2026-10-25/api_coordinator_rerun.out); [executable fixture](review-evidence-2026-10-25/api_reproduce.py). Limits: synthetic service boundaries; ASGI2.3 real disconnect; local5ms scheduler polling; synthetic120ms latency and burst workloads. The proposed remediation was checked against the root cause but was not implemented or tested.

### [F36] [P3 / Low] Oracle error-code patterns cannot match lowercased input

**User story — illustrative scenario:**

> As an Oracle user, when I receive a permission or quoted-string syntax error, I expect its declared safe permission or syntax category, but instead the classifier emits unknown and DB_OPERATION_FAILED, causing loss of actionable error classification.

**Location:** back-end/core/errors.py:41, :53 and :87-89 — _ERROR_PATTERNS / classify_db_error.

**Defect and root cause:** core/errors.py:41, :53 vs classify_db_error :87-89. Case-sensitive uppercase ORA patterns are searched against lowercase messages. The separate singular `insufficient privilege` word-boundary pattern does not match plural privileges.

**Concrete example:** Oracle query fails `ORA-01031: insufficient privileges` or `ORA-01756: quoted string not properly terminated`; public_database_error is used by database operations.py and ai_tool_executor.py. The user/agent receives generic failure rather than permission/syntax guidance.

**Expectation/basis:** declared explicit Oracle regex categories and canonical error catalog indicate intended permission_denied/syntax_error behavior. **Reproduced proof:** `api_reproduce.py`, queue_and_context_errors F36 invokes real classify_db_error and public_database_error; both messages actually produce category unknown, public_code DB_OPERATION_FAILED. Driver message strings are synthetic; no Oracle server needed.

**Remediation:** lowercase ORA patterns or compile them case-insensitive; retain canonical safe messages. **Why this remediation:** makes pattern and target case compatible. **Regression validation:** both example codes in uppercase/lowercase plus non-Oracle controls; check public codes DB_PERMISSION_DENIED/DB_SYNTAX_ERROR. **Severity rationale:** diagnostic/routing degradation, no secret disclosure or execution-policy bypass proven.

**Main-agent verification:** Inspected the cited implementation, relevant callers and existing safeguards, then independently reran `back-end/.venv/bin/python docs/security/review-evidence-2026-10-25/api_reproduce.py` (exit **0**). Observed: **both Oracle permission/syntax example messages classified unknown with generic public error**. [Captured coordinator output](review-evidence-2026-10-25/api_coordinator_rerun.out); [executable fixture](review-evidence-2026-10-25/api_reproduce.py). Limits: synthetic service boundaries; ASGI2.3 real disconnect; local5ms scheduler polling; synthetic120ms latency and burst workloads. The proposed remediation was checked against the root cause but was not implemented or tested.

## Unverified concerns and withdrawn extensions

These are **excluded from the 37 confirmed root-cause findings**. An effect left unproved by a confirmed finding's fixture remains a limitation, not an extra confirmed issue.

| Concern | Evidence/limit or missing prerequisite | Exact next verification step |
|---|---|---|
| N02: long ReAct tasks may finish at their first segment boundary | Real production ReAct builder with synthetic always-tool model/tool finishes at checkpoint49 under long_task200/segment50, with no continuation/compaction event. The synthetic tool bypasses actual application guards; realistic task failure and end-to-end completion handling are unverified. | Use a supported multi-stage workflow through the actual guarded tools and full SSE path that legitimately needs a second segment; capture task outcome and pending work. Do not infer production152/764step runs from the generic graph probe. |
| PostgreSQL composite-FK pairing extension of F18 | Similar query structure was inspected; only the Oracle catalog query was executed. | Execute the generated PostgreSQL information_schema query on a synthetic composite/cross-schema catalog or disposable PostgreSQL instance, verifying column position mapping. |
| DNS re-resolution, proxies and additional Oracle DSN grammars | F12 proves mixed failover destination validation only; it does not prove a successful DNS-rebinding connection or every descriptor/proxy variation. Deployed egress rules were not inspected. | Use isolated controlled DNS plus disposable listeners and the real driver, testing each supported grammar and destination pinning without touching private production services. |
| Reconnect racing with disconnect/expiry | Existing unconditional state writes are a lead; no corresponding concurrent route reproduction was run. | Barrier old pool closure, complete a new connection on the same cookie, then release old disconnect and verify the new generation/config remains selected. |
| Refund after a quota-window rollover | No executed interleaving proves an old refund decrements a new window under allowed timings. | Fake-clock the actual quota Redis commands, debit A/expire/debit B/refund A through a reachable admission-failure path, then inspect B's count. |
| Disconnect failure during automatic expiry | F10 executed explicit HTTP disconnect only; the expiry sibling was source-traced. | Trigger real cached-config expiry with an actual service close failure and inspect retained retry ownership before extending F10's executed-path scope. |
| Qdrant readiness lock across event loops | Lock comments and implementation differ, but no actual failure was reproduced; the client is synchronous and offloaded. | Concurrently initialize the actual adapter from two loops following failed readiness; capture lock failure or withdraw. |
| Schema-qualified allowed SQL functions with mutating implementations | Parser behavior alone does not prove permitted mutation through the real read-only transaction/privilege boundaries. | Use disposable supported databases and a controlled function; execute through the real query path and inspect committed state and transaction restrictions. |
| Large execution-result commit limits | No oversized Firestore commit/request failure was reproduced. This is separate from F37's canonical parent array. | Build bounded synthetic result chunks and execute the real commit construction against an isolated emulator/test store with request-limit instrumentation. |

**Withdrawn:** PostgreSQL DSN selection under the current snapshot is handled by the adapter's explicit dbname override. Its executed control selected target correctly. It is not included in F14. The broad generic-graph continuation interpretation from the earlier report is also withdrawn for ordinary ReAct runs; F29 covers the reproduced nonzero-checkpoint resume case.

F16 does not prove indefinite socket retention after garbage collection. F20/F23 establish actual session-setup/driver-call contracts with stateful/offline boundaries; a disposable PostgreSQL/Oracle instance with distinct same-named tables would extend evidence to real engine plan/name-resolution outputs. F32 proves stored transcript retention, not unauthorized retrieval. F12 proves unchecked driver destinations, not successful internal network access. F37 does not claim exactly32 real turns fit: real storage overhead can reject earlier. These limits are preserved rather than silently elevated into impacts.

## Remediation order

1. **Close the destination-validation mismatch (F12).** Fail closed on unsupported Oracle grammar, then validate/canonicalize every effective driver destination. Existing auth remains required; inspect deployment egress as a separate defense rather than assuming it repairs application validation.
2. **Make deletion final across delayed work and stores (F33, F32).** Introduce conversation-level write/deletion fencing before expanding checkpoint/summary/vector cleanup, so late writers cannot repopulate data after successful cleanup. Remove every checkpoint generation, with retry ownership for failed external erasure.
3. **Repair cancellation ownership and persistence (N01, F01, F02, F27, F28).** Shield bounded essential cleanup at its owning layer; preserve partial history; cover debit-to-admission cancellation; replace uncertain/expiring aggregate ownership with renewable request-specific leases. These changes must not bypass account erasure barriers.
4. **Align selected state with execution (F14, F23, F21, F13, F20).** Make session/driver identity authoritative, apply each selected namespace on borrow, and persist selection only after verified success. Repair retry-state preservation and late pool returns together (F10/F16).
5. **Bound durable history and output (F37, F34).** Migrate canonical messages to bounded records with stable history cursors and complete deletion support. Add SSE backpressure with cancellation-aware termination; a maxsize-only queue change can deadlock cleanup.
6. **Enforce resolved budgets and reliable background state (F29/F30, F24/F25/F26).** Count real graph steps across resume; reserve tool calls atomically; distinguish no work from failed eligible indexing, back off partial failures, and prevent replay scheduling. Investigate N02 before redesigning continuation.
7. **Correct settings, metadata and response semantics (F06/F07/F05, F15/F17/F18/F19/F22, F08/F09/F11/F03).** Add targeted failure/interleaving/driver-contract regression cases from the supplied probes. Remove synchronous SDK calls from async compaction (F31) while preserving transaction units.
8. **Address limited diagnostics/legacy paths (F04/F35/F36).** Offload the gated metrics reset, normalize timestamp instants, and fix Oracle regex case. Keep their lower severity proportional to their prerequisites and observed effects.

No proposed patch was applied. Each fix should first turn its corresponding defect probe into a regression test that fails on this snapshot, then verify the normal/failure/authorization/concurrency controls listed in its finding. The review's passing defect probes are not evidence that any fix works.

## Coverage and FastAPI gate appendix

The following specialist records preserve exact route registrations, response/status declarations, full-handler reads, signature validation/auth dependencies, blocking-call evidence where alleged, file ownership and material exclusions. Source paths in these records are relative to `back-end/` unless explicitly prefixed. Absent response models/status declarations are recorded for verification; absence alone is not reported as a defect.

### API/services gates and inspected safeguards

#### FastAPI gate record (applies independently to each listed finding)

All cited handlers were opened and their full bodies inspected. No finding asserts absent auth or absent Pydantic validation. No sync-in-async claim is made except F04, where the exact synchronous ref.set call and measured delay are identified.

| Findings | Gate1 method/decorator/response/status | Gate2 full body read; blocking claim | Gate3 signature/auth/validation |
|---|---|---|---|
| F01, F02, F34, N01 (each) | conversations_controller.py:431-435 POST/pass_user_prompt_to_llm; :493-497 POST/resume_agent. response_class StreamingResponse; responses STREAMING_RESPONSES; response_model and explicit status absent, default200. | chat :439-490; resume :500-543; shared handler :181-428, wrapper :116-165. No blocking-I/O claim; N01 service full :117-528 inspected. | chat Request, ChatRequest Pydantic, user Depends(get_current_user), db_config Depends(get_authenticated_db_config) :439-443; resume same with AgentResumeRequest :500-504. Auth/selection/owner checks precede debit :228-302. |
| F03 | context_controller.py:197 DELETE/user/context/schemas; response_model/status absent, default200. | :198-208; no blocking claim, threadpool present. | user AuthenticatedUser Depends(get_current_user) :198; no body. |
| F04 | context_controller.py:353 POST/context/metrics/reset; response_model/status absent, default200. | :354-368; blocking ContextMetrics.reset :367 -> context_service.py:97 ref.set. | user Depends(require_admin_user) :354; admin UID decision dependencies.py:427-438; DEBUG/TESTING guard :360. |
| F05 | context_controller.py:458 POST/user/session/active; response_model/status absent, default200. | :459-497; no blocking claim. | Request, SessionActiveRequest Pydantic, user Depends(get_current_user) :460. SessionActiveRequest ID max length validated api_contract/context.py:62-65. |
| F06, F07 (each) | context_controller.py:397 POST/user/settings; response_model/status absent, default200. | :398-420; no blocking claim, save offloaded. GET control :374-394. | Request, SaveUserSettingsRequest Pydantic, user Depends(get_current_user) :399-401; schema constraints api_contract/context.py:15-52 already validate inputs. |
| F08 | database_schema_controller.py:216-220 GET/get_tables, response_model ApiSuccess[TableListData], responses COMMON_ERROR_RESPONSES, explicit status absent/default200. | :221-232; no blocking claim, threadpool present. | db_config Depends(require_authenticated_db_config) :221 -> authenticated dependencies dependencies.py:555-583 -> get_current_user. No body. |
| F09 | main.py middleware registrations :371-449 are the response-producing registration sites; CSRF POST settings decorator :397; normal GET/api/v1/ api_router.py:20. | middleware bodies main.py:382-423, boundaries core/http_boundary.py full read. No blocking claim. | csrf_middleware Request/call_next :408 and real double-submit check dependencies.py:136-157. Test settings signature is :399-401 above. Error occurs before auth/validation for correct middleware reasons. |
| F10 | database_controller.py:273-277 POST/disconnect_db; response_model ApiSuccess[DisconnectDatabaseData], responses COMMON_ERROR_RESPONSES; explicit status absent/default200. | :278-302; no blocking claim, disconnect offloaded. | Request :279, db_config Depends(get_authenticated_db_config) :280, user Depends(get_current_user) :281. |
| F11 | auth_controller.py:112 POST/set_authenticated_user_session, limiter10/min :114; response_model/status absent/default200. | :115-172; no blocking claim, Firebase calls offloaded. | Request, Response, SetSessionRequest Pydantic :115. This is an authentication endpoint: verifies ID token :122-126; explicit CSRF :119. No missing-auth allegation. |
| F35 | Service timestamp defect; route gates are not the substance of this finding. Source reachability via context_sync/AIToolExecutor and authenticated chat established. | Full get_schema_context :282-329. No blocking claim. | No unvalidated HTTP parameter alleged; stored heterogeneous timestamp is the input. |
| F36 | Pure error-classification defect; no route alteration or missing-auth allegation. Public DB operations reach it through public_database_error. | Full classifier core/errors.py:75-91 and public mapping inspected. No blocking claim. | Synthetic DB exception text; no request schema allegation. |

#### Source coverage and existing safeguards inspected

All54 assigned production files were inspected for behavior and relevant callers; executable reproduction is limited to the15 candidates above, not all application branches. Exact assigned file list is the API/services/infrastructure group in `/tmp/moonlit-review-20261025/assignments.json`. Group coverage:

- api_contract: all13 files (__init__, common, context, conversations, conversations_protocols, database, database_protocols, database_schemas, orchestration_protocols, query_schemas, run_context, runtime_ports, streaming); request limits/extra-forbid, UUIDv4 IDs, safe validation error projection, public response projection, port contracts and RunControl budgets.
- api_router.py, composition.py, config.py, main.py, dependencies.py; auth/CSRF/session lifecycle, lifespan configuration, middleware order/error envelopes, session atomic Lua top-level merge and per-user session cleanup.
- controller: all9 files (__init__, auth_controller, context_controller, conversations_controller, database_controller, database_schema_controller, quota_controller, rate_limiter, user_dashboard_controller); complete registered handler bodies and service boundaries inspected.
- core: all10 files (__init__, account_activity, admin_authorization, audit, audit_middleware, errors, http_boundary, logging, security, startup_diagnostics); Redis/in-memory erasure barrier, tombstone and admission behavior, header/body boundaries, audit redaction and actor pseudonyms, request IDs, safe public errors.
- service/context __init__, context_service; service/conversations __init__, agent_streaming, conversation_service, conversation_streaming_service, run_context; service/dashboard __init__, account_deletion, dashboard_service, usage_analytics; service/quota __init__, user_quota_service; service/__init__, service/redis_service; service/user_settings __init__, user_settings_service.

Consulted persistence boundary contracts ContextRepository, UsageRepository callers, DatabaseService.disconnect and context_sync; repository/DB implementation review remains database specialist ownership. Checkpoint/graph/provider/memory internals remain orchestration specialist ownership. Frontend source limited to tab-ID/heartbeat reachability, not a frontend audit.

Important safeguards checked rather than assumed absent: verified Firebase session auth and always-check-revoked protected-cookie validation; no-cookie-only dev bypass; optional auth preserves409/503; explicit admin UID gate; typed request constraints and extra-forbid; provider/model authorization and existing-conversation ownership before quota; user quota refund-on-rejection plus zero-floor decrement; session Lua shallow merge; per-cookie hashed state; body cap before parsing; CSRF on mutating requests; safe database response projection; account request/stream admissions plus shared erasure fencing, recent-auth/CSRF/account-user equality, owned connection cleanup before identity deletion, strict conversation child cleanup, and deleted-account tombstones.


### Database gates and coverage

#### FastAPI gate evidence

All paths below are under `back-end/`. Each handler body was opened and read in full. `main.py:475-476` mounts auth and `/api/v1` application routes; `api_router.py:26-28` includes the database/schema routers. Authentication is present, not missing: `dependencies.py:340-411` verifies Firebase session cookies through the helper at `:125-132`, checks revocation, and rejects no-cookie callers when the dev bypass is disabled; `:555-568` binds configs to the authenticated UID and `:571-582` requires a config. No candidate asserts missing authentication, absent response validation, or event-loop blocking in these handlers. Synchronous database work is dispatched through `run_in_threadpool` in the database handlers.

| Gate label | Decorator/response/status | Signature and full handler body | Validation/auth observations |
|---|---|---|---|
| C | `controller/database_controller.py:240-244`, POST `/connect_db`, `response_model=ApiSuccess[ConnectDatabaseData]`; explicit `status_code` absent, default 200 | signature `:245`; full body `:246-270`; service dispatched at `:250` | Request; `data: ConnectDBRequest`; `user=Depends(get_current_user)`. Request fields/validators `api_contract/database.py:13-44`: type enum, string bounds, port bounds, extra forbid, DSN quote/space trimming. This does not restrict Oracle DSN destinations. |
| S | `controller/database_controller.py:411-415`, POST `/select_database`, `response_model=ApiSuccess[DatabaseSelectionData]`; explicit status absent/default 200 | signature `:416-420`; full body `:422-442`; dispatched at `:425` | Request; `data: SwitchDatabaseRequest`; required authenticated DB config and authenticated user dependencies. `api_contract/database.py:47-58` bounds and sanitizes the database string. It does not test database existence/access or driver selection fidelity. |
| W | `controller/database_controller.py:378-382`, POST `/switch_remote_database`, same response model; explicit status absent/default 200 | signature `:383-388`; full body `:389-408`; dispatched at `:392` | Request, SwitchDatabaseRequest, same config/user dependencies. |
| D | `controller/database_controller.py:273-277`, POST `/disconnect_db`, `response_model=ApiSuccess[DisconnectDatabaseData]`; explicit status absent/default 200 | signature `:278-282`; body `:283-302`; dispatched at `:286` | Request, optional authenticated DB config, authenticated user dependencies. |
| Q | `controller/database_controller.py:448-452`, POST `/run_sql_query`, `response_model=ApiSuccess[RunSqlQueryData]`; explicit status absent/default 200 | signature `:453-458`; full body `:459-504` | RunQueryRequest, Request, authenticated DB config/user dependencies. Query text/row limit/timeout validated in `api_contract/database.py:93-110`; database service runs in a worker. |
| T | `controller/database_schema_controller.py:216-220`, GET `/get_tables`, `response_model=ApiSuccess[TableListData]`; explicit status absent/default 200 | signature `:221`; full body `:222-232`; dispatched `:223` | required authenticated DB config; selected database/schema come from that config. |
| M | `controller/database_schema_controller.py:235-239`, POST `/get_table_schema`, `response_model=ApiSuccess[TableSchemaData]`; explicit status absent/default 200 | signature `:240-243`; full body `:244-248`; dispatched `:245` | GetTableSchemaRequest plus required authenticated DB config. Model `api_contract/database.py:79-90` checks nonempty/bounds/sanitizes table name. |
| A | `controller/conversations_controller.py:431-435`, POST `/pass_user_prompt_to_llm`, `response_class=StreamingResponse`, `responses=STREAMING_RESPONSES`; response_model/status_code absent/default 200; rate limit decorator `:438` | signature `:439-444`; full body `:460-490` | Request; ChatRequest; authenticated user at `:442`; optional authenticated config at `:443`. Session config is passed in stream kwargs `:472-480`. `langgraph_orchestration/tools.py:579` supplies config to actual executor functions; explain/details/FK delegates at `:840`, `:856`, `:893`. Full streaming orchestration belongs to graph reviewer. |


#### Source coverage and exclusions

The 22 assigned files were source-inspected, including all four adapters, connection selection and DSN parsing, pool key/creation/borrow/return/cleanup, query security and execution guards, result typing/encoding/identity, metadata executors and context sync, Firestore result chunk/write/read path, context repository error handling/merge semantics, and usage repository transaction/idempotency/delete path:

```text
service/context/context_repository.py
service/dashboard/usage_repository.py
service/database/__init__.py
service/database/adapters/__init__.py
service/database/adapters/base_adapter.py
service/database/adapters/mysql_adapter.py
service/database/adapters/oracle_adapter.py
service/database/adapters/postgresql_adapter.py
service/database/adapters/sqlserver_adapter.py
service/database/ai_tool_executor.py
service/database/connection_handlers.py
service/database/connection_manager.py
service/database/connection_service.py
service/database/context_sync.py
service/database/database_service.py
service/database/mysql_utils.py
service/database/operations.py
service/database/query_guards.py
service/database/query_result.py
service/database/security.py
service/firestore/__init__.py
service/firestore/firestore_service.py
```

Inspected relevant cross-boundary callers/models/auth dependencies and route gates are identified above. Controller/session/business logic ownership remains with API reviewer; graph orchestration, conversation/vector repositories, and deletion/checkpoint fencing remain with graph reviewer. No source edits, existing-test edits, staged changes, or edits to the prior report were made. No claim that all possible payloads or all deployment/network policies were exhaustively tested. Local scope coverage is source review plus the explicitly executed cases, not production certification.


### Graph/provider gates and coverage

#### FastAPI gates and application reachability

The following gates apply explicitly to **each** finding identified below as route C, R or D:

* C: `controller/conversations_controller.py:431` declares `POST /pass_user_prompt_to_llm`, `response_class=StreamingResponse`, `responses=STREAMING_RESPONSES`; `response_model` and explicit `status_code` are absent. Full handler body/signature inspected at439–490: `request: Request`, `data: ChatRequest` (Pydantic), `user: AuthenticatedUser = Depends(get_current_user)`, `db_config: Optional[dict] = Depends(get_authenticated_db_config)`. Auth exists; no missing-auth/validation claim is made. Existing conversation ownership is checked in `_handle_agent_stream`259–282. Request and model configuration validation also precede admission.
* R: same file493 declares `POST /resume_agent` with the same StreamingResponse declarations and absent response_model/status_code. Full handler500–543 inspected: `request: Request`, `data: AgentResumeRequest` (Pydantic), the same user and DB dependencies. Ownership is checked before resolving resumed policy284–302. No missing-auth/validation claim.
* D: same file846 declares `DELETE /delete_conversation/{conversation_id}`; response_model and status_code are absent. Full handler847–895 inspected: `conversation_id: ConversationId` is the constrained project type, and `user: AuthenticatedUser = Depends(get_current_user)`. It offloads `ConversationService.delete_user_conversation` at864; repository ownership checks are present. No blocking-HTTP-delete claim is made.

These routers have no extra prefix (`conversations_controller.py:61`), are included by `api_router.py:26` and mounted at `/api/v1` by `main.py:476`. Public paths therefore start `/api/v1/`. `dependencies.get_current_user`340–412 verifies the session and admits account activity. Account erasure has a separate account barrier; that barrier does not make ordinary single-conversation deletion exclusive.

C/R call `_handle_agent_stream`482/535, perform LLM admission329, then `ConversationService.create_streaming_generator`362. The facade delegates to `ConversationStreamingService`; that service stores the prompt via `ConversationRepository.store_message`189–205 and invokes the configured agent port. `LangGraphConversationAgentStreamer.stream` forwards to `stream_conversation`. C pre-summary awaits the summarizer at `langgraph_orchestration/stream_conversation.py:873`; `ConversationOrchestrationAccess.check_and_summarize`127 and the service facade reach `ConversationCompactionService.check_and_summarize`. Summary writes use `VampConversationSummaryMemoryWriter` → `VampMemoryService.store_summary_block`; indexing starts from its schedule branch339. Maintenance retries use `maintenance.run_vamp_maintenance_pass` → `retry_pending_indexes`689 → `_index_with_failure_record`220. These source paths provide route reachability; the scripts do not claim a full authenticated ASGI integration test.


#### Source coverage

Focused source inspection followed orchestration entrypoints, checkpoint ownership/generation cloning, cancellation/deadline fences, continuation arithmetic, prompt/history shaping, tool guards/schemas/execution, provider configuration/token counting, vector indexing/retrieval/retries, canonical persistence and deletion. Depth varies: findings and their callers were inspected in detail; adjacent pure formatting/schema/helper code received targeted static inspection, not exhaustive dynamic coverage. No claim that every branch is tested is made.

Assignment inventory (Graph/providers/memory group) inspected through direct reads or targeted symbol/caller searches:

* `langgraph_orchestration/{__init__,checkpoint_savers,checkpointing,context_usage,conversation_access,conversation_streamer,historical_context,prompt_builder,react_graph,result_analysis,stream_budget,stream_context,stream_conversation,stream_events,stream_lifecycle,stream_protocol,summarization_context,tool_evidence,tool_executor,tool_schemas,tools}.py`
* `llm_provider/{__init__,bedrock_client,model_capabilities,model_factory,rate_limiter,token_budget}.py`, plus bundled `model_capabilities.json` (capability lookup context).
* `service/conversations/{conversation_compaction_service,conversation_history,conversation_repository,orchestration_access,summary_memory,vector_memory_cleanup}.py`
* `service/llm/{__init__,llm_options_service}.py`
* `skills/{__init__,skill_registry}.py`; static skill assets were not treated as executable Python findings.
* `vamp_memory/{__init__,bedrock_embedding_provider,budget_selection,conversation_ports,historical_context_builder,maintenance,orchestration_provider,protocols,qdrant_vector_store,summary_block_repository,vamp_memory_service}.py`

Relevant cross-owner callers inspected: `controller/conversations_controller.py`, `api_contract/{conversations,run_context,runtime_ports,orchestration_protocols}.py`, `service/conversations/{conversation_service,conversation_streaming_service,run_context}.py`, `core/account_activity.py`, `dependencies.py`, `api_router.py`, `main.py`, `config.py`, `service/redis_service.py`, and narrow FirestoreService boundary imports. These were inspected for reachability, guards and contracts, not claimed as a duplicate exhaustive review of the other agents' ownership.

