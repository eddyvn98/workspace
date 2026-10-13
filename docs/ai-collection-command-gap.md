# Workspace AI and Collection: implementation handoff

## Goal and architecture boundary

Make the existing Collection block usable by Workspace AI through the same
typed command path used by the canvas. Workspace owns turn orchestration,
capability selection, validation, authorization, execution, PostgreSQL
persistence, receipts, revision conflicts and realtime notification. Dify
provides the selected model and conversation/user logging. Do not add a direct
provider call, a second executor, or a Dify Custom Tool that mutates the board.
The model proposes commands; Workspace validates and applies them.

The command contract is the CLI-style interface: stable command names and
JSON arguments that are validated by Workspace. It is not permission for the
model to run arbitrary shell commands or write directly to the database.

## Current Collection UI contract

`app/workspace/collections/model.ts` defines stable IDs for fields, records and
views. A record stores `values` by field ID and may have a `parentId`. Views
share the same records and support Table, Kanban, Calendar, Timeline, Gallery
and hierarchical Mind Map. The UI also supports record/field/view editing,
filters, sorting, CSV/JSON import/export and copying a Table into an
independent Collection.

Collection writes use revisioned Workspace REST saves and PostgreSQL. The
whole-block Yjs path is intentionally disabled for Collection boards because
it can overwrite independent record edits. Preserve this boundary and the
existing same-field conflict behavior when adding AI actions.

## Verified code gap

At Workspace `main` commit `27b6b3b5`:

- `config/workspace-command-registry.json` has 111 commands, but no
  `collection` command or capability category.
- `lib/workspace-command-capabilities.ts` and
  `lib/workspace-agent/capabilitySelection.ts` have no Collection routing.
- `lib/workspace-agent/modelStepContext.ts` summarizes blocks without the
  Collection field/record/view payload, so the model cannot resolve record and
  field IDs or inspect stored values.
- `lib/workspace-agent/actionSchema.ts` has no Collection action schemas or
  validators; table-specific validation expects `block.type === "table"`.
- The current AI executor therefore has no supported Collection CRUD, schema,
  view-configuration or Table-conversion action. UI parity is not AI parity.

The command-engine reference in
`workspace-imagegen-panel/AI-WEB-CHAT-engine-v2` has reusable patterns for a
canonical command registry, filtered capability descriptions, typed action
validation, signed user context, revision-aware shared execution, replay
protection, cancellation, progress and a product-level parity matrix. Its
current registry/parity matrix also has no Collection command; there is no
ready-made Collection implementation to copy. Reuse those patterns, not a
generated Dify workflow or a second executor.

The reference also has `app/api/chat-sessions/**` routes and Dify chat-session
tracking. The current Workspace repo has client code that calls
`/api/chat-sessions`, but no matching route files. During the real Chrome smoke
the request returned HTTP 404. Check whether this is meant to be client-only
history; if persistent Workspace chat history is part of the contract, port the
smallest compatible server path from the reference and verify it without
changing Dify's role as model/log provider.

## Local AI smoke evidence

The local Workspace server used server-only configuration from the reference
worktree. Credential values are intentionally excluded from this document,
the issue, browser code and client bundles. PostgreSQL, MongoDB and the Dify
model-step endpoint were available; the Workspace UI showed `Current AI
source: Dify` and made the model call through the existing runtime.

On the dedicated local test board, Chrome showed the row `AI collection parity
smoke`. The AI changed its Status from `To do` to `Done` using
`update_collection_record`. The Workspace response identified the target
record and reported one updated block. PostgreSQL showed the persisted value
and an advanced board revision. A full browser reload retained `Done` and
rendered the same Collection record. A second AI update was visible in the
Workspace chat transcript and in Chat history; both remained available after
reloading the board. The test board remains in the shared local database as a
reusable fixture.

The local Mongo `ai_usage_events` collection contains successful
`workspace-runtime-model-step` usage events for the authenticated test actor,
including Dify conversation and message IDs, the selected model, and usage
metadata. This confirms local usage-event logging. The Dify Admin UI was not
opened; the event evidence must not be described as an Admin UI inspection.
Workspace receipts and persisted board data remain the authority for whether
an AI-proposed command actually succeeded.

