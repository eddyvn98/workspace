/**
 * Origins approved for live iframe embedding in a `link` block (P3A —
 * see .claude/specs/active/workspace-resource-architecture-plan.md's
 * "Embed/SDK (approved iframe)" phase). Before this list existed,
 * LinkBlock.tsx embedded ANY url the user typed, unrestricted and with
 * `allow-same-origin` set alongside `allow-scripts` — effectively no
 * containment for arbitrary third-party sites. A link to a site NOT on
 * this list still renders as a normal link card (favicon/title/open-in-
 * new-tab); it just never gets a live iframe.
 *
 * MVP is a fixed hardcoded list, not a per-workspace admin setting — add
 * an entry here when a new provider is needed.
 */
const ALLOWED_EMBED_HOSTNAMES = [
  "youtube.com",
  "youtube-nocookie.com",
  "vimeo.com",
  "player.vimeo.com",
  "docs.google.com",
  "figma.com",
  "codesandbox.io",
  "codepen.io",
  "loom.com",
  "open.spotify.com",
  "miro.com",
];

function isSubdomainOf(hostname: string, allowed: string): boolean {
  return hostname === allowed || hostname.endsWith(`.${allowed}`);
}

/** https-only: an embedded http page would also mix insecure content into the board. */
export function isEmbedAllowed(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const hostname = parsed.hostname.toLowerCase();
  return ALLOWED_EMBED_HOSTNAMES.some((allowed) => isSubdomainOf(hostname, allowed));
}
