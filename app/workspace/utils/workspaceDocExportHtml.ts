import { sanitizeAgentHtml } from '@/app/api/workspaces/[id]/agent/agentHtmlSanitize';
import { attrValue, encodeText, parseHtml, walkNodes } from '@/app/api/workspaces/[id]/agent/docHtmlParse';
import type { TableBlockPayload } from '../types/table';
import { rewriteWorkspaceDocTables } from './workspaceDocReferences';
import { workspaceTableExportHtml } from './workspaceDocTableExport';
import { safeDocImageUrl } from './workspaceDocSafety';
import { workspaceDocAttachmentHtml } from './workspaceDocAttachmentExport';
import { workspaceDocChartHtml } from './workspaceDocChartExport';

export const WORKSPACE_DOC_EXPORT_CSS = `
.workspace-doc-export{box-sizing:border-box;color:#0f172a;background:#fff;font:16px/1.65 Arial,Helvetica,sans-serif;overflow-wrap:anywhere;padding:24px 28px}
.workspace-doc-export *{box-sizing:border-box}.workspace-doc-export p{margin:0 0 .7em}.workspace-doc-export h1{font-size:2em}.workspace-doc-export h2{font-size:1.5em}.workspace-doc-export h3{font-size:1.2em}
.workspace-doc-export h1,.workspace-doc-export h2,.workspace-doc-export h3{line-height:1.25;margin:.8em 0 .4em;break-after:avoid}
.workspace-doc-export ul,.workspace-doc-export ol{padding-left:1.6em}.workspace-doc-export li p{margin:.15em 0}.workspace-doc-export ul[data-type=taskList]{list-style:none;padding-left:1.4em}
.workspace-doc-export li[data-type=taskItem]{position:relative}.workspace-doc-export li[data-type=taskItem]:before{content:'☐';position:absolute;left:-1.3em}.workspace-doc-export li[data-checked=true]:before{content:'☑'}
.workspace-doc-export blockquote{border-left:3px solid #cbd5e1;margin:1em 0;padding-left:1em;color:#475569}.workspace-doc-export pre{white-space:pre-wrap;background:#f1f5f9;border-radius:5px;padding:12px;font-size:.9em}.workspace-doc-export code{font-family:ui-monospace,monospace}
.workspace-doc-export table{border-collapse:collapse;table-layout:fixed;max-width:100%;width:100%;margin:1em 0}.workspace-doc-export td,.workspace-doc-export th{border:1px solid #cbd5e1;padding:8px;vertical-align:top;min-width:25px}.workspace-doc-export th{background:#f1f5f9;font-weight:600}
.workspace-doc-export img{display:block;max-width:100%;height:auto}.workspace-doc-export figure{margin:1em 0;break-inside:avoid}.workspace-doc-export figcaption{color:#64748b;font-size:.85em;line-height:1.4;margin-top:.4em}
.workspace-doc-export a{color:#2563eb}.workspace-doc-export hr{border:0;border-top:1px solid #cbd5e1;margin:1.3em 0}.workspace-doc-export mark{padding:0 .1em}
@media print{html,body{margin:0!important;background:#fff!important}.workspace-doc-export{padding:0;max-width:none!important}.workspace-doc-export tr{break-inside:avoid}.workspace-doc-export thead{display:table-header-group}a{overflow-wrap:anywhere}@page{size:A4;margin:18mm}}
`;

type ExportBlock = { type?: unknown; data?: unknown };
const escapeAttr = (value: string) => encodeText(value).replace(/"/g, '&quot;');

export function workspaceDocExportBody(html: string, blocks: Record<string, ExportBlock>): string {
  let body = sanitizeAgentHtml(html, { docAlign: true });
  body = rewriteWorkspaceDocTables(body, (id) => {
    const table = blocks[id];
    if (table?.type !== 'table') return '<p>Table unavailable.</p>';
    return workspaceTableExportHtml(table.data as TableBlockPayload, (attachmentId) => workspaceDocAttachmentHtml(blocks[attachmentId]));
  });
  const charts: Array<{ start: number; end: number; html: string }> = [];
  walkNodes(parseHtml(body), (node) => {
    if (node.tag === 'div' && attrValue(node, 'data-slide-chart') === 'bar') charts.push({ start: node.start, end: node.end, html: workspaceDocChartHtml(attrValue(node, 'data-series')) });
  });
  for (const chart of charts.sort((a, b) => b.start - a.start)) body = body.slice(0, chart.start) + chart.html + body.slice(chart.end);
  const changes: Array<{ start: number; end: number; html: string }> = [];
  walkNodes(parseHtml(body), (node) => {
    if (node.tag !== 'img') return;
    const src = attrValue(node, 'src') ?? '', original = attrValue(node, 'data-download-url');
    if (!safeDocImageUrl(src)) return;
    const caption = attrValue(node, 'data-caption') ?? '', alt = attrValue(node, 'alt') ?? '';
    const width = attrValue(node, 'data-width') ?? '100%', align = attrValue(node, 'data-align') ?? 'center';
    const margin = align === 'left' ? '0 auto 0 0' : align === 'right' ? '0 0 0 auto' : '0 auto';
    const image = `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" style="width:100%">`;
    changes.push({ start: node.start, end: node.end, html: `<figure style="width:${width};margin-left:${align === 'left' ? '0' : 'auto'};margin-right:${align === 'right' ? '0' : 'auto'}"><div style="margin:${margin}">${original && safeDocImageUrl(original) ? `<a href="${escapeAttr(original)}">${image}</a>` : image}</div>${caption ? `<figcaption>${encodeText(caption)}</figcaption>` : ''}</figure>` });
  });
  for (const change of changes.sort((a, b) => b.start - a.start)) body = body.slice(0, change.start) + change.html + body.slice(change.end);
  return body;
}

export function workspaceDocExportHtml(body: string, title: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${encodeText(title)}</title><style>${WORKSPACE_DOC_EXPORT_CSS}</style></head><body><article class="workspace-doc-export" style="max-width:840px;margin:0 auto">${body}</article></body></html>`;
}
