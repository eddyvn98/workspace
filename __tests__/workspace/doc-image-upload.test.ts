// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Slice } from "@tiptap/pm/model";
import { DocImageSchema } from "@/app/workspace/extensions/docImageSchema";
import { createDocImageUpload, uploadDocImage, cancelDocImageUploads, hasPendingDocImageUploads } from "@/app/workspace/extensions/docImageUpload";
import { docImageUploadKey } from "@/app/workspace/utils/docImageUploadState";

type Result = { url: string; downloadUrl: string } | null;
const saved = { url: "/api/workspace-images/display", downloadUrl: "/api/workspace-images/original" };
const file = () => new File(["image bytes"], "photo.png", { type: "image/png" });
const editors: Editor[] = [];
afterEach(() => { editors.forEach((editor) => { if (!editor.isDestroyed) editor.destroy(); }); editors.length = 0; });
function deferred() { let resolve!: (value: Result) => void; return { promise: new Promise<Result>((done) => { resolve = done; }), resolve }; }
function makeEditor(upload: (file: File, signal: AbortSignal) => Promise<Result>) {
  const editor = new Editor({ extensions: [StarterKit, DocImageSchema, createDocImageUpload({ upload, onError: vi.fn() })], content: "<p>Alpha beta gamma</p>" });
  editors.push(editor); return editor;
}
function images(editor: Editor) { const result: unknown[] = []; editor.state.doc.descendants((node) => { if (node.type.name === "image") result.push(node.attrs); }); return result; }

describe("document image uploads", () => {
  it("maps the insertion anchor while typing and preserves selected text", async () => {
    const pending = deferred();
    const editor = makeEditor(() => pending.promise);
    editor.commands.setTextSelection({ from: 7, to: 11 });
    expect(uploadDocImage(editor, file())).toBe(true);
    expect(editor.getText()).toBe("Alpha beta gamma");
    expect(editor.getHTML()).not.toContain("Uploading");
    editor.commands.insertContentAt(1, "prefix ");
    const anchor = docImageUploadKey.getState(editor.state)!.find()[0].from;
    editor.commands.insertContentAt(anchor, "during ");
    pending.resolve(saved);
    await vi.waitFor(() => expect(images(editor)).toHaveLength(1));
    expect(editor.getText().replace(/\n/g, "")).toBe("prefix Alpha during beta gamma");
    expect(images(editor)[0]).toMatchObject({ src: saved.url, downloadUrl: saved.downloadUrl, alt: "photo.png" });
    expect(hasPendingDocImageUploads(editor)).toBe(false);
  });

  it("keeps a failed upload retryable at its mapped position", async () => {
    const upload = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(saved);
    const editor = makeEditor(upload);
    uploadDocImage(editor, file(), 7);
    await vi.waitFor(() => expect(editor.view.dom.querySelector('[role="alert"]')).not.toBeNull());
    editor.commands.insertContentAt(1, "kept ");
    const retry = Array.from(editor.view.dom.querySelectorAll("button")).find((button) => button.textContent === "Retry");
    expect(retry).toBeTruthy(); retry!.click();
    await vi.waitFor(() => expect(images(editor)).toHaveLength(1));
    expect(editor.getText().replace(/\n/g, "")).toBe("kept Alpha beta gamma");
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it.each(["cancel", "delete", "readonly", "destroy"])("ignores late upload results after %s", async (action) => {
    const pending = deferred(); let signal!: AbortSignal;
    const editor = makeEditor((_file, abort) => { signal = abort; return pending.promise; });
    uploadDocImage(editor, file(), 7);
    if (action === "cancel") cancelDocImageUploads(editor);
    if (action === "delete") editor.commands.deleteRange({ from: 1, to: 16 });
    if (action === "readonly") editor.setEditable(false);
    if (action === "destroy") editor.destroy();
    await Promise.resolve();
    expect(signal.aborted).toBe(true);
    pending.resolve(saved); await Promise.resolve(); await Promise.resolve();
    expect(images(editor)).toHaveLength(0);
    expect(hasPendingDocImageUploads(editor)).toBe(false);
  });

  it("handles pasted and dropped files through the same upload controller", async () => {
    const upload = vi.fn().mockResolvedValue(saved);
    const editor = makeEditor(upload);
    editor.commands.setTextSelection(4);
    const paste = { clipboardData: { files: [file()] }, preventDefault: vi.fn() } as unknown as ClipboardEvent;
    expect(editor.view.someProp("handlePaste", (handler) => handler(editor.view, paste, Slice.empty))).toBe(true);
    await vi.waitFor(() => expect(images(editor)).toHaveLength(1));
    expect(paste.preventDefault).toHaveBeenCalled();
    vi.spyOn(editor.view, "posAtCoords").mockReturnValue({ pos: editor.state.doc.content.size, inside: -1 });
    const drop = { dataTransfer: { files: [file()] }, clientX: 5, clientY: 10, preventDefault: vi.fn() } as unknown as DragEvent;
    expect(editor.view.someProp("handleDrop", (handler) => handler(editor.view, drop, Slice.empty, false))).toBe(true);
    await vi.waitFor(() => expect(images(editor)).toHaveLength(2));
    expect(editor.getText().replace(/\n/g, "")).toBe("Alpha beta gamma");
  });

  it("rejects invalid files and never starts uploads in a readonly editor", () => {
    const upload = vi.fn(); const editor = makeEditor(upload);
    expect(uploadDocImage(editor, new File(["text"], "text.txt", { type: "text/plain" }))).toBe(false);
    editor.setEditable(false);
    expect(uploadDocImage(editor, file())).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });
});
