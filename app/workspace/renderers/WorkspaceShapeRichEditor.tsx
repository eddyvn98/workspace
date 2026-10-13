"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { useCallback, useEffect, useRef } from "react";
import { useWorkspaceStore, type WorkspaceInlineRichEditorActiveMarks, type WorkspaceInlineRichEditorCommands } from "../store/useWorkspaceStore";
import type { BlockId } from "../types/block";

/**
 * WYSIWYG replacement for the old plain-string/markdown label editor —
 * per explicit direction, this is TipTap (ProseMirror), not a hand-rolled
 * contentEditable: typing shows real bold/italic/lists immediately instead
 * of literal `**`/`- ` markers until the block deselects, and future marks
 * (headings, images) are TipTap extensions, not new hand-written regexes.
 *
 * Storage: `value` is now an HTML string (TipTap's native format), NOT the
 * markdown-string convention markdownPreview.tsx/inlineMarkdownEditing.ts
 * used — a deliberate clean break, not a migration, since this shape rich-
 * text feature was only added this same session with no real user data at
 * stake yet.
 *
 * List bullets/numbers were toggling correctly at the document-model level
 * (`editor.isActive('bulletList')` was already true) but never SHOWED —
 * this app's global Tailwind reset sets `list-style: none` on every
 * `ul`/`ol`, and TipTap's default `<ul>`/`<ol>` output carries no override.
 * Fixed below via `bulletList`/`orderedList` HTMLAttributes (inline style,
 * so no global CSS change needed).
 */
function computeActiveMarks(editor: NonNullable<ReturnType<typeof useEditor>>): WorkspaceInlineRichEditorActiveMarks {
  return {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    underline: editor.isActive("underline"),
    strike: editor.isActive("strike"),
    bulletList: editor.isActive("bulletList"),
    orderedList: editor.isActive("orderedList"),
    blockquote: editor.isActive("blockquote"),
    align: editor.isActive({ textAlign: "center" }) ? "center" : editor.isActive({ textAlign: "right" }) ? "right" : "left",
  };
}

