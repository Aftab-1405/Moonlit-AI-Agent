# Phase 3 Task 1 implementation report

## Implemented behavior

- Added frozen `TaskMode`, `TaskModeSource`, `RunBudgets`, and `ResolvedRunPolicy` contracts.
- Added pure `resolve_run_policy(prompt, requested_mode, persisted_resume_mode, provider, model, db_connected)` with precedence: explicit non-normal mode, persisted resume mode, then moved deterministic automatic/default classification.
- Added configured policies: normal `(50 graph, 50 segment, 20 tool, 180s)`, tool `(100, 50, 20, 600s)`, and long `(200, 50, 20, 1200s)`.
- Resolved the policy in the controller after provider/model authorization and before quota or any run mutation. Resume performs the necessary owned read before resolution and still resolves before quota/persistence/lease work.
- Replaced the raw `task_mode`/provider/model agent-stream contract with one `ResolvedRunPolicy`. The same policy drives the temporary standalone mode write, SSE mode/source/graph budget, prompt policy text, checkpoint-config policy scalars, model selection, graph/segment limits, step-limit metadata, and token reserve.
- Removed late resume restoration, late automatic classification, `change_task_mode()`, `task_mode_detector.py`, hard-coded prompt/session mode budgets, and the obsolete 500-step clamp. No alias or parallel detector remains.
- Per-turn assistant policy metadata is deliberately deferred to the Task 7/8 finalization work; lease fences, checkpoint generations, command identity, finalization, and browser terminals were not implemented.

## Strict TDD evidence

### RED A — resolver absent

Command:

```text
cd back-end && env/bin/python -m pytest tests/test_run_context.py -k 'policy or automatic or resume' -q
```

Output (exit 1):

```text
Failed to create stream fd: Operation not permitted
Failed to create stream fd: Operation not permitted
Failed to create stream fd: Operation not permitted
FFFFFFFFFF                                                               [100%]
...
E   ModuleNotFoundError: No module named 'service.conversations.run_context'
...
10 failed in 0.06s
```

All ten selected behavioral cases failed for the intended reason: the pure resolver module/contract did not exist. There was no syntax, fixture, or unrelated failure.

### GREEN A — exact policy selection

Same command, output (exit 0):

```text
Failed to create stream fd: Operation not permitted
Failed to create stream fd: Operation not permitted
Failed to create stream fd: Operation not permitted
..........                                                               [100%]
10 passed in 0.03s
```

### RED B — no outer boundary / raw stream contract

Command:

```text
cd back-end && env/bin/python -m pytest tests/test_run_context.py tests/test_context_summary_sync.py -q
```

Output (exit 1):

```text
..........FF........                                                     [100%]
FAILED tests/test_run_context.py::test_automatic_long_mode_is_resolved_before_any_repository_call
E   AttributeError: ... conversations_controller ... has no attribute 'resolve_run_policy'
FAILED tests/test_run_context.py::test_resolved_mode_and_budgets_match_stream_prompt_checkpoint_and_history
E   TypeError: stream_conversation() got an unexpected keyword argument 'run_policy'
2 failed, 18 passed, 2 warnings in 6.30s
```

Both failures were the intended integration breaks: no controller resolution boundary and no threaded immutable policy contract.

### GREEN B — consistent consumers

Same command, output (exit 0):

```text
....................                                                     [100%]
20 passed, 2 warnings in 6.23s
```

The two warnings are the installed SlowAPI/Python 3.14 `asyncio.iscoroutinefunction` deprecations. An intermediate prompt-construction attempt encountered the known unowned dirty React Flow skill; the test isolates that external registry boundary and the skill file was not edited.

## Final verification

Prescribed regression command:

```text
cd back-end && env/bin/python -m pytest tests/test_run_context.py tests/test_context_summary_sync.py tests/test_stream_events.py tests/test_conversation_identity.py -q
```

The sandboxed run hung at the first pre-existing `run_in_threadpool` identity test while the wrapper reported `Operation not permitted`. The approved unsandboxed repository-local rerun exited 0:

```text
..........................................................               [100%]
58 passed, 2 warnings in 1.38s
```

