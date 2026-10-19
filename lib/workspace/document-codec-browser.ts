import { generateHTML, generateJSON } from "@tiptap/core";
import { documentSchemaExtensions } from "./document-schema";
import type { DocumentCodec } from "./ydoc-documents";

export const browserDocumentCodec: DocumentCodec = {
  parse: (html) => generateJSON(html, documentSchemaExtensions),
  render: (json) => generateHTML(json, documentSchemaExtensions),
};
