# Spreadsheet release contract

## Scope and gates
This change delivers bounded XLSX/CSV file workflows and save-safety improvements for the existing FortuneSheet Office app. It does not claim Excel feature parity or a verified production deployment. Mark RELEASED only after the deployment checks below have evidence.

## Supported file contract
- Import/export XLSX: multiple sheets, active sheet, scalar text/number/boolean values, ordinary formulas and cross-sheet references, number formats, whole-cell font/color/size/emphasis, simple fills/alignment/wrap, borders, merged cells, row/column sizes, hidden rows/columns/sheets, frozen panes, HTTP(S)/mailto links and notes.
- Rules: inline dropdown validation and numeric cell-value conditional formatting. Filter range is retained; filter criteria require reapplying in Excel.
- UTF-8 CSV/TSV import preserves blank records and quoting. Values stay text, including leading zeroes and leading '='. CSV export contains active-sheet display values; formula-like strings are apostrophe-neutralized. Use XLSX for formulas/styles.
- Native backup preserves the single spreadsheet block payload. Import the resulting `.workspace.json` using **Import file** in the Spreadsheet app; the destination board/block ID and file title remain unchanged. Attached external assets/other blocks must be backed up separately. Imports/exports are limited to 10 MiB.
- Unsupported features produce compatibility warnings: named ranges, charts/drawings/images, pivot/Excel tables, advanced conditional/validation rules, partial-cell rich text, custom themes, print settings, protection. Macros, external-workbook links, embedded objects and active/external formulas are rejected, not silently executed.
- I/O limits: 10 MiB compressed input/output, 50 MiB actual inflated ZIP data, 2,048 ZIP entries, 20 sheets, 10,000 rows, 256 columns, 50,000 allocated cells TOTAL, 32,767 characters/cell and 8,192/formula. These are supported I/O limits, not a promise that arbitrarily large existing canvas blocks will be fast.
- File processing runs in a disposable browser Worker. Cancel, unmount and the 30-second timeout terminate it. CSP must permit the same-origin Next.js worker chunk; no third-party worker URL is required.

## Data safety
Both Office and Workspace still edit the SAME canonical board/block. Import requires confirmation and refuses to replace content that changed during parsing. Viewer import is disabled and rechecked at completion.

Flush first commits the active cell/formula-bar edit, then drains the editor callback, then invokes REST/WS persistence. An unsuccessful save does not navigate away. Unsaved Office edits trigger a browser unload warning; mobile OS process termination is not guaranteed to deliver unload events.

Spreadsheet boards are fenced from whole-block Yjs writes on BOTH client and server. They use revisioned REST writes and external-update polling. This is deliberate: it is not granular simultaneous cell coauthoring. On a conflicting workbook save, keep the user's draft and show an error instead of adopting the other writer and reporting an automatic retry as success. Export a Native backup before reloading to resolve a conflict.

External polling must not advance the CAS revision until its snapshot is actually adopted. A local mutation during an in-flight poll invalidates that response.

## Automated acceptance
Run the full existing Workspace gate, not just new tests:

```sh
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm exec tsc --noEmit
pnpm test:workspace
pnpm build
pnpm exec playwright test -c playwright.collection.config.ts
```

The browser suite now includes Spreadsheet import confirmation, a real worker/XLSX download, reload, active-edit flush, malformed file handling, read-only and Escape on desktop/mobile Chromium. `/spreadsheet-acceptance` is an isolated LOCAL persistence fixture gated at request time by `SPREADSHEET_BROWSER_ACCEPTANCE=true`; leave this unset in real deployments. Fixture success is NOT proof of authenticated database/network behavior.

## Host-app acceptance handoff (delegated to local agent; required before RELEASED)
- Record integration commit and CI run. Verify `/spreadsheet-acceptance` returns 404 on deployment. This repository is the identity-neutral extracted module; the embedding host owns authentication and identity.
- In the host integration: verify editor/viewer permissions are enforced by the host's security layer, not by adding a second login system to this module. An editor creates, renames, edits formula/style/multiple sheets, saves, reloads and opens on Canvas with identical data.
- In two authenticated sessions, test different-block updates and same-workbook conflicts. Confirm draft retention, error visibility and backup/recovery; a stale WS room must receive 409.
- Simulate 503/offline during save, an edit during an external poll, session expiry and permission revocation. Never show success for data not committed.
- Exercise 1k/10k-row fixtures within the total-cell budget on the actual target device. Record load/edit/save/export timings and memory; no unmeasured performance claims.
- Open exported representative files in the user's target Excel/LibreOffice; inspect formulas, dates, rules, blank-cell formatting and number formats. Back up, replace with CSV, restore the original `.workspace.json` from inside Spreadsheet, and verify destination identity is retained. Confirm unsupported features are disclosed.
- Perform a database backup and restore drill; verify monitoring of 409/5xx and backup retention. No schema migration is required by this change.

Rollback: redeploy the preceding known-good commit without changing the database. Retain native backups. Disable imports while investigating any fidelity failure; do not discard newer board data during rollback.