Directly affected controller/outer-stream contracts:

```text
cd back-end && env/bin/python -m pytest tests/test_model_authorization.py tests/test_tool_error_safety.py -k 'stream or conversation_http_permission or concurrent_agent_run' -q
........                                                                 [100%]
8 passed, 69 deselected, 3 warnings in 1.42s
```

Targeted Ruff:

```text
cd back-end && env/bin/ruff check api_contract/run_context.py service/conversations/run_context.py config.py controller/conversations_controller.py service/conversations/conversation_service.py service/conversations/conversation_streaming_service.py api_contract/conversations_protocols.py langgraph_orchestration/conversation_streamer.py langgraph_orchestration/stream_conversation.py langgraph_orchestration/stream_lifecycle.py langgraph_orchestration/react_graph.py langgraph_orchestration/prompt_builder.py langgraph_orchestration/stream_budget.py tests/test_run_context.py tests/test_context_summary_sync.py tests/test_tool_error_safety.py
All checks passed!
```

Targeted compilation:

```text
cd back-end && env/bin/python -m py_compile api_contract/run_context.py service/conversations/run_context.py config.py controller/conversations_controller.py service/conversations/conversation_service.py service/conversations/conversation_streaming_service.py api_contract/conversations_protocols.py langgraph_orchestration/conversation_streamer.py langgraph_orchestration/stream_conversation.py langgraph_orchestration/stream_lifecycle.py langgraph_orchestration/react_graph.py langgraph_orchestration/prompt_builder.py langgraph_orchestration/stream_budget.py tests/test_run_context.py tests/test_context_summary_sync.py tests/test_tool_error_safety.py
```

Output was only the restricted wrapper's three known `Failed to create stream fd: Operation not permitted` diagnostics; exit code was 0. `git diff --check` also exited 0 without output. Python scans found no `task_mode_detector`, `classify_task_mode`, `should_auto_classify`, `change_task_mode`, or `AGENT_TOTAL_STEP_BUDGET` reference. Remaining detector references are historical security-audit records only.

## Files changed

- Contracts/resolution/config: `back-end/api_contract/run_context.py`, `back-end/service/conversations/run_context.py`, `back-end/config.py`.
- Outer boundary and service/port threading: `back-end/controller/conversations_controller.py`, `back-end/service/conversations/conversation_service.py`, `back-end/service/conversations/conversation_streaming_service.py`, `back-end/api_contract/conversations_protocols.py`, `back-end/langgraph_orchestration/conversation_streamer.py`.
- Policy consumers/removal: `back-end/langgraph_orchestration/stream_conversation.py`, `stream_budget.py`, `prompt_builder.py`, `react_graph.py`, `stream_lifecycle.py`; deleted `task_mode_detector.py`.
- Behavioral/regression tests: `back-end/tests/test_run_context.py`, `test_context_summary_sync.py`, `test_tool_error_safety.py`.
- Documentation/journals: `back-end/README.md`, `phases.md`, `memory.md`, and this report.

## Cleanup and self-review

- Reviewed every changed file for unused imports/variables, dead detector paths, duplicate numeric mode budgets, accidental raw-mode forwarding, debug statements, and unrelated formatting.
- Mutation check: wrong explicit/resume/automatic precedence, wrong budget tuple, mutable policy fields, late controller resolution, wrong SSE/config/prompt/token consumer, or raw-mode persistence each has a behavioral assertion that fails.
- Mode reload remains conversation-level in this task; per-turn assistant metadata stays deferred as planned. The standalone mode update is temporary until Task 5's command claim absorbs it.
- No unowned backend skill or frontend path was edited, staged, restored, or deleted.

## Commit and concerns

- Base: `13d6dc5` (`docs: plan Phase 3 lifecycle durability`).
- Local commit: `refactor: resolve agent run policy once` (this Task 1 commit; exact SHA is reported by the parent after creation).
- Independent review is intentionally parent/controller-owned because this implementer was explicitly told not to dispatch a reviewer. Task 2 must not begin until that review checkpoint clears.
- No network, dependency, live service/database, migration, deployment, remote, push, or merge action was performed.
