# Workspace Document: contract for reintegration into the host application

> Scope: the neutral `eddyvn98/workspace` extraction. Document completion was merged in PR #58. This is an **integration handoff**, not a claim that the host application has been changed or that its real database/WebSocket/storage have been validated.

## Ownership boundary

Workspace owns its canvas/Document editor, TipTap schema, document/table/embed codec, board persistence protocol, exports, realtime room semantics, and tests. The **host application** owns login/session identity, existing users and permissions, application shell/navigation, deployment infrastructure, and secret management.

**Do not build a second sign-in system in this extraction.** Keep the permission decisions and validation at API/room boundaries, but adapt the following providers when integrating:

| Contract | Current neutral implementation | Host responsibility |
| --- | --- | --- |
| Caller identity | `app/api/workspaces/_auth.ts`: `resolveWorkspaceCallerEmail(req)` and `resolveWorkspaceCallerAuth(req, body)` | Return the host's canonical user identity for browser and authorized agent requests; remove the development-only fallback in the integrated production build |
| Board authorization | `app/api/workspaces/_access.ts`: `resolveAccessRole(board, email)` | Reuse the host's sharing/ACL model or map it to `OWNER` / `EDITOR` / `VIEWER`; keep the unauthorized/no-write checks |
| Realtime token | `app/api/workspaces/[id]/ws-token/route.ts`, `lib/workspace/ws-token.ts` | Mint board-scoped, short-lived signed tokens **after** authorization; use the same signing secret as the Workspace WS service |
| AI/service caller | `lib/workspace/agentAuth.ts`, Workspace agent routes | Map to host-controlled agent credentials and caller identity; do not bypass write authorization |
| File assets | `app/api/workspace-images`, Workspace resource and knowledge storage | Point to the host storage service; ensure saved image URLs and original downloads remain available to the editor and export pipeline |
| Database | `prisma/models/WorkspaceBoard.prisma` and migrations | Adapt the additive migration and preserve board IDs, owner role, revisions, attachments and row relationships |

The neutral environment's `WORKSPACE_DEV_USER_EMAIL` and `mock-email` cookie are development conveniences, **not host identity contracts**. An existing host session should replace their resolution without changing the TipTap document schema.

## What must move together

Use the merged Workspace commit as the source of truth, then transfer the feature paths together rather than cherry-picking UI controls:

- `app/workspace/**`, `app/office/**`, `app/api/workspaces/**` and Workspace-related API routes/asset endpoints used by those components
- `lib/workspace/**` (notably `document-schema.ts`, `ydoc-documents.ts`, `document-room.ts`, `document-checkpoint.ts`, `ydoc-persistence.ts`, and realtime notification modules)
- `scripts/workspace-ws/**`, `package.json` script `workspace:ws`, and the required dependencies/lockfile entries
- The `WorkspaceBoard.documentState` schema change and the additive migration `20261019160000_add_workspace_document_state`
- Document/Office/realtime tests from `__tests__/workspace/**` and the three `docs/workspace-document-*.md` contracts

Check for path/route collisions, host import aliases, shared CSS, Prisma table mappings and dependency versions before applying a filesystem-level merge. Do **not** blindly overwrite the host's `package.json`, lockfile, Prisma schema, app layout, session middleware, or storage implementations. The related `agent-web` repository also uses an explicit seam/three-way-merge model; it is **not** automatically assumed to be this module's destination.

## Runtime wiring

1. Merge schema changes with the host's existing Prisma schema. Back up host data and apply the additive migration in the host's controlled rollout; never reset the database to match the extraction.
2. Run one Workspace document-aware realtime room service using `pnpm workspace:ws` or the host's equivalent process manager. It must have a private path back to the host's internal Workspace board API.
3. Set `WORKSPACE_WS_TOKEN_SECRET` in both the app and WS service. The app uses `WORKSPACE_WS_INTERNAL_URL` and publishes `NEXT_PUBLIC_WORKSPACE_WS_URL`; the service uses `WORKSPACE_INTERNAL_API_ORIGIN`. Route WebSocket upgrades for `/workspace/*`.
4. Keep the internal `/internal/workspace-agent-patch` and `/internal/workspace-access-changed` endpoints private. Never expose their shared secret or allow browsers to impersonate internal calls.
5. Ensure the host app exposes stable routes for `/workspace`, `/workspace/doc-editor`, and `/office/document` (or adapts all links/deep links consistently). Keep the canvas and Office versions of a Document pointed at the same board/block identity.
6. Make server-confirmed saves the success criterion. Offline drafts, conflict responses, deletion-only edits and AI/version-restore invalidations must retain the same semantics as the neutral implementation.

The document-aware room registry currently supports **one service instance** per workspace namespace. Do not horizontally scale independent replicas without implementing shared room coordination. The export contract distinguishes complete Document HTML/print PDF from frame-clipped canvas exports.

## Local agent: final validation after host integration

The test owner, not this neutral repository, should execute environment-specific checks. Use `docs/workspace-document-local-test.md` as the detailed matrix; add the following host-specific gates:

- Same user and two users: session-to-board role mapping, Office VIEWER read-only, API mutation rejection and short-lived WS-token rotation; no second login flow
- Real PostgreSQL migration, document create/save/reload, two-browser concurrent edits, socket disconnect/reconnect, REST fallback, AI edits and revision conflict recovery
- Real image paste/upload, original download, clipboard table dependencies, copy/import/export and HTML/print/canvas output opened in browsers
- Existing host navigation, CSS and component integration, build/typecheck and all previously passing host regression tests
- Backups and rollback: deploy server + migration before enabling document-aware rooms; retain prior data until compatibility and restore are demonstrated

**Stop / rollback on silent content loss, incorrect cross-board table ownership, unauthorized mutation, or confirmed revisions that were not persisted.** CI green for the extraction is not evidence of successful host integration.

## References

- [Document realtime and persistence](workspace-document-realtime.md)
- [Document copy/import/export behavior](workspace-document-export.md)
- [Local-agent tests](workspace-document-local-test.md)
- [Release acceptance levels and rollback](implementation/03-release-acceptance.md)
