# Workspace

A collaborative canvas for documents, diagrams, tables, and AI-assisted image flows. This is an **identity-neutral feature extraction** intended to be reintegrated into a host application. The host provides its existing sign-in, session, navigation and permissions integration; this repository is not a separate identity product.

## Requirements

- Node.js 22.13+ or 24, pnpm **9.10.0**
- PostgreSQL and MongoDB for the features that use them
- Dify API credentials for enabled Workspace AI features
- Dedicated document-aware Workspace WebSocket service for live TipTap/Yjs collaboration

## Development setup

1. Copy `.env.example` to `.env.local`; configure development database, image storage and AI providers as needed.
2. Install dependencies: `pnpm install --frozen-lockfile`.
3. Apply migrations to a **development** database: `pnpm exec prisma migrate deploy`, then `pnpm prisma:generate`.
4. Configure the same `WORKSPACE_WS_TOKEN_SECRET` in the Next.js app and service. Set `NEXT_PUBLIC_WORKSPACE_WS_URL`, `WORKSPACE_WS_INTERNAL_URL` and `WORKSPACE_INTERNAL_API_ORIGIN` as described below.
5. Start `pnpm workspace:ws` and `pnpm dev` in separate terminals. Open `http://localhost:3000/workspace`.

The development-only identity `WORKSPACE_DEV_USER_EMAIL` is **not** a production sign-in mechanism. Board ownership and access currently use PostgreSQL. Document collaboration stores Yjs checkpoints in PostgreSQL through the app's persistence API; other Workspace modules may also use MongoDB. If the realtime service is unavailable, the app retains its revision-checked REST save path.

Never apply the extraction's migration by resetting a database that already contains host data. The document-aware room registry currently runs as **one service instance**; see the runtime guide before deploying or scaling.

## Document integration and operations

- **[Host integration boundary / merge-back checklist](docs/workspace-upstream-integration.md)** — what must move together; where to plug in the host's existing identity, permissions, storage and infrastructure without implementing another login.
- [Document WebSocket and persistence](docs/workspace-document-realtime.md)
- [Document copy/import/export contract](docs/workspace-document-export.md)
- [Agent-local acceptance matrix](docs/workspace-document-local-test.md)
- [Release / staging acceptance and rollback](docs/implementation/03-release-acceptance.md)

The Document completion implementation was merged in [PR #58](https://github.com/eddyvn98/workspace/pull/58). Passing CI and local unit/fixture tests in the extraction **do not establish** that the integrated host's real services, WebSocket, credentials, or storage have been validated.

## Implementation blueprint

The broader product-readiness plan is documented separately from implemented behavior:

- [00 — Master plan: architecture, phases, dependencies and definition of done](docs/implementation/00-master-plan.md)
- [01 — Library capability matrix and integration audit](docs/implementation/01-library-capability-matrix.md)
- [02 — Implementation backlog with work item IDs and acceptance criteria](docs/implementation/02-implementation-backlog.md)
- [03 — Release/staging E2E, security, operations and rollback runbook](docs/implementation/03-release-acceptance.md)

**Documentation is not proof of deployment.** Check the linked PRs, CI runs and agent-local host integration reports before declaring a release production-ready.
