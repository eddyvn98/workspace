import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type { CanvasBlock } from '../types/block';
import { workspaceDocExportBody, workspaceDocExportHtml } from './workspaceDocExportHtml';
import { inlineWorkspaceDocImages } from './workspaceDocExportAssets';

async function documentFile(blockId: string): Promise<{ html: string; title: string }> {
  const state = useWorkspaceStore.getState();
  const block = state.blocks[blockId];
  if (!block || block.type !== 'doc') throw new Error('The document is no longer available.');
  const title = state.title || 'Document';
  const body = await inlineWorkspaceDocImages(workspaceDocExportBody((block as CanvasBlock<'doc'>).data.html, state.blocks));
  return { html: workspaceDocExportHtml(body, title), title };
}

export async function downloadWorkspaceDocHtml(blockId: string): Promise<void> {
  const file = await documentFile(blockId);
  const url = URL.createObjectURL(new Blob([file.html], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${file.title.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 100) || 'document'}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function printWorkspaceDoc(blockId: string): Promise<void> {
  // Open synchronously in the user's click event, before asynchronous image preparation.
  const preview = window.open('', '_blank');
  if (!preview) throw new Error('Allow this site to open the document print preview, then try again.');
  preview.opener = null;
  preview.document.title = 'Preparing document';
  preview.document.body.textContent = 'Preparing document images…';
  try {
    const file = await documentFile(blockId);
    if (preview.closed) return;
    preview.document.open();
    preview.document.write(file.html);
    preview.document.close();
    await Promise.all(Array.from(preview.document.images).map((image) => image.decode()));
    await preview.document.fonts.ready;
    if (!preview.closed) { preview.focus(); preview.print(); }
  } catch (error) {
    preview.close();
    throw error;
  }
}
