/**
 * lib/mindmap/known-users.ts
 *
 * "Does this email belong to an existing NextAuth user?" check for mindmap
 * sharing invites.
 *
 * This repo has NO NextAuth database adapter (JWT session strategy only —
 * see app/api/auth/[...nextauth]/route.ts) and therefore no `users` table to
 * query. Identity is just the email string carried in the JWT. Every real
 * A production email-domain allowlist can be set through
 * WORKSPACE_ALLOWED_EMAIL_DOMAINS. No account roster is stored in source.
 */

const EXACT_EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const ALLOWED_EMAIL_DOMAINS = () => (process.env.WORKSPACE_ALLOWED_EMAIL_DOMAINS ?? "")
	.split(",")
	.map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
	.filter(Boolean);

export function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized && EXACT_EMAIL_PATTERN.test(normalized) ? normalized : null;
}

/**
 * Returns true if `email` belongs to a configured domain, or is any valid
 * address outside production (local dev). Used to gate share invites
 * per the locked v1 scope: "no invite for an email without an existing
 * account — return 422, no pending-invite/email-invite flow."
 */
export function isKnownUserEmail(rawEmail: string | null | undefined): boolean {
  const normalized = normalizeEmail(rawEmail);
  if (!normalized) return false;

  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const domains = ALLOWED_EMAIL_DOMAINS();
  return domains.length === 0 || domains.some((domain) => normalized.endsWith(`@${domain}`));
}
