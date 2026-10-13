import { addContainerMembers, fitContainerToContents, frameMembers } from "@/app/workspace/utils/frameMembership";
import type { AgentBoardState } from "./operationsCore";
import { param, record, resolveId } from "./operationsCore";
import type { JsonMap } from "./operationsTables";

export function editContainerFrame(state: AgentBoardState, raw: JsonMap): { ids: string[]; reason?: string } | undefined {
  const mode = param(raw, "mode");
  if (mode === undefined || mode === "create") return;
  const frameId = resolveId({ target: param(raw, "frameId") ?? param(raw, "target") }, state);
  const frame = frameId ? state.blocks[frameId] : undefined;
  const members = frameMembers(frame);
  const fail = (reason: string) => ({ ids: [], reason });
  if (!frame || !frameId || !members) return fail("frameId must identify an existing movable container, not a saved camera frame.");
  if (record(frame.style).isLocked) return fail("Unlock the frame position before editing its contents or bounds.");
  if (mode === "fit") {
    const padding = param(raw, "padding");
    if (padding !== undefined && (typeof padding !== "number" || !Number.isFinite(padding) || padding < 0 || padding > 500)) return fail("padding must be a finite number from 0 to 500.");
    const bounds = fitContainerToContents(state.blocks, frameId, padding as number | undefined);
    if (!bounds) return fail("The frame needs existing contents and rotation 0 to fit its bounds.");
    const t = record(frame.transform);
    frame.transform = { ...t, override: { ...record(t.computed), ...record(t.override), ...bounds } };
  } else if (mode === "release") {
    frame.data = { ...record(frame.data), frameBlockIds: [] };
  } else if (mode === "configure") {
    const capture = param(raw, "autoMembership");
    if (typeof capture !== "boolean") return fail("autoMembership must be a boolean.");
    frame.data = { ...record(frame.data), frameAutoMembership: capture };
  } else if (mode === "add" || mode === "remove") {
    const input = param(raw, "blockIds") ?? param(raw, "targets");
    if (!Array.isArray(input) || !input.length) return fail("blockIds or targets must be a non-empty list of existing blocks.");
    const ids = input.map((target) => resolveId({ target }, state));
    if (ids.some((id) => !id)) return fail("Every member must identify an existing block uniquely.");
    const resolved = ids as string[];
    if (resolved.some((id) => record(state.blocks[id].style).isLocked)) return fail("Unlock member positions before changing membership.");
    const next = mode === "add" ? addContainerMembers(state.blocks, frameId, resolved) : members.filter((id) => !resolved.includes(id));
    if (!next) return fail("A frame cannot contain itself or its ancestor.");
    frame.data = { ...record(frame.data), frameBlockIds: next };
  } else return fail("Container mode must be create, fit, add, remove, release or configure.");
  frame.updatedAt = Date.now();
  return { ids: [frameId] };
}
