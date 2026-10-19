import { boardMetadata } from "./boardMetadata";
import { diffRecordMap, type WorkspaceAgentPatch } from "./ws-repository-notify";

type Snapshot = { blocks: unknown; connectors: unknown; blockOrder: unknown } & Record<string, unknown>;
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Used by REST saves as well as AI writes; live rooms must observe offline checkpoints. */
export function repositoryBoardPatch(previous: Snapshot | null, next: Snapshot): WorkspaceAgentPatch {
  const blocks = diffRecordMap(record(previous?.blocks), record(next.blocks));
  const connectors = diffRecordMap(record(previous?.connectors), record(next.connectors));
  return {
    upsertBlocks: blocks.upsert, removeBlockIds: blocks.removeIds,
    upsertConnectors: connectors.upsert, removeConnectorIds: connectors.removeIds,
    blockOrder: Array.isArray(next.blockOrder) ? next.blockOrder.map(String) : [],
    previousBlockOrder: Array.isArray(previous?.blockOrder) ? previous.blockOrder.map(String) : [],
    metadata: boardMetadata(next), previousMetadata: boardMetadata(previous ?? {}),
  };
}
