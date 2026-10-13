/**
 * Dify offloads a long answer to a cloud-hosted .md/.txt file and returns a
 * "Cloud Link" pointer instead of the content. Anything that parses an answer
 * has to resolve that first, or it parses the pointer text as if it were the
 * answer — a bullet list arrives as one branch reading
 * "Cloud Link (7 Day Validity): https://…".
 *
 * Fetched through /api/proxy/file to keep the request same-origin.
 *
 * Engine-owned copy of the same contract as
 * components/features/chat/mindmap/mindmap-cloud.ts: the workspace engine must
 * not import from the mindmap app (app/workspace/CONTRACTS.md header). The
 * function is pure string -> string, so the duplication is the whole coupling.
 */


const TEXT_FILE_RE = /(?:\[([^\]]+\.(?:docx?|pdf|pptx?|xlsx?|md|txt))\]\([^)\n]*\)|([^\n\r]+\.(?:docx?|pdf|pptx?|xlsx?|md|txt)))\s*[\n\r]+Cloud Link[^\n\r]*:[\s\S]*?(https?:\/\/[^\s\n\r]+)/gi;

const BARE_TEXT_URL_RE = /https?:\/\/[^\s\n\r"']+\.(?:md|txt)(?:\?[^\s\n\r"']*)?/i;

async function fetchThroughProxy(fileUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/proxy/file/?url=${encodeURIComponent(fileUrl)}`);
    if (!res.ok) return null;
    const content = await res.text();
    return content.trim() ? content.trim() : null;
  } catch {
    return null;
  }
}

/** Returns the linked file's content when `text` is a cloud-link pointer to a
 *  .md/.txt file, otherwise `text` unchanged. Never throws. */
export async function resolveWorkspaceCloudLink(text: string): Promise<string> {
  TEXT_FILE_RE.lastIndex = 0;
  const match = TEXT_FILE_RE.exec(text);

  if (match) {
    const fileName = (match[1] ?? match[2] ?? "").trim().toLowerCase();
    const fileUrl = (match[3] ?? "").trim();
    // Only text formats are inlineable; a .pdf/.docx pointer stays a pointer.
    if (fileUrl && (fileName.endsWith(".md") || fileName.endsWith(".txt"))) {
      return (await fetchThroughProxy(fileUrl)) ?? text;
    }
    return text;
  }

  const bare = text.match(BARE_TEXT_URL_RE);
  if (bare) return (await fetchThroughProxy(bare[0])) ?? text;
  return text;
}
