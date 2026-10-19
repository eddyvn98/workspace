"use client";
import React, { useEffect, useRef, useState } from "react";
import type { SlideSceneObject } from "../../types/slideScene";

type Props = {
  object: SlideSceneObject;
  onCommit: (text: string) => void;
  onCancel: () => void;
};

/** Commit a complete text editing session as one undoable scene change. */
export function SlideSceneInlineText({ object, onCommit, onCancel }: Props) {
  const [draft, setDraft] = useState(object.text ?? "");
  const input = useRef<HTMLTextAreaElement>(null);
  const finished = useRef(false);
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
    input.current?.select();
  }, []);
  const complete = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (save) onCommit(draft.slice(0, 10000));
    else onCancel();
  };
  return <textarea
    ref={input}
    data-slide-inline-editor
    aria-label="Edit slide text"
    value={draft}
    maxLength={10000}
    spellCheck
    onChange={event => setDraft(event.target.value)}
    onPointerDown={event => event.stopPropagation()}
    onClick={event => event.stopPropagation()}
    onDoubleClick={event => event.stopPropagation()}
    onBlur={() => complete(true)}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); complete(false); }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault(); complete(true);
      }
    }}
    style={{
      display: "block", width: "100%", height: "100%", padding: 0, margin: 0, border: "1px solid #6366f1",
      borderRadius: 0, outline: "none", resize: "none", background: "transparent",
      color: object.color, fontFamily: object.fontFamily || "Arial", fontWeight: object.fontWeight || "normal",
      fontSize: "inherit", lineHeight: 1.12, textAlign: object.align || "left",
      overflowWrap: "anywhere", whiteSpace: "pre-wrap",
    }}
  />;
}
