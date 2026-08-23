# Phase 3 Ownership-Safe LangGraph Lifecycle and Terminal Durability Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to execute this plan one task at a time. Every task uses red-green-refactor TDD and receives an independent review before the next task starts.

**Goal:** Make every chat or resume command a bounded, single-owner state machine whose public success event is emitted only after its checkpoint outcome, assistant response, command status, and lease transition are durable.

**Architecture:** Resolve one immutable run policy before any turn mutation, then admit a user-scoped command exactly once. A single Firestore claim transaction binds that command to the conversation, attempt, monotonically increasing fence, and reserved immutable checkpoint generation before quota/provider work. The owner establishes or clones that generation, verifies it, and activates it with a second fence-aware CAS before graph entry. Stale Redis writes may finish only in their old fence-qualified generation and can never replace the Firestore-selected active generation. One identity-stable `RunControl` guards graph, tool, checkpoint, artifact, and finalization work. Protected actions are durably reserved before external work, and quota debit/refund uses an idempotent command-attempt token. The inner agent produces typed execution/checkpoint results, never public completion. A prepare/stage/commit protocol places a bounded finalization envelope in the selected checkpoint generation, stages the assistant and command atomically, commits the final result/task transition, closes renewal, and only then emits one public terminal event.

**Tech Stack:** Python 3.14, FastAPI, Pydantic v2, Firestore compare-and-set transactions, LangGraph/LangChain, `AsyncRedisSaver`/`InMemorySaver`, pytest/pytest-asyncio, JavaScript Fetch/SSE parsing, the Node test runner, Ruff, ESLint.

**Spec:** `docs/superpowers/specs/2026-08-21-mvp-agent-remediation-design.md`

## Global constraints and rulings

- Limit changes to repository code. Do not mutate live Firestore, Redis, Bedrock, Qdrant, databases, IAM, migrations, deployment state, remotes, or production data.
- Work directly on the current `moonlit-dev` branch as the user requested. Do not create a worktree, push, merge, or open a pull request.
- Follow strict behavioral TDD. Each production behavior starts with a focused failing test and receives an independent task review before the next task begins.
- Replace broken internal contracts directly. Do not retain the late `task_mode_detector` call, old encoded inner `done` events, random secondary turn IDs, permissive retry behavior, `change_task_mode`, or compatibility aliases.
- Preserve the existing configured graph budgets: normal `50`, tool task `100`, and long task `200` total graph steps. Keep one authoritative tool budget of `20` calls, counting database, memory, search, skill, history, and UI-action tools.
- Add explicit wall-clock budgets of normal `180` seconds, tool task `600` seconds, and long task `1200` seconds. These are independent run budgets, not aliases for the lease TTL. Tests use a fake monotonic clock; they do not wait in real time.
- The lease deadline is conservative: a confirmed renewal may extend the local deadline only from the monotonic instant immediately before its durable RPC began. An ambiguous or failed renewal never extends it. The store rejects renewal when the existing durable lease has already expired, even for the same `run_id`.
- Use a monotonically increasing per-conversation integer `fence` plus an opaque `run_id`. Every Firestore owned mutation compares both. The run ID identifies an attempt; the fence rejects every earlier attempt after takeover.
- Use an immutable physical checkpoint generation derived from `(logical_thread_id, run_id, fence)`. It does not depend on the later public command DTO. Firestore reserves that generation in the transaction that claims the current lease; `active_checkpoint_generation` changes only in a second owner/fence CAS after fresh creation or resumable clone is verified. Graph entry requires active equals reserved. A stale saver call may write only its old generation; it cannot make that generation active. New turns establish a fresh empty generation, eliminating the shared-thread stale-state workaround. Clone/activation failure is fatal before graph entry.
- Add a required user-scoped UUIDv4 `command_id` to chat and resume requests. The command ID is also the logical turn ID for a new chat command; do not mint a second random turn identifier.
- Do not add per-token/event persistence. Recovery is bounded and no-replay: a duplicate reads command/final assistant state and refetches history instead of replaying token frames.
- A duplicate command with a different canonical request hash returns `409 IDEMPOTENCY_CONFLICT` before quota, provider admission, prompt persistence, lease acquisition, model construction, or tool work.
- A matching duplicate never joins or restarts a live generator. It returns one bounded terminal/status frame containing the recorded conversation and turn identity.
- `done` is success-only and means an immediate repository read can observe the final assistant, confirmed checkpoint outcome, command result, and released task state. EOF, malformed SSE, fetch failure, or cancellation without a public terminal event is transport-disconnected/unknown, never success.
- Non-success terminal states are `no_output`, `partial_response`, `resumable_interrupt`, and `failed_finalization`, each with one bounded retry disposition: `retry_same_command`, `wait`, `resume`, `refetch`, or `user_confirmation_required`.
- A same-command automatic reclaim is added only after durable checkpoint, action, and finalization evidence exists. It is allowed from stored `no_output` only when no protected action reservation and no prepared finalization envelope exist. Partial output, an interrupt, or an uncertain protected action never automatically reruns model/tool work.
- A resume decision is a new command against an existing turn/checkpoint. Reusing the same resume `command_id` applies that decision at most once; a later distinct decision requires a new command ID.
- Every protected tool call first commits `reserve_protected_action(command_id, action_id, run_id, fence)` and only then starts external work. Completion or uncertainty is persisted under the same bounded action entry and fence. Failure to reserve fails closed. Where a downstream service accepts an idempotency key, use `(command_id, action_id)`.
- Quota reservation/refund is idempotent by `(user_id, command_id, attempt_id)` and atomic across all quota windows. One command attempt cannot refund another command's debit; a process crash after debit cannot make the same attempt debit twice.
- Phase 3 prevents admission and application persistence after a stale fence and cancels cooperative async work at the monotonic deadline. It does not claim to terminate an already-running blocking database driver thread; driver-level cancellation remains Phase 4 and an ambiguous driver result remains `uncertain`.
- Do not add a second finalization state machine in the controller or inner LangGraph generator. `ConversationStreamingService` is the sole terminal coordinator.
- Re-check `git status --short` before every frontend edit. Preserve the unowned `back-end/skills/react-flow-diagram/SKILL.md` change and all unrelated dirty `front-end/**` work exactly as found.
- Keep `phases.md` and `memory.md` current at each independently reviewed task checkpoint.
- The current Phase 3 journal diffs are controller-owned against `HEAD 3cb89fd` (baseline SHA-256: `phases.md` `8f304b79a4d88032f1120db300ffadb9afd2c47cb06723feea0855dc28e6a928`; `memory.md` `fda20742cf391a39b76040a901a2f2f644d846136d495884216d15c09d450dcb`). Before each task, capture the current journal diff; stage these two files by exact path only after reviewing Phase 3 hunks. If a non-Phase-3 hunk appears, stop and separate ownership instead of staging the whole file.

