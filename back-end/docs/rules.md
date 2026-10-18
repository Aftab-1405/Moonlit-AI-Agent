# Moonlit Back-End Engineering Rules

## Authority and Scope

These rules apply to changes under `back-end/`. They complement the repository's `AGENTS.md`
instructions and the contracts encoded in production code and tests. If a requested change would
violate a security, integrity, or public-contract rule, stop and surface the conflict before
implementation.

## Before Modifying Code

- Read the relevant controller, request/response schema, service, repository/adapter, configuration,
  and tests end to end.
- Trace the real request path before proposing a fix; do not infer behavior from filenames alone.
- Check `back-end/docs/memory.md` and `back-end/docs/phases.md` for active work, known findings,
  deferred issues, and verified constraints.
- Inspect the working tree and preserve user-owned changes. Do not reformat or repair unrelated
  files.
- Establish the narrowest practical test, Ruff, or compilation baseline before implementation.
- Clarify requirements that could change API compatibility, persistence, authorization, or terminal
  semantics.

## Architecture Rules

- Keep HTTP concerns in `controller/`, application behavior in `service/`, orchestration in
  `langgraph_orchestration/`, provider behavior in `llm_provider/`, and cross-cutting primitives in
  `core/`.
- Put public schemas and cross-subsystem protocols in `api_contract/`.
- Wire concrete cross-feature implementations only in `composition.py`; consume them through the
  existing runtime-port accessors.
- Extend an existing service, protocol, adapter, error helper, or schema before creating a parallel
  abstraction.
- Keep controllers thin. They may authenticate, validate, authorize, call a service, and translate
  the result; they should not implement the domain workflow.
- Do not create factories, managers, repositories, generic helpers, or global registries unless the
  current change has a concrete second consumer or testability need.
- Do not perform broad refactors of streaming, orchestration, persistence, or adapter code during a
  focused fix.

## API and Validation Rules

- Treat bodies, query/path parameters, headers, cookies, stored documents, provider responses,
  database metadata, and tool results as untrusted.
- Use strict Pydantic request/response models for public JSON contracts. Reject unknown fields on
  security-sensitive inputs.
- Preserve the unversioned authentication routes and `/api/v1` product-route convention.
- Use canonical UUID validation for conversation identity and verify user ownership separately.
- Return the shared success/error envelopes and stable machine-readable public error codes.
- Never expose raw exception text, stack traces, SQL driver details, provider credentials, internal
  collection names, or infrastructure topology to clients.
- Keep SSE events JSON-serializable, typed, bounded, and aligned with `api_contract/streaming.py`.
- Do not emit or interpret a success terminal until the durability contract for that terminal is
  satisfied.
- Coordinate breaking API or SSE changes with the frontend and cover both sides with contract tests.

## Authentication and Authorization Rules

- Verify Firebase session cookies on every protected request; cached session state is not identity.
- Authenticate before reading protected Redis or Firestore state.
- Enforce conversation ownership, administrator access, database-context access, and user-scoped
  storage on the server.
- Keep CSRF enforcement on state-changing cookie-authenticated routes except for the smallest
  explicit bootstrap exemption.
- Compare secrets and CSRF values with the repository's approved security helpers where applicable.
- Development authentication bypass must remain development-only, no-cookie-only, and fail closed
  when a supplied credential cannot be verified.
- Do not trust user IDs, owner IDs, admin flags, model authorization, or permission claims supplied
  by the frontend.

## Secrets, Logging, and Audit Rules

- Read credentials and secrets from environment configuration; never hardcode or commit them.
- Do not log cookies, authorization headers, CSRF tokens, database passwords/connection strings,
  private keys, API keys, raw prompts on sensitive routes, or full external exception payloads.
- Use request-ID-aware logging and the redaction helpers in `core/`.
- Log meaningful failures once at the boundary that has enough context to classify them.
- Use structured audit events for security-relevant actions and ownership/state transitions.
- Do not silently swallow failures. A best-effort cleanup may log and continue only when the primary
  contract explicitly permits it and recovery is recorded.

## Persistence and Concurrency Rules

- Scope Firestore reads and writes by authenticated user and canonical resource identity.
- Use transactions or compare-and-set semantics for leases, ownership, command admission,
  finalization, and any multi-field integrity transition.
- Treat timeout/transport failures after a write as potentially committed. Reconcile exact durable
  state before retrying.
- Own agent mutations with `(run_id, fence)` and reject expired, cancelled, or fenced-out work.
- Write each agent attempt to its immutable checkpoint generation; never let a partial clone become
  active.
- Reserve a protected action durably before invoking its external effect. Publish result IDs only
  after persistence succeeds.
- Keep Redis updates atomic, keys namespaced, and TTLs explicit. In-memory fallbacks are not
  production behavior.
- Bound stored documents and payloads before reaching Firestore, Redis, checkpoint, SSE, or driver
  limits.
- Do not rely on process-local locks for cross-worker correctness.

## Database and SQL Rules

- Support database-specific behavior through the existing PostgreSQL, MySQL, SQL Server, and Oracle
  adapters.
- Validate connection formats, hostnames/IPs, ports, database/service names, schema names, and
  identifiers before driver use.
- Apply SSRF/blocked-host rules before opening a connection; revalidate resolved addresses as
  required by the existing connection policy.
