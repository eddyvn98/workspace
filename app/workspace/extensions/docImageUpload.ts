import { Extension, type Editor } from "@tiptap/react";
import { Plugin } from "@tiptap/pm/state";
import { DecorationSet } from "@tiptap/pm/view";
import { DocImageUploadController, type DocImageUploadOptions } from "../utils/docImageUploadController";
import { docImageUploadKey, mapDocImageUploads } from "../utils/docImageUploadState";

const controllers = new WeakMap<Editor, DocImageUploadController>();

export function uploadDocImage(editor: Editor, file: File, pos?: number): boolean {
  return controllers.get(editor)?.start(file, pos) ?? false;
}
export function cancelDocImageUploads(editor: Editor): void { controllers.get(editor)?.cancelAll(); }
export function hasPendingDocImageUploads(editor: Editor): boolean { return controllers.get(editor)?.pending ?? false; }

/** One controller per editor; placeholder state never enters its persisted schema. */
export function createDocImageUpload(options: DocImageUploadOptions = {}) {
  return Extension.create({
    name: "docImageUpload",
    addProseMirrorPlugins() {
      const editor = this.editor;
      const controller = new DocImageUploadController(editor, options);
      controllers.set(editor, controller);
      return [new Plugin({
        key: docImageUploadKey,
        state: { init: () => DecorationSet.empty, apply: mapDocImageUploads },
        props: {
          decorations: (state) => editor.isEditable ? docImageUploadKey.getState(state) : null,
          handlePaste: (_view, event) => {
            if (!editor.isEditable) return false;
            const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"));
            if (!files.length) return false;
            event.preventDefault();
            files.forEach((file) => controller.start(file));
            return true;
          },
          handleDrop: (view, event, _slice, moved) => {
            if (!editor.isEditable || moved) return false;
            const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.type.startsWith("image/"));
            if (!files.length) return false;
            event.preventDefault();
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
            files.forEach((file) => controller.start(file, pos));
            return true;
          },
        },
        view: () => ({
          update: () => controller.prune(),
          destroy: () => { controller.dispose(); controllers.delete(editor); },
        }),
      })];
    },
  });
}
