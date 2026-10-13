import type { WorkspaceBoardSnapshot, WorkspaceJson } from "./contracts";

function record(value: unknown): WorkspaceJson {
  return value && typeof value === "object" && !Array.isArray(value) ? value as WorkspaceJson : {};
}

function namedBlock(snapshot: WorkspaceBoardSnapshot, reference: unknown): string | undefined {
  if (typeof reference !== "string" || !reference.trim()) return undefined;
  const blocks = record(snapshot.blocks);
  const direct = record(blocks[reference]);
  const match = Object.keys(direct).length
    ? direct
    : Object.values(blocks).map(record).find((block) => {
        const data = record(block.data);
        return [block.id, block.title, block.label, data.title, data.label, data.markdown]
          .some((value) => typeof value === "string" && value.trim() === reference.trim());
      });
  if (!match) return undefined;
  const data = record(match.data);
  const label = [match.title, match.label, data.title, data.label, data.markdown]
    .find((value) => typeof value === "string" && value.trim());
  return typeof label === "string" ? label.trim().replace(/\s+/g, " ").slice(0, 120) : undefined;
}

function quoted(value: string | undefined): string {
  return value ? JSON.stringify(value) : "the selected block";
}

function changedBlockSummaries(body: WorkspaceJson): Map<string, string> {
  const values = Array.isArray(record(body.result).changedBlocks) ? record(body.result).changedBlocks as unknown[] : [];
  return new Map(values.map((value) => {
    const block = record(value);
    return [String(block.id ?? ""), String(block.summary ?? "").slice(0, 240)];
  }));
}

function deletedBlockSummary(snapshot: WorkspaceBoardSnapshot, action: WorkspaceJson, count: number): string {
  const block = record(record(snapshot.blocks)[String(action.blockId)]);
  const data = record(block.data);
  const title = [block.title, block.label, data.markdown, data.title, data.label]
    .find((value) => typeof value === "string" && value.trim());
  const label = typeof title === "string" ? ` ${title.trim().slice(0, 160)}` : ` ${count} block(s)`;
  return `deleted${label}${count > 1 ? ` and ${count - 1} descendant(s)` : ""}`;
}

function connectorSummary(actionType: string, action: WorkspaceJson, snapshot: WorkspaceBoardSnapshot, language: "English" | "Vietnamese"): string | undefined {
  if (!["connect_nodes", "disconnect_nodes", "update_relationship", "repair_connector"].includes(actionType)) return undefined;
  const connectors = record(snapshot.connectors);
  const connectorId = String(action.connectorId ?? "");
  const connector = record(connectors[connectorId]);
  const from = namedBlock(snapshot, connector.fromBlockId ?? action.from ?? action.fromBlockId);
  const to = namedBlock(snapshot, connector.toBlockId ?? action.to ?? action.toBlockId);
  const connectedEndpoints = from && to ? `${quoted(from)} to ${quoted(to)}` : "blocks";
  const disconnectedEndpoints = from && to ? `${quoted(from)} from ${quoted(to)}` : "connector";
  if (actionType === "repair_connector") {
    const strategy = String(action.strategy ?? "reroute_only").replace(/[_-]+/g, " ");
    return language === "Vietnamese" ? `Đã sửa đường nối giữa ${quoted(from)} và ${quoted(to)} (${strategy}).` : `Repaired connector between ${quoted(from)} and ${quoted(to)} (${strategy}).`; // vi-allow: localized receipt
  }
  const patch = record(action.relationshipPatch);
  const label = action.label ?? action.lineLabel ?? patch.lineLabel ?? patch.label ?? connector.label;
  const labelText = typeof label === "string" && label.trim() ? ` (${quoted(label.trim().slice(0, 120))})` : "";
  if (actionType === "connect_nodes") return `connected ${connectedEndpoints}${labelText}`;
  if (actionType === "disconnect_nodes") return `disconnected ${disconnectedEndpoints}${labelText}`;
  return `updated relationship between ${quoted(from)} and ${quoted(to)}${labelText}`;
}

function slideSummary(actionType: string, action: WorkspaceJson, snapshot: WorkspaceBoardSnapshot): string | undefined {
  if (actionType !== "update_slide") return undefined;
  const blocks = record(snapshot.blocks);
  const deck = record(blocks[String(action.blockId ?? "")]);
  const data = record(deck.data);
  const slides = record(data.slides);
  const reference = String(action.slideId ?? action.id ?? action.target ?? "");
  const direct = record(slides[reference]);
  const matched = Object.keys(direct).length
    ? direct
    : Object.values(slides).map(record).find((slide) =>
        [slide.id, slide.name, slide.title].some((value) => typeof value === "string" && value.trim() === reference.trim()),
      );
  const slideName = String(matched?.name ?? matched?.title ?? reference).trim();
  const deckName = String(deck.title ?? data.title ?? "slide deck").trim();
  if (!slideName || !reference) return undefined;
  return `updated slide ${quoted(slideName.slice(0, 120))} in deck ${quoted(deckName.slice(0, 120))}`;
}

export function workspaceActionReceiptSummary(input: {
  actionType: string;
  action: WorkspaceJson;
  actionResult: WorkspaceJson;
  language?: "English" | "Vietnamese";
  targetIds: string[];
  snapshot: WorkspaceBoardSnapshot;
  body: WorkspaceJson;
  changed: boolean;
}): string | undefined {
  const { actionType, action, actionResult, language = "English", targetIds, snapshot, body, changed } = input;
  const summaries = changedBlockSummaries(body);
  const snapshotLabel = record(record(body.result).snapshot).label;
  const versionLabel = actionType === "create_version" && changed && typeof snapshotLabel === "string"
    ? snapshotLabel.trim().replace(/[\r\n\u0000-\u001f]/g, " ").slice(0, 120)
    : "";
  const versionSummary = versionLabel
    ? language === "Vietnamese" ? `Đã lưu phiên bản “${versionLabel}”.` : `Saved a new version “${versionLabel}”.` // vi-allow: localized receipt
    : undefined;
  return (changed ? slideSummary(actionType, action, snapshot) : undefined)
    ?? versionSummary
    ?? targetIds.map((id) => summaries.get(id)).find((value): value is string => Boolean(value))
    ?? (changed && typeof actionResult.summary === "string" ? actionResult.summary.trim().slice(0, 240) : undefined)
    ?? (changed ? connectorSummary(actionType, action, snapshot, language) : undefined)
    ?? (changed && actionType === "delete_node" ? deletedBlockSummary(snapshot, action, targetIds.length) : undefined)
    ?? (changed && actionType === "rename_board" ? "board title updated" : undefined);
}