## State and ordering contracts

### Command states

`accepted -> running -> finalizing -> durable_completion`

The terminal alternatives are `no_output`, `partial_response`, `resumable_interrupt`, and `failed_finalization`. Live `accepted`, `running`, and `finalizing` are represented by a non-terminal `turn_status` response, not overloaded into a terminal outcome. A reclaimed safe `no_output` command starts a new attempt/fence/generation but keeps the same command, conversation, and turn identity. `failed_finalization` may rerun only the idempotent finalizer, never the graph.

### Normal success mutation order

1. Resolve provider/model, effective mode, graph/tool/wall budgets, and canonical request hash.
2. Atomically accept/read the user-scoped command, choose the server conversation ID, allocate the turn, and insert the user message once.
3. In one Firestore transaction, claim the command attempt, acquire the conversation lease/fence, and reserve a fresh immutable checkpoint generation; only that winner may reserve quota/provider capacity.
4. Establish the fresh generation or clone a clean resumable source fail-closed, then owner-CAS it active. Run bounded graph/tool/checkpoint work only when active equals reserved.
5. Obtain a typed `RunOutcome` and explicit `CheckpointOutcome` while the lease is still valid.
6. Write a bounded `FinalizationEnvelope` containing the typed outcome, canonical assistant snapshot, checkpoint generation, and digest into the immutable active generation.
7. Transactionally compare user, command, turn, `run_id`, and `fence`; stage the assistant once and move the command to `finalizing` with the envelope generation/digest.
8. In a second idempotent transaction, mark the staged assistant final, record the command/checkpoint outcome, and transition task state out of `running`; ambiguous commits are reconciled by read.
9. Stop and await renewal/finalization cleanup with no orphan mutation.
10. Encode the one public terminal frame. Only step 10 may emit `done`.

### Cross-store recovery

Redis checkpoint work and Firestore finalization cannot share one transaction. `prepare_finalization()` first writes the bounded canonical `FinalizationEnvelope` to the already Firestore-selected immutable generation. `begin_finalization()` then stages that assistant snapshot and the command's generation/digest together in Firestore. `commit_finalization()` makes the assistant/result/task transition durable. Recovery in a fresh process reads the selected generation and digest; it never depends on an in-memory token timeline. A crash before an envelope exists cannot be called safe completion and cannot replay protected work. A crash after the envelope exists runs only begin/commit finalization under a replacement finalizer fence.

## File and responsibility map

| File | Phase 3 responsibility |
|---|---|
| `back-end/api_contract/run_context.py` | Immutable modes, budgets, run identity, command/outcome types, and identity-stable `RunControl`. |
| `back-end/service/conversations/run_context.py` | Resolve effective mode and configured run policy before persistence/lease work. |
| `back-end/config.py` | Authoritative per-mode graph/tool/wall-clock budget values. |
| `back-end/api_contract/conversations.py` | Required UUIDv4 command identity for chat and resume. |
| `back-end/api_contract/streaming.py` | Enriched success-only `DoneEvent` and typed `TurnResultEvent`. |
| `back-end/api_contract/conversations_protocols.py` | Carry resolved run context and typed internal outcomes through the agent port. |
| `back-end/api_contract/orchestration_protocols.py` | Fence-aware lease acquisition/renewal/task-state contracts. |
| `back-end/controller/conversations_controller.py` | Resolve policy and accept/read command before quota/provider execution; short-circuit duplicates safely. |
| `back-end/service/conversations/conversation_service.py` | Facade for command admission/status and resolved streaming inputs. |
| `back-end/service/conversations/conversation_repository.py` | Transactional command admission, attempt claim, idempotent fenced assistant finalization, and command status reads. |
| `back-end/service/conversations/orchestration_access.py` | Durable lease/fence CAS, expired-renew rejection, and owner/fence task-state mutations. |
| `back-end/service/quota/user_quota_service.py` | Idempotent command-attempt quota reservation and token-specific refund. |
| `back-end/langgraph_orchestration/stream_lifecycle.py` | Conservative monotonic deadline, renewal cancellation, ownership assertions, and non-orphan cleanup. |
| `back-end/langgraph_orchestration/checkpointing.py` | Immutable fence-qualified generations, resumable clone, prepared-finalization envelope, and explicit checkpoint results. |
| `back-end/langgraph_orchestration/stream_conversation.py` | Fail-closed clear, actual step deltas, bounded graph execution, compaction outcome, and typed internal completion. |
| `back-end/langgraph_orchestration/conversation_streamer.py` | Adapt the agent port to run-context/internal-outcome contracts. |
| `back-end/langgraph_orchestration/stream_protocol.py` | Progress encoding only; remove inner success termination. |
| `back-end/langgraph_orchestration/stream_events.py` | Preserve stable tool/action IDs on public progress events. |
| `back-end/langgraph_orchestration/tools.py` | Atomic all-tool reservation, stable action IDs, and pre/post fence checks. |
| `back-end/service/conversations/conversation_streaming_service.py` | Sole outer finalizer and public terminal-event coordinator. |
| `back-end/langgraph_orchestration/prompt_builder.py` | Render authoritative per-mode budgets without duplicated literals. |
| `back-end/langgraph_orchestration/stream_budget.py` | Consume the resolved policy rather than recomputing mode-specific limits. |
| `back-end/api_contract/runtime_ports.py`, `back-end/composition.py` | Owner-aware protected-action/result mutation port and concrete wiring. |
| `front-end/src/api/conversationRequestModel.js` | Preserve one command ID in chat/resume request models. |
| `front-end/src/api/conversations.js` | Send caller-supplied command identity; do not regenerate during retry. |
| `front-end/src/utils/streamParser.js` | Require exactly one typed terminal frame and reject terminal-less EOF. |
| `front-end/src/hooks/chat-page/messageStreamOutcome.js` | Pure terminal-to-UI-state decision model used by the hook and Node tests. |
| `front-end/src/hooks/chat-page/useMessageStreaming.js` | Retain command ID, distinguish durable result from transport loss, and refetch bounded state. |
| `back-end/README.md` | Document the repository command/fence/terminal contract and deferred deployment verification. |

