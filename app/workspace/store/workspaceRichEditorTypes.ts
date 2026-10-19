export interface WorkspaceInlineRichEditorCommands {
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrike: () => void;
  toggleBulletList: () => void;
  toggleOrderedList: () => void;
  toggleBlockquote: () => void;
  setTextAlign: (align: "left" | "center" | "right" | "justify") => void;
  /** Doc-block-only commands (WorkspaceDocRichEditor.tsx) — a shape's label
   *  editor has no heading/checklist/link/code concept (see its own doc
   *  comment), so these stay optional rather than forcing every editor to
   *  implement no-ops. */
  toggleCode?: () => void;
  toggleHeading1?: () => void;
  toggleHeading2?: () => void;
  toggleHeading3?: () => void;
  toggleTaskList?: () => void;
  /** Applies/replaces the link on the current selection (or the link the
   *  caret sits inside). window.prompt() isn't usable here — it throws in
   *  this app's runtime — so the URL comes from WorkspaceDocFormatToolbar's
   *  own popover input instead of a native prompt. */
  setLink?: (url: string) => void;
  unsetLink?: () => void;
  insertImage?: (src: string, alt?: string) => void;
  /** Uploads into a position tracked by the editor while the file is in flight. */
  uploadImage?: (file: File) => void | Promise<void>;
  setFontFamily?: (value: string | null) => void;
  setFontSize?: (value: string | null) => void;
  setTextColor?: (value: string | null) => void;
  setHighlightColor?: (value: string | null) => void;
  setLineHeight?: (value: string | null) => void;
  clearFormatting?: () => void;
  toggleCodeBlock?: () => void;
  insertHorizontalRule?: () => void;
  undo?: () => void;
  redo?: () => void;
}

/** A live snapshot of the current selection's formatting, refreshed on
 *  every selection/content change (WorkspaceShapeRichEditor.tsx's
 *  onSelectionUpdate/onTransaction) — lets WorkspaceSelectionToolbar.tsx's
 *  Bold/Italic/.../list buttons show whether the selected text ALREADY has
 *  that mark, the same way they already do for a TextBlock's whole-block
 *  style flags. */
export interface WorkspaceInlineRichEditorActiveMarks {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  bulletList: boolean;
  orderedList: boolean;
  blockquote: boolean;
  align: "left" | "center" | "right" | "justify";
  /** Doc-block-only marks — see WorkspaceInlineRichEditorCommands. */
  code?: boolean;
  heading1?: boolean;
  heading2?: boolean;
  heading3?: boolean;
  taskList?: boolean;
  link?: boolean;
  linkHref?: string;
  fontFamily?: string;
  fontSize?: string;
  textColor?: string;
  highlightColor?: string;
  lineHeight?: string;
  codeBlock?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
}
