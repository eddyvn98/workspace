# Collection scheduled automation runner

This adds **server-side, once-per-local-day field update rules**, not a client-side timer.
Rules are configured in Collection → Settings → Daily scheduled rules.
They use the same Collection record IDs, audit history, board CAS revision and
checkpoint path as ordinary edits. Rules are disabled when created.

## Setup

1. Generate a random secret with **at least 32 characters**, and set the
   same \`WORKSPACE_AUTOMATION_CRON_SECRET\` environment variable on the
   Next.js server and on the machine that invokes the scheduled job.
   Keep it outside Git and never send it to the browser.
2. On the scheduler machine also set
   \`WORKSPACE_AUTOMATION_URL=https://your-workspace-host\`.
3. Configure Windows Task Scheduler, cron or an external scheduler to run
   \`node scripts/collection-schedule-cron.mjs\` every 10–15 minutes, using
   the working directory of this repository and a service account. The
   scheduler must keep the two environment variables available to the process.
4. Configure and explicitly enable a rule in the Collection settings.

No Prisma schema migration is needed: the bounded rules and their
\`lastRunDay\` markers live in the same persisted Collection board JSON.

## API contract

The job script pages through the secured endpoint:

\`POST /api/internal/workspace/collection-schedules\`

Header: \`Authorization: Bearer <WORKSPACE_AUTOMATION_CRON_SECRET>\`

JSON body:

\`\`\`json
{ "cursor": "", "limit": 30 }
\`\`\`

JSON response includes \`nextCursor\`, \`boardsUpdated\`, \`conflicted\`,
\`rulesExecuted\`, and \`recordsChanged\`. Continue while \`nextCursor\`
is not null. The route is Node.js only and rejects all requests when the
secret is missing or shorter than 32 bytes/characters.

## Semantics and important limits

- Daily rules use their configured IANA timezone and local hour/minute.
  At the first tick *at or after* the chosen time, a rule updates fields in
  matching records (or all records if no match field is selected).
- Each rule records the successful local date with the **same board
  revision compare-and-swap commit** as its changes. Concurrent ticks cannot
  both apply the same revision. Conflicts are counted and can be retried by
  the next tick; no blind last-write-wins overwrite is permitted.
- A missed day is not backfilled. At the first tick tomorrow only
  tomorrow's scheduled occurrence runs. If a cron job is never configured,
  rules will never execute despite being enabled in the UI.
- These rules **do not** deliver Telegram/email, webhooks, arbitrary scripts,
  or untrusted URLs. They are intentionally restricted to supported writable
  Collection fields. External effects require a distinct durable outbox,
  permission model, rate limits and delivery receipts.
- The runner pages through boards rather than fetching all of them at once.
  The invocation has to keep paging for all boards; the included Node script
  does so with an explicit finite traversal cap.
- This is not record-level realtime CRDT collaboration. Open clients still
  use revision/CAS saving and show the existing "newer board" notice.

**Release status:** code authored without executing tests/build/Playwright,
per owner preference. Configure the scheduler only after code verification
and production readiness checks.
