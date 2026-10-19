// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import * as Y from 'yjs';
import { exportSelectionToMarkdown, exportToMarkdown } from '@/app/workspace/utils/markdownExport';
import { importFromMarkdown } from '@/app/workspace/utils/markdownImport';
import { docContentHtml } from '@/app/api/workspaces/[id]/agent/docRichOperations';
import { spliceDocHtml } from '@/app/api/workspaces/[id]/agent/docHtmlEdit';
import { workspaceDocTableIds, includeWorkspaceDocTables, normalizeWorkspaceDocOwnership, reconcileWorkspaceDocTables, removeWorkspaceDocReferences } from '@/app/workspace/utils/workspaceDocReferences';
import { deriveBoardFromDoc, workspaceDocMaps } from '@/lib/workspace/ydoc-shapes';
import { useWorkspaceStore } from '@/app/workspace/store/useWorkspaceStore';
import type { CanvasBlock } from '@/app/workspace/types/block';

const transform = { computed: null, override: { x: 0, y: 0, w: 400, h: 300, rotation: 0, zIndex: 1 } };
function fixture(): Record<string, CanvasBlock> {
  return {
    doc: { id: 'doc', type: 'doc', transform, data: { html: '<h1>Report</h1><p><strong>Revenue</strong> and <a href="https://example.com">source</a>.</p><img src="/chart.png" alt="Chart" data-caption="October results" data-download-url="/original.png"><div data-workspace-table="true" data-table-id="table"></div>' }, createdAt: 1, updatedAt: 1 },
    table: { id: 'table', type: 'table', embeddedInDocId: 'doc', transform, data: { rows: 2, cols: 2, cells: [['Item', 'Total'], ['A', '120']], headerRow: true }, createdAt: 1, updatedAt: 1 },
  };
}

describe('Document portable lifecycle', () => {
  it('exports readable body, formatting, linked images, captions and one embedded table', () => {
    const markdown = exportToMarkdown(fixture(), ['doc', 'table'], 'Board').split('<!--WORKSPACE_DATA')[0];
    expect(markdown).toContain('# Report');
    expect(markdown).toContain('**Revenue**');
    expect(markdown).toContain('[source](https://example.com)');
    expect(markdown).toContain('![Chart](/chart.png)');
    expect(markdown).toContain('October results');
    expect(markdown).toContain('| A | 120 |');
    expect(markdown.match(/\| Item \| Total \|/g)).toHaveLength(1);
    expect(markdown).not.toContain('(empty)');
  });

  it('carries table dependencies in a Doc-only selection and remaps both relation endpoints', () => {
    const imported = importFromMarkdown(exportSelectionToMarkdown(fixture(), ['doc'], ['doc', 'table'], 'Board'));
    const doc = imported.blocks.find((block) => block.type === 'doc')!;
    const table = imported.blocks.find((block) => block.type === 'table')!;
    expect(imported.blocks).toHaveLength(2);
    expect(doc.id).not.toBe('doc');
    expect(table.id).not.toBe('table');
    expect(workspaceDocTableIds((doc.data as { html: string }).html)).toEqual([table.id]);
    expect(table.embeddedInDocId).toBe(doc.id);
    expect((table.data as { cells: string[][] }).cells[1][1]).toBe('120');
  });

  it('keeps independent table export visible and releases missing imported ownership', () => {
    const md = exportSelectionToMarkdown(fixture(), ['table'], ['doc', 'table'], 'Board');
    expect(md.split('<!--WORKSPACE_DATA')[0]).toContain('| A | 120 |');
    const imported = importFromMarkdown(md);
    expect(imported.blocks).toHaveLength(1);
    expect(imported.blocks[0].embeddedInDocId).toBeUndefined();
  });

  it('preserves a native resized table through AI HTML editing and the real editor schema', () => {
    const extensions = () => [StarterKit, TableKit.configure({ table: { resizable: false } })];
    const first = new Editor({ extensions: extensions(), content: '<table><tr><td colwidth="240"><p>Old</p></td><td colwidth="120"><p>Second</p></td></tr></table>' });
    const sanitized = docContentHtml(first.getHTML().replace('Old', 'New'));
    const second = new Editor({ extensions: extensions(), content: sanitized });
    expect(second.getHTML()).toContain('colwidth="240"');
    expect(second.getHTML()).toContain('colwidth="120"');
    expect(second.getHTML()).toContain('New');
    first.destroy(); second.destroy();
  });

  it('keeps heading identity and alignment for a selected-line rewrite', () => {
    const changed = spliceDocHtml('<h2 data-line-id="stable" style="text-align:center">Old</h2><p>Keep</p>', '<p>New</p>', { mode: 'replace', lineId: 'stable' });
    expect(changed).toBe('<h2 data-line-id="stable" style="text-align:center">New</h2><p>Keep</p>');
  });

  it('releases table data when an embed or Doc is removed, and cleans nodes when a table is deleted', () => {
    const blocks = fixture();
    expect(includeWorkspaceDocTables(blocks, ['doc'])).toEqual(['doc', 'table']);
    const edited = { ...blocks, doc: { ...blocks.doc, data: { html: '<p>No embed</p>' } } };
    expect(reconcileWorkspaceDocTables(edited, 'doc').table.embeddedInDocId).toBeUndefined();
    expect(removeWorkspaceDocReferences({ table: blocks.table }, 'doc').table.embeddedInDocId).toBeUndefined();
    const removed = removeWorkspaceDocReferences({ doc: blocks.doc }, 'table');
    expect(workspaceDocTableIds((removed.doc.data as { html: string }).html)).toEqual([]);
    expect((removed.doc.data as { html: string }).html).toContain('Report');
  });

  it('projects deterministic ownership from live Docs without changing modification timestamps', () => {
    const blocks = fixture();
    const second = { ...blocks.doc, id: 'other' };
    const owned = { ...blocks, other: second, table: { ...blocks.table, embeddedInDocId: 'other' } };
    expect(normalizeWorkspaceDocOwnership(owned)).toBe(owned);
    const repaired = normalizeWorkspaceDocOwnership({ ...owned, table: { ...owned.table, embeddedInDocId: 'deleted' } });
    expect(repaired.table.embeddedInDocId).toBe('doc');
    expect(repaired.table.updatedAt).toBe(1);
    const ydoc = new Y.Doc(), maps = workspaceDocMaps(ydoc);
    Object.entries(blocks).forEach(([id, block]) => maps.blocks.set(id, block));
    maps.blocks.delete('doc');
    const projected = deriveBoardFromDoc(ydoc).blocks.table as CanvasBlock<'table'>;
    expect(projected.embeddedInDocId).toBeUndefined();
    expect(projected.updatedAt).toBe(1);
    expect((maps.blocks.get('table') as CanvasBlock).embeddedInDocId).toBe('doc');
    ydoc.destroy();
  });

  it('reconciles restored Doc versions and preserves metadata delimiter text on portable reimport', () => {
    const blocks = fixture();
    useWorkspaceStore.setState({ isReadOnly: false, blocks });
    useWorkspaceStore.getState().restoreBlockVersion('doc', { ...blocks.doc, data: { html: '<p>WORKSPACE_DATA--></p>' } });
    expect(useWorkspaceStore.getState().blocks.table.embeddedInDocId).toBeUndefined();
    const imported = importFromMarkdown(exportToMarkdown(useWorkspaceStore.getState().blocks, ['doc', 'table'], 'Board'));
    const restored = imported.blocks.find((block) => block.type === 'doc')!;
    expect((restored.data as { html: string }).html).toContain('WORKSPACE_DATA-->');
  });
});
