"use client";

import { EditorContent, Extension, useEditor } from "@tiptap/react";
import { liftListItem, sinkListItem } from "@tiptap/pm/schema-list";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import TextAlign from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useWorkspaceStore, type WorkspaceInlineRichEditorCommands } from "../store/useWorkspaceStore";
import type { BlockId } from "../types/block";
import { DocLineId } from "../extensions/docLineId";
import { DocImage } from "../extensions/docImage";
import { SlideChart } from "../extensions/slideChart";
import { DocWorkspaceTable } from "../extensions/docWorkspaceTable";
import { createDocSlashCommand, type SlashMenuState } from "../extensions/docSlashCommand";
import { WorkspaceDocLineOverlay } from "../components/WorkspaceDocLineOverlay";
import { WorkspaceDocSlashMenu } from "../components/WorkspaceDocSlashMenu";
import { WorkspaceDocTableControls } from "../components/WorkspaceDocTableControls";
import { WorkspaceDocRichEditorStyles } from "../components/WorkspaceDocRichEditorStyles";
import { uploadWorkspaceImageWithOriginal } from "../utils/imageUpload";
import { getWorkspaceDocSlashItems } from "../utils/workspaceDocSlashItems";
import { computeActiveMarks, handleDocSlashSelect, type WorkspaceDocTableEmbedHandler, type WorkspaceDocTableInsertHandler } from "../utils/workspaceDocEditorHelpers";
import { useDocEditorSynchronization } from "../hooks/useDocEditorSynchronization";

// Mod-e is TipTap's default shortcut for the inline `code` mark, but this
// app's convention (and most word processors') is Mod-e = align center —
// registered after StarterKit in the extensions list below so it wins the
// key-combo collision (later extension's shortcut overrides an earlier
// one's for the same combo). Code stays reachable from the "Aa" popover.
const AlignCenterShortcut = Extension.create({
  name: "docAlignCenterShortcut",
  addKeyboardShortcuts() {
    return { "Mod-e": () => this.editor.commands.setTextAlign("center") };
  },
});

/**
 * The `doc` block's editor — a sibling to WorkspaceShapeRichEditor.tsx, not a
 * shared component: that one is tuned for a short, centered shape LABEL
 * (heading/link/checklist deliberately left out, see its own doc comment).
 * A page-style document needs the opposite defaults — left-flowing text,
 * section headings, and checklists — so this is its own TipTap config
 * rather than a growing set of flags on the label editor.
 *
 * Formatting controls (Bold/Heading/List/Checklist/Quote/Link) live in the
 * floating WorkspaceSelectionToolbar, not inline here — see
 * useWorkspaceStore.ts's activeRichTextEditor doc comment. This component
 * only publishes editor state; it renders no toolbar of its own.
 */
