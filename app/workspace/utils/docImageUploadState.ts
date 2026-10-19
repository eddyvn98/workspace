import type { EditorState, Transaction } from "@tiptap/pm/state";
import { PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const docImageUploadKey = new PluginKey<DecorationSet>("docImageUpload");
export interface DocImageUploadWidget {
  id: string;
  revision: number;
  filename: string;
  error?: string;
  retry: () => void;
  cancel: () => void;
}
export type DocImageUploadMeta = { add?: { pos: number; widget: DocImageUploadWidget }; remove?: string; clear?: boolean };

function uploadWidget(widget: DocImageUploadWidget): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.contentEditable = "false";
  wrapper.dataset.docImageUpload = widget.id;
  wrapper.className = "mx-1 inline-flex max-w-full flex-wrap items-center gap-2 rounded border border-slate-300 bg-slate-100 p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
  wrapper.setAttribute("role", "group");
  wrapper.setAttribute("aria-label", `Image upload: ${widget.filename}`);
  const status = document.createElement("span");
  status.setAttribute("role", widget.error ? "alert" : "status");
  status.textContent = widget.error ? `${widget.filename}: ${widget.error}` : `Uploading ${widget.filename}…`;
  wrapper.appendChild(status);
  const button = (label: string, action: () => void) => {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.className = "rounded border border-current px-2 py-1 hover:bg-slate-200 dark:hover:bg-slate-700";
    element.setAttribute("aria-label", `${label} image upload ${widget.filename}`);
    element.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); action(); });
    wrapper.appendChild(element);
  };
  if (widget.error) button("Retry", widget.retry);
  button("Cancel", widget.cancel);
  wrapper.addEventListener("pointerdown", (event) => event.stopPropagation());
  return wrapper;
}

export function findDocImageUploadPosition(state: EditorState, id: string): number | undefined {
  return docImageUploadKey.getState(state)?.find(undefined, undefined, (spec) => spec.id === id)[0]?.from;
}

/** Decorations move with transactions and never enter HTML, history, or user text. */
export function mapDocImageUploads(tr: Transaction, previous: DecorationSet): DecorationSet {
  let next = previous.map(tr.mapping, tr.doc);
  const meta = tr.getMeta(docImageUploadKey) as DocImageUploadMeta | undefined;
  if (!meta) return next;
  if (meta.clear) return DecorationSet.empty;
  if (meta.remove) next = next.remove(next.find(undefined, undefined, (spec) => spec.id === meta.remove));
  if (meta.add) {
    const { pos, widget } = meta.add;
    next = next.add(tr.doc, [Decoration.widget(pos, () => uploadWidget(widget), {
      id: widget.id, key: `${widget.id}:${widget.revision}`, side: -1, ignoreSelection: true,
      stopEvent: () => true,
    })]);
  }
  return next;
}
