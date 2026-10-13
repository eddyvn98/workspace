import { PROCESS_MAX, PROCESS_MIN, STATS_MAX, STATS_MIN, statItems, stringList, type SlideLayout, type SlideLayoutParams } from "./slideLayouts";
import type { JsonMap } from "./operationsTables";

import { slideDataProblem } from "./slideDataLayouts";

const text = (value: unknown): string | undefined => (value === undefined || value === null ? undefined : String(value));

/** Reads every layout field from a flat action item (or its `params`). */
export function layoutParamsFrom(read: (key: string) => unknown): SlideLayoutParams {
  return {
    title: text(read("heading") ?? read("title")),
    subtitle: text(read("subtitle")),
    bullets: stringList(read("bullets")),
    left: stringList(read("left")),
    right: stringList(read("right")),
    imageUrl: text(read("imageUrl")),
    caption: text(read("caption")),
    items: statItems(read("items")),
    steps: stringList(read("steps")),
    leftTitle: text(read("leftTitle")),
    rightTitle: text(read("rightTitle")),
    text: text(read("text")),
    author: text(read("author")),
    columns: Array.isArray(read("columns")) ? (read("columns") as unknown[]).map(String) : undefined,
    rows: Array.isArray(read("rows")) ? (read("rows") as unknown[]).map((row) => Array.isArray(row) ? row.map(String) : []) : undefined,
    series: Array.isArray(read("series")) ? (read("series") as unknown[]).map((item) => {
      const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return { label: String(value.label ?? ""), value: typeof value.value === "number" ? value.value : NaN };
    }) : undefined,
  };
}

/**
 * Obvious unfilled placeholders only: [Company name], [insert figure], [Q3 revenue], $XX, XX%, TBD, lorem ipsum.
 * Ordinary text such as "insert a card", "Chapter XX", "arr[i]", "[x] done", "[sic]" or "[Smith 2020]" must pass.
 */
const BRACKET_PLACEHOLDER = /(?<![\w\])])\[(?:insert|add|enter|your|company|client|customer|project|product|name|date|number|value|figure|amount|metric|percent|todo|tbd)\b[^\]\n]*\]|(?<![\w\])])\[Q[1-4]\s[^\]\n]*\]|\[X{2,}\]/i;
const OTHER_PLACEHOLDER = /lorem ipsum|\bTBD\b|\bX{2,}%|[$€£]X+\b/;

export function findPlaceholder(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const match = value ? BRACKET_PLACEHOLDER.exec(value) ?? OTHER_PLACEHOLDER.exec(value) : null;
    if (match) return match[0];
  }
  return undefined;
}

/** Layout-specific content rules; returns a reason, or undefined when the content is usable. */
export function layoutContentProblem(layout: SlideLayout, params: SlideLayoutParams, strict: boolean): string | undefined {
  const dataProblem = slideDataProblem(layout, params);
  if (dataProblem) return dataProblem;
  const count = (value: unknown[] | undefined) => value?.length ?? 0;
  if (layout === "stats" && (count(params.items) < STATS_MIN || count(params.items) > STATS_MAX)) return `layout "stats" needs ${STATS_MIN}-${STATS_MAX} items [{value,label}] (got ${count(params.items)}).`;
  if (layout === "process" && (count(params.steps) < PROCESS_MIN || count(params.steps) > PROCESS_MAX)) return `layout "process" needs ${PROCESS_MIN}-${PROCESS_MAX} steps (got ${count(params.steps)}).`;
  if (layout === "quote" && !params.text?.trim()) return 'layout "quote" needs text (the quotation) and optionally author.';
  if (layout === "agenda" && !count(params.bullets)) return 'layout "agenda" needs bullets (the agenda items).';
  if (layout === "comparison" && !(count(params.left) || count(params.right))) return 'layout "comparison" needs left[] and right[] lines (plus leftTitle and rightTitle).';
  if (!strict) return undefined;
  const everything = [
    params.title, params.subtitle, params.caption, params.leftTitle, params.rightTitle, params.text, params.author,
    ...(params.bullets ?? []), ...(params.left ?? []), ...(params.right ?? []), ...(params.steps ?? []),
    ...(params.columns ?? []), ...(params.rows ?? []).flat(), ...(params.series ?? []).map((item) => item.label),
    ...(params.items ?? []).flatMap((item) => [item.value, item.label]),
  ];
  const placeholder = findPlaceholder(everything);
  return placeholder ? `contains the placeholder "${placeholder}". Write the real content from the user's request or source text, or leave the field out.` : undefined;
}

export type { JsonMap };
