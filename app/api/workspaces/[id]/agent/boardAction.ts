import { NextResponse } from "next/server";
import { applyBoardCommand, BOARD_COMMANDS } from "@/lib/workspace/board-management";
import type { JsonMap } from "./routeHelpers";

/** Handles versions, export/import and share commands outside the normal edit path. Returns null when the batch has none. */
export async function handleBoardActions(
  board: { id: string; title: string; blocks: unknown; revision: number },
  email: string,
  actions: JsonMap[],
  role: "OWNER" | "EDITOR" | "VIEWER",
): Promise<NextResponse | null> {
  const commands = actions.filter((item) => BOARD_COMMANDS.has(String(item.type)));
  if (commands.length === 0) return null;
  if (commands.length !== actions.length) {
    return NextResponse.json({
      error: "Version, export, import and share commands must not be mixed with board edits",
      reason: "mixed_batch",
      revision: board.revision,
    }, { status: 400 });
  }
  const applied: Array<{ type: string; ids: string[]; changed: boolean }> = [];
  const result: Record<string, unknown> = {};
  let revision = board.revision;
  for (const action of commands) {
    const params = action.params && typeof action.params === "object" ? action.params as JsonMap : {};
    const outcome = await applyBoardCommand(board.id, email, role, String(action.type), (key) => action[key] ?? params[key]);
    if (!outcome.ok) {
      return NextResponse.json({
        error: outcome.error,
        reason: outcome.reason ?? "board_command_rejected",
        revision: outcome.revision ?? revision,
        actions: applied,
      }, { status: outcome.status });
    }
    if (outcome.revision !== undefined) revision = outcome.revision;
    Object.assign(result, outcome.result);
    applied.push({ type: String(action.type), ids: outcome.ids, changed: outcome.changed });
  }
  return NextResponse.json({ success: true, ok: true, action: "batch", actions: applied, result, revision });
}
