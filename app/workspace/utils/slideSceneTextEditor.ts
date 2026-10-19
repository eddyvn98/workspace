"use client";
import { Schema, type Mark, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, Plugin, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";
import { baseKeymap } from "@tiptap/pm/commands";
import { keymap } from "@tiptap/pm/keymap";
import { history, undo, redo } from "@tiptap/pm/history";
import { resolvedSceneTextStyle, sceneParagraphLabels, type SceneRichText, type SceneTextDefaults, type SceneTextParagraph, type SceneTextStyle } from "../types/slideSceneText";
import { sceneTextToEditor, sceneTextFromEditor, SCENE_TEXT_STYLE_MARK } from "./slideSceneTextCodec";
export interface SceneTextEditorState { style: Required<SceneTextStyle>; paragraph: Omit<SceneTextParagraph, "runs">; }
export interface SceneTextEditorController {
  style(patch: SceneTextStyle): void;
  paragraph(patch: Partial<Omit<SceneTextParagraph, "runs">>): void;
  toggle(key: "bold" | "italic" | "underline" | "strike"): void;
  value(): SceneRichText | undefined;
  undo(): void; redo(): void; focus(): void; destroy(): void;
}
const styleKeys = ["bold", "italic", "underline", "strike", "color", "fontSize", "fontFamily", "opacity"] as const;
const paragraphKeys = ["align", "lineHeight", "spaceBefore", "spaceAfter", "bullet", "level", "start"] as const;
function cssStyle(style: Required<SceneTextStyle>, baseSize: number): string {
  return `font-weight:${style.bold ? "bold" : "normal"};font-style:${style.italic ? "italic" : "normal"};` +
    `text-decoration:${[style.underline ? "underline" : "", style.strike ? "line-through" : ""].filter(Boolean).join(" ") || "none"};` +
    `color:${style.color};font-size:${style.fontSize / baseSize}em;font-family:${style.fontFamily};opacity:${style.opacity}`;
}
/** Uses the ProseMirror packages already provided by Tiptap; no browser execCommand or raw HTML persistence. */
export function createSceneTextEditor(host: HTMLElement, rich: SceneRichText, defaults: SceneTextDefaults, events: {
  onState(state: SceneTextEditorState): void; onError(message: string): void; apply(): void; cancel(): void;
}): SceneTextEditorController {
  const base = resolvedSceneTextStyle(defaults), attrs = Object.fromEntries(styleKeys.map(key => [key, { default: null }]));
  const paragraphAttrs = Object.fromEntries(paragraphKeys.map(key => [key, { default: null }]));
  const schema = new Schema({ nodes: {
    doc: { content: "paragraph+" }, text: { group: "inline" },
    paragraph: { group: "block", content: "inline*", attrs: paragraphAttrs, parseDOM: [{ tag: "p" }], toDOM(node) {
      const p = node.attrs, bullet = p.bullet && p.bullet !== "none";
      return ["p", { "data-scene-paragraph": "true", style: `position:relative;white-space:pre-wrap;overflow-wrap:anywhere;min-height:1em;` +
        `text-align:${p.align ?? defaults.align ?? "left"};line-height:${p.lineHeight ?? 1.12};` +
        `margin:${(p.spaceBefore ?? 0) / base.fontSize}em 0 ${(p.spaceAfter ?? 0) / base.fontSize}em;` +
        `padding-left:${bullet ? (p.level ?? 0) * 1.2 + 1.2 : 0}em;--bullet-left:${(p.level ?? 0) * 1.2}em` }, 0];
    } },
    hard_break: { inline: true, group: "inline", selectable: false, parseDOM: [{ tag: "br" }], toDOM: () => ["br"] },
  }, marks: {
    [SCENE_TEXT_STYLE_MARK]: { attrs, toDOM(mark) {
      const style = { ...base }; for (const key of styleKeys) if (mark.attrs[key] != null) Object.assign(style, { [key]: mark.attrs[key] });
      return ["span", { "data-slide-run": "true", style: cssStyle(style, base.fontSize) }, 0];
    } },
  } });
  const styleType = schema.marks[SCENE_TEXT_STYLE_MARK]; let view: EditorView;
  const mergedStyle = (marks: readonly Mark[]): Required<SceneTextStyle> => {
    const raw = marks.find(mark => mark.type === styleType)?.attrs ?? {}, output = { ...base };
    for (const key of styleKeys) if (raw[key] != null) Object.assign(output, { [key]: raw[key] });
    return output;
  };
  const stateStyle = () => mergedStyle(view.state.storedMarks ?? view.state.selection.$from.marks());
  const inform = () => {
    events.onState({ style: stateStyle(), paragraph: { ...view.state.selection.$from.parent.attrs } });
  };
  const format = (patch: SceneTextStyle): boolean => {
    const { state } = view, { from, to, empty } = state.selection, tr = state.tr;
    if (empty) tr.setStoredMarks([styleType.create({ ...stateStyle(), ...patch })]);
    else state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText && node.type !== schema.nodes.hard_break) return;
      tr.addMark(Math.max(from, pos), Math.min(to, pos + node.nodeSize), styleType.create({ ...mergedStyle(node.marks), ...patch }));
    });
    view.dispatch(tr); view.focus(); return true;
  };
  const toggle = (key: "bold" | "italic" | "underline" | "strike") => format({ [key]: !stateStyle()[key] });
  const defaultMarks = new Plugin({ appendTransaction(transactions, _before, state) {
    if (!transactions.some(tr => tr.docChanged)) return null;
    const tr = state.tr;
    state.doc.descendants((node, pos) => {
      if ((node.isText || node.type === schema.nodes.hard_break) && !styleType.isInSet(node.marks)) tr.addMark(pos, pos + node.nodeSize, styleType.create(base));
    });
    return tr.docChanged ? tr : null;
  } });
  const labels = new Plugin({ props: { decorations(state) {
    const value = sceneTextFromEditor(state.doc.toJSON(), defaults); if (!value) return null;
    const labelText = sceneParagraphLabels(value), decorations: Decoration[] = []; let index = 0;
    state.doc.forEach((node, offset) => {
      if (labelText[index]) decorations.push(Decoration.node(offset, offset + node.nodeSize, { "data-scene-label": labelText[index] }));
      index++;
    });
    return DecorationSet.create(state.doc, decorations);
  } } });
  const commands = keymap({
    "Mod-z": undo, "Mod-y": redo, "Shift-Mod-z": redo,
    "Mod-b": () => toggle("bold"), "Mod-i": () => toggle("italic"), "Mod-u": () => toggle("underline"),
    "Mod-Enter": () => { events.apply(); return true; }, "Escape": () => { events.cancel(); return true; },
    "Shift-Enter": (state, dispatch) => { dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView()); return true; },
  });
  view = new EditorView(host, {
    state: EditorState.create({ schema, doc: schema.nodeFromJSON(sceneTextToEditor(rich, defaults)), plugins: [history(), commands, keymap(baseKeymap), defaultMarks, labels] }),
    attributes: { role: "textbox", "aria-label": "Rich slide text", "aria-multiline": "true", "data-scene-rich-editor": "true" },
    dispatchTransaction(tr) {
      const next = view.state.applyTransaction(tr).state;
      if (tr.docChanged && !sceneTextFromEditor(next.doc.toJSON(), defaults)) { events.onError("Text exceeds the supported size or formatting limits; this edit was not applied."); return; }
      view.updateState(next); events.onError(""); inform();
    },
    handlePaste(_view, event) {
      const text = event.clipboardData?.getData("text/plain"); if (text === undefined) return false;
      event.preventDefault();
      if (text.length > 10000) { events.onError("Pasted text exceeds 10,000 characters."); return true; }
      view.dispatch(view.state.tr.insertText(text.replace(/\r\n?/g, "\n"))); return true;
    },
  });
  const initial = TextSelection.atEnd(view.state.doc); view.dispatch(view.state.tr.setSelection(initial).setStoredMarks([styleType.create(base)]));
  return {
    style: patch => { format(patch); }, toggle: key => { toggle(key); },
    paragraph: patch => {
      const { state } = view, { from, to } = state.selection, tr = state.tr;
      state.doc.forEach((node: ProseMirrorNode, offset: number) => {
        if (offset < to && offset + node.nodeSize > from) tr.setNodeMarkup(offset, undefined, { ...node.attrs, ...patch });
      });
      view.dispatch(tr); view.focus();
    },
    value: () => sceneTextFromEditor(view.state.doc.toJSON(), defaults),
    undo: () => { undo(view.state, view.dispatch); view.focus(); }, redo: () => { redo(view.state, view.dispatch); view.focus(); },
    focus: () => view.focus(), destroy: () => view.destroy(),
  };
}
