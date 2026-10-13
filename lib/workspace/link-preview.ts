/**
 * lib/workspace/link-preview.ts
 *
 * Server-side Open Graph metadata fetch for a `link` block's preview image
 * (see .claude/specs/active/workspace-resource-roadmap.md's Checkpoint 14).
 * Same idea as Slack/Discord/iMessage link unfurling: read the `og:image`/
 * `og:title` meta tags a page already publishes for this exact purpose,
 * rather than rendering the page ourselves (no headless-browser screenshot
 * service — that was explicitly ruled out as disproportionate for what this
 * needs).
 *
 * This is a server making an outbound request to a user-supplied URL — the
 * SSRF surface the architecture plan flags. Mitigations here: resolve the
 * hostname and reject private/loopback/link-local/metadata addresses before
 * connecting; re-validate on every redirect hop (redirects are followed
 * manually, not automatically) instead of only the original URL; hard
 * timeout; capped response size; only the `<head>` is parsed (regex, not a
 * full DOM), so nothing here need be tolerant of malicious/huge HTML bodies.
 * Residual risk this does NOT close: a DNS answer could change between the
 * lookup here and the actual TCP connect (classic rebinding) — acceptable
 * for now because the only thing that reaches the caller is a title string
 * and an image URL, never the fetched bytes themselves.
 */

import { promises as dns } from "dns";
import { isIP } from "net";

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 300_000; // only need <head>; real pages' <head> is tiny next to this
const MAX_REDIRECTS = 3;

export interface LinkPreview {
  title?: string;
  imageUrl?: string;
  description?: string;
}

function isDisallowedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true; // loopback
    if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true; // link-local / unique-local
    if (lower.startsWith("::ffff:")) return isDisallowedIp(lower.slice(7)); // IPv4-mapped
    return false;
  }
  return true; // not a valid IP at all — refuse rather than guess
}

async function assertHostIsPublic(hostname: string): Promise<void> {
  if (hostname.toLowerCase() === "localhost") throw new Error("blocked host");
  const literalVersion = isIP(hostname);
  if (literalVersion) {
    if (isDisallowedIp(hostname)) throw new Error("blocked host");
    return;
  }
  const records = await dns.lookup(hostname, { all: true });
  if (records.length === 0 || records.some((r) => isDisallowedIp(r.address))) {
    throw new Error("blocked host");
  }
}

function resolveMaybeRelative(base: string, maybeRelative: string): string | undefined {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return undefined;
  }
}

function extractMeta(head: string, ...names: string[]): string | undefined {
  for (const name of names) {
    const match = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`,
      "i",
    ).exec(head) ?? new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`,
      "i",
    ).exec(head);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

async function fetchOnce(url: string): Promise<{ status: number; location?: string; head: string }> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("unsupported protocol");
  await assertHostIsPublic(parsed.hostname);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WorkspaceLinkPreview/1.0)" },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      // Same reason as the non-redirect path's reader.cancel() below — an
      // unconsumed response body can hold its underlying socket open until
      // GC, and this path never reads it at all otherwise.
      await res.body?.cancel().catch(() => {});
      return { status: res.status, location: location ?? undefined, head: "" };
    }

    const reader = res.body?.getReader();
    let received = "";
    let bytes = 0;
    if (reader) {
      const decoder = new TextDecoder();
      while (bytes < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        received += decoder.decode(value, { stream: true });
        if (/<\/head>/i.test(received)) break;
      }
      await reader.cancel().catch(() => {});
    }
    return { status: res.status, head: received };
  } finally {
    clearTimeout(timer);
  }
}

/** Returns null on any failure (unreachable, blocked host, no OG tags,
 *  timeout) — a missing preview is not an error to the caller, just an
 *  ordinary link card with no image. */
export async function fetchLinkPreview(inputUrl: string): Promise<LinkPreview | null> {
  let current = inputUrl;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const { status, location, head } = await fetchOnce(current);
      if (status >= 300 && status < 400 && location) {
        current = resolveMaybeRelative(current, location) ?? current;
        continue;
      }
      if (status < 200 || status >= 300) return null;

      const title = extractMeta(head, "og:title", "twitter:title") ?? extractMeta(head, "title");
      const rawImage = extractMeta(head, "og:image", "og:image:url", "twitter:image");
      const description = extractMeta(head, "og:description", "description");
      const imageUrl = rawImage ? resolveMaybeRelative(current, rawImage) : undefined;

      if (!title && !imageUrl && !description) return null;
      return { title, imageUrl, description };
    }
    return null;
  } catch {
    return null;
  }
}
