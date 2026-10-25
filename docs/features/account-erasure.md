# Account erasure

`DELETE /api/v1/user/account` requires CSRF validation and recent Firebase
authentication within five minutes, allowing 60 seconds of future-clock skew.
It obtains exclusive account access before disconnecting database
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
requests are blocked; authentication and another deletion attempt are allowed
while the Firebase identity still exists. An active erasure excludes both.
The completed barrier retains a hashed-UID marker, preventing a previously
verified, delayed request from recreating data after identity deletion. No content
or plain UID is stored in this marker. This describes barrier state, not every
retained record: provider rate-limit keys contain the UID and expire naturally;
logs, backups, and external-service records follow their deployment retention policies.

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

There is also a finalization failure window after Firebase identity deletion:
the controller still clears the current session and marks erasure complete in
Redis. A failure at either step can leave pending state without an identity that
can authenticate a retry. Operator recovery must verify completed cleanup and
identity deletion, drain any uncertain work, and reconcile the barrier without
reopening account access. No automated recovery procedure for this window is
provided; do not promise that signing in again can recover every partial failure.


## Source and regression coverage

The [account controller](../../back-end/controller/user_dashboard_controller.py) owns recent-authentication validation and exclusive erasure admission. [AccountDeletionService](../../back-end/service/dashboard/account_deletion.py) coordinates application-data cleanup before Firebase identity deletion. [account_activity.py](../../back-end/core/account_activity.py) and its middleware coordinate request and detached-work admissions.

Relevant tests cover [account deletion](../../back-end/tests/test_account_deletion.py), [account activity](../../back-end/tests/test_account_activity.py), and [checkpoint erasure](../../back-end/tests/test_checkpoint_account_erasure.py). These are source/fixture guarantees; deployment must separately verify Redis persistence, worker draining, and recovery. See [operations](../operations.md#deployment).
