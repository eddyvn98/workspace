import { Extension, type Editor, type Range } from "@tiptap/react";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import {
  Calculator,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  List,
  ListChecks,
  ListOrdered,
  Pilcrow,
  Quote as QuoteIcon,
  Table as TableIcon,
  type LucideIcon,
} from "lucide-react";
import type { TableMode } from "../types/table";
import type { BlockId } from "../types/block";

export interface SlashCommandItem {
  label: string;
  description: string;
  icon: LucideIcon;
  /** Groups items into sections in the popup, separated by a divider. */
  group: string;
  command: (editor: Editor, range: Range) => void;
  /** Creates or embeds the native Workspace table instead of a TipTap table. */
  tableMode?: TableMode;
  /** Embeds an existing native Workspace table. */
  tableId?: BlockId;
  /** Set on the "Image" item: instead of running `command`, WorkspaceDocRichEditor.tsx
   *  clears the range then opens its file picker, since inserting an image needs an
   *  async upload the plain synchronous `command` shape can't express. */
  insertsFile?: boolean;
}

export const SLASH_COMMAND_ITEMS: SlashCommandItem[] = [
  { label: "Paragraph", description: "Plain text line", icon: Pilcrow, group: "Basic", command: (editor, range) => editor.chain().focus().deleteRange(range).clearNodes().setParagraph().run() },
  { label: "Quote", description: "Capture a quote", icon: QuoteIcon, group: "Basic", command: (editor, range) => editor.chain().focus().deleteRange(range).clearNodes().toggleBlockquote().run() },
  { label: "Heading 1", description: "Big section heading", icon: Heading1, group: "Headings", command: (editor, range) => editor.chain().focus().deleteRange(range).clearNodes().setHeading({ level: 1 }).run() },
  { label: "Heading 2", description: "Medium section heading", icon: Heading2, group: "Headings", command: (editor, range) => editor.chain().focus().deleteRange(range).clearNodes().setHeading({ level: 2 }).run() },
  { label: "Heading 3", description: "Small section heading", icon: Heading3, group: "Headings", command: (editor, range) => editor.chain().focus().deleteRange(range).clearNodes().setHeading({ level: 3 }).run() },
  { label: "Bullet list", description: "Simple unordered list", icon: List, group: "Lists", command: (editor, range) => editor.chain().focus().deleteRange(range).clearNodes().toggleBulletList().run() },
  { label: "Ordered list", description: "Numbered list", icon: ListOrdered, group: "Lists", command: (editor, range) => editor.chain().focus().deleteRange(range).clearNodes().toggleOrderedList().run() },
  { label: "Checklist", description: "Track tasks with checkboxes", icon: ListChecks, group: "Lists", command: (editor, range) => editor.chain().focus().deleteRange(range).clearNodes().toggleTaskList().run() },
  { label: "Image", description: "Upload and embed a picture", icon: ImagePlus, group: "Media", insertsFile: true, command: () => {} },
  { label: "Table", description: "Insert a native document table", icon: TableIcon, group: "Media", tableMode: "document", command: () => {} },
  { label: "Spreadsheet", description: "Insert a formula-ready table", icon: Calculator, group: "Media", tableMode: "spreadsheet", command: () => {} },
];

export interface SlashMenuState {
  items: SlashCommandItem[];
  range: Range;
  clientRect: () => DOMRect | null;
  selectedIndex: number;
}

/**
 * Notion-style "/" trigger. This extension itself never renders anything —
 * it only runs @tiptap/suggestion's plugin (query filtering, range tracking,
 * arrow-key/enter/escape handling) and forwards the resulting state to React
 * via `onStateChange`, which WorkspaceDocRichEditor.tsx wires to
 * WorkspaceDocSlashMenu.tsx for the actual popup UI — keeping this file a
 * plain config module, same split as docImage.ts/WorkspaceDocImageNodeView.tsx.
 */
export function createDocSlashCommand(
  onStateChange: (state: SlashMenuState | null) => void,
  onSelectItem: (editor: Editor, item: SlashCommandItem, range: Range) => void,
  getItems: () => SlashCommandItem[] = () => SLASH_COMMAND_ITEMS,
) {
  return Extension.create({
    name: "docSlashCommand",
    addProseMirrorPlugins() {
      const options: Omit<SuggestionOptions, "editor"> = {
        char: "/",
        startOfLine: false,
        items: ({ query }) => getItems().filter((item) => item.label.toLowerCase().includes(query.toLowerCase())),
        render: () => {
          let selectedIndex = 0;
          let current: { items: SlashCommandItem[]; range: Range; clientRect: () => DOMRect | null } | null = null;
          let activeEditor: Editor | null = null;

          const push = () => {
            if (!current) return;
            onStateChange({ ...current, selectedIndex });
          };

          return {
            onStart: (props) => {
              selectedIndex = 0;
              activeEditor = props.editor as Editor;
              current = { items: props.items as SlashCommandItem[], range: props.range, clientRect: () => props.clientRect?.() ?? null };
              push();
            },
            onUpdate: (props) => {
              selectedIndex = 0;
              activeEditor = props.editor as Editor;
              current = { items: props.items as SlashCommandItem[], range: props.range, clientRect: () => props.clientRect?.() ?? null };
              push();
            },
            onKeyDown: (props) => {
              if (!current) return false;
              if (props.event.key === "Escape") {
                current = null;
                onStateChange(null);
                return true;
              }
              if (props.event.key === "ArrowDown") {
                selectedIndex = (selectedIndex + 1) % Math.max(current.items.length, 1);
                push();
                return true;
              }
              if (props.event.key === "ArrowUp") {
                selectedIndex = (selectedIndex - 1 + current.items.length) % Math.max(current.items.length, 1);
                push();
                return true;
              }
              if (props.event.key === "Enter") {
                const item = current.items[selectedIndex];
                const range = current.range;
                current = null;
                onStateChange(null);
                if (item && activeEditor) onSelectItem(activeEditor, item, range);
                return true;
              }
              return false;
            },
            onExit: () => {
              current = null;
              onStateChange(null);
            },
          };
        },
      };
      return [Suggestion({ editor: this.editor, ...options })];
    },
  });
}

export default createDocSlashCommand;
