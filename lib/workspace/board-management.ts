import { prisma } from "@/lib/prisma";
import type { BoardAccessRole, BoardFailure } from "./board-commit-notify";
import { exportBoardContent, importMarkdownIntoBoard } from "./board-export-import";
import { createBoardSlideExport } from "./board-pptx-export";
import { createBoardVersion, listBoardVersions, restoreBoardVersion } from "./version-management";
import { listBoardShares, removeBoardShare, setBoardPublicLink, shareBoardWith } from "./share-management";

export const BOARD_COMMANDS = new Set([
  "list_versions", "create_version", "restore_version", "export_board", "import_markdown",
  "list_shares", "share_board", "remove_share", "set_public_link",
]);

export type BoardCommandOutcome =
  | { ok: true; ids: string[]; changed: boolean; result: Record<string, unknown>; revision?: number }
  | BoardFailure;

type Field = (key: string) => unknown;

/** Runs one board-level command. The board row is re-read so revision checks use fresh state. */
export async function applyBoardCommand(
  boardId: string, email: string, role: BoardAccessRole, type: string, field: Field,
): Promise<BoardCommandOutcome> {
  const board = await prisma.workspaceBoard.findUnique({ where: { id: boardId } });
  if (!board) return { ok: false, status: 404, error: "Not found" };
  const done = (result: Record<string, unknown>, ids: string[] = [], changed = false, revision?: number): BoardCommandOutcome =>
    ({ ok: true, ids, changed, result, revision });

  switch (type) {
    case "list_versions": {
      const versions = await listBoardVersions(boardId);
      return done({ versions }, versions.map((v) => v.id));
    }
    case "create_version": {
      const r = await createBoardVersion(board, email, role, field("label"));
      return r.ok ? done({ snapshot: r.snapshot }, [r.snapshot.id], true) : r;
    }
    case "restore_version": {
      const r = await restoreBoardVersion(board, email, role, {
        snapshotId: field("snapshotId"), baseRevision: field("baseRevision"), confirm: field("confirm"),
      });
      return r.ok ? done({ restored: { snapshotId: r.snapshotId, revision: r.board.revision } }, [r.snapshotId], true, r.board.revision) : r;
    }
    case "export_board": {
      if (field("format") === "pptx" || field("format") === "pdf") {
        const format = field("format") as "pptx" | "pdf";
        const result = await createBoardSlideExport(board, field("blockIds"), format);
        if (!result.ok) return result;
        const query = new URLSearchParams({ format });
        if (Array.isArray(field("blockIds"))) query.set("blockIds", JSON.stringify(field("blockIds")));
        return done({ export: { format, slideCount: result.slideCount, byteLength: result.buffer.length,
          downloadUrl: `/api/workspaces/${encodeURIComponent(boardId)}/export?${query}`,
          layout: format === "pdf" ? "Static rendered slide pages; hidden slides omitted. PDF text is rasterized, not searchable." : "Editable text, tables, charts and uploaded images arranged to fit each page; slide transitions and presenter notes included. Browser element animations are not exported." } });
      }
      const r = exportBoardContent(board, field("format"), field("blockIds"));
      if (!r.ok) return r;
      const query = new URLSearchParams({ format: r.export.format });
      if (Array.isArray(field("blockIds"))) query.set("blockIds", JSON.stringify(field("blockIds")));
      return done({ export: { ...r.export, downloadUrl: `/api/workspaces/${encodeURIComponent(boardId)}/export?${query}` } });
    }
    case "import_markdown": {
      const r = await importMarkdownIntoBoard(board, email, role, { markdown: field("markdown"), baseRevision: field("baseRevision") });
      return r.ok ? done({ created: r.ids }, r.ids, true, r.board.revision) : r;
    }
    case "list_shares": {
      const r = await listBoardShares(boardId, role);
      return r.ok ? done({ shares: r.shares }, r.shares.map((s) => s.email)) : r;
    }
    case "share_board": {
      const r = await shareBoardWith(board, email, role, { email: field("email"), role: field("role"), confirm: field("confirm") });
      return r.ok ? done({ share: r.share }, [r.share.email], r.changed) : r;
    }
    case "remove_share": {
      const r = await removeBoardShare(boardId, role, { email: field("email"), confirm: field("confirm") });
      return r.ok ? done({ removed: r.email }, [r.email], true) : r;
    }
    case "set_public_link": {
      const r = await setBoardPublicLink(board, role, { enabled: field("enabled"), expiration: field("expiration"), confirm: field("confirm") });
      return r.ok ? done({ publicLink: r.publicLink }, [], true) : r;
    }
    default:
      return { ok: false, status: 400, error: `Unknown board command ${type}` };
  }
}
