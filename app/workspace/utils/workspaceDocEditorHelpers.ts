import type { Editor, Range } from "@tiptap/react";
import type { RefObject } from "react";
import type { WorkspaceInlineRichEditorActiveMarks } from "../store/useWorkspaceStore";
import type { SlashCommandItem } from "../extensions/docSlashCommand";
import type { TableMode } from "../types/table";

export type WorkspaceDocTableInsertHandler = (mode: TableMode, editor: Editor, range: Range) => void;
export type WorkspaceDocTableEmbedHandler = (tableId: string, editor: Editor, range: Range) => void;

export function computeActiveMarks(editor: Editor): WorkspaceInlineRichEditorActiveMarks {
  return {
    bold: editor.isActive("bold"), italic: editor.isActive("italic"), underline: editor.isActive("underline"),
    strike: editor.isActive("strike"), bulletList: editor.isActive("bulletList"), orderedList: editor.isActive("orderedList"),
    blockquote: editor.isActive("blockquote"),
    align: editor.isActive({ textAlign: "center" }) ? "center" : editor.isActive({ textAlign: "right" }) ? "right" : editor.isActive({ textAlign: "justify" }) ? "justify" : "left",
    code: editor.isActive("code"), heading1: editor.isActive("heading", { level: 1 }), heading2: editor.isActive("heading", { level: 2 }),
    heading3: editor.isActive("heading", { level: 3 }), taskList: editor.isActive("taskList"), link: editor.isActive("link"),
    linkHref: (editor.getAttributes("link").href as string | undefined) ?? "",
  };
}

export function handleDocSlashSelect(
  editor: Editor,
  item: SlashCommandItem,
  range: Range,
  imageInputRef: RefObject<HTMLInputElement>,
  onInsertTable?: WorkspaceDocTableInsertHandler,
  onEmbedTable?: WorkspaceDocTableEmbedHandler,
) {
  if (item.insertsFile) {
    editor.chain().focus().deleteRange(range).run();
    imageInputRef.current?.click();
    return;
  }
  if (item.tableId && onEmbedTable) {
    onEmbedTable(item.tableId, editor, range);
    return;
  }
  if (item.tableMode && onInsertTable) {
    onInsertTable(item.tableMode, editor, range);
    return;
  }
  item.command(editor, range);
}
