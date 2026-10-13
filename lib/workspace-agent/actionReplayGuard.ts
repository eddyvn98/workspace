import type { WorkspaceJson } from "./contracts";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";
}

function targetId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function targets(action: WorkspaceJson): string[] {
  for (const key of ["targets", "targetIds", "blockIds", "ids"]) {
    const value = action[key];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").map(targetId).sort();
  }
  const target = action.target ?? action.blockId;
  return typeof target === "string" ? [targetId(target)] : [];
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  }
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : value;
}

/** Stable intent key for frame creation, whose executor creates random block IDs. */
export function workspaceActionReplayKey(action: WorkspaceJson): string | null {
  if (action.type === "create_image_flow") {
    const settings = action.settings && typeof action.settings === "object" ? action.settings as WorkspaceJson : {};
    const options = action.options && typeof action.options === "object" ? action.options : {};
    const mode = action.mainMode ?? action.mode;
    if (typeof action.prompt !== "string" || !action.prompt.trim()) return null;
    return JSON.stringify(canonical({
      type: action.type,
      prompt: action.prompt,
      mainMode: mode,
      subMode: action.subMode,
      options,
      settings: {
        ...settings,
        ...(settings.model === undefined && action.model !== undefined ? { model: action.model } : {}),
        ...(settings.aspect_ratio === undefined && action.aspectRatio !== undefined ? { aspect_ratio: action.aspectRatio } : {}),
        ...(settings.resolution === undefined && action.resolution !== undefined ? { resolution: action.resolution } : {}),
        ...(settings.image_count === undefined && action.imageCount !== undefined ? { image_count: action.imageCount } : {}),
      },
      mainImageBlockIds: action.mainImageBlockIds,
      referenceImageBlockIds: action.referenceImageBlockIds,
    }));
  }
  if (action.type === "add_comment") {
    const body = action.body ?? action.text ?? action.comment;
    const blockId = action.blockId ?? action.target;
    if (typeof body !== "string" || !body.trim() || typeof blockId !== "string" || !blockId.trim()) return null;
    return JSON.stringify({
      type: action.type,
      blockId: targetId(blockId),
      parentId: targetId(action.parentId ?? action.replyTo),
      body: body.trim().replace(/\s+/g, " "),
    });
  }
  if (action.type !== "wrap_blocks_in_frame" || action.frameId || action.mode) return null;
  const actionTargets = targets(action);
  if (!actionTargets.length && !["all", "board"].includes(String(action.scope ?? ""))) return null;
  return JSON.stringify({
    type: action.type,
    scope: String(action.scope ?? "selection"),
    targets: actionTargets,
    title: text(action.title ?? action.text ?? action.label),
  });
}

/** Suppress persisted replays and duplicate frame creations within one proposal. */
export function suppressWorkspaceActionReplays(
  actions: WorkspaceJson[],
  confirmedKeys: Set<string>,
): { actions: WorkspaceJson[]; suppressed: number } {
  const seen = new Set<string>();
  let suppressed = 0;
  const filtered = actions.filter((action) => {
    const key = workspaceActionReplayKey(action);
    if (!key) return true;
    if (confirmedKeys.has(key) || seen.has(key)) {
      suppressed += 1;
      return false;
    }
    seen.add(key);
    return true;
  });
  return { actions: filtered, suppressed };
}
