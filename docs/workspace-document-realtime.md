# Document collaboration service

The workspace service runs from `scripts/workspace-ws/index.ts`. It hosts native Yjs XML fragments for Documents, the existing board maps, and authenticated presence. The browser and service use the same TipTap schema. PostgreSQL remains the durable source through the application's internal `sync-board` endpoint.

## Run locally

Run the Next.js application and this service as separate processes:

```sh
pnpm dev
pnpm workspace:ws
```

Configure the application and service with the same `WORKSPACE_WS_TOKEN_SECRET`. Use a random secret rather than the example value. The service does not need database credentials.

| Variable | Process | Value |
| --- | --- | --- |
| `WORKSPACE_WS_TOKEN_SECRET` | Both | Shared signing and internal API secret |
| `NEXT_PUBLIC_WORKSPACE_WS_URL` | Application | `ws://localhost:3002` locally; the public `wss://` service URL in production |
| `WORKSPACE_WS_INTERNAL_URL` | Application | `http://127.0.0.1:3002` locally; the service's private HTTP origin in production |
| `WORKSPACE_INTERNAL_API_ORIGIN` | Service | `http://127.0.0.1:3000` locally; the application's private HTTP origin in production |
| `WORKSPACE_WS_PORT` | Service | Defaults to `3002` |
| `WORKSPACE_WS_HOST` | Service | Defaults to `0.0.0.0` |

The launcher reads the process environment, then fills missing values from `.env.local` and `.env`, in that order. Apply the `add_workspace_document_state` Prisma migration before enabling this service.

## Save and synchronization behavior

Rooms save after two seconds without an edit, or after ten seconds of continuous editing. A successful compare-and-swap write publishes its new board revision and the exact persisted Yjs state vector. Per-client mutation markers give deletion-only edits a fresh clock, so the client confirms a save only when the receipt covers its edits. An HTTP response for an older in-flight snapshot cannot confirm a later edit.

A stale revision triggers a reload and a CRDT rebase against the previously persisted ancestor. REST, AI, and version changes reach open rooms through an authenticated invalidation notification. Duplicate and out-of-order notifications cannot roll a room back. Dirty rooms survive disconnected clients and transient repository failures, with retries capped at a thirty-second interval. When a writer loses access, the service revalidates another connected owner/editor before saving; without an authorized writer, it retains the pending room without confirming a save. Deleted boards and incompatible Collection boards close the room.

Viewers receive documents and presence without contributing document updates. Tokens are scoped to one board and expire after sixty seconds; established sockets remain open until disconnection or an access-change notification. The client refreshes access with its token and locks editing after a verified downgrade or access denial. Transient network failures keep the last known role. Presence identities come from the verified token. Server save receipts cannot be supplied by a client.

An editor keeps its Yjs fragment while disconnected. Pending realtime changes hand off to REST with the original CRDT operation IDs, including when Save or navigation follows disconnection immediately. Unresolved revision conflicts keep the local draft and cannot be retried as a blind overwrite using a newly fetched server revision.

## Operation

Use one service instance for the workspace room namespace. Multiple independent instances holding the same board require a shared room coordinator and are not supported by this in-memory room registry. Route websocket upgrades for `/workspace/*`; allow the application to reach the service's two private `/internal/workspace-*` endpoints. A public unauthenticated `GET /health` returns readiness without board data.

The service bounds incoming websocket messages to 8 MiB, complete HTTP requests and responses to 32 MiB, and checkpoint binaries to 24 MiB. It caps active rooms and participants, applies websocket backpressure, and uses ping/pong to release dead connections. File uploads remain on the image upload API; Documents store the resulting image URLs.

SIGINT/SIGTERM stop new joins and attempt to flush dirty rooms. A failed flush is reported and retained for retry instead of being reported as saved. A hard process kill can lose edits that have not received a persistence receipt; the UI continues to show them as pending or failed. Health checks and application save errors should be monitored before routing production traffic.