- Use parameterized queries for internal values. Validate identifiers with the existing identifier
  policy where bind parameters cannot be used.
- Keep AI tool execution within the server-defined read-only SQL policy. Do not infer safety from a
  leading `SELECT` alone; database functions can have side effects.
- Preserve per-dialect parsing and metadata behavior. A rule proven for one DBMS must not be applied
  blindly to another.
- Move blocking driver and Firestore operations off the event loop and give them bounded deadlines
  where cancellation cannot stop underlying work.
- Normalize rows, dates, decimals, bytes, and non-finite numbers into valid bounded JSON before
  persistence or streaming.
- Close cursors, connections, pools, and in-flight accounting in `finally`/context-managed cleanup.

## Agent, Model, and Tool Rules

- Resolve one immutable `ResolvedRunPolicy` before the run performs a durable mutation.
- Authorize model IDs against the server-owned capability catalog. Do not accept arbitrary provider
  or model identifiers from the client.
- Enforce graph-step, segment-step, tool-call, token, row/result, and wall-clock budgets as hard
  ceilings at their authoritative boundaries.
- Skill definitions must pass registry validation and retain required routing metadata. Invalid
  skill assets fail closed.
- Treat LLM output and tool arguments as untrusted. Validate tool arguments through the registered
  schemas before execution and validate/structure results before publication.
- Do not serialize live locks, controls, clients, or other process-local objects into LangGraph or
  Firestore state.
- Preserve pause/resume fidelity: publish a resumable interrupt only after the graph is quiescent and
  durable pause state is confirmed.
- Cancellation must stop new protected work, but never claim that it halted an already-running
  blocking external call unless the driver proves it.

## Error and Cleanup Rules

- Catch exceptions only where the code can add context, translate to a stable contract, retry under
  an explicit policy, or guarantee cleanup.
- Preserve cancellation exceptions and generator-close semantics after required cleanup.
- Keep cleanup bounded and await owned background tasks. Do not create orphan tasks whose failures
  disappear.
- Distinguish validation, authentication, authorization, conflict, rate/quota, dependency,
  timeout, interrupted, partial, and internal failures.
- A failure path must not persist a successful tool result, final assistant response, active
  checkpoint, or public `done` event.
- Use safe recovery records for best-effort external cleanup rather than silently abandoning it.

## Performance and Scalability Rules

- Production behavior must remain correct with multiple workers.
- Avoid synchronous network or driver work on the asyncio event loop.
- Bound queues, streaming buffers, retries, backoff, concurrency, result rows/bytes, prompt context,
  and background work.
- Prevent N+1 Firestore/database operations in list and history paths.
- Use batching/chunking only with explicit aggregate size limits and deterministic reassembly.
- Add caching only with a clear owner, invalidation rule, scope, TTL, and security boundary.
- Measure before optimizing; do not weaken correctness or ownership checks for throughput.

## Dependencies and Configuration Rules

- Prefer the standard library and installed project dependencies.
- Add a dependency only after documenting why existing capabilities are insufficient, how the
  version is pinned, and its security/maintenance impact.
- Keep environment parsing and defaults in `config.py`; do not scatter direct environment reads
  through feature code.
- Production-like environments must fail closed when shared Redis or other mandatory security
  configuration is absent.
- Update `back-end/README.md` when setup, environment variables, endpoints, dependencies, or
  operational behavior changes.

## Testing Rules

- Follow test-driven development for features and regressions: demonstrate the failure, implement
  the smallest fix, and rerun the focused test.
- Test happy paths, validation, authorization, ownership, boundary values, failure cleanup,
  cancellation, retries, and concurrency where applicable.
- Prefer state-based assertions. Concurrency tests should use barriers and fake clocks rather than
  sleeps; integration fakes should preserve transaction and ambiguity semantics.
- Mark tests requiring live external systems with the existing `integration`/`slow` markers.
- Run targeted tests first, then the affected regression suite, Ruff, and compilation. Run the broad
  suite when risk and environment permit.
- Never disable, delete, loosen, or xfail a valid test merely to make a change pass.
- Distinguish new failures, pre-existing failures, environmental limitations, and unexecuted checks
  in the completion report.

## Change Hygiene

- Make the smallest coherent change that closes the requirement across every affected layer.
- Do not rename, reorder, reformat, or clean unrelated code.
- Avoid `Any`, unsafe casts, blanket ignores, and weakened schemas used only to silence tooling.
- Remove unused imports, dead branches, temporary debug output, commented-out code, stale TODOs,
  duplicate logic, and accidental formatting from changed files only.
- Review every changed file for correctness, security, performance, regression risk, and scope.
- Update `back-end/docs/memory.md` after meaningful decisions or evidence and
  `back-end/docs/phases.md` when phase status changes.
- Do not mark a phase complete or claim a fix works without recording the exact verification run.

## Definition of Done

A back-end change is complete only when:

1. The requirement and public contract are satisfied.
2. Authentication, authorization, ownership, and data-integrity boundaries remain correct.
3. Failure, cancellation, retry, and cleanup behavior is intentional.
4. Relevant tests pass, or every limitation/failure is reported accurately.
5. Ruff, compilation, and broader regression checks appropriate to the risk have been run.
6. Every changed file has been cleaned and self-reviewed.
7. Operational/API documentation and the back-end memory/phases journals are current.
8. No unrelated user-owned change was modified.
