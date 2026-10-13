const escape = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export interface SlideDataParams {
  columns?: string[];
  rows?: string[][];
  series?: Array<{ label: string; value: number }>;
}

export function slideDataProblem(layout: string, params: SlideDataParams): string | undefined {
  if (layout === "data-table") {
    if (!params.columns?.length || params.columns.length > 8 || !params.rows?.length || params.rows.length > 12)
      return "data-table needs 1-8 columns and 1-12 rows; split larger tables across slides.";
    if (params.rows.some((row) => row.length !== params.columns!.length)) return "Every row must have one cell per column.";
  }
  if (layout === "bar-chart") {
    if (!params.series?.length || params.series.length > 8 || params.series.some((item) => !item.label.trim() || !Number.isFinite(item.value) || item.value < 0))
      return "bar-chart needs 1-8 series [{label,value}] with finite non-negative numbers.";
  }
}

export function buildSlideDataHtml(layout: string, title: string | undefined, params: SlideDataParams): string {
  const heading = title ? `<h2>${escape(title)}</h2>` : "";
  if (layout === "data-table") return heading + `<table><thead><tr>${params.columns?.map((column) => `<th><p>${escape(column)}</p></th>`).join("")}</tr></thead><tbody>${params.rows?.map((row) => `<tr>${row.map((cell) => `<td><p>${escape(cell)}</p></td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const maximum = Math.max(0, ...(params.series ?? []).map((item) => item.value)) || 1;
  return heading + `<div data-slide-chart="bar" data-series="${escape(JSON.stringify(params.series))}"><table><tbody>${params.series?.map((item) => `<tr><th><p>${escape(item.label)}</p></th><td><p style="background-color:#2563eb;color:#ffffff;width:${item.value / maximum * 100}%;padding:8px">&nbsp;</p></td><td><p>${escape(item.value)}</p></td></tr>`).join("")}</tbody></table></div>`;
}