---

### Task 1: Resolve One Immutable Run Policy Before Mutation

**Files:** create `back-end/api_contract/run_context.py` and `back-end/service/conversations/run_context.py`; modify `back-end/config.py`, `back-end/controller/conversations_controller.py`, `back-end/service/conversations/conversation_service.py`, `back-end/api_contract/conversations_protocols.py`, `back-end/langgraph_orchestration/conversation_streamer.py`, `stream_conversation.py`, `react_graph.py`, `prompt_builder.py`, and `stream_budget.py`; delete `back-end/langgraph_orchestration/task_mode_detector.py`; create `back-end/tests/test_run_context.py`; modify `back-end/tests/test_context_summary_sync.py` and the journals.

**Exact contracts:** `TaskMode`, `TaskModeSource`, `RunBudgets`, and `ResolvedRunPolicy` are frozen. `resolve_run_policy(prompt, requested_mode, persisted_resume_mode, provider, model, db_connected)` is pure. Configured tuples are normal `(50 graph, 50 segment, 20 tool, 180s)`, tool `(100, 50, 20, 600s)`, and long `(200, 50, 20, 1200s)`. The selected policy is the only value used by SSE mode progress, prompt text, token budgeting, and the current pre-command persistence path. No full run context is constructed yet; Tasks 2 and 5 provide fence and command identity.

- [ ] RED slice A: explicit/automatic/resume table tests fail because no resolver exists. Run `cd back-end && env/bin/python -m pytest tests/test_run_context.py -k 'policy or automatic or resume' -q`.
- [ ] GREEN A: move the existing classification rules into the pure resolver; verify the exact selection only.
- [ ] RED slice B: end-to-end mode-consistency tests fail because controller, prompt, budget, and stream still recompute mode. Run `cd back-end && env/bin/python -m pytest tests/test_run_context.py tests/test_context_summary_sync.py -q`.
- [ ] GREEN B: thread `ResolvedRunPolicy`, remove every late override/`change_task_mode`, and delete the detector without an alias. The standalone mode write may temporarily persist only this resolved value; Task 5 absorbs it into command claim.
- [ ] Run `cd back-end && env/bin/python -m pytest tests/test_run_context.py tests/test_context_summary_sync.py tests/test_stream_events.py tests/test_conversation_identity.py -q` and targeted Ruff/compile.
- [ ] Review mode metadata after reload, duplicate literals, deleted imports, and per-turn assistant mode planned for Task 8. Update journals, commit `refactor: resolve agent run policy once`, and obtain independent review.

---

### Task 2: Establish Monotonic Fence and Conservative Lease Deadlines

**Files:** modify `back-end/api_contract/run_context.py`, `back-end/api_contract/orchestration_protocols.py`, `back-end/service/conversations/orchestration_access.py`, `back-end/langgraph_orchestration/stream_lifecycle.py`, and `stream_conversation.py`; create `back-end/tests/test_orchestration_access.py` and `back-end/tests/test_lease_checkpoint_lifecycle.py`; update journals.

**Exact contracts:** `TaskRunAcquisition(acquired, run_id, fence, lease_expires_at, previous_status, previous_task_mode)`; `RunControl(deadline_monotonic, tool_limit)` with `cancel(reason)`, `mark_ownership_lost()`, `remaining_seconds(now=None)`, `ensure_mutation_allowed(now=None)`, and atomic `reserve_tool_call(action_id)`. Store renew/task mutations require `(run_id, fence)`. `TaskRunLease` receives `run_id`, computes its local confirmed deadline from the monotonic instant immediately before the successful Firestore call, never extends on error, and cancels the registered task no later than that deadline.

- [ ] RED store slice: first acquisition/fence, active collision, expired takeover, same-attempt re-entry, expired same-owner renewal, and stale-fence mutation tests fail against the run-ID-only store. Run `cd back-end && env/bin/python -m pytest tests/test_orchestration_access.py -q`.
- [ ] GREEN store slice: add CAS fence fields and reject expired renewal; no compatibility overloads.
- [ ] RED lifecycle slice: fake-clock renewal failure, ambiguous renewal, pre-first-output theft, local expiry, and exactly-once close fail against current `TaskRunLease`. Run `cd back-end && env/bin/python -m pytest tests/test_lease_checkpoint_lifecycle.py -q`.
- [ ] GREEN lifecycle slice: implement conservative monotonic deadline/cancellation and retained cleanup; register the current stream task before any graph call.
- [ ] Run both modules plus `tests/test_context_summary_sync.py tests/test_stream_events.py`; run targeted Ruff/compile. Review clock source, CAS retries, timezone conversion, and no orphan tasks. Update journals, commit `fix: fence agent run leases`, and obtain independent review.

---

### Task 3: Isolate Every Checkpoint Attempt in an Immutable Generation

**Files:** modify `back-end/api_contract/run_context.py`, `back-end/api_contract/orchestration_protocols.py`, `back-end/langgraph_orchestration/checkpointing.py`, `back-end/langgraph_orchestration/stream_conversation.py`, and `back-end/service/conversations/orchestration_access.py`; create `back-end/tests/test_checkpoint_generations.py`; extend `back-end/tests/test_lease_checkpoint_lifecycle.py`; update journals.

