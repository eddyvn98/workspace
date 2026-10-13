export type WorkspaceTextDataStylePatch = Record<string, string | number | boolean>;
const TEXT_STYLE_KEYS = ["fontSize", "padding", "textPadding", "fontWeight", "fontStyle", "fontUnderline", "fontStrikethrough", "bold", "italic", "underline", "textStyle", "align", "fontAlign", "verticalAlign"];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Normalizes text-only fields that live in block.data rather than block.style. */
export function normalizeWorkspaceTextDataStyle(raw: unknown): WorkspaceTextDataStylePatch {
  const source = record(raw);
  const patch: WorkspaceTextDataStylePatch = {};
  const fontSize = finite(source.fontSize);
  const padding = finite(source.padding ?? source.textPadding);
  if (fontSize !== undefined) patch.fontSize = Math.min(96, Math.max(8, fontSize));
  if (padding !== undefined) patch.padding = Math.min(100, Math.max(0, padding));
  if (source.fontWeight === "normal" || source.fontWeight === "bold" || finite(source.fontWeight) !== undefined) patch.fontWeight = source.fontWeight as string | number;
  else if (typeof source.bold === "boolean") patch.fontWeight = source.bold ? "bold" : "normal";
  if (source.fontStyle === "normal" || source.fontStyle === "italic") patch.fontStyle = source.fontStyle;
  else if (typeof source.italic === "boolean") patch.fontStyle = source.italic ? "italic" : "normal";
  if (typeof source.fontUnderline === "boolean") patch.fontUnderline = source.fontUnderline;
  else if (typeof source.underline === "boolean") patch.fontUnderline = source.underline;
  if (typeof source.fontStrikethrough === "boolean") patch.fontStrikethrough = source.fontStrikethrough;
  const textStyle = source.textStyle;
  if (textStyle === "plain" || textStyle === "bullet" || textStyle === "numbered" || textStyle === "quote") patch.textStyle = textStyle;
  const align = source.align ?? source.fontAlign;
  if (align === "left" || align === "center" || align === "right") patch.align = align;
  if (source.verticalAlign === "top" || source.verticalAlign === "middle" || source.verticalAlign === "bottom") patch.verticalAlign = source.verticalAlign;
  return patch;
}

export function normalizeWorkspaceVisualStyle(raw: unknown): Record<string, unknown> {
  const source = record(raw);
  return Object.fromEntries(Object.entries(source).filter(([key]) => !TEXT_STYLE_KEYS.includes(key)));
}
