/**
 * lib/workspace/identity.ts
 *
 * Email-as-identity rules for the workspace API.
 *
 * There is no users table in this repo (NextAuth runs a JWT session strategy
 * with no database adapter), so the email string IS the identity. That makes
 * normalization a correctness requirement, not a nicety: Postgres compares
 * strings byte-for-byte, so a share stored as `Bob@x.com` is a different
 * identity from `bob@x.com` to every `where` clause in this API family. Left
 * unnormalized, a revoke silently matches nothing while the collaborator
 * keeps their access.
 *
 * Deliberately a workspace-owned module rather than an import of
 * lib/mindmap/known-users.ts: app/workspace/** and its API stay independent
 * of the mindmap feature (app/workspace/CONTRACTS.md), the same reason
 * app/api/workspaces/_auth.ts duplicates the mindmap auth resolver. The rules
 * below are the legacy ones — see __tests__/workspace/parity-b5-identity.test.ts,
 * which pins both against each other.
 */

const EXACT_EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

/** Optional production allowlist, configured as comma-separated domains. */
function allowedEmailDomains(): string[] {
  return (process.env.WORKSPACE_ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

/**
 * Trims, lower-cases, and validates. Returns null for anything that is not a
 * well-formed address, so a caller can answer 400 rather than storing junk.
 */
export function normalizeWorkspaceEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized && EXACT_EMAIL_PATTERN.test(normalized) ? normalized : null;
}

/**
 * True when `email` could belong to an account that can actually sign in.
 * Outside production any address passes, so local dev can invite freely; in
 * production only configured domains do. An empty allowlist accepts any
 * well-formed email; deployments can restrict invitations through env.
 */
export function isKnownWorkspaceUserEmail(email: string | null | undefined): boolean {
  const normalized = normalizeWorkspaceEmail(email);
  if (!normalized) return false;
  if (process.env.NODE_ENV !== "production") return true;
  const domains = allowedEmailDomains();
  return domains.length === 0 || domains.some((domain) => normalized.endsWith(`@${domain}`));
}

/** True when two stored identities denote the same person. */
export function sameWorkspaceIdentity(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
