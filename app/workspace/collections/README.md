# Universal Collection Views — Issue #2 release gate

## Functionality and persistence

- **Insert → Add Collection** creates a collection canvas block. Table, Kanban, Calendar, Timeline, Gallery and hierarchical Mind Map use the same records with stable IDs.
- Editing a record updates the board block and flows through the existing Workspace local cache + authenticated Postgres board REST autosave. The active editable View ID is persisted in the block. A VIEWER may browse tabs locally without saving changes.
- **To Collection** on the existing Table toolbar copies its values to a new independent Collection; the source Table is unchanged.
- CSV/JSON import and CSV/JSON export are available. CSV export neutralizes spreadsheet formula injection; JSON import checks the format and caps records. Spreadsheet formula cells are copied as display text, not live formulas.
- Fullscreen uses a DOM portal rather than a CSS fixed element inside the canvas transform. Small viewports use scrollable columns and responsive toolbars.

## Concurrent editing safety boundary

**Collections deliberately use REST instead of whole-block Yjs sessions.** The current Yjs room stores complete CanvasBlock values, which loses simultaneous edits to different Collection records. The Workspace client declines to join realtime for boards containing Collections, and a previously joined Yjs room's POST /sync-board is refused with HTTP 409 if either the stored or submitted board contains a Collection. New collection creation disables the realtime-live writer flag before insertion so the existing REST autosave is armed. Ordinary boards retain their existing Yjs behavior.

REST uses optimistic board revisions and performs a three-way merge on HTTP 409. For Collection blocks, records are reconciled by record ID and individual value field; independent edits and additions survive. Divergent writes to the *same* field, or deletion vs modification, are reported as conflicts rather than silently dropped. Unlike true collaborative editing, a second tab may observe other edits only after REST polling/reload; there is no real-time cursor/drag collaboration on collection boards.

**Not proven for production multi-user:** an already-open stale legacy client/socket may still display stale state until its next refresh; conflicts across structural field/view changes may require user intervention. Review server/client version compatibility before enabling collaboration publicly.

## Verification

Commands on a checked-out repo with pnpm 9.10.0 and Node 20:

```bash
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm exec vitest run __tests__/workspace/collection-views.test.ts __tests__/workspace/collection-conflicts.test.ts
pnpm exec tsc --noEmit
DATABASE_URL=postgresql://workspace:workspace@localhost:5432/workspace MONGODB_URI=mongodb://localhost:27017/workspace pnpm build
pnpm exec playwright install --with-deps chromium
pnpm exec playwright test -c playwright.collection.config.ts
```

The Playwright fixture route `/collection-acceptance` is only enabled with `COLLECTION_BROWSER_ACCEPTANCE=true` (set by its webServer). It mounts the actual Insert toolbar, Table conversion toolbar and Collection renderer; it stores a board-like snapshot in browser localStorage so browser reload/edit/read-only/mobile behavior can be tested **without private credentials**.

**Scope of browser evidence:** the fixture confirms rendered component behavior and local snapshot round-trips. It does **not** prove authenticated Postgres persistence or realtime service operation; those require a real staging Workspace board with owner and viewer credentials.

## Required manual staging acceptance (before merge)

1. Open a persisted Workspace board as OWNER/EDITOR and insert Collection.
2. Add/edit/delete records, switch all View tabs, convert existing Table and verify source unchanged.
3. Wait for the save indicator to settle, reload, open on a second device and verify record values, active View, and object IDs.
4. Open the same board as VIEWER; verify record mutations/import/configuration cannot persist, but tabs remain browsable.
5. Exercise mobile touch/scroll/fullscreen and browser Back, especially Kanban status select (touch alternative to drag).
6. Disable/reconnect network, then edit different records from two sessions. Confirm both records survive REST 409 merge; a same-field conflict must be signaled. Inspect server log if older WS clients remain attached.
7. Repeat on a board with ordinary Doc, Spreadsheet, Mind Map and Shapes to catch regressions.

Do not mark Issue #2 complete or merge PR #1 before **actual local CI and authenticated staging evidence** are reviewed.


## Post-local-CI follow-up

Local feedback on commit `5f9bc81`: `pnpm exec tsc --noEmit` passed; two CSV Vitest assertions failed and the Playwright devServer command parsed `-p` as a project path. These were fixed in commit `a4fa938`: explicit CSV comma delimiter, compare round-trip values instead of regenerated field IDs, and `pnpm dev -p 3137`.

An intermittent dev-only `Hydration failed` overlay was observed under `<Workspace><ProtectedRoute>`. The dynamic client check for server-only `WORKSPACE_DEV_USER_EMAIL` could disagree between SSR and browser. The workspace route now evaluates a non-secret boolean on the server and passes it as an explicit prop to the client route and ProtectedRoute, so the initial decision is the same on both sides. **This is a suspected cause and a targeted fix, not a verified elimination**. Confirm after local reload with console open and no hydration errors; report stack if it persists.

`BlockFrame.tsx` was previously 413+ lines. Connector geometry and document/slides auto-fit moved to `useBlockFrameGeometry.ts`, and frame styles moved to `blockFrameStyle.ts`; the original frame is now under 300 lines. No behavior change intended.
