import { record, type AgentBoardState } from "./operationsCore";

// Models often "bold" a whole node by wrapping its text in markdown markers.
// The editor stores emphasis as block properties, so the markers would show up
// as literal asterisks in outlines and break later name lookups. Promote a
// fully wrapped text to the real property instead.
const WHOLE_TEXT_EMPHASIS: Array<{ pattern: RegExp; patch: Record<string, unknown> }> = [
  { pattern: /^\*\*\*([^*\n]+)\*\*\*$/, patch: { fontWeight: "bold", fontStyle: "italic" } },
  { pattern: /^\*\*([^*\n]+)\*\*$/, patch: { fontWeight: "bold" } },
  { pattern: /^__([^_\n]+)__$/, patch: { fontWeight: "bold" } },
  { pattern: /^\*([^*\n]+)\*$/, patch: { fontStyle: "italic" } },
];

export function normalizeWholeTextEmphasis(state: AgentBoardState, blockIds: string[]): void {
  for (const blockId of blockIds) {
    const block = state.blocks[blockId];
    if (!block || block.type !== "text") continue;
    const data = record(block.data);
    if (typeof data.markdown !== "string") continue;
    const markdown = data.markdown.trim();
    const match = WHOLE_TEXT_EMPHASIS.find((rule) => rule.pattern.test(markdown));
    if (!match) continue;
    block.data = { ...data, markdown: markdown.replace(match.pattern, "$1"), ...match.patch };
  }
}
