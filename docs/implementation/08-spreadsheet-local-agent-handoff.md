# Spreadsheet — local agent acceptance and host integration

This is an **identity-neutral extracted Office module**. The original host app provides authentication, authorization, identity, navigation and deployment. Do not add a second login, user database, tenant model or brand to this extracted project solely for acceptance.

## Developer contract
- Office Spreadsheet is the `table` block with `mode: "spreadsheet"`; the standalone editor and Canvas access the same canonical board/block. Keep board and block IDs stable on import/export. `WorkspaceSpreadsheetEditor` accepts `block`, `onChange`, `onClose`, `allowEdit`, `boardId` and optional `assistant`.
- New XLSX/CSV and native backup conversions are pure file utilities in `lib/office/spreadsheet` with a disposable browser Worker, not an external service. The host does not need Office-provider API keys or a second storage backend.
- Import is a *replace workbook* operation. It must require a confirmation and reject replacement if data changed while parsing. Native import restores spreadsheet content **only**; it never rewrites host board/block IDs, the destination title or foreign assets.
- Spreadsheet uses revisioned REST persistence, deliberately **not** whole-block Yjs realtime. A 409 leaves the local draft intact and requires reconciliation; exporting Native backup is the recovery route. Do not flip on whole-block WS publishing for Spreadsheet.
- The import/export budget is 20 sheets, 10,000 rows, 256 columns, 50,000 allocated cells total, 10 MiB file, 50 MiB decompressed ZIP, and a 30-second Worker task. The bounds apply to I/O, not an assertion of UI performance. Compatibility warnings are part of the public file contract.
- `/spreadsheet-acceptance` is isolated and enabled only when `SPREADSHEET_BROWSER_ACCEPTANCE=true` at request time; it must remain disabled in the integrated production deployment.

## Agent local — acceptance matrix
Use local or staging credentials belonging to the **original host**, without committing any secrets or identity-bearing fixtures to this repo. Record the tested SHA and screenshots/traces.

| Area | Steps | Pass condition |
|---|---|---|
| File lifecycle | Create Spreadsheet, rename, edit, Save, reopen and open on Canvas | Same cells, formula, styles, sheets and title |
| XLSX fidelity | Import a realistic two-sheet Excel file with dates, numbers, cross-sheet formulas, merged/frozen/hidden sections and styles on **empty** cells; export and reopen in Excel/LibreOffice | No silent loss of supported fields; warnings for excluded features |
| Native recovery | Export Native backup, import a different CSV, then reimport `.workspace.json` using Spreadsheet **Import file** | Original workbook restored; host board/block ID and destination file name unchanged |
| CSV | Import/export UTF-8, quoted commas/newlines, empty rows, Vietnamese text, `00123`, `=SUM(1,2)` as literal | No formula injection; no skipped data |
| Save safety | Type in formula bar but do not press Enter; Save or navigate away; reload | Active edit persisted or clear failed-save warning; never silent loss |
| Network failure | Lose connectivity during Save, try Back and reload; reconnect/retry | No false saved status; native backup remains accessible |
| Concurrency | Edit one workbook in two sessions, save stale second version | Conflict surfaced; stale draft preserved for backup, not overwritten |
| Host permissions | Test the host-provided editor vs read-only and direct mutation route | Read-only never writes; no second auth system in module |
| Limits/security | Oversized/truncated XLSX, macros, external links, invalid JSON native backup | Clear rejection; current workbook left untouched |
| Responsiveness | Desktop Chromium and mobile viewport with 1k/10k-row samples within 50k cells | Record load/edit/save/export latency and memory; optimize only from actual measurements |

## Noninteractive checks (existing repo)
```sh
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm exec tsc --noEmit
pnpm test:workspace
pnpm build
pnpm exec playwright test -c playwright.collection.config.ts
```

The isolated Playwright route is a **fixture**, not proof of host persistence or multiple-user behavior. The local agent is responsible for those integration checks. Do not claim successful staging or release based only on green CI.

## Final report requested from local agent
- Integrated host SHA and deployed URL (if applicable), test platform/browser, pass/fail and relevant trace/screenshots for each matrix row.
- Any data loss, fidelity or save-conflict issue as a reproducible test + fix commit.
- Release decision: `CI_PASS` means code gate only; `INTEGRATION_ACCEPTED` requires the above host matrix; `RELEASED` requires the host's normal deployment and rollback evidence.

No schema migration is introduced for the file workflows. On failure, redeploy preceding known-good commit; retain database/native backups rather than dropping newer board data.