**Exact contracts:** `CheckpointGeneration(logical_thread_id, physical_thread_id, run_id, fence, source_generation=None)` is frozen. Physical IDs use canonical conversation/user namespace plus run/fence components and never parse business identity back out. The lease claim writes `reserved_checkpoint_generation`; `prepare_checkpoint_generation()` creates an empty generation for a new turn or clones a clean `resumable_interrupt` source using the installed saver APIs; only after verification may the owner/fence CAS `active_checkpoint_generation=reserved_checkpoint_generation`. `GenerationCheckpointer` refuses graph access unless those fields match, rewrites every read/write/list/delete to the immutable physical generation, and applies the run deadline. A stale blocked write may finish only in its old namespace. New turns delete no shared thread, so `clear_checkpointer_thread()` and the prompt workaround are removed.

- [ ] RED slice A: real `InMemorySaver` tests for fresh generation, resumable clone, clone failure before graph, and generation identity fail because the adapter is absent. Run `cd back-end && env/bin/python -m pytest tests/test_checkpoint_generations.py -k 'fresh or clone or resume' -q`.
- [ ] GREEN A: implement generation creation/clone and active-generation CAS.
- [ ] RED slice B: a barrier test lets A's blocked write land after B takeover and incorrectly affect B's shared state. Run `cd back-end && env/bin/python -m pytest tests/test_checkpoint_generations.py -k 'takeover or stale or deadline' -q`.
- [ ] GREEN B: route A and B to separate physical generations and assert Firestore still selects only B; await cancellation without claiming the old write was terminated.
- [ ] Run the complete generation/lease modules plus context/stream regressions and targeted Ruff/compile. Review every saver method signature, fresh-turn no-checkpoint semantics, resume clone fidelity, and cleanup. Update journals, commit `fix: isolate checkpoint generations`, and obtain independent review.

---

### Task 4: Enforce Graph, Tool, and Wall-Clock Budgets

**Files:** modify `back-end/api_contract/run_context.py`, `back-end/config.py`, `back-end/langgraph_orchestration/stream_conversation.py`, `react_graph.py`, `prompt_builder.py`, `stream_budget.py`, `tools.py`, and `stream_events.py`; create `back-end/tests/test_run_budgets.py`; modify `back-end/tests/test_stream_events.py` and `test_tool_error_safety.py`; update journals.

**Exact contracts:** LangGraph receives only the relative remaining segment grant. The actual non-negative before/after checkpoint `step` delta is charged. A missing step is valid only for the initial empty generation; missing/regressing/unparseable metadata after execution fails closed. `RunControl` owns the one atomic 20-call counter. Every `ALL_TOOLS` entry receives supported `InjectedToolCallId`, reserves before `tool_start`, and emits that `action_id`; the 21st call emits no start/external work. The wall deadline bounds graph, compaction, checkpoint, and tool admission.

- [ ] RED graph slice: the real installed `StateGraph`/`InMemorySaver` 4-total/2-segment case executes 8 nodes; exact boundary, completion-under-budget, and metadata regression cases fail. Run `cd back-end && env/bin/python -m pytest tests/test_run_budgets.py -k 'graph or step' -q`.
- [ ] GREEN graph slice: use relative recursion grants and actual deltas.
- [ ] RED tool slice: concurrent mixed tool-family reservations exceed 20 and UI/skill tools bypass the counter. Run `cd back-end && env/bin/python -m pytest tests/test_run_budgets.py -k 'tool' tests/test_tool_error_safety.py -k 'budget' -q`.
- [ ] GREEN tool slice: route all tools through the single atomic reservation; retain loop detection only as a separate diagnostic.
- [ ] RED/GREEN wall slice: fake-clock graph, compaction, checkpoint, and pre-tool expirations. Run `cd back-end && env/bin/python -m pytest tests/test_run_budgets.py -k 'deadline or timeout' -q`.
- [ ] Run complete budget/tool/stream/context suites and targeted Ruff/compile. Review off-by-one behavior, parallel calls, action correlation, timeout mapping, and no Phase 4 driver-cancellation claim. Update journals, commit `fix: enforce agent run budgets`, and obtain independent review.

---

### Task 5: Admit Commands and Acquire One Attempt Before Quota

**Preflight:** record hashes/diffs for the exact frontend request files; they are currently clean. Preserve all unrelated dirty frontend files.

**Files:** modify `back-end/api_contract/conversations.py`, `run_context.py`, `streaming.py`, and `orchestration_protocols.py`; modify `back-end/controller/conversations_controller.py`, `back-end/service/conversations/conversation_service.py`, `conversation_repository.py`, `conversation_streaming_service.py`, `orchestration_access.py`, `back-end/langgraph_orchestration/stream_lifecycle.py`, `back-end/service/quota/user_quota_service.py`, `front-end/src/api/conversationRequestModel.js`, `conversationRequestModel.test.js`, `conversations.js`, and `front-end/src/hooks/chat-page/useMessageStreaming.js`; create `back-end/tests/test_turn_command_idempotency.py` and `back-end/tests/test_user_quota_idempotency.py`; update journals.

**Exact contracts:**

```python
@dataclass(frozen=True)
class TurnCommandAdmission:
    disposition: Literal["claim_candidate", "existing", "conflict"]
    command_id: UUID
    conversation_id: UUID
    turn_id: UUID
    turn_index: int
    state: CommandState

@dataclass(frozen=True)
class ResolvedRunContext:
    user_id: str
    conversation_id: str
    command_id: str
    turn_id: str
    turn_index: int
    run_id: str
    fence: int
    checkpoint_generation: CheckpointGeneration
    policy: ResolvedRunPolicy
    control: RunControl
```

