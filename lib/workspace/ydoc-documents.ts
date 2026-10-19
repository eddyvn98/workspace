import * as Y from "yjs";
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import type { JSONContent } from "@tiptap/core";
import { workspaceDocumentSchema } from "./document-schema";

export const DOCUMENT_PROTOCOL_VERSION = 1;
export interface DocumentCodec {
  parse: (html: string) => JSONContent;
  render: (json: JSONContent) => string;
}
type DocBlock = { type: "doc"; data: Record<string, unknown> & { html: string } };
export const documentFragments = (doc: Y.Doc) => doc.getMap<Y.XmlFragment>("documents");
export function isDocBlock(value: unknown): value is DocBlock {
  if (!value || typeof value !== "object") return false;
  const block = value as Partial<DocBlock>;
  return block.type === "doc" && typeof block.data?.html === "string";
}
export function documentFragmentHtml(fragment: Y.XmlFragment, codec: DocumentCodec): string {
  return codec.render(yXmlFragmentToProsemirrorJSON(fragment) as JSONContent);
}
export function projectDocumentBlock(doc: Y.Doc, id: string, block: unknown, codec?: DocumentCodec): unknown {
  const fragment = documentFragments(doc).get(id);
  if (!codec || !isDocBlock(block) || !fragment) return block;
  return { ...block, data: { ...block.data, html: documentFragmentHtml(fragment, codec) } };
}

/** HTML is an interchange format. Live editing always mutates the XML tree, never raw HTML text. */
export function synchronizeDocumentFragments(
  doc: Y.Doc, previous: Record<string, unknown>, next: Record<string, unknown>, codec: DocumentCodec,
): boolean {
  const fragments = documentFragments(doc);
  let changed = false;
  for (const id of Object.keys(previous)) {
    if (!isDocBlock(next[id]) && fragments.has(id)) { fragments.delete(id); changed = true; }
  }
  for (const [id, block] of Object.entries(next)) {
    if (!isDocBlock(block)) continue;
    let fragment = fragments.get(id);
    const before = previous[id];
    if (fragment && isDocBlock(before) && before.data.html === block.data.html) continue;
    const parsed = codec.parse(block.data.html || "<p></p>");
    if (fragment && documentFragmentHtml(fragment, codec) === codec.render(parsed)) continue;
    if (!fragment) { fragment = new Y.XmlFragment(); fragments.set(id, fragment); }
    prosemirrorJSONToYXmlFragment(workspaceDocumentSchema, parsed, fragment);
    changed = true;
  }
  return changed;
}