export function WorkspaceShapeRichEditor({
  blockId,
  value,
  isEditing,
  color = "#1e293b",
  onChange,
  onStopEditing,
  onMeasuredHeight,
}: {
  blockId: BlockId;
  value: string;
  isEditing: boolean;
  color?: string;
  onChange: (html: string) => void;
  onStopEditing: () => void;
  /** Fires with the content's real rendered height (including this
   *  component's own padding) whenever it changes — replaces guessing at a
   *  char-count/line-wrap estimate (fragile: inline code/bold render at a
   *  different width than plain text, so a heuristic tuned for one
   *  under/over-shoots for the other) with the actual measured DOM height,
   *  via ResizeObserver. The caller (ShapeBlock.tsx) grows the block to fit
   *  this instead of an estimate. */
  onMeasuredHeight?: (height: number) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const publishState = useCallback((editor: NonNullable<ReturnType<typeof useEditor>>) => {
    const commands: WorkspaceInlineRichEditorCommands = {
      toggleBold: () => editor.chain().focus().toggleBold().run(),
      toggleItalic: () => editor.chain().focus().toggleItalic().run(),
      toggleUnderline: () => editor.chain().focus().toggleUnderline().run(),
      toggleStrike: () => editor.chain().focus().toggleStrike().run(),
      toggleBulletList: () => editor.chain().focus().toggleBulletList().run(),
      toggleOrderedList: () => editor.chain().focus().toggleOrderedList().run(),
      toggleBlockquote: () => editor.chain().focus().toggleBlockquote().run(),
      setTextAlign: (align) => editor.chain().focus().setTextAlign(align).run(),
    };
    useWorkspaceStore.getState().setActiveRichTextEditor({ blockId, commands, activeMarks: computeActiveMarks(editor) });
  }, [blockId]);

  const editor = useEditor({
    // StarterKit (v3) already bundles Underline — a separate
    // @tiptap/extension-underline import here registered it twice
    // ("Duplicate extension names found: ['underline']").
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
        // list-style-position:inside — with `outside` (the default), the
        // marker sits in the list's own padding gutter and never moves, so a
        // centered/right-aligned list item's text shifts but its bullet/
        // number stays pinned at the left edge. `inside` makes the marker
        // part of the text's own line box so it travels with the alignment.
        bulletList: { HTMLAttributes: { style: "list-style: disc; list-style-position: inside; padding-left: 0; text-align: left;" } },
        orderedList: { HTMLAttributes: { style: "list-style: decimal; list-style-position: inside; padding-left: 0; text-align: left;" } },
        // display:inline-block (+ max-width so it still wraps instead of
        // overflowing) makes the quote box shrink to fit its own text and
        // follow the surrounding text-align like a normal inline run —
        // `block` (the default) always spans the full editor width, so its
        // left border sat pinned to the far edge while center/right-aligned
        // text moved away from it.
        blockquote: { HTMLAttributes: { style: "border-left: 3px solid #94a3b8; padding-left: 8px; font-style: italic; opacity: 0.9; display: inline-block; max-width: 100%;" } },
      }),
      TextAlign.configure({ types: ["paragraph", "listItem", "blockquote"] }),
    ],
    content: value,
    editable: isEditing,
    immediatelyRender: false,
    onUpdate: ({ editor: instance }) => { onChange(instance.getHTML()); publishState(instance); },
    onSelectionUpdate: ({ editor: instance }) => publishState(instance),
    editorProps: {
      attributes: { style: `color:${color}; text-align:center; outline:none;` },
      handleKeyDown: (_view, event) => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); onStopEditing(); return true; }
        return false;
      },
    },
  }, [color]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(isEditing);
    // ProseMirror keeps its own `role`/`aria-label` fixed from init options —
    // toggle them here instead, so a read-only (not currently being edited)
    // shape doesn't keep claiming an editable textbox role for the rest of
    // the DOM's lifetime (both a11y correctness and what lets callers query
    // "is the editor currently open" by role, same as the old plain-<textarea>
    // version did by only mounting the textarea while isEditing).
    editor.view.dom.setAttribute("role", isEditing ? "textbox" : "presentation");
    if (isEditing) {
      editor.view.dom.setAttribute("aria-label", "Shape text");
      // scrollIntoView:false — the canvas has its own pan/zoom camera, and
      // ProseMirror's own scrollIntoView assumes normal document scrolling
      // (also the only part of this call jsdom's incomplete layout support
      // can't handle — it throws on getClientRects there).
      editor.commands.focus("end", { scrollIntoView: false });
      // Published so WorkspaceSelectionToolbar.tsx's Bold/Italic/Underline/
      // Strikethrough/list/align buttons can apply to — and reflect the
      // live state of — THIS editor's selection. See
      // useWorkspaceStore.ts's activeRichTextEditor doc comment for why a
      // shape's per-run rich text needs this instead of the whole-block
      // style patch those buttons apply to a TextBlock.
      publishState(editor);
    } else {
      editor.view.dom.removeAttribute("aria-label");
    }
  }, [editor, isEditing, blockId, publishState]);

  useEffect(() => () => {
    if (useWorkspaceStore.getState().activeRichTextEditor?.blockId === blockId) {
      useWorkspaceStore.getState().setActiveRichTextEditor(null);
    }
  }, [blockId]);

  // The block's own `value` (patched by an AI tool call, undo/redo, or a
  // collaborator) can change without this editor instance having produced
  // it — resync the DOM in that case, but never while the user is actively
  // typing here (that would fight their own edit and reset the caret).
  useEffect(() => {
    if (!editor || isEditing) return;
    if (editor.getHTML() !== value) editor.commands.setContent(value || "", { emitUpdate: false });
  }, [editor, value, isEditing]);

  useEffect(() => () => editor?.destroy(), [editor]);

  // Measures the ACTUAL rendered height (content + this wrapper's own
  // padding) instead of estimating it, and reports every change — typing,
  // pasting, an AI tool call replacing `value`, a mark toggle that wraps
  // text onto an extra line, all go through the same one measurement path.
  useEffect(() => {
    const node = contentRef.current;
    if (!node || !onMeasuredHeight) return;
    const report = () => onMeasuredHeight(node.getBoundingClientRect().height);
    report();
    // ResizeObserver doesn't exist in jsdom (vitest's test environment) —
    // every real browser has it, so this only ever degrades in tests, where
    // the one-shot report() above already covers what's checked.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [onMeasuredHeight, editor]);

  if (!editor) return null;
  if (!isEditing && !value) return null;
  return (
    <div
      className="workspace-shape-rich-editor"
      onPointerDown={(event) => { if (isEditing) event.stopPropagation(); }}
      onBlur={onStopEditing}
      style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", pointerEvents: isEditing ? "auto" : "none" }}
    >
      {/* A list item's marker is inline content but its child <p> is a block,
          which forces a line break between them (marker on its own line) —
          invisible at the default left alignment, but very visible once the
          marker+text are centered/right-aligned as if they were one unit.
          Making that <p> inline puts the marker back on the same line. */}
      <style>{".workspace-shape-rich-editor li > p { display: inline; }"}</style>
      <div ref={contentRef} style={{ width: "100%", padding: "8px", boxSizing: "border-box" }}>
        <EditorContent editor={editor} style={{ width: "100%", fontSize: 14, lineHeight: 1.5 }} />
      </div>
    </div>
  );
}
