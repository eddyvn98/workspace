import { normalizeSlideScene } from "@/app/workspace/types/slideScene";
import { inspectSlideScene } from "@/app/workspace/utils/slideSceneInspect";
import { composeSlideScene, SLIDE_SCENE_STYLES, type SceneComposition, type SceneDesignStyle } from "@/app/workspace/utils/slideSceneCompositions";
import { SLIDE_ANIMATIONS, SLIDE_TRANSITIONS, validSlideMotion } from "@/app/workspace/utils/slideMotion";
import { sanitizeAgentHtml } from "./agentHtmlSanitize";
import { slideHtmlLayoutProblem } from "./slideHtmlContract";
import { buildSlideLayoutHtml, parseSlideLayout, safeSlideImageUrl, SLIDE_LAYOUTS } from "./slideLayouts";
import { findPlaceholder, layoutContentProblem, layoutParamsFrom } from "./slideLayoutInput";
import { parseBoolean, parseColor, parseStatus } from "./slideValidation";
import type { JsonMap } from "./operationsTables";

export interface ActionOutcome {
  ids?: string[];
  reason?: string;
  summary?: string;
  notes?: string[];
}

function record(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}

export function param(raw: JsonMap, key: string): unknown {
  return raw[key] ?? record(raw.params)[key];
}

export type SlideFields = { ok: true; set: JsonMap; clear: string[]; notes: string[] } | { ok: false; reason: string };

/** Validates every slide field the caller supplied. One bad field rejects the
 *  whole action with a reason, instead of saving half of it silently. */
export function parseSlideFields(raw: JsonMap, options: { allowLayout: boolean; strict?: boolean; requireImage?: boolean }): SlideFields {
  const set: JsonMap = {};
  const clear: string[] = [];
  const notes: string[] = [];
  const name = param(raw, "name");
  if (name !== undefined) set.name = String(name);
  const notesText = param(raw, "presenterNotes") ?? param(raw, "notes");
  if (notesText !== undefined) set.presenterNotes = String(notesText);
  if (options.strict) {
    const placeholder = findPlaceholder([String(notesText ?? ""), String(name ?? ""), typeof param(raw, "html") === "string" ? String(param(raw, "html")) : ""]);
    if (placeholder) return { ok: false, reason: `contains the placeholder "${placeholder}". Write the real content or leave the field out.` };
  }
  for (const [key, parse] of [
    ["status", (input: unknown) => parseStatus(input)],
    ["backgroundColor", (input: unknown) => parseColor(input, "backgroundColor")],
    ["hidden", (input: unknown) => parseBoolean(input, "hidden")],
  ] as const) {
    const input = param(raw, key);
    if (input === undefined) continue;
    const parsed = parse(input);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    if (parsed.value === undefined || parsed.value === false) clear.push(key);
    else set[key] = parsed.value;
  }
  for (const [key, choices] of [["transition", SLIDE_TRANSITIONS], ["animation", SLIDE_ANIMATIONS]] as const) {
    const input = param(raw, key);
    if (input === undefined) continue;
    if (!validSlideMotion(input, choices)) return { ok: false, reason: `${key} must be one of ${choices.join(", ")}.` };
    set[key] = input;
  }
  const composition = param(raw,"composition");
  const designStyle = param(raw,"designStyle");
  if (composition !== undefined) {
    if (!["hero","split","metric","statement","columns"].includes(String(composition))) return {ok:false,reason:"Invalid composition; use hero, split, metric, statement or columns."};
    const selectedStyle = String(designStyle ?? "editorial");
    if (!Object.hasOwn(SLIDE_SCENE_STYLES,selectedStyle)) return {ok:false,reason:"Invalid designStyle; use editorial, technology, minimal or playful."};
    set.scene = composeSlideScene({title:String(param(raw,"title") ?? ""),subtitle:String(param(raw,"subtitle")??""),bullets:Array.isArray(param(raw,"bullets"))?param(raw,"bullets") as string[]:[],imageUrl:String(param(raw,"imageUrl")??""),metric:String(param(raw,"metric")??""),metricLabel:String(param(raw,"metricLabel")??"")},selectedStyle as SceneDesignStyle,composition as SceneComposition);
    set.backgroundColor = SLIDE_SCENE_STYLES[selectedStyle as SceneDesignStyle].background;
    notes.push("Generated editable Scene V2 composition with consistent design tokens.");
    notes.push(...inspectSlideScene(set.scene as NonNullable<ReturnType<typeof normalizeSlideScene>>,String(set.backgroundColor)).map(w=>`Scene warning [${w.code}] on ${w.objectId}: ${w.message}`));
  }
  const sceneInput = param(raw, "scene");
  if (sceneInput !== undefined && composition !== undefined) return {ok:false,reason:"Give either scene or composition, not both."};
  if (sceneInput !== undefined) {
    const scene = normalizeSlideScene(sceneInput, param(raw,"aspectRatio") === "4:3" ? "4:3" : "16:9");
    if (!scene) return { ok: false, reason: "Invalid Scene V2. Provide an objects array (max 120) containing text, shape or image objects with safe dimensions." };
    set.scene = scene;
    notes.push(...inspectSlideScene(scene,typeof set.backgroundColor==="string"?set.backgroundColor:"#FFFFFF").map(w=>`Scene warning [${w.code}] on ${w.objectId}: ${w.message}`));
  }
  const html = param(raw, "html");
  const layoutInput = options.allowLayout ? param(raw, "layout") : undefined;
  if (html !== undefined) {
    const problem = slideHtmlLayoutProblem(String(html));
    if (problem) return { ok: false, reason: problem };
    set.html = sanitizeAgentHtml(String(html), { allowStyle: true });
    if (layoutInput !== undefined) notes.push("Both html and layout were given; html was used and layout ignored.");
  } else if (layoutInput !== undefined) {
    const layout = parseSlideLayout(layoutInput);
    if (!layout) return { ok: false, reason: `Unknown layout "${String(layoutInput)}". Use one of: ${SLIDE_LAYOUTS.join(", ")}.` };
    const params = layoutParamsFrom((key) => param(raw, key));
    if (layout === "image-caption" && options.requireImage && !safeSlideImageUrl(params.imageUrl)) {
      return { ok: false, reason: "image-caption update needs a valid http(s) or site-relative imageUrl. Read the existing slide images or full HTML first; the slide was left unchanged." };
    }
    const title = params.title;
    const problem = layoutContentProblem(layout, params, options.strict === true);
    if (problem) return { ok: false, reason: problem };
    const layoutHtml = buildSlideLayoutHtml(layout, params);
    set.html = sanitizeAgentHtml(layoutHtml, { allowStyle: true });
    if (set.name === undefined && title !== undefined && String(title).trim()) set.name = String(title).trim().slice(0, 80);
    if (layout === "image-caption" && !/<img\b/.test(String(set.html))) notes.push("image-caption layout needs a valid http(s) or site-relative imageUrl; no image was added.");
  }
  return { ok: true, set, clear, notes };
}
