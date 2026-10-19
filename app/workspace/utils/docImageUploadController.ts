import type { Editor } from "@tiptap/react";
import { toast } from "sonner";
import { docImageFileError, safeDocImageUrl } from "./docImageAttributes";
import { uploadWorkspaceImageWithOriginal } from "./imageUpload";
import { docImageUploadKey, findDocImageUploadPosition, type DocImageUploadMeta } from "./docImageUploadState";

export interface DocImageUploadOptions {
  upload?: (file: File, signal: AbortSignal) => Promise<{ url: string; downloadUrl: string } | null>;
  onError?: (message: string) => void;
}
interface UploadJob { id: string; file: File; abort: AbortController; revision: number; error?: string }

export class DocImageUploadController {
  private jobs = new Map<string, UploadJob>();
  private disposed = false;
  constructor(private editor: Editor, private options: DocImageUploadOptions) {}

  get pending(): boolean { return this.jobs.size > 0; }
  private canEdit(): boolean { return !this.disposed && !this.editor.isDestroyed && this.editor.isEditable; }
  private report(message: string) { (this.options.onError ?? toast.error)(message); }
  private dispatch(meta: DocImageUploadMeta) {
    if (!this.disposed && !this.editor.isDestroyed) {
      this.editor.view.dispatch(this.editor.state.tr.setMeta(docImageUploadKey, meta).setMeta("addToHistory", false));
    }
  }
  private refresh(job: UploadJob, pos = findDocImageUploadPosition(this.editor.state, job.id)) {
    if (pos === undefined) return;
    this.dispatch({ remove: job.id, add: { pos, widget: {
      id: job.id, revision: job.revision, filename: job.file.name, error: job.error,
      retry: () => this.retry(job.id), cancel: () => this.cancel(job.id),
    } } });
  }

  start(file: File, pos = this.editor.state.selection.from): boolean {
    if (!this.canEdit() || !this.editor.state.schema.nodes.image) return false;
    const error = docImageFileError(file);
    if (error) { this.report(error); return false; }
    if (!Number.isInteger(pos) || pos < 0 || pos > this.editor.state.doc.content.size) return false;
    const job: UploadJob = { id: crypto.randomUUID(), file, abort: new AbortController(), revision: 0 };
    this.jobs.set(job.id, job);
    this.refresh(job, pos);
    void this.run(job);
    return true;
  }

  private async run(job: UploadJob) {
    const abort = job.abort;
    try {
      const upload = this.options.upload ?? ((file, signal) => uploadWorkspaceImageWithOriginal(file, { signal }));
      const result = await upload(job.file, abort.signal);
      if (abort.signal.aborted || this.jobs.get(job.id) !== job || this.disposed || this.editor.isDestroyed) return;
      if (!this.canEdit()) { this.cancel(job.id); return; }
      const pos = findDocImageUploadPosition(this.editor.state, job.id);
      if (pos === undefined) { this.cancel(job.id); return; }
      const src = safeDocImageUrl(result?.url);
      const downloadUrl = safeDocImageUrl(result?.downloadUrl);
      if (!src || !downloadUrl) throw new Error("Upload failed. Try again.");
      // Insert at the current mapped anchor. Never delete a remembered range:
      // typing or remote transactions may have inserted real text there.
      const inserted = this.editor.chain().insertContentAt(pos, {
        type: "image", attrs: { src, downloadUrl, alt: job.file.name },
      }, { updateSelection: false }).command(({ tr }) => {
        tr.setMeta(docImageUploadKey, { remove: job.id });
        return true;
      }).run();
      if (!inserted) throw new Error("The image could not be inserted here.");
      this.jobs.delete(job.id);
    } catch (error) {
      if (abort.signal.aborted || !this.canEdit() || this.jobs.get(job.id) !== job) return;
      job.error = error instanceof Error ? error.message : "Upload failed. Try again.";
      job.revision++;
      this.refresh(job);
      this.report(job.error);
    }
  }

  retry(id: string) {
    const job = this.jobs.get(id);
    if (!job || !job.error || !this.canEdit()) return;
    job.abort.abort();
    job.abort = new AbortController();
    job.error = undefined;
    job.revision++;
    this.refresh(job);
    void this.run(job);
  }
  cancel(id: string) {
    this.jobs.get(id)?.abort.abort();
    this.jobs.delete(id);
    this.dispatch({ remove: id });
  }
  cancelAll() {
    for (const job of this.jobs.values()) job.abort.abort();
    this.jobs.clear();
    this.dispatch({ clear: true });
  }
  /** Called after transactions; deleting a placeholder cancels its network work. */
  prune() {
    if (this.disposed || this.editor.isDestroyed) return;
    for (const [id, job] of this.jobs) {
      if (!this.editor.isEditable || findDocImageUploadPosition(this.editor.state, id) === undefined) {
        job.abort.abort();
        this.jobs.delete(id);
      }
    }
    if (!this.editor.isEditable && docImageUploadKey.getState(this.editor.state)?.find().length) queueMicrotask(() => {
      if (!this.disposed && !this.editor.isDestroyed && !this.editor.isEditable) this.dispatch({ clear: true });
    });
  }
  dispose() {
    this.disposed = true;
    for (const job of this.jobs.values()) job.abort.abort();
    this.jobs.clear();
  }
}
