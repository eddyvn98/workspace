import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { buildTableRenderData } from "@/app/workspace/utils/tableRenderData";
import type { CanvasBlock } from "@/app/workspace/types/block";

export function board(data: Record<string, unknown>): AgentBoardState {
  return {
    title: "t",
    blockOrder: ["tbl"],
    blocks: { tbl: { id: "tbl", type: "table", transform: { computed: null, override: { x: 0, y: 0, w: 300, h: 160, zIndex: 1 } }, data } },
    connectors: {},
  };
}

/** Applies one action, then proves it persisted by round-tripping the state through JSON. */
export function run(state: AgentBoardState, action: Record<string, unknown>) {
  const result = applyAgentAction(state, { target: "tbl", ...action });
  return { result, state: JSON.parse(JSON.stringify(state)) as AgentBoardState };
}

export const tbl = (state: AgentBoardState) => state.blocks.tbl.data as Record<string, any>;
export const render = (state: AgentBoardState) => buildTableRenderData(state.blocks.tbl as unknown as CanvasBlock<"table">);