- Required canonical UUIDv4 `command_id` is generated once when the hook creates the optimistic action, retained on that action, and passed unchanged through both chat/resume API builders and retries. A pure request-model helper creates-or-reuses the ID so Node tests exercise this behavior. Canonicalization applies Unicode NFC recursively, uses the already edge-trimmed prompt without internal whitespace folding, preserves resume list order and string whitespace, rejects non-finite numbers, includes every validated option with explicit defaults, and serializes UTF-8 JSON with sorted keys/compact separators before SHA-256. The DB fingerprint includes normalized type plus NFC database/schema and an explicit context version only—never host, port, username, password, DSN, or token. User document keys use `sha256(user_id)`; raw user IDs are compared inside records.
- `accept_or_read_turn_command()` atomically creates/owns the conversation, allocates the turn, and inserts the user message once. A matching `accepted` command returns `claim_candidate`; every caller may attempt the same claim transaction and exactly one wins, so a crash between admission and claim cannot strand the command. Matching `running/finalizing/terminal` commands execute nothing and return a canonical non-2xx `ApiError` with safe IDs/state; hash mismatch is `409 IDEMPOTENCY_CONFLICT`. The SSE `TurnStatusEvent` is introduced only with the final public protocol in Task 8. Automatic reclaim of an attempted command is prohibited in this task.
- `claim_and_acquire_attempt()` is one Firestore transaction over command plus conversation: it compares `accepted`, assigns run/fence plus `reserved_checkpoint_generation`, leaves active unset/unchanged, and writes both running states. It runs before quota/provider work. Only its winner can establish/activate the generation and construct `ResolvedRunContext`.
- `UserQuotaService.reserve(user_id, command_id, attempt_id)` and `refund(user_id, command_id, attempt_id)` use one Redis Lua reservation token plus all three counters. Same-attempt reserve/refund is idempotent; one command cannot refund another. Remove the blind user-only API.

- [ ] RED request/hash slice: required/preserved UUID, cross-user independence, changed request conflict, non-secret deterministic hash. Run `cd back-end && env/bin/python -m pytest tests/test_api_contract.py tests/test_turn_command_idempotency.py -k 'request or hash or conflict or user' -q` and `cd front-end && node --test src/api/conversationRequestModel.test.js`.
- [ ] GREEN request/hash slice: update backend and frontend callers together; no broken intermediate public request contract.
- [ ] RED admission/claim slice: concurrent same-key new chat, crash-after-accepted retry, and two distinct commands for one conversation currently create/debit/claim incorrectly. Run `cd back-end && env/bin/python -m pytest tests/test_turn_command_idempotency.py -k 'concurrent or accepted or claim or collision or prompt' -q`.
- [ ] GREEN admission/claim slice: implement the two transactions, remove prompt/standalone-mode persistence from the streaming service, and move lease acquisition before quota.
- [ ] RED/GREEN quota slice: crash-after-debit, duplicate reserve, token-specific refund, exceeded rollback. Run `cd back-end && env/bin/python -m pytest tests/test_user_quota_idempotency.py -q`.
- [ ] Run command/API/model-auth/conversation/rate regression suites, Node request tests, targeted Ruff/ESLint/compile. Review tenant paths, secrets, transaction ambiguity/read-after-error, quota Lua, and resume turn targeting. Update journals, commit `feat: admit agent commands once`, and obtain independent review.

---

### Task 6: Durably Reserve Protected Actions and Fence Results

**Files:** modify `back-end/api_contract/orchestration_protocols.py`, `runtime_ports.py`, `back-end/composition.py`, `back-end/langgraph_orchestration/tools.py`, `stream_events.py`, `back-end/service/conversations/conversation_repository.py`, `orchestration_access.py`, and `back-end/service/firestore/firestore_service.py`; create `back-end/tests/test_fenced_mutations.py`; modify `test_stream_events.py` and `test_tool_error_safety.py`; update journals.

**Exact contracts:** `RunMutationStore.reserve_protected_action(context, action_id, tool_name)`, `complete_protected_action(context, action_id, outcome_digest)`, `mark_protected_action_uncertain(context, action_id)`, and `store_execution_result(context, action_id, execution_id, payload)`. The command stores at most 20 bounded action entries containing ID/name/state/digest, never result payload. Reservation transaction compares user/command/run/fence and commits `started` before external work. Result/artifact persistence compares the same fence. Downstream idempotency key is `command_id:action_id` where supported.

- [ ] RED reservation slice: failure before reservation prevents external call; crash after external effect leaves stored `started/uncertain`; stale fence cannot complete or persist. Run `cd back-end && env/bin/python -m pytest tests/test_fenced_mutations.py -k 'reserve or uncertain or stale' -q`.
- [ ] GREEN reservation slice: add the port/concrete store and wire every protected tool around external allocation.
- [ ] RED result slice: current direct `store_execution_result()` accepts stale writes and returns an execution ID after persistence failure. Run `cd back-end && env/bin/python -m pytest tests/test_fenced_mutations.py -k 'result or artifact' -q`.
- [ ] GREEN result slice: make persistence owner-conditional and expose an ID only after success; keep Phase 4 byte/chunk redesign deferred.
- [ ] Run fenced/tool/stream/runtime-port regressions and targeted Ruff/compile. Review every protected tool, pre/post boundaries, bounded action metadata, and driver-thread limitation. Update journals, commit `fix: fence protected agent actions`, and obtain independent review.

---

### Task 7: Prepare and Commit a Recoverable Finalization Result

**Files:** modify `back-end/config.py`, `back-end/api_contract/run_context.py`, `orchestration_protocols.py`, `conversations_protocols.py`, `back-end/langgraph_orchestration/checkpointing.py`, `react_graph.py`, `conversation_streamer.py`, `stream_conversation.py`, `back-end/service/conversations/conversation_repository.py`, and `orchestration_access.py`; create `back-end/tests/test_finalization_recovery.py`; update journals.

