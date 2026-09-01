# Moonlit Back-End Design Reference

## Purpose

This document records the intended design of the existing Moonlit back end. It translates product
and operational needs into stable engineering decisions without replacing executable API schemas,
tests, or the configuration reference in `back-end/README.md`.

The primary design goal is a secure, truthful AI-to-database service: authenticated users can ask
for database work, observe progress, and recover from interruption without another user gaining
access, stale work mutating current state, or the client receiving a success signal before the
corresponding state is durable.

## Design Priorities

When concerns conflict, use this order:

1. Correctness and truthful outcomes.
2. Authentication, authorization, and secret protection.
3. Data integrity and ownership isolation.
4. Durable recovery and backward compatibility.
5. Existing architectural boundaries.
6. Simplicity and maintainability.
7. Performance and extensibility.

## Core Design Decisions

### One explicit HTTP boundary

FastAPI controllers own transport concerns: dependency resolution, Pydantic validation, status
codes, headers, and response construction. Services own application behavior. Drivers, Firestore,
Redis, Bedrock, and Qdrant must not leak their native exceptions or data shapes directly to the
client.

Why: a single transport boundary keeps public contracts stable while infrastructure changes and
prevents sensitive internal details from becoming part of the API.

### Contracts before implementations

Public schemas and cross-subsystem protocols live in `api_contract/`. Concrete cross-feature
implementations are registered in `composition.py` and accessed through typed runtime ports.
Feature-local helpers may remain concrete when no cross-boundary substitution or test seam is
needed.

Why: the orchestration, conversation, and memory layers need isolated testing, but a generic
repository or service abstraction for every file would add indirection without value.

### Authentication and authorization are separate

Firebase proves identity. Every protected resource then performs its own authorization check:
conversation ownership, administrator identity, database-session ownership, and user-scoped
persistence. Frontend guards are user experience only.

Why: a valid session must never imply access to another user's resource.

### Immutable run policy

The outer conversation boundary resolves one `ResolvedRunPolicy` before orchestration mutates
state. It includes the effective task mode and its source, provider/model, database-connected state,
and graph/segment/tool/wall budgets. Inner layers consume it; they do not reclassify it.

Why: persistence, prompts, limits, SSE status, and recovery must describe the same run.

### Fenced ownership and immutable checkpoint generations

Agent work is owned by `(run_id, fence)`, not by a run ID alone. A takeover increments the fence,
and stale owners must fail closed before protected mutations. Each attempt writes to an immutable
physical checkpoint generation. Resume activation occurs only after the source has been copied and
verified.

Why: cancellation cannot guarantee an already-running external write has stopped. Fencing and
generation isolation prevent that stale write from becoming current state.

### Durable state defines terminal truth

Progress events are transient. A public completion signal may represent success only after the
assistant response, checkpoint outcome, command/result metadata, and lease transition required by
the contract are durable and immediately readable. Disconnect, pause, partial response, no output,
and finalization failure are distinct outcomes.

This is the target lifecycle contract tracked by the active remediation program. Consult
`back-end/docs/phases.md` before relying on any portion not yet marked complete.

### At-most-once protected effects require durable reservation

External or persistent tool effects must have a stable action identity and a durable reservation
before execution. The active fence must be checked before and after the effect where possible. A
result identifier is published only after its persistence succeeds.

Why: retries and process loss otherwise make it impossible to distinguish safe replay from
duplicate work.

### Bounded work at every layer

Request bytes, schema fields, prompt sizes, graph steps, tool calls, wall time, result rows/bytes,
checkpoint/finalization payloads, and retrieval context all require explicit ceilings. Limits are
enforced at the earliest authoritative boundary and repeated where a lower layer has a smaller
physical constraint.

Why: an AI agent and a remote database are both untrusted workload sources. Unbounded work is a
reliability and security defect.

### Shared infrastructure in production

Redis-backed session state, quotas, rate limits, and checkpoints are mandatory in production-like
multi-worker deployments. In-memory implementations exist for development and deterministic tests,
not production fallback.

Why: per-process state breaks global limits, leases, and resumability when requests move between
workers.

## API Design

### Routes and versioning

- Session bootstrap/check/logout routes remain unversioned for compatibility.
- Product routes are mounted under `/api/v1`.
- Existing path and payload compatibility is preserved unless a migration is explicitly approved.

### Request contracts

- External input is represented by strict Pydantic models where practical.
- Unknown fields are rejected for security-sensitive contracts.
- Conversation IDs are canonical UUIDs and are validated before repository access.
- Model IDs are selected from the server-authorized capability catalog.
- Database configuration is normalized only after authentication and input validation.

### Response contracts

