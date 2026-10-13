import { fitTableContent } from "@/app/workspace/utils/tableAutoFit";
import type { JsonMap } from "./operationsTables";

const record = (value: unknown): JsonMap => value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};

export function applyTableAutoFit(block: JsonMap, data: JsonMap): JsonMap {
  if (data.autoFitContent === false || (Array.isArray(data.merges) && data.merges.length > 0)) return data;
  const fit = fitTableContent(data.cells);
  const transform = record(block.transform);
  const current = { ...record(transform.computed), ...record(transform.override) };
  block.transform = { ...transform, override: { ...current, w: fit.width, h: fit.height } };
  return { ...data, autoFitContent: true, rowWeights: fit.rowWeights, colWeights: fit.colWeights };
}