**Exact layer types:** `ExecutionOutcome` describes only inner execution (`completed`, `no_output`, `partial_response`, `resumable_interrupt`, `failed`); `CheckpointOutcome` is `confirmed(generation)` / `not_required` / `failed(code)`; `FinalizationEnvelope` contains version, command/turn/origin-run/origin-fence/generation, valid execution+checkpoint pair, canonical assistant snapshot, protected-action state, and SHA-256 digest; `FinalizationResult` is outer-only (`durable_completion`, `no_output`, `partial_response`, `resumable_interrupt`, `failed_finalization`). Constructors/validators reject `completed + checkpoint.failed` and other illegal pairs. Canonical serialized envelope size is at most `1_048_576` UTF-8 bytes; oversize preparation returns checkpoint/finalization failure and can never produce `done`.

- The ReAct state schema gains one bounded `finalization_envelope` channel. `AgentRunSession.prepare_finalization(context, execution_outcome, assistant_snapshot)` uses the compiled graph's supported `aupdate_state()` against the immutable physical generation and reads the envelope back; the session retains only graph/config handles, not the recovery source of truth.
- `begin_finalization(context, envelope_digest)` reads that envelope, transactionally stages the assistant exactly once by turn/role, and moves the command to `finalizing` with generation/digest.
- `commit_finalization(context, envelope_digest)` verifies the staged assistant and command, marks the assistant final with resolved mode metadata, stores checkpoint/result state, and clears/transitions task lease fields. It reconciles ambiguous commits by read.
- `claim_finalizer_recovery(user_id, command_id, recovery_run_id)` is one Firestore transaction requiring the same user, an expired `running`/`finalizing` owner, and a valid selected envelope. It increments the conversation fence, records a finalizer-only owner, retains immutable origin run/fence/generation/digest provenance, and sets `graph_admission=False`; the new recovery fence authorizes Firestore stage/commit while the envelope digest proves the old result. It never reserves quota or permits graph/tool work.
- `recover_finalization(user_id, command_id)` runs only under that finalizer-only context in a fresh process from command/conversation/generation state, never from a captured timeline. If no envelope exists, protected work is never replayed automatically.

- [ ] RED type/envelope slice: illegal pairs, digest mismatch, missing generation, and bounded snapshot tests fail. Run `cd back-end && env/bin/python -m pytest tests/test_finalization_recovery.py -k 'type or envelope or digest or bounded' -q`.
- [ ] GREEN envelope slice: implement typed validation, the state channel, and generation-backed `aupdate_state` prepare/read.
- [ ] RED stage/commit slice: crashes before envelope, after envelope, after stage, ambiguous commit, two recovery contenders, and a stale original finalizer cannot recover safely today. Run `cd back-end && env/bin/python -m pytest tests/test_finalization_recovery.py -k 'crash or recover or contender or stale or stage or commit' -q`.
- [ ] GREEN stage/commit slice: implement idempotent begin/commit/read recovery; existing conversation required, resume targets the recorded assistant turn, and no generic create-or-append API is used.
- [ ] Run finalization/checkpoint/lease/conversation regressions and targeted Ruff/compile. Review bounded serialization, fresh-process reconstruction, deletion, fence theft, per-turn mode/history reload, and no event-log documents. Update journals, commit `feat: add recoverable turn finalization`, and obtain independent review.

---

### Task 8: Make the Outer Coordinator the Sole Terminal Authority

**Files:** modify `back-end/api_contract/run_context.py`, `conversations_protocols.py`, and `streaming.py`; modify `back-end/langgraph_orchestration/conversation_streamer.py`, `stream_conversation.py`, `stream_protocol.py`, and `stream_events.py`; modify `back-end/service/conversations/conversation_repository.py`, `conversation_streaming_service.py`, and `orchestration_access.py`; modify `back-end/tests/test_stream_events.py` and `test_context_summary_sync.py`; create `back-end/tests/test_terminal_durability.py`; update `back-end/README.md` and journals.

**Public schemas:** `DoneEvent(type, command_id, conversation_id, turn_id, checkpoint_generation)`; `TurnStatusEvent(type, command_id, conversation_id, turn_id, state: accepted|running|finalizing, retry_after_ms)`; `TurnResultEvent(type, command_id, conversation_id, turn_id, outcome: no_output|partial_response|resumable_interrupt|failed_finalization, retry_disposition, safe_error_code=None)`. `ExecutionOutcome` never contains `failed_finalization`.

- Inner orchestration yields progress and one typed execution result; it never imports/calls `sse_done()` or maps outer finalization failure.
- `ConversationStreamingService` obtains the canonical snapshot, calls prepare/begin/commit while the fence is valid, retains/awaits bounded shielded cleanup, stops renewal, then emits exactly one public terminal. Step limit maps to durable resumable interrupt. For an expired `running` attempt with no action reservation and no finalization envelope, one transaction records `no_output`, clears the stale lease, and exposes `retry_same_command`; only a later claim creates a fresh attempt/fence/generation. Safe no-output reclaim and finalizer-only recovery are enabled here, after durable action/envelope evidence exists.
- Receipt of `done` implies an immediate history/command/task read observes final assistant, mode, checkpoint outcome, command result, and released lease. Disconnect wording is neutral unless a distinct authenticated cancel command proves user intent.

- [ ] RED success-order slice: current order is `done -> assistant`; immediate read fails. Run `cd back-end && env/bin/python -m pytest tests/test_terminal_durability.py -k 'done or order or immediate' -q`.
- [ ] GREEN success slice: remove every inner done and encode success only after commit/cleanup.
- [ ] RED failure/disconnect slice: no output, partial, protected action, interrupt, step limit, failed checkpoint, failed/stuck finalizer, deletion, theft, and EOF branches currently lie or duplicate. Run `cd back-end && env/bin/python -m pytest tests/test_terminal_durability.py -k 'disconnect or interrupt or failure or theft or retry' -q`.
- [ ] GREEN failure slice: map typed results/status, retain/await one finalizer task, enable only evidence-backed reclaim/recovery, and emit no success for failures.
- [ ] Load-shaped test: 10,000 progress tokens produce zero event documents, one command record, one final assistant snapshot, and a fixed upper bound of command-state writes independent of token count.
- [ ] Run terminal/finalization/command/checkpoint/lease/stream/context suites and targeted Ruff/compile. Mechanically scan for inner `sse_done`, orphan tasks, run-ID-only writes, and raw errors. Update README/journals, commit `fix: make stream completion durable`, and obtain independent review.

