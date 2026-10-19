"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { Editor, NodeViewProps } from "@tiptap/react";
import { docImageFileError, docImageWidth, safeDocImageUrl, type DocImageAlign } from "../utils/docImageAttributes";
import { uploadWorkspaceImageWithOriginal } from "../utils/imageUpload";

export function useDocImageEditable(editor: Editor): boolean {
  const [editable, setEditable] = useState(editor.isEditable);
  useEffect(() => {
    const update = () => setEditable(!editor.isDestroyed && editor.isEditable);
    update();
    editor.on("update", update).on("transaction", update).on("destroy", update);
    return () => { editor.off("update", update).off("transaction", update).off("destroy", update); };
  }, [editor]);
  return editable;
}

export function useDocImageReplacement(props: NodeViewProps, editable: boolean) {
  const latest = useRef(props);
  latest.current = props;
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState("");
  const cancel = () => { abortRef.current?.abort(); abortRef.current = null; fileRef.current = null; setStatus("idle"); setError(""); };
  useEffect(() => {
    // A remote replace invalidates an in-flight local replacement as well.
    setStatus("idle"); setError(""); fileRef.current = null;
    if (!editable) { abortRef.current?.abort(); abortRef.current = null; }
    return () => { abortRef.current?.abort(); abortRef.current = null; };
  }, [editable, props.node.attrs.src]);

  const replace = async (file: File) => {
    const current = latest.current;
    if (current.editor.isDestroyed || !current.editor.isEditable) return;
    const validation = docImageFileError(file);
    if (validation) { fileRef.current = null; setError(validation); setStatus("error"); return; }
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    fileRef.current = file;
    const originalSrc = current.node.attrs.src;
    setError(""); setStatus("uploading");
    try {
      const uploaded = await uploadWorkspaceImageWithOriginal(file, { signal: abort.signal });
      if (abort.signal.aborted || abortRef.current !== abort) return;
      const active = latest.current;
      if (active.editor.isDestroyed || !active.editor.isEditable) return;
      const pos = active.getPos();
      if (pos === undefined || active.editor.state.doc.nodeAt(pos)?.attrs.src !== originalSrc) return;
      const src = safeDocImageUrl(uploaded?.url), downloadUrl = safeDocImageUrl(uploaded?.downloadUrl);
      if (!src || !downloadUrl) throw new Error("Upload failed. Your current image is unchanged.");
      active.updateAttributes({ src, downloadUrl, alt: active.node.attrs.alt || file.name, height: null });
      setStatus("idle");
    } catch (failure) {
      if (!abort.signal.aborted && !latest.current.editor.isDestroyed) {
        setError(failure instanceof Error ? failure.message : "Upload failed. Try again.");
        setStatus("error");
      }
    }
  };
  return { status, error, replace, cancel, canRetry: Boolean(fileRef.current), retry: () => { if (fileRef.current) void replace(fileRef.current); } };
}

export function useDocImageResize({ editor, node, updateAttributes }: NodeViewProps, container: RefObject<HTMLDivElement>, align: DocImageAlign, editable: boolean) {
  const [draft, setDraft] = useState<string | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!editable) { cleanup.current?.(); cleanup.current = null; setDraft(null); }
    return () => { cleanup.current?.(); cleanup.current = null; };
  }, [editable, editor]);

  const start = (event: ReactPointerEvent<HTMLElement>) => {
    if (!editor.isEditable || editor.isDestroyed || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    cleanup.current?.();
    const width = container.current?.getBoundingClientRect().width;
    if (!width) return;
    const pointerId = event.pointerId, target = event.currentTarget, startX = event.clientX;
    const percent = Number.parseFloat(docImageWidth(node.attrs.width));
    let next = docImageWidth(percent);
    const factor = align === "center" ? 2 : align === "right" ? -1 : 1;
    try { target.setPointerCapture(pointerId); } catch { /* Window listeners remain available. */ }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointerId || editor.isDestroyed || !editor.isEditable) return;
      next = docImageWidth(percent + (e.clientX - startX) / width * 100 * factor);
      setDraft(next);
    };
    const finish = (commit: boolean) => {
      cleanup.current?.(); cleanup.current = null;
      if (commit && !editor.isDestroyed && editor.isEditable) updateAttributes({ width: next, height: null });
      setDraft(null);
    };
    const up = (e: PointerEvent) => { if (e.pointerId === pointerId) finish(true); };
    const cancel = () => finish(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    cleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      try { if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId); } catch { /* Detached node. */ }
    };
  };
  return { draft, start };
}