## Implementation and verification status

PR #4 (`feat/collection-ai-commands`) adds 12 typed Collection commands and
the missing authenticated Workspace chat-session routes. Focused CI on
`40fdb75c` passed 6 suites / 41 tests, `tsc --noEmit`, and the production
build. The same six focused test files passed locally. The local Mongo-backed
chat history route was verified through the browser across a full reload.

The parity scripts cannot currently be reported green: three inputs they
reference are absent from baseline `main` as well as this branch:
`docs/dify/workspace-agent-custom-tool.openapi.yaml`,
`workspace-agent-company-all-models-with-evidence.yml`, and
`config/workspace-ai-parity.json`. Do not invent or silently add Dify parity
artifacts to mask this baseline gap.

The real-browser smoke proves one record update and chat-history persistence.
It does not yet prove every Collection command, viewer-role denial, independent
record merge, same-field conflict, retry idempotency, or saved-view/Table
conversion behavior against live PostgreSQL/Mongo/Dify. Use the focused tests
and the acceptance gate below for those contracts before claiming complete
Collection parity.

## Implementation contract

1. Add a `collection` capability and register Collection actions in the
   canonical Workspace command registry. Use exact `blockId`, `recordId`,
   `fieldId` and `viewId`; resolve display names only when unique and otherwise
   ask a clarifying question.
2. Add bounded Collection context to the model step: field schema, selected
   view/configuration, and relevant record IDs/values. Keep large boards
   token-bounded and never send unrelated records when selection/search can
   narrow the request.
3. Add typed validation and server execution for at least read/search, create,
   update and delete record; add/update/remove field; configure view/filter/
   sort; and Table-to-Collection conversion when explicitly requested. Reuse
   the existing action appliers, authorization, `commitBoardContent`,
   optimistic revision and receipt path. Do not mutate browser state directly.
4. Make receipts identify the Collection block and affected stable IDs,
   revision before/after, persisted status and any rejected/partial action.
   Retries must not duplicate records; stale revisions must not overwrite
   concurrent edits. Keep record-level conflict merging and REST-only writes.
5. Keep Dify as model provider and user-log store. Verify that the original
   user request, selected user/conversation, and final result shown in the UI
   are represented correctly in Dify logs; do not treat a successful model
   proposal as a successful Workspace mutation.
6. Extend the command/source parity checks and add unit/integration tests for
   the Collection command contract, permission failures, ambiguous targets,
   idempotency, partial failures and stale revisions. Keep each edited or new
   source file under 300 lines.

## Acceptance gate

Use the shared local Dify/PostgreSQL/MongoDB configuration without committing
or copying credential values. On a dedicated Collection test board, prove in
real Chrome:

- create, read, edit and delete a record through AI; the receipt and revision
  match the intended stable IDs;
- change a field and configure a saved view/filter/sort; convert a Table only
  on explicit request and verify the source Table remains unchanged;
- reload from PostgreSQL and verify the values, active view and rendered
  state; run a second-client edit and prove independent record changes survive;
- same-field conflict, retry/duplicate prevention, read-only user and invalid
  target return truthful errors with no unintended mutation;
- Dify log shows the correct user/request and a final result consistent with
  the persisted receipt; a failed or partial action is not reported as done.

Run the focused Workspace command/Collection tests, registry/source parity,
`pnpm exec tsc --noEmit`, build and browser tests. CLI, unit tests or a Dify
HTTP 200 alone do not close AI acceptance; require AI chat → persisted receipt
→ database reload → correct UI render.

## Issue #5 follow-up (post-merge, 2026-10-13)

PR #4 is on `main` at `574a826`. Chrome/Dify/local DB acceptance
confirmed individual Collection CRUD, stable-ID mutations and persistence.
It did **not** confirm name-only deletion or dependent multi-action requests.

Code-level causes verified on that main:
- Collection mutation schemas require field/view/record stable IDs and do not
  expose named target references. Snapshot target-validation occurs before
  executing the whole proposed batch, so a record referencing a field created
  earlier in that same batch is rejected prematurely.
