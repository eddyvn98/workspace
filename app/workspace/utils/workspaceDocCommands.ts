import type { Editor } from "@tiptap/react";
import type { WorkspaceInlineRichEditorCommands } from "../store/workspaceRichEditorTypes";
import { uploadDocImage } from "../extensions/docImageUpload";

export function workspaceDocCommands(editor: Editor): WorkspaceInlineRichEditorCommands {
  return {
    toggleBold: () => editor.chain().focus().toggleBold().run(),
    toggleItalic: () => editor.chain().focus().toggleItalic().run(),
    toggleUnderline: () => editor.chain().focus().toggleUnderline().run(),
    toggleStrike: () => editor.chain().focus().toggleStrike().run(),
    toggleBulletList: () => editor.chain().focus().toggleBulletList().run(),
    toggleOrderedList: () => editor.chain().focus().toggleOrderedList().run(),
    toggleBlockquote: () => editor.chain().focus().toggleBlockquote().run(),
    setTextAlign: (align) => editor.chain().focus().setTextAlign(align).run(),
    toggleCode: () => editor.chain().focus().toggleCode().run(),
    toggleHeading1: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    toggleHeading2: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    toggleHeading3: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    toggleTaskList: () => editor.chain().focus().toggleTaskList().run(),
    setLink: (url) => { if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run(); },
    unsetLink: () => editor.chain().focus().extendMarkRange("link").unsetLink().run(),
    insertImage: (src, alt) => editor.chain().focus().setImage({ src, alt }).run(),
    uploadImage: (file) => { uploadDocImage(editor, file); },
    setFontFamily: (value) => value ? editor.chain().focus().setFontFamily(value).run() : editor.chain().focus().unsetFontFamily().run(),
    setFontSize: (value) => value ? editor.chain().focus().setFontSize(value).run() : editor.chain().focus().unsetFontSize().run(),
    setTextColor: (value) => value ? editor.chain().focus().setColor(value).run() : editor.chain().focus().unsetColor().run(),
    setHighlightColor: (value) => value ? editor.chain().focus().setHighlight({ color: value }).run() : editor.chain().focus().unsetHighlight().run(),
    setLineHeight: (value) => value ? editor.chain().focus().setLineHeight(value).run() : editor.chain().focus().unsetLineHeight().run(),
    clearFormatting: () => editor.chain().focus().unsetAllMarks().clearNodes().unsetTextAlign().run(),
    toggleCodeBlock: () => editor.chain().focus().toggleCodeBlock().run(),
    insertHorizontalRule: () => editor.chain().focus().setHorizontalRule().run(),
    undo: () => editor.chain().focus().undo().run(),
    redo: () => editor.chain().focus().redo().run(),
  };
}
