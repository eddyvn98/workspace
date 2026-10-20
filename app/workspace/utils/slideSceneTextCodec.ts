import { normalizeSceneRichText, resolvedSceneTextStyle, type SceneRichText, type SceneTextDefaults, type SceneTextParagraph, type SceneTextRun, type SceneTextStyle } from "../types/slideSceneText";
export interface SceneEditorJson { type: string; attrs?: Record<string, unknown>; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: SceneEditorJson[]; }
export const SCENE_TEXT_STYLE_MARK = "sceneTextStyle";
const keys = ["bold", "italic", "underline", "strike", "color", "fontSize", "fontFamily", "opacity"] as const;
export function sceneTextToEditor(rich: SceneRichText, defaults: SceneTextDefaults): SceneEditorJson {
  return { type: "doc", content: rich.paragraphs.map(({ runs, ...attrs }) => ({
    type: "paragraph", attrs, content: runs.flatMap(run => {
      const marks = [{ type: SCENE_TEXT_STYLE_MARK, attrs: { ...resolvedSceneTextStyle(defaults, run) } }];
      const pieces = run.text.split("\n");
      return pieces.flatMap((text, index): SceneEditorJson[] => [...(index ? [{ type: "hard_break", marks }] : []), ...(text ? [{ type: "text", text, marks }] : [])]);
    }),
  })) };
}
export function sceneTextFromEditor(document: SceneEditorJson, defaults: SceneTextDefaults): SceneRichText | undefined {
  if (document.type !== "doc" || !Array.isArray(document.content)) return undefined;
  const base = resolvedSceneTextStyle(defaults), paragraphs: SceneTextParagraph[] = [];
  for (const node of document.content) {
    if (node.type !== "paragraph") return undefined;
    const runs: SceneTextRun[] = [];
    for (const inline of node.content ?? []) {
      if (inline.type !== "text" && inline.type !== "hard_break") return undefined;
      const raw = inline.marks?.find(mark => mark.type === SCENE_TEXT_STYLE_MARK)?.attrs ?? {};
      const style: Record<string, unknown> = {};
      for (const key of keys) if (raw[key] != null && raw[key] !== base[key]) style[key] = raw[key];
      const text = inline.type === "hard_break" ? "\n" : inline.text ?? "";
      runs.push({ text, ...style } as SceneTextRun);
    }
    paragraphs.push({ ...node.attrs, runs } as SceneTextParagraph);
  }
  return normalizeSceneRichText({ version: 1, paragraphs });
}
export const sceneTextStyleKeys: readonly (keyof SceneTextStyle)[] = keys;
