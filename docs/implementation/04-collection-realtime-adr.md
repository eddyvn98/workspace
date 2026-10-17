# ADR — Collection realtime protocol: REST CAS with revision awareness

Status: **Implemented incrementally, staging validation pending** (2026-10-17).

## Decision
Keep revisioned REST as the **single authoritative Collection writer**. Yjs currently serializes board blocks as whole values and is disabled when a Collection block exists. Introducing a second Yjs writer before a granular migration would risk silent overwrites. For this iteration, provide revision-only polling to alert users when another session committed a new version. Never automatically replace unsaved drafts on an advisory response.

## Design
- `GET /api/workspaces/:id/revision` already authorizes the caller and returns only the revision, without affecting the local base revision cache.
- `useCollectionRevisionWatch` polls this endpoint each 10 seconds only when Collection is active, the tab is visible, and the known base revision has been hydrated.
- Skip while a save is in progress where status is known; notification is advisory, never a forced reconciliation.
- REST PUT continues to send `baseRevision` and a mismatched revision is refused (409); the persistence layer performs three-way merging and reports conflicts.
- No Yjs/REST dual writer, no new database schema, and no automatic remote snapshot adoption.

## Explicit limitations / future decisions
- This **is not live record-by-record collaboration** and does not show collaborator cursors in Collection. This is a correctness-first notification mechanism.
- Browser unit tests and CI cannot establish real Postgres consistency. Local agent must run 2 authenticated browser sessions (different roles), parallel edits, loss of connectivity, reconnect, status-change/reload, and CAS denial.
- If a true multiuser editing requirement is confirmed, measure (A) server-push invalidation over REST versus (B) granular Yjs records/fields/order with migrations and fencing, before selecting B.
- Feature rollout can be reversed by removing the hook call with no schema/data migration.

## Local agent acceptance matrix
1. OWNER and EDITOR open the same Collection board; EDITOR changes a different field and saves. OWNER receives stale revision notice without editor draft replacement.
2. OWNER changes a local field, EDITOR changes same field. Only server-accepted write wins by policy; the other receives explicit merge conflict; no lost local draft.
3. VIEWER cannot PUT or mint write privileges, but can GET revision for accessible board.
4. Unauthorized account cannot GET revision; board existence is not disclosed.
5. Simulate loss of network and recovery. Notification request errors never reset local data or claim a save succeeded.
6. Switch tabs and boards during a revision request, confirm no cross-board notification or unwanted state change.

Status is not STAGING_PASS until agent local submits evidence links.