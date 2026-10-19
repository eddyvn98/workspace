import { encodeText } from '@/app/api/workspaces/[id]/agent/docHtmlParse';
import { parseSlideChart } from './slideChart';

/** Rebuild supported chart atoms from their validated series instead of relying on editor-only NodeViews. */
export function workspaceDocChartHtml(value: unknown): string {
  const series = parseSlideChart(value);
  if (!series.length) return '<p>Chart data unavailable.</p>';
  const maximum = Math.max(1, ...series.map((item) => item.value));
  const rows = series.map((item) => `<tr><th scope="row">${encodeText(item.label)}</th><td><div style="height:20px;background:#2563eb;width:${item.value / maximum * 100}%"></div></td><td>${item.value}</td></tr>`).join('');
  return `<table aria-label="Bar chart"><colgroup><col style="width:25%"><col style="width:60%"><col style="width:15%"></colgroup><tbody>${rows}</tbody></table>`;
}
