# Collection scheduler — Windows Task Scheduler deployment

This runbook activates the **existing** server-side Collection scheduler. It does not send email, Telegram or external webhooks.

## Prerequisites

- Windows machine with Node.js >=20 and the Workspace repository already checked out
- Reachable HTTPS Workspace endpoint
- The **same** random `WORKSPACE_AUTOMATION_CRON_SECRET` (at least 32 characters) configured on Workspace backend
- A dedicated Windows service identity allowed to read this checkout; its environment must not expose the secret to other users

## Installation (PowerShell run as the dedicated service identity)

1. Check out the verified commit and install dependencies using `pnpm install --frozen-lockfile`.
2. Put `WORKSPACE_AUTOMATION_URL` and `WORKSPACE_AUTOMATION_CRON_SECRET` in a protected process environment/credential store. **Do not check secrets into source control or command-line arguments in a Task Scheduler action.**
3. Create a short local wrapper, outside the repo and access-controlled, that loads your secret environment and calls `node scripts/collection-schedule-cron.mjs` from the repository folder.
4. Create the task to run every 15 minutes, starting only when the target network is available; disable parallel instances ("Do not start a new instance"). Use Windows Task Scheduler UI: *Create Task → Triggers → Daily → Repeat task every 15 minutes indefinitely → Settings → If task is already running: Do not start a new instance*.
5. Configure automatic retry on task failure, task execution timeout (longer than a full batch traversal), and event logging. Do not configure retry storms.
6. Run the job once manually against **staging** and verify `scanned`, `boardsUpdated`, `rulesExecuted`, `conflicted`, `recordsChanged`, and `durationMs` in its summary. Confirm that an enabled rule changes exactly the expected record.
7. Tick again on the same local calendar day and verify no double apply. Test disabled rule, skipped calendar day, two concurrent ticks, 409 conflict and revoked cron secret.

## Monitoring and shutdown

- Watch the Windows Task Scheduler history and central logs. A successful task process exit does **not** establish that any configured rule existed.
- Alert for missing successful scheduled invocation for >30 minutes, nonzero exit, repeated CAS conflicts, or continuously zero scanned boards when there should be data.
- To stop: disable the scheduled task. To revoke access: rotate or unset the backend cron secret and update the service identity.
- No schema migration is needed. Data writes follow board CAS and audit history. Before rollback, record the board revision and back up the database.

## Local agent proof

Attach masked task history, one JSON/log summary, board revisions before/after, same-day duplicate tick evidence, access denial evidence and a restore smoke-test. Keep secret values, signed user tokens and personal board content out of public logs.

**Status:** Deployment instructions only; the task is **not** installed on the user's Windows machine from this PR.