# Account erasure

`DELETE /api/v1/user/account` requires CSRF validation and recent Firebase
authentication. It obtains exclusive account access before disconnecting database
pools or deleting any data. If another request or background write is active, it
returns HTTP 409 without starting cleanup. The user can stop active responses and
retry once their final writes finish.

Authenticated requests hold admissions through the entire ASGI response,
including stream finalization and response background work. Detached tool and
memory work retain independent admissions until their underlying operations
finish, even if their callers time out. Firebase session creation participates in
the same barrier, including a login that verified its ID token before deletion.

The cleanup order is: disconnect connections; clear session/quota state; erase
all account-owned checkpoint namespaces; erase conversation vectors and documents;
drain outstanding vector-cleanup records (including exhausted retries and deleted
conversations); erase context and usage; delete the Firebase identity. Retry
records are retired only after successful vector deletion. External user
databases are disconnected, not erased.

Partial erasure leaves the account in a pending-deletion state. Ordinary account
requests are blocked; authentication and another deletion attempt are allowed.
An active erasure excludes both. Completed erasure retains only a hashed-UID
barrier marker, preventing a previously verified, delayed request from recreating
data after identity deletion. No content or plain UID is stored in this marker.

## Deployment and recovery

Production/staging require the shared Redis activity store; Redis failures do not
fall back to process-local admission. The development fallback is single-process
only. All workers must run the barrier-aware code before account erasure is
enabled during a deployment; drain older workers first.

The `account_activity:{sha256(uid)}:state` and `:requests` keys have no TTL.
Redis must preserve these keys: use persistent storage and a non-evicting policy.
Do not flush/reset them while workers can still write. Expiring an admission could
allow a paused worker to resume after deletion and recreate data.

An abruptly terminated worker or cancelled operation whose completion cannot be
proved can leave an admission behind. Erasure then fails closed. Operators must
first confirm the originating work and worker have terminated, then remove only
the confirmed stale token from that account's requests set. If that token owns
the state key, change the state to `pending`, never clear a `deleted` marker.
Retry erasure after recovery. Never clear live tokens merely to make deletion
succeed. A Redis recovery that loses barrier state requires draining all workers
before accepting further traffic.