---

### Task 9: Make Browser Retry and Terminal Semantics Truthful

**Preflight:** record status/hash/diff for every exact path. Stop if an unowned overlapping edit appears. Do not attribute the dirty checkout's full build to Phase 3; final attribution uses a clean committed archive.

**Files:** modify `front-end/src/utils/streamParser.js` and `front-end/src/hooks/chat-page/useMessageStreaming.js`; create `front-end/src/hooks/chat-page/messageStreamOutcome.js`, `front-end/src/utils/streamParser.test.js`, and `front-end/src/hooks/chat-page/messageStreamOutcome.test.js`; modify frontend API/request tests only if backend review changed the Task 5 schema; update journals.

**Exact pure interface:** `resolveMessageStreamOutcome(terminal)` returns one of `durable_done`, `wait`, `refetch`, `resume`, `retry_same_command`, or `user_confirmation_required`; invalid/absent terminal throws `TransportDisconnectedError`. Existing message status becomes `DONE` only for `durable_done`. The parser accepts fragmented/multiline SSE and returns the first protocol-ending `done`/`turn_result`; a duplicate terminal already buffered in the same decoded batch is a protocol error. The first terminal ends the protocol, so later unread bytes are not claimed to be inspected. `[DONE]` is removed.

- [ ] RED parser slice: terminal-less EOF, malformed terminal JSON, duplicate buffered terminal, and abort currently resolve successfully. Run `cd front-end && node --test src/utils/streamParser.test.js`.
- [ ] GREEN parser slice: return a typed terminal descriptor or throw; cancel/release only after terminal/error cleanup.
- [ ] RED outcome slice: all status/disposition mappings and false-DONE regressions fail because the pure model is absent. Run `cd front-end && node --test src/hooks/chat-page/messageStreamOutcome.test.js`.
- [ ] GREEN outcome slice: add the pure model and consume it from the hook; retain Task 5's command ID on optimistic action and same-command transport retry; refetch history after recorded completion.
- [ ] Run all three focused Node test files, exact-path ESLint, and build. Then verify a clean `git archive HEAD` copy with a symlink to existing `node_modules`; report dirty-checkout results separately. Re-run backend terminal/API contracts.
- [ ] Review retry loops, optimistic identity, abort/reader cleanup, stale closures, UI states, and exact-path diffs. Update journals, commit `fix: honor durable stream terminals`, and obtain independent review.

---

## Required named RED cases and fixture contracts

Each named case must be added and observed failing for the stated production break before its GREEN implementation. Expected values are literals or hand-built fixtures, never computed by the production helper under test.

| Task | Exact test name | Production break it must catch |
|---|---|---|
| 1 | `test_automatic_long_mode_is_resolved_before_any_repository_call` | Late classification or persistence before policy resolution. |
| 1 | `test_resolved_mode_and_budgets_match_stream_prompt_checkpoint_and_history` | Any consumer recomputes or persists a different mode/budget. |
| 2 | `test_expired_same_owner_cannot_renew_or_mutate` | Run-ID-only renewal revives an expired lease. |
| 2 | `test_renewal_failure_cancels_before_last_confirmed_deadline` | Renewal error extends local ownership or misses cancellation. |
| 3 | `test_stale_blocked_write_cannot_become_active_after_takeover` | A's in-flight write changes B's selected checkpoint. |
| 3 | `test_resume_clone_failure_never_activates_reserved_generation_or_enters_graph` | Empty/incomplete resume state becomes active. |
| 4 | `test_real_graph_never_exceeds_four_steps_across_two_step_segments` | Saved step is added to a relative recursion grant. |
| 4 | `test_twenty_concurrent_mixed_tools_execute_and_twenty_first_never_starts` | Non-atomic/off-by-one/all-tool budget bypass. |
| 5 | `test_retry_after_admission_before_claim_can_claim_same_command_once` | An `accepted` command is stranded after process loss. |
| 5 | `test_two_distinct_commands_on_one_conversation_debit_quota_for_only_lease_winner` | Claim/lease/quota are separate gates. |
| 5 | `test_refund_token_cannot_decrement_another_command_reservation` | User-only refund corrupts another command's quota. |
| 6 | `test_protected_action_is_durable_before_external_callable_runs` | Crash can hide that protected work started. |
| 6 | `test_stale_fence_cannot_publish_execution_result_id` | Old owner persists an artifact/result after takeover. |
| 7 | `test_fresh_process_recovers_exact_staged_snapshot_from_envelope` | Recovery depends on captured process memory. |
| 7 | `test_only_one_of_two_finalizer_recovery_claimants_gets_new_fence` | Competing recovery finalizers both write. |
| 7 | `test_finalization_envelope_accepts_1048576_bytes_and_rejects_1048577` | Recovery payload is unbounded or boundary is off by one. |
| 8 | `test_done_is_last_mutation_and_immediate_read_observes_final_state` | Public success precedes assistant/checkpoint/task durability. |
| 8 | `test_expired_running_without_action_or_envelope_transitions_once_to_no_output` | Safe reclaim is implicit or duplicate. |
| 8 | `test_failed_finalization_never_reruns_graph_or_emits_done` | Recovery replays work or lies about success. |
| 9 | `terminal_less_eof_throws_transport_disconnected` | EOF is treated as successful completion. |
| 9 | `durable_done_is_the_only_outcome_that_sets_message_done` | Non-success/disconnect maps to `MESSAGE_STATUS.DONE`. |

**Shared backend fixtures:**

