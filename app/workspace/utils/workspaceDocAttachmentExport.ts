import { encodeText } from '@/app/api/workspaces/[id]/agent/docHtmlParse';
import { sanitizeAgentHtml } from '@/app/api/workspaces/[id]/agent/agentHtmlSanitize';
import { markdownToDocHtml } from '@/app/api/workspaces/[id]/agent/agentMarkdownToHtml';
import { safeDocImageUrl } from './workspaceDocSafety';

type ExportBlock = { type?: unknown; data?: unknown };
const attr = (value: string) => encodeText(value).replace(/"/g, '&quot;');

/** Cell attachments become flowing content inside the exported cell; canvas offsets are not page layout. */
export function workspaceDocAttachmentHtml(block: ExportBlock | undefined): string {
  if (!block) return '<p>Attachment unavailable.</p>';
  const data = block.data && typeof block.data === 'object' ? block.data as Record<string, unknown> : {};
  if (block.type === 'image') {
    const images = [data.url, ...(Array.isArray(data.extraUrls) ? data.extraUrls : [])];
    const active = Number.isInteger(data.activeIndex) ? Number(data.activeIndex) : 0;
    const src = String(images[active] ?? data.url ?? '');
    if (!safeDocImageUrl(src)) return '<p>Image unavailable.</p>';
    const original = typeof data.downloadUrl === 'string' && safeDocImageUrl(data.downloadUrl) ? data.downloadUrl : '';
    return `<img src="${attr(src)}" alt="${attr(String(data.alt ?? ''))}"${original ? ` data-download-url="${attr(original)}"` : ''}>`;
  }
  if (block.type === 'link') {
    const url = String(data.url ?? '');
    return sanitizeAgentHtml(`<p><a href="${attr(url)}">${encodeText(String(data.title || url))}</a></p>`, { docAlign: true });
  }
  if (block.type === 'text') return sanitizeAgentHtml(markdownToDocHtml(String(data.markdown ?? '')), { docAlign: true });
  const text = block.type === 'shape' ? data.label
    : block.type === 'path' ? data.text : block.type === 'file' ? data.filename : undefined;
  if (typeof text === 'string') return `<p>${encodeText(text).replace(/\n/g, '<br>')}</p>`;
  return `<p>${encodeText(String(block.type ?? 'Unknown'))} attachment: open the workspace to view this content.</p>`;
}