- The Workspace agent endpoint deliberately rejects batches mixing Collection
  reads with edits. A failed search and a successful delete may therefore
  yield partial status without undoing the already persisted delete receipt.

Issue #5 implementation contract:
- Field/view target aliases `fieldName` / `viewName` and record target alias
  `recordName` resolve only on a unique normalized exact name in the
  currently loaded Collection. Existing stable IDs remain preferred. Record
  names refer to the primary field value. Duplicate names produce concrete
  candidate IDs; missing names produce a targeted error. No fuzzy matching
  or arbitrary first-result target is allowed.
- Collection field names in record `values` are resolved to stable field IDs
  before Workspace validation/execution. Validation for a dependent action
  occurs against state after earlier actions, not solely the initial snapshot.
  A failed edit batch is still atomic: no draft state is committed.
- Mixed read/write proposals run in ordered phases with distinct request IDs,
  revisions and receipts. Earlier committed phases remain committed if later
  phases fail; remaining phases must be identified as not executed.
- Workspace retains command registry, authentication, validation, executor,
  persistence/revisions and receipts. Dify supplies only model proposals and
  conversation/usage logging.

This follow-up's unit tests are not a replacement for real browser acceptance.
Re-test unique-name field/view removal; ambiguous names; field→record→view
creation; delete followed by search failure; reload PostgreSQL persistence,
receipt consistency, actor permissions, Dify logs, retries and concurrent edits.
Do not describe local/Dify/live browser acceptance as passed without running it.

### Issue #5 follow-up: confirmed read results in combined turns

After PR #6 focused CI and Chrome's field→record→view/name-resolution cases
passed, a combined delete+search browser request exposed only the delete
save receipt. The local Dify-history inspection confirmed the model proposed
both delete and search, then search again, and finally no actions. The runtime
previously retained successful `workspaceReadResults` between rounds but
`completedAnswer` on a final empty proposal discarded them. A successful
read also has `persisted:false`, correctly excluding it from mutation
receipts, so the UI had no other visible search result.

The runtime now composes a separate **Workspace-verified read result**
from executor-returned Collection records (bounded samples and stable IDs),
alongside any persisted mutation summary. The SSE answer envelope and
client answer parser preserve that text. Read-only actions remain
non-mutating and are not represented as saved edits; failed reads remain
partial with an unresolved action receipt. Multiple read actions in one
phase use their corresponding indexed result, rather than duplicating the
first/combined result. A repeated identical read is de-duplicated only in
the final display, not skipped in the executor.

The combined Chrome/Dify/Postgres/Mongo scenario is **still unverified after
this change**; run it again and inspect the displayed search result and
read-versus-write receipts before describing end-to-end acceptance as green.

### Issue #5 follow-up: Collection read field labels and stable row IDs

Chrome retest on `c5fdf37` confirmed read results survive the final model
round but showed empty row IDs and empty field keys. The Collection executor
already returns `result.records[].id`, `result.records[].values[fieldId]`,
and `result.fields[] = {id, name, type}` from `summarizeCollection`.
The runtime initially printed the raw ID-keyed JSON; the shared assistant
content sanitizer intentionally strips UUIDs, including IDs embedded as JSON
keys, corrupting that displayed output.

Verified read summaries now map each value's field ID to its **server-provided
field name**, render each record's stable ID separately as `Record ID`, and
include a bounded sample of multiple fields. The runtime passes an allowlist
of record IDs obtained only from confirmed Workspace read responses; the UI
sanitizer preserves only those IDs in the `Record ID:` display context.
All other raw UUID stripping remains unchanged; model text does not authorize
an allowlist in legacy Dify mode. This is display metadata, not new mutation
authority, and is retained in the saved chat message.

Focused tests now exercise the actual `summarizeCollection` payload with
three different fields, stable UUID roundtrip through SSE and the visible
content sanitizer, filtering of other UUIDs, and existing partial-failure
semantics. **The combined browser scenario remains unverified on this latest
commit** until the reviewer re-runs it with local Dify/Postgres/Mongo.
