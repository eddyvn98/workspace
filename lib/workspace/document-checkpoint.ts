import * as Y from "yjs";
import { documentFragments, documentFragmentHtml, DOCUMENT_PROTOCOL_VERSION, isDocBlock } from "./ydoc-documents";
import { workspaceDocMaps } from "./ydoc-shapes";
import { serverDocumentCodec } from "./document-room";

/** A browser's offline checkpoint is accepted only with the HTML it actually represents. */
export function validateDocumentCheckpoint(encoded: unknown, blocks: unknown): encoded is string {
  if (typeof encoded !== "string" || encoded.length > 32 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  if (!blocks || typeof blocks !== "object" || Array.isArray(blocks)) return false;
  const doc = new Y.Doc();
  try {
    const fragments = documentFragments(doc);
    const { meta } = workspaceDocMaps(doc);
    Y.applyUpdate(doc, Buffer.from(encoded, "base64"));
    if (meta.get("docProtocolVersion") !== DOCUMENT_PROTOCOL_VERSION) return false;
    for (const [id, block] of Object.entries(blocks)) {
      if (!isDocBlock(block)) continue;
      const fragment = fragments.get(id);
      if (!fragment || documentFragmentHtml(fragment, serverDocumentCodec)
        !== serverDocumentCodec.render(serverDocumentCodec.parse(block.data.html || "<p></p>"))) return false;
    }
    return true;
  } catch { return false; }
  finally { doc.destroy(); }
}