export function WorkspaceDocRichEditor({
  blockId,
  html,
  isEditing,
  onChange,
  onStopEditing,
  onInsertTable,
  onEmbedTable,
}: {
  blockId: BlockId;
  html: string;
  isEditing: boolean;
  onChange: (html: string) => void;
  onStopEditing: () => void;
  onInsertTable?: WorkspaceDocTableInsertHandler;
  onEmbedTable?: WorkspaceDocTableEmbedHandler;
}) {
  // Tracks the HTML this editor instance itself last produced, so the resync
  // effect below can tell "the store caught up with my own last keystroke"
  // (skip — don't fight the live caret) apart from "something else changed
  // the block's content out from under me" (workspace undo/redo, an AI tool
  // call, a collaborator) — which must resync even while isEditing, unlike
  // before.
  const lastEmittedHtmlRef = useRef(html);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [slashState, setSlashState] = useState<SlashMenuState | null>(null);

  const handleSlashImageFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/") || !editor) return;

    // Compression + upload takes a few hundred ms (longer for a large
    // photo) with nothing else on screen to show for it — insert a visible
    // placeholder immediately so picking a file doesn't look like it did
    // nothing, then swap it for the real image once the upload resolves.
    const placeholderText = "Uploading image…";
    const from = editor.state.selection.from;
    const to = from + placeholderText.length;
    editor.chain().focus().insertContentAt(from, placeholderText).setTextSelection({ from, to }).setItalic().run();

    const uploaded = await uploadWorkspaceImageWithOriginal(file);
    if (editor.isDestroyed) return;
    if (!uploaded) {
      editor.chain().focus().deleteRange({ from, to }).run();
      return;
    }
    editor.chain().focus().deleteRange({ from, to }).setImage({ src: uploaded.url, alt: file.name }).run();
  };

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
      toggleCode: () => editor.chain().focus().toggleCode().run(),
      toggleHeading1: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      toggleHeading2: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      toggleHeading3: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      toggleTaskList: () => editor.chain().focus().toggleTaskList().run(),
      setLink: (url) => { if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run(); },
      unsetLink: () => editor.chain().focus().extendMarkRange("link").unsetLink().run(),
      insertImage: (src, alt) => editor.chain().focus().setImage({ src, alt }).run(),
    };
    useWorkspaceStore.getState().setActiveRichTextEditor({ blockId, commands, activeMarks: computeActiveMarks(editor) });
  }, [blockId]);

  const editor = useEditor({
    extensions: [
      // StarterKit (v3) already bundles Link internally — same trap as
      // Underline in WorkspaceShapeRichEditor.tsx (see its own doc comment):
      // a separate @tiptap/extension-link import here registered it twice
      // ("Duplicate extension names found: ['link']"). Configure it via
      // StarterKit's own `link` option instead.
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TextAlign.configure({ types: ["paragraph", "heading", "listItem", "blockquote"] }),
      Placeholder.configure({
        showOnlyCurrent: false,
        emptyNodeClass: ({ hasAnchor }) => (hasAnchor ? "is-empty is-empty-current" : "is-empty"),
        placeholder: ({ editor: ed, node, pos }) => {
          if (node.type.name === "heading") return `Heading ${node.attrs.level}`;
          // pos is only valid against the doc mid-transaction decorations were
          // built for — ed.state.doc can already be a later/earlier doc (e.g.
          // right after insertTable() shifts everything), so resolve() can
          // throw "Position out of range". Fall back to the default text
          // rather than crash the editor over a cosmetic hint.
          try {
            const parent = ed.state.doc.resolve(pos).parent;
            if (parent.type.name === "taskItem") return "To-do";
            if (parent.type.name === "listItem") return "List item";
            if (parent.type.name === "blockquote") return "Quote";
          } catch {
            // fall through to default
          }
          return "Press '/' for options or start writing";
        },
      }),
      TableKit.configure({ table: { resizable: true } }),
      AlignCenterShortcut,
      DocLineId,
      DocImage,
      DocWorkspaceTable,
      SlideChart,
      createDocSlashCommand(
        setSlashState,
        (editorInstance, item, range) => handleDocSlashSelect(editorInstance, item, range, imageInputRef, onInsertTable, onEmbedTable),
        () => [...getWorkspaceDocSlashItems(blockId)],
      ),
    ],
    content: html,
    // Always constructed editable — TableKit's columnResizing plugin is only
    // ever added if `this.editor.isEditable` reads true at THIS ONE-TIME
    // construction (extensions are frozen by the `[]` dep array below), so
    // gating this on the current `isEditing` would permanently disable
    // column resize whenever a block happens to mount not-yet-editing. The
    // effect below (`editor.setEditable(isEditing)`) is what actually
    // toggles real interactivity afterward — this only affects the plugin
    // set picked at construction time.
    editable: true,
    immediatelyRender: false,
    onUpdate: ({ editor: instance }) => {
      const nextHtml = instance.getHTML();
      lastEmittedHtmlRef.current = nextHtml;
      onChange(nextHtml);
      publishState(instance);
    },
    onSelectionUpdate: ({ editor: instance }) => publishState(instance),
    editorProps: {
      attributes: { style: "outline:none;" },
      handleKeyDown: (view, event) => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); onStopEditing(); return true; }
        // Sink/lift the current list item a level, same as most editors.
        // Without this, Tab does nothing here (TipTap's ListItem doesn't
        // bind Tab/Shift-Tab itself) and — since stopPropagation above only
        // stops the DOM event, not this callback's fallthrough — falls
        // through to the workspace's own global Tab shortcut (add a child
        // block), which is even more surprising mid-edit.
        if (event.key === "Tab") {
          // Only for a real list item — otherwise let ProseMirror's other
          // keymaps handle Tab (notably TableKit's own next-cell/prev-cell
          // navigation; intercepting unconditionally here broke Tab inside
          // an inserted table).
          const { $from } = view.state.selection;
          const inListItem = Array.from({ length: $from.depth }, (_, i) => $from.node(i + 1).type.name).includes("listItem");
          if (!inListItem) return false;
          event.preventDefault();
          const { listItem } = view.state.schema.nodes;
          (event.shiftKey ? liftListItem : sinkListItem)(listItem)(view.state, view.dispatch);
          return true;
        }
        return false;
      },
    },
  }, []);

  useDocEditorSynchronization(editor, html, isEditing, lastEmittedHtmlRef, publishState);

  useEffect(() => () => {
    if (useWorkspaceStore.getState().activeRichTextEditor?.blockId === blockId) {
      useWorkspaceStore.getState().setActiveRichTextEditor(null);
    }
  }, [blockId]);

  if (!editor) return null;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        ref={containerRef}
        className="workspace-doc-rich-editor"
        data-workspace-wheel-lock="true"
        onPointerDown={(e) => { if (isEditing) e.stopPropagation(); }}
        // Keep the surface hit-testable when the doc is not in text-edit mode:
        // embedded Workspace tables are independently interactive. TipTap's
        // `setEditable(isEditing)` still keeps ordinary document text read-only.
        // `data-workspace-wheel-lock` opts this container out of the canvas's
        // own wheel handler (useCameraControls.ts), which otherwise calls
        // preventDefault() on every wheel event for pan/zoom and swallows the
        // native scroll this `overflow: auto` container needs when content
        // overflows the frame.
        style={{ position: "relative", flex: 1, minHeight: 0, overflow: "auto", padding: "24px 28px", pointerEvents: "auto" }}
      >
        <WorkspaceDocLineOverlay editor={editor} blockId={blockId} containerRef={containerRef} isEditing={isEditing} />
        {isEditing && <WorkspaceDocTableControls editor={editor} />}
        {slashState && (
          <WorkspaceDocSlashMenu
            items={slashState.items}
            clientRect={slashState.clientRect}
            selectedIndex={slashState.selectedIndex}
            onSelect={(item) => { handleDocSlashSelect(editor, item, slashState.range, imageInputRef, onInsertTable, onEmbedTable); setSlashState(null); }}
          />
        )}
        <input ref={imageInputRef} type="file" accept="image/*" onChange={handleSlashImageFile} style={{ display: "none" }} />
        <WorkspaceDocRichEditorStyles />
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
