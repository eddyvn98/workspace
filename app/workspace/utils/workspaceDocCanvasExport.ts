import type { CanvasBlock } from '../types/block';
import type { ExportBlockInfo } from './workspaceExportBlocks';
import { WORKSPACE_DOC_EXPORT_CSS, workspaceDocExportBody } from './workspaceDocExportHtml';
import { inlineWorkspaceDocImages } from './workspaceDocExportAssets';
import { includeWorkspaceDocTables } from './workspaceDocReferences';

/** Embedded tables and their attachments already render inside a Doc; explicit independent selections remain exportable. */
export function workspaceDocCanvasHiddenIds(blocks: Record<string, CanvasBlock>, selectedIds?: readonly string[]): Set<string> {
  const owners = new Set(selectedIds ?? Object.keys(blocks));
  const tableIds = Object.entries(blocks).filter(([, block]) => block.type === 'table'
    && block.embeddedInDocId && blocks[block.embeddedInDocId]?.type === 'doc' && owners.has(block.embeddedInDocId)).map(([id]) => id);
  return new Set(includeWorkspaceDocTables(blocks, tableIds));
}

function svgDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/** A self-contained SVG preserves the Doc's actual browser typography, lists, images and tables. */
export async function workspaceDocCanvasSvg(block: CanvasBlock<'doc'>, blocks: Record<string, CanvasBlock>, width: number, height: number): Promise<string> {
  if (![width, height].every((n) => Number.isFinite(n) && n > 0 && n <= 16000)) throw new Error('Document export dimensions exceed the supported canvas size.');
  const body = await inlineWorkspaceDocImages(workspaceDocExportBody(block.data.html, blocks));
  const parsed = new DOMParser().parseFromString('<div xmlns="http://www.w3.org/1999/xhtml"></div>', 'text/html');
  const root = parsed.body.firstElementChild!;
  const style = parsed.createElement('style');
  style.textContent = WORKSPACE_DOC_EXPORT_CSS;
  root.appendChild(style);
  const article = parsed.createElement('article');
  article.className = 'workspace-doc-export';
  article.style.cssText = `width:${width}px;height:${height}px;overflow:hidden;`;
  article.innerHTML = body;
  root.appendChild(article);
  const xhtml = new XMLSerializer().serializeToString(root);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
}

export async function drawWorkspaceDocExport(ctx: CanvasRenderingContext2D, source: CanvasBlock, blocks: Record<string, CanvasBlock>, rect: ExportBlockInfo): Promise<boolean> {
  if (source.type !== 'doc') return false;
  const svg = await workspaceDocCanvasSvg(source as CanvasBlock<'doc'>, blocks, rect.w - 2, rect.h - 2);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('The document could not be rendered for export. Use Download HTML or Print / Save PDF.')), 12000);
    image.onload = () => { window.clearTimeout(timeout); resolve(); };
    image.onerror = () => { window.clearTimeout(timeout); reject(new Error('This browser could not render the document. Use Download HTML or Print / Save PDF.')); };
    image.src = svgDataUrl(svg);
  });
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.rotate((rect.rotation ?? 0) * Math.PI / 180);
  ctx.drawImage(image, -rect.w / 2 + 1, -rect.h / 2 + 1, rect.w - 2, rect.h - 2);
  ctx.restore();
  return true;
}

export async function workspaceDocCanvasMarkup(source: CanvasBlock, blocks: Record<string, CanvasBlock>, rect: ExportBlockInfo): Promise<string> {
  if (source.type !== 'doc') return '';
  const svg = await workspaceDocCanvasSvg(source as CanvasBlock<'doc'>, blocks, rect.w - 2, rect.h - 2);
  return `<image href="${svgDataUrl(svg)}" x="${rect.x + 1}" y="${rect.y + 1}" width="${rect.w - 2}" height="${rect.h - 2}" transform="rotate(${rect.rotation ?? 0} ${rect.x + rect.w / 2} ${rect.y + rect.h / 2})"/>`;
}
