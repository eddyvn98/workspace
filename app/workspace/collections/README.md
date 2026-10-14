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


## Deterministic browser acceptance runner

The previous Playwright setup ran `next dev` with two workers (desktop and mobile). During concurrent reload Next Fast Refresh rebuilt modules and occasionally failed to fetch the RSC payload; the fixture remained at the server-rendered `Preparing browser test…` shell because React never hydrated. Running the mobile test alone passed, supporting a dev/HMR race rather than proven data loss. The remedy is to **build once and start immutable Next production mode**, retaining **2 workers** to detect any real concurrency bugs. The opt-in `/collection-acceptance` page is forced dynamic so `COLLECTION_BROWSER_ACCEPTANCE=true` is evaluated at request time, not frozen during build. Reusing an existing dev server is disabled. Tests now assert HTTP 200, hydrated fixture readiness, record values after reload, and absence of runtime hydration/RSC failures.

Run `pnpm build` before `pnpm exec playwright test -c playwright.collection.config.ts`. The webServer uses `pnpm exec next start -p 3137` with an isolated port. Stop any existing server on port 3137 before running. Browser fixture verifies real components and `localStorage`, **not authenticated Postgres or a deployed WebSocket room**.


## Collection capabilities added on feature branch (October 2026)

- Form View creates records in the canonical Collection, with configurable required and visible fields.
- Gallery cards have per-view configurable columns and bounded rendering.
- Same-Collection multi-relations are stored as JSON arrays in existing string cells; existing single-ID values still work. Relations may also target records in another Collection block on the same board.
- Lookup and rollup are read-only projected values. Rollups count linked records or calculate sum / average / min / max over numeric source values. Foreign targets are read from sibling board blocks; records are only edited in their owning Collection.
- Formula expressions accept numeric \`{fieldId}\` references and arithmetic operators (+, -, *, /, parentheses); parsing is bounded and never uses eval. Existing fixed-operation formulas remain supported.
- One-pass record automation rules can change another writable field when a trigger field transitions to an exact value; model commands use the same deterministic rule function as the UI.
- Gantt bars support direct pointer move/resize, alongside the previous keyboard-accessible controls; Mind Map nodes can be dragged near another node to change their parent.
- Foreign-Collection links do **not** create cross-block cascade updates. Removing a target record leaves its foreign reference stale until the owner fixes it; the UI displays an empty computed value when its target is absent. Do not claim per-record Yjs realtime or global relational integrity.
- No tests or staging acceptance were run for these new changes per user instruction. Treat this branch as unverified work-in-progress until a later repair pass.


## Integrity, history, and record pages (follow-up)

- Record deletes from the Workspace editor and AI now remove inbound links from
  other Collection blocks on the **same board**, in the same board-save transaction.
  Removing a target Collection block also unbinds source fields and clears their
  now-orphaned values; existing valid links to other blocks are untouched.
- Collection Settings includes a dangling-link diagnostic and an explicit
  "Repair dangling links" action. Repair removes only IDs no longer present in
  the linked Collection; it is never automatic on a passive read.
- Each Collection stores a capped (120) record-level change history covering
  create/edit/delete and long-form notes. Consecutive typing edits to the same
  record field coalesce, reducing noise. History lives inside the board JSON and
  is **not a tamper-proof regulatory audit log**.
- Table, Kanban and Gallery can open a shared record detail drawer with editable
  fields and a 20,000-character notes body. AI can read a bounded notes preview,
  and create/update the notes with the same authenticated record commands.
- A lightweight authenticated revision-only endpoint alerts Collection users
  when another session has saved a newer board. It **does not** change the local
  CAS base revision. "Save & refresh" uses the existing persistence-flush path
  and avoids reloading when the pending save could not be confirmed. It is not
  realtime editing, nor does it merge active editors' cursors.
- The existing REST three-way merge now merges per-record history entries by
  their event IDs. The same-field concurrent edit conflict policy remains.
- No tests, builds, staging checks, or deployment were performed for this
  follow-up, as expressly requested by the owner. Regressions may still exist.
- Background scheduled automations, authenticated external webhooks and
  record-level collaborative CRDTs still require dedicated implementations.
