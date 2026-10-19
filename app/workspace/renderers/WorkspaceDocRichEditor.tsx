"use client";

import { EditorContent, Extension, useEditor } from "@tiptap/react";
import { liftListItem, sinkListItem } from "@tiptap/pm/schema-list";
import Collaboration from "@tiptap/extension-collaboration";
import { documentBaseExtensions } from "@/lib/workspace/document-schema";
import Placeholder from "@tiptap/extension-placeholder";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { BlockId } from "../types/block";
import { DocLineId } from "../extensions/docLineId";
import { DocImage } from "../extensions/docImage";
import { SlideChart } from "../extensions/slideChart";
import { DocWorkspaceTable } from "../extensions/docWorkspaceTable";
import { createDocSlashCommand, closeDocSlashMenu, type SlashMenuState } from "../extensions/docSlashCommand";
import { WorkspaceDocLineOverlay } from "../components/WorkspaceDocLineOverlay";
import { WorkspaceDocSlashMenu } from "../components/WorkspaceDocSlashMenu";
import { WorkspaceDocTableControls } from "../components/WorkspaceDocTableControls";
import { WorkspaceDocRichEditorStyles } from "../components/WorkspaceDocRichEditorStyles";
import { createDocImageUpload, uploadDocImage } from "../extensions/docImageUpload";
import { DocTableClipboard } from "../extensions/docTableClipboard";
import { workspaceDocCommands } from "../utils/workspaceDocCommands";
import { WorkspaceDocTools } from "../components/WorkspaceDocTools";
import { useDocumentCollaboration } from "../hooks/useDocumentCollaboration";
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
 * Formatting controls use the shared activeRichTextEditor channel in the
 * canvas and Office toolbar. Find, replace, outline and counts live beside
 * the document content.
 */
export function WorkspaceDocRichEditor({
  blockId,
  html,
  isEditing,
  onChange,
  onStopEditing,
  onInsertTable,
  onEmbedTable,
  readOnly = false,
  showDocumentTools = false,
}: {
  blockId: BlockId;
  html: string;
  isEditing: boolean;
  onChange: (html: string) => void;
  onStopEditing: () => void;
  onInsertTable?: WorkspaceDocTableInsertHandler;
  onEmbedTable?: WorkspaceDocTableEmbedHandler;
  readOnly?: boolean;
  showDocumentTools?: boolean;
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

  const fragment = useDocumentCollaboration(blockId);
  const isReadOnly = useWorkspaceStore(state => state.isReadOnly);
  const editable = isEditing && !isReadOnly && !readOnly;
  const handleSlashImageFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file && editor) uploadDocImage(editor, file);
  };
  const publishState = useCallback((instance: NonNullable<ReturnType<typeof useEditor>>) => {
    if (!editable) return;
    useWorkspaceStore.getState().setActiveRichTextEditor({ blockId, commands: workspaceDocCommands(instance), activeMarks: computeActiveMarks(instance) });
  }, [blockId, editable]);

  const editor = useEditor({
    extensions: [
      ...documentBaseExtensions(Boolean(fragment)),
      ...(fragment ? [Collaboration.configure({ fragment })] : []),
      createDocImageUpload(),
      DocTableClipboard.configure({ blockId }),
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
      AlignCenterShortcut,
      DocLineId.configure({ canWrite: () => !readOnly && !useWorkspaceStore.getState().isReadOnly }),
      DocImage,
      DocWorkspaceTable.configure({ readOnly }),
      SlideChart,
      createDocSlashCommand(
        setSlashState,
        (editorInstance, item, range) => handleDocSlashSelect(editorInstance, item, range, imageInputRef, onInsertTable, onEmbedTable),
        () => [...getWorkspaceDocSlashItems(blockId)],
      ),
    ],
    content: fragment ? undefined : html,
    // Always constructed editable — TableKit's columnResizing plugin is only
    // ever added if `this.editor.isEditable` reads true at THIS ONE-TIME
    // construction, so
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
      // The Yjs projection publishes merged HTML to the store for a bound document.
      if (!fragment) onChange(nextHtml);
      publishState(instance);
    },
    onSelectionUpdate: ({ editor: instance }) => publishState(instance),
    onTransaction: ({ editor: instance }) => publishState(instance),
    editorProps: {
      attributes: { style: "outline:none;", role: "textbox", "aria-label": "Document content", "aria-multiline": "true" },
      handleKeyDown: (view, event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          if (!editor || !closeDocSlashMenu(editor)) onStopEditing();
          return true;
        }
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
  }, [blockId, fragment, readOnly]);

  useDocEditorSynchronization(editor, html, editable, lastEmittedHtmlRef, publishState, Boolean(fragment));

  useEffect(() => () => {
    if (useWorkspaceStore.getState().activeRichTextEditor?.blockId === blockId) {
      useWorkspaceStore.getState().setActiveRichTextEditor(null);
    }
  }, [blockId]);

  if (!editor) return null;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      {(isEditing || showDocumentTools) && <WorkspaceDocTools editor={editor} readOnly={!editable} />}
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
        <WorkspaceDocLineOverlay editor={editor} blockId={blockId} containerRef={containerRef} isEditing={editable} />
        {editable && <WorkspaceDocTableControls editor={editor} />}
        {slashState && (
          <WorkspaceDocSlashMenu
            menuId={slashState.menuId}
            onHighlight={slashState.onHighlight}
            items={slashState.items}
            clientRect={slashState.clientRect}
            selectedIndex={slashState.selectedIndex}
            onSelect={(item) => { handleDocSlashSelect(editor, item, slashState.range, imageInputRef, onInsertTable, onEmbedTable); closeDocSlashMenu(editor); setSlashState(null); }}
          />
        )}
        <input ref={imageInputRef} type="file" accept="image/*" onChange={handleSlashImageFile} style={{ display: "none" }} />
        <WorkspaceDocRichEditorStyles />
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
