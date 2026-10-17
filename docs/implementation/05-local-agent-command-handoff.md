# Local agent verification handoff (WS-201)

## Generate full command inventory
```bash
node scripts/workspace-command-audit.mjs > workspace-command-audit.md
node scripts/workspace-command-audit.mjs --json > workspace-command-audit.json
```

The generated inventory is **not** a passing test report: every validation column is intentionally UNVERIFIED. The registry currently has 123 entries (version 9). Some registry `mutation` flags are historical hints rather than confirmed semantics.

## Local agent steps
1. Check out the exact merged SHA and record its GitHub Actions URL.
2. With staged Postgres/Mongo/Dify and owner/editor/viewer identities, run `pnpm install --frozen-lockfile`, `pnpm prisma:generate`, `pnpm exec tsc --noEmit`, `pnpm test:workspace`, `pnpm build`.
3. For each command in the generated JSON file, locate its strict schema, server executor, ACL, revision precondition and persisted receipt. Mark evidence with file:line and actual test ID, not guesswork.
4. Exercise read-only operations with VIEWER; mutating operations with EDITOR and deny as VIEWER. Confirm server data before/after, not just response text.
5. Simulate duplicate turn/retry, cancellation, stale revision, Dify 5xx, partial failure and tool injection (unsupported command).
6. For Collection, test 2 active browser clients: distinct-field merge, same-field conflict, delete-vs-edit, network loss and restore, and revision notice.
7. Attach sanitized traces, test logs and database row/revision proofs. Never place app secrets in test evidence.
8. Mark only measured command cases VERIFIED; leave unavailable providers or fixtures BLOCKED with a precise reason.

**Release rule:** registry count is not coverage. Mark a capability supported in production only after persisted backend tests and explicit permission checks pass.