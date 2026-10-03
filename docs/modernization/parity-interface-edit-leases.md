# Interface edit leases

This change fixes a reproduced collaboration bug: closing a rejected editor cleared another user's `edit_uid`. It also prevents two windows belonging to the same user from being treated as one connection. The feature branch has not been deployed to production.

## Ownership and authorization

`solveConflict` loads the persisted interface project and checks the authenticated connection's view and edit rights. View-only guests may inspect a local draft, but receive an explicit read-only result and never claim a write lease. Existing save authorization still rejects their writes. Private nonmembers receive no interface data from this channel.

Each editable WebSocket gets a fresh server-only random token. A single MongoDB `findOneAndUpdate` claims the interface only when a lease is absent, incomplete, or expired. The filter also binds the persisted project. A valid token is authoritative even if an unrelated legacy operation changes `edit_uid` to zero. The ordinary interface query projection hides the token and expiry fields.

Release compares interface ID and connection token. Rejected connections never release; a connection closed while its claim is pending releases only the token it eventually acquired. An old close cannot clear a newer lease. Renewal additionally checks project ID, unexpired lease, token and current edit authorization.

## Lifetime and recovery

- Lease lifetime: 45 seconds.
- Heartbeat: server ping every 15 seconds; only a pong and successful live authorization check renew the lease.
- A missing pong on the next heartbeat terminates the connection and attempts token-matched release. Merely keeping a broken TCP connection marked open does not renew forever.
- Normal close releases immediately. If database release fails, expiry remains a bounded recovery path.
- Process crash or restart cannot renew the old token; another editor can claim after at most the remaining 45-second lease lifetime.
- Existing records without lease fields remain readable. A legacy `edit_uid` with no token is recoverable on the first upgraded claim. No global lock reset, migration or collection cleanup is used. Expiry is a query predicate, not a MongoDB TTL index; interface documents are never deleted by lease expiry.

The lease protocol applies to upgraded writers. Old server processes sharing the same database do not implement connection ownership; mixed old/new collaboration semantics are not an acceptance claim. Production rollout is outside this task.

## Editor behavior

A busy lease shows the existing blocked-editor view. Initial connection failure or timeout is explicit and does not enable an unconfirmed editor. If an active lease is lost, the current draft stays visible and Save is disabled; reopening the edit page obtains a fresh lease. This is collaboration control, not a replacement for REST write authorization or version-conflict checks.

## Verification

Default tests cover ownership, concurrent/same-user claims, rejected and late closes, close during claim, guest/private access, pong renewal, missed pong, revocation, renewal failure, project binding, expiry and model compare-and-set predicates. Browser tests use separate contexts and exact synthetic database IDs for owner/dev/guest, connection loss/reconnect, real pong/revocation, expired takeover, legacy records and a forced crash/restart of only `parity-fast-interfaces-new`. Lease token values are excluded from evidence.
