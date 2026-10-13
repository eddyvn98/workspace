"use client";
import { useEffect } from "react";
import type { Editor } from "@tiptap/react";

/** React node views may call flushSync: dispatch editor changes after the React effect has returned. */
export function useDocEditorSynchronization(
  editor: Editor | null, html: string, isEditing: boolean,
  lastEmitted: { current: string }, publish: (editor: Editor) => void,
) {
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || !editor || editor.isDestroyed) return;
      if (editor.isEditable !== isEditing) editor.setEditable(isEditing);
      if (isEditing) { editor.commands.focus("end", { scrollIntoView: false }); publish(editor); }
    });
    return () => { cancelled = true; };
  }, [editor, isEditing, publish]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || !editor || editor.isDestroyed || html === lastEmitted.current) return;
      if (editor.getHTML() !== html) editor.commands.setContent(html || "", { emitUpdate: false });
      lastEmitted.current = html;
    });
    return () => { cancelled = true; };
  }, [editor, html, lastEmitted]);
}
