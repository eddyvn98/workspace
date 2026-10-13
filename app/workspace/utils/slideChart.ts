import type { DOMOutputSpec } from "@tiptap/pm/model";
export interface SlideChartValue { label: string; value: number }
export function parseSlideChart(input: unknown): SlideChartValue[] {
  try {
    const data = typeof input === "string" ? JSON.parse(input) : input;
    if (!Array.isArray(data) || !data.length || data.length > 8) return [];
    if (data.some((item) => !item || typeof item.label !== "string" || typeof item.value !== "number" || !Number.isFinite(item.value) || item.value < 0)) return [];
    return data.map(({ label, value }) => ({ label, value }));
  } catch { return []; }
}
export function slideChartSpec(series: SlideChartValue[]): DOMOutputSpec {
  const maximum = Math.max(0, ...series.map((item) => item.value)) || 1;
  return ["div", { "data-slide-chart": "bar", "data-series": JSON.stringify(series), role: "img", "aria-label": series.map((item) => `${item.label}: ${item.value}`).join(", ") },
    ["table", ["tbody", ...series.map((item): DOMOutputSpec => ["tr",
      ["th", ["p", item.label]], ["td", ["p", { style: `background-color:#2563eb;color:#ffffff;width:${item.value / maximum * 100}%;padding:8px` }, "\u00a0"]], ["td", ["p", String(item.value)]],
    ])]],
  ];
}
