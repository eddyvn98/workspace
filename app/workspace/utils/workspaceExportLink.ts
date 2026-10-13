/** Accept only authenticated exports from this board, with a valid explicit selection when required. */
export function workspaceExportLink(content: string, boardId: string, format: string, requireSelection: boolean): string | null {
  const origin = typeof window === "undefined" ? "https://workspace.invalid" : window.location.origin;
  for (const match of content.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
    try {
      const url = new URL(match[1], origin);
      if (url.origin !== origin || url.pathname !== `/api/workspaces/${encodeURIComponent(boardId)}/export` || url.searchParams.get("format") !== format) continue;
      if ([...url.searchParams.keys()].some((key) => !["format", "blockIds"].includes(key))) continue;
      const raw = url.searchParams.get("blockIds");
      if (requireSelection && !raw) continue;
      if (raw) {
        const ids = JSON.parse(raw);
        if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some((id) => typeof id !== "string" || !id)) continue;
      }
      return `${url.pathname}${url.search}`;
    } catch { /* Ignore untrusted or malformed links. */ }
  }
  return null;
}