- `TransactionalRunRepository` is an in-test implementation of the real repository protocol. It uses one `asyncio.Lock`, immutable snapshot copies, explicit ambiguous-commit scripts, and a mutation log. Tests assert repository outcomes/state, not fake method call counts.
- `BarrierCheckpointSaver` implements the complete installed `BaseCheckpointSaver` async surface used by production and exposes barriers immediately before durable write. Its state is keyed by physical generation, so takeover tests inspect which generation is active rather than asserting on the barrier itself.
- `FakeMonotonicClock` advances only when the test calls `advance(seconds)` and is injected into `RunControl`/`TaskRunLease`; no test sleeps.
- `ProtectedActionHarness` records the external effect under the stable action key. Tests assert the effect ledger and durable command action state, not mock invocation alone.

Representative barrier assertion for Task 3:

```python
async def test_stale_blocked_write_cannot_become_active_after_takeover(
    run_store,
    barrier_saver,
) -> None:
    attempt_a = await run_store.claim("run-a")
    saver_a = GenerationCheckpointer(barrier_saver, attempt_a.context)
    write_a = asyncio.create_task(saver_a.aput(attempt_a.config, checkpoint_a, metadata_a, versions_a))
    await barrier_saver.before_commit.wait()

    run_store.expire(attempt_a)
    attempt_b = await run_store.claim("run-b")
    saver_b = GenerationCheckpointer(barrier_saver, attempt_b.context)
    await saver_b.aput(attempt_b.config, checkpoint_b, metadata_b, versions_b)
    barrier_saver.allow_commit.set()
    await write_a

    assert run_store.active_generation == attempt_b.generation
    assert (await barrier_saver.read(attempt_b.generation))["id"] == "checkpoint-b"
    assert (await barrier_saver.read(attempt_a.generation))["id"] == "checkpoint-a"
```

Representative durability assertion for Task 8:

```python
async def test_done_is_last_mutation_and_immediate_read_observes_final_state(coordinator, repository) -> None:
    events = [event async for event in coordinator.stream()]
    assert events[-1]["type"] == "done"
    assert repository.mutation_log[-1] == "release_lease"

    state = repository.read_turn(events[-1]["command_id"])
    assert state.command_state == "durable_completion"
    assert state.assistant_final is True
    assert state.checkpoint_status == "confirmed"
    assert state.task_run_id is None
```

---

## Whole-phase review and verification

- [ ] Run a fresh independent review across the complete Phase 3 commit range. Review invariants, not only diffs: policy resolution order, command idempotency, quota ordering, fence/deadline behavior, checkpoint/tool writes, graph/tool/time budgets, finalization order, SSE schemas, frontend retry semantics, security, performance, and SOLID boundaries.
- [ ] Convert every confirmed Critical/Important review finding into a focused failing regression, fix it, rerun affected suites, and request scoped re-review. Do not patch speculative style preferences.
- [ ] Review every changed file for unused imports/variables, dead compatibility code, stale comments/TODOs, raw exception exposure, duplicate constants, accidental formatting, and unrelated edits.
- [ ] Run the Phase 3 focused backend suite, including the new run-context, lease, command, fenced-mutation, budget, terminal, API, stream, conversation, context, and tool tests.
- [ ] Run backend Ruff on all changed Python paths and targeted `compileall` on production packages.
- [ ] Run the broad hermetic backend suite from an exact committed archive or equivalent clean overlay so the preserved unowned React Flow skill edit cannot contaminate the result. Also report the current dirty-checkout result separately.
- [ ] Run focused frontend tests and exact-path lint in the current checkout. Attribute the full frontend lint/build only to a clean committed archive (with the existing `node_modules` linked read-only); report the dirty-checkout result separately because unrelated frontend edits are present.
- [ ] Verify mechanically: no `sse_done()` call under inner orchestration; no `change_task_mode`; no late `classify_task_mode`; no run-ID-only owned mutation; no commandless chat/resume caller; no terminal-less EOF success; no public `done` before the finalizer.
- [ ] Update `phases.md` and `memory.md` with exact counts, warnings, commit range, unresolved external-service limits, and remaining findings. Mark Phase 3 complete only when all exit-gate invariants are evidenced.
- [ ] Commit closure documentation locally. Do not push, merge, deploy, migrate, or mutate live services.

## Required final evidence matrix

| Invariant | Minimum evidence |
|---|---|
| One effective run policy | Explicit/automatic/resume tests; no late detector or task-mode mutation path. |
| One logical command | Concurrent same-key test; hash-conflict test; cross-user independence; one quota/graph execution. |
| One live owner | Fake-clock collision/takeover tests; increasing fence; expired same-owner renewal rejection. |
| No stale owned writes | Barrier tests for checkpoint, tool result/artifact, assistant, command, and task-state mutations. |
| Hard budgets | Real `StateGraph`/`InMemorySaver` graph totals; concurrent 20-tool cap; fake wall deadline. |
| Truthful finalization | Mutation-order log; immediate query on `done`; no `done` for every failure/disconnect branch. |
| Retry without duplicate work | Pre/post-tool, checkpoint, assistant-commit, disconnect, resume, and ambiguous-commit barriers. |
| Truthful browser state | Parser/hook tests for each terminal and terminal-less EOF/fetch abort. |
| Bounded recovery storage | Long-token test proving no event documents and O(1) command records per turn. |

## Deferred deployment and later-phase controls

- Verify Firestore composite indexes/security rules for user-scoped command records and conversation/fence transactions before deployment. No migration is needed for the unlaunched MVP; repository reads must treat absent legacy command fields as non-executable rather than create a compatibility path.
- Define command-record retention together with conversation deletion and privacy policy before launch. Keep records for at least the conversation lifetime so an old retry cannot recreate work.
- Verify Redis cancellation and checkpoint metadata behavior against production-shaped Redis in staging.
- Verify downstream idempotency keys for any future mutating external tool. Where unsupported, retain `uncertain` plus user confirmation.
- Driver-level statement timeout/cancellation, heartbeat queue backpressure, artifact/result byte caps, and in-flight database fairness remain Phase 4.
- VAMP retry/budgets, skill authorization/instruction loading, and complete public event/result validation remain Phase 5.
- Append-only message storage, broad coordinator decomposition, mypy/toolchain reproducibility, and schema migration exercises remain Phase 6.