- Non-streaming success and error shapes use the shared API contract.
- Validation failures use a stable sanitized details structure.
- SSE uses typed JSON events encoded as `data: <json>\n\n`; heartbeat comments are transport-only.
- A stream must produce one truthful protocol terminal or be treated as disconnected by the client.

### Compatibility

Additive fields should have safe defaults and preserve old clients when feasible. Removing or
renaming a field, changing a status code, or changing terminal semantics requires coordinated
frontend/backend work and contract tests.

## Persistence Design

### Firestore

Firestore is the durable application record. Repository operations must be user-scoped, avoid
unbounded document growth, and use transactions/CAS semantics for ownership, leases, command
admission, and finalization transitions. Ambiguous commit errors are reconciled with an exact read;
they are never blindly retried when that could duplicate an effect.

### Redis

Redis stores shared, expiring coordination state. Keys must be namespaced, TTLs explicit, and
multi-field mutations atomic. Lua or transactional operations are used when a read-modify-write
sequence must remain indivisible.

### Qdrant/VAMP

VAMP stores derived summary embeddings. Firestore summary blocks remain the durable source.
Indexing is asynchronous, bounded, retryable, and safe to repeat. Retrieval deduplicates and
budgets candidates before they enter a prompt.

### Remote relational databases

Connection factories enforce supported driver formats and SSRF restrictions. Pools have bounded
sizes and lifecycle cleanup. AI tools use the server's read-only SQL policy, while user-submitted
SQL follows its explicit endpoint contract. Database error text is classified and sanitized.

## Concurrency and Failure Model

The service assumes:

- Multiple application workers may handle the same user or conversation.
- A client may retry after receiving no response.
- A process may stop between any two durable writes.
- Network timeouts may be ambiguous: the remote write may have committed.
- Cancellation is cooperative and cannot revoke a blocking driver call already in progress.
- Redis, Firestore, Bedrock, Qdrant, or a remote database may be temporarily unavailable.

Consequently, correctness relies on stable identities, idempotent transitions, durable
reservations, fences, immutable generations, bounded cleanup, and exact state reconciliation—not
on process-local locks alone.

## Security Design

- Fail closed when identity, ownership, CSRF, model authorization, database context, or a protected
  mutation fence cannot be proven.
- Treat prompts, database metadata, SQL, provider output, tool output, stored documents, and
  forwarded headers as untrusted input.
- Apply SSRF protection before remote database connection attempts.
- Use parameterized statements for internal database writes and validated identifiers where
  parameterization cannot represent an identifier.
- Do not place credentials, session cookies, connection strings, raw prompts, or raw external
  exceptions in logs.
- Keep development authentication bypasses disabled outside development and prevent a presented
  but unverifiable credential from falling through to bypass behavior.
- Require shared rate/quota enforcement in production and avoid revealing account-wide provider
  capacity through errors.

## Observability Design

Every request receives a correlation ID. Logs record safe operation context and machine-readable
public error codes. Security-relevant state transitions use structured audit events. Metrics and
administrator endpoints remain server-authorized and fail closed when the configured admin identity
is absent.

Operational logs are evidence, not state. A successful log line must not substitute for a durable
record or a contract test.

## Testing Design

- Pure policy, validation, serialization, and budgeting logic receives unit tests.
- Controller/service and repository boundaries receive integration-style tests with faithful
  fakes.
- Concurrency tests use barriers, fake monotonic clocks, and observable durable state rather than
  sleeps or mock call counts.
- API schemas and SSE event unions receive contract tests shared conceptually with frontend
  parsing expectations.
- External Firebase, Firestore, Redis, Qdrant, Bedrock, and database behavior is verified in
  production-shaped staging in addition to hermetic tests.
- Every regression fix begins with a failing test that demonstrates the production break when the
  repository can express it.

## Deliberate Non-Goals

- No second web framework, ORM, dependency-injection container, event bus, or global repository
  abstraction without an approved need.
- No replacement of Firebase, Firestore, Redis, LangGraph, Bedrock, or Qdrant as part of local fixes.
- No generic multi-provider LLM abstraction beyond capabilities currently supported by the
  repository.
- No broad rewrite of the orchestration or streaming paths while a focused phase can establish the
  required invariant.
- No claim of exactly-once external effects; the practical target is durable admission,
  at-most-once reservation where supported, idempotent reconciliation, and truthful reporting.

## Definition of a Sound Back-End Change

A change is acceptable when it preserves or strengthens public contracts, enforces identity and
ownership at the authoritative layer, has bounded failure behavior, fits existing module
boundaries, includes focused regression evidence, does not introduce unrelated churn, and updates
the relevant documentation when an architectural fact or active phase changes.
