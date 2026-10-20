/** Traversal context is per import path. Reusing a diagram on another slide is not a cycle. */
export type DiagramTraversal = { diagramDepth?: number; diagramParts?: readonly string[] };
export const MAX_SMARTART_DEPTH = 8;
export function descendSmartArt(context: DiagramTraversal, part: string): Required<DiagramTraversal> {
  const depth = context.diagramDepth ?? 0, ancestors = context.diagramParts ?? [];
  if (!Number.isInteger(depth) || depth < 0 || depth >= MAX_SMARTART_DEPTH || ancestors.length >= MAX_SMARTART_DEPTH) throw new Error("SmartArt reference nesting limit exceeded.");
  if (ancestors.includes(part)) throw new Error("Cyclic SmartArt data reference is not supported.");
  return { diagramDepth: depth + 1, diagramParts: [...ancestors, part] };
}
