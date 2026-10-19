import { encodeText } from '@/app/api/workspaces/[id]/agent/docHtmlParse';
import { isTableCellContent, tableCellContentToHtml } from '../components/table/tableCellContent';
import type { TableBlockPayload } from '../types/table';
import { safeDocColor } from './workspaceDocSafety';

const bounded = (value: unknown, fallback: number, maximum: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.min(maximum, value)) : fallback;

/** Static semantic table, including the active sheet's saved display values and supported cell styles. */
export function workspaceTableExportHtml(data: TableBlockPayload, attachmentHtml: (id: string) => string = () => '<p>Attachment unavailable.</p>'): string {
  const rows = Math.max(1, Number(data.rows) || data.cells?.length || 1);
  const cols = Math.max(1, Number(data.cols) || data.cells?.[0]?.length || 1);
  if (rows * cols > 20000) throw new Error('This embedded table is too large to export. Export its workbook separately.');
  const merges = new Map<string, { rowSpan: number; colSpan: number }>();
  const covered = new Set<string>();
  for (const merge of data.merges ?? []) {
    const rowSpan = Math.max(1, Math.min(rows - merge.row, merge.rowSpan));
    const colSpan = Math.max(1, Math.min(cols - merge.col, merge.colSpan));
    if (merge.row < 0 || merge.col < 0 || merge.row >= rows || merge.col >= cols) continue;
    merges.set(`${merge.row}:${merge.col}`, { rowSpan, colSpan });
    for (let r = 0; r < rowSpan; r++) for (let c = 0; c < colSpan; c++) if (r || c) covered.add(`${merge.row + r}:${merge.col + c}`);
  }
  const weights = Array.from({ length: cols }, (_, c) => bounded(data.columnWidths?.[c] ?? data.colWeights?.[c], 1, 10000));
  const sum = weights.reduce((a, b) => a + b, 0);
  const columns = weights.map((weight) => `<col style="width:${(weight / sum * 100).toFixed(3)}%">`).join('');
  const body = Array.from({ length: rows }, (_, row) => {
    const cells = Array.from({ length: cols }, (_, col) => {
      const key = `${row}:${col}`;
      if (covered.has(key)) return '';
      const header = data.headerRow && row === 0 || data.headerCol && col === 0;
      const tag = header ? 'th' : 'td', merge = merges.get(key);
      const style: string[] = [];
      const align = data.cellAlign?.[row]?.[col];
      if (align && ['left', 'center', 'right'].includes(align)) style.push(`text-align:${align}`);
      const bg = data.cellBgColor?.[row]?.[col], color = data.cellTextColor?.[row]?.[col];
      if (bg && safeDocColor(bg)) style.push(`background-color:${bg}`);
      if (color && safeDocColor(color)) style.push(`color:${color}`);
      if (data.cellFontSizes?.[row]?.[col]) style.push(`font-size:${bounded(data.cellFontSizes[row][col], 14, 144)}px`);
      const rich = data.cellContents?.[row]?.[col];
      const content = isTableCellContent(rich) ? tableCellContentToHtml(rich) : encodeText(String(data.cells?.[row]?.[col] ?? '')).replace(/\n/g, '<br>');
      const attachments = (data.cellItems?.[key] ?? []).map((item) => `<div class="workspace-doc-attachment">${attachmentHtml(item.blockId)}</div>`).join('');
      return `<${tag}${merge ? ` rowspan="${merge.rowSpan}" colspan="${merge.colSpan}"` : ''}${style.length ? ` style="${style.join(';')}"` : ''}>${content || '<br>'}${attachments}</${tag}>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<table><colgroup>${columns}</colgroup><tbody>${body}</tbody></table>`;
}
