/**
 * lib/workspace/public-link.ts
 *
 * Expiration presets, parser, and token minting helpers for anonymous
 * public share links on WorkspaceBoard models.
 */

export const PUBLIC_LINK_EXPIRATION_OPTIONS = [
  { value: "1h", label: "1 hour", hours: 1 },
  { value: "1d", label: "1 day", hours: 24 },
  { value: "7d", label: "7 days", hours: 24 * 7 },
  { value: "30d", label: "30 days", hours: 24 * 30 },
  { value: "never", label: "Never", hours: null },
  { value: "custom", label: "Custom", hours: null },
] as const;

export type PublicLinkExpiration =
  | (typeof PUBLIC_LINK_EXPIRATION_OPTIONS)[number]["value"]
  | string;

export function parsePublicLinkExpiration(value: unknown): PublicLinkExpiration | null {
  if (typeof value !== "string") return null;
  if (PUBLIC_LINK_EXPIRATION_OPTIONS.some((option) => option.value === value)) {
    return value as PublicLinkExpiration;
  }
  if (!isNaN(Date.parse(value))) {
    return value;
  }
  return null;
}

export function publicLinkExpiresAt(
  expiration: PublicLinkExpiration,
  now = new Date()
): Date | null {
  const option = PUBLIC_LINK_EXPIRATION_OPTIONS.find((item) => item.value === expiration);
  if (option) {
    if (option.hours === null) return null;
    return new Date(now.getTime() + option.hours * 60 * 60 * 1000);
  }
  const date = new Date(expiration);
  return isNaN(date.getTime()) ? null : date;
}

export function mintPublicShareToken(): string {
  return crypto.randomUUID();
}
