/**
 * Normalizes and validates a URL string for node link affordances.
 * Rejects non-http/https protocols (e.g. javascript:), and prepends https:// if protocol is omitted.
 */
export function normalizeBlockLink(value?: string): string | undefined {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return undefined;

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
