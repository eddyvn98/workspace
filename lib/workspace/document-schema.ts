import { Extension, getSchema, type Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import { DocImageSchema } from "../../app/workspace/extensions/docImageSchema";
import { DocWorkspaceTableSchema, SlideChartSchema } from "../../app/workspace/extensions/docEmbedSchema";

export const DocumentLineAttributes = Extension.create({
  name: "documentLineAttributes",
  addGlobalAttributes() {
    return [{ types: ["paragraph", "heading", "blockquote", "listItem", "taskItem"], attributes: {
      lineId: { default: null, parseHTML: (element) => element.getAttribute("data-line-id"),
        renderHTML: (attrs) => attrs.lineId ? { "data-line-id": attrs.lineId } : {} },
    } }];
  },
});

/** Keep browser and server serialization identical; UI plugins are added by the editor. */
export function documentBaseExtensions(collaborative = false): Extensions {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true }, undoRedo: collaborative ? false : {} }),
    TaskList, TaskItem.configure({ nested: true }),
    TextAlign.configure({ types: ["paragraph", "heading", "listItem", "blockquote"] }),
    TextStyleKit, Highlight.configure({ multicolor: true }), TableKit.configure({ table: { resizable: true } }),
  ];
}

export const documentSchemaExtensions: Extensions = [
  ...documentBaseExtensions(), DocumentLineAttributes, DocImageSchema, DocWorkspaceTableSchema, SlideChartSchema,
];
export const workspaceDocumentSchema = getSchema(documentSchemaExtensions);
