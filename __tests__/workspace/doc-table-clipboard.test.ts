// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { Editor, Node } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Fragment, Slice } from '@tiptap/pm/model';
import { DocTableClipboard } from '@/app/workspace/extensions/docTableClipboard';
import { useWorkspaceStore } from '@/app/workspace/store/useWorkspaceStore';
import { workspaceDocTableIds } from '@/app/workspace/utils/workspaceDocReferences';
import type { CanvasBlock } from '@/app/workspace/types/block';

// A minimal atom with the production node's name/attribute contract; NodeView UI does not affect paste semantics.
const TableAtom = Node.create({ name: 'workspaceTable', group: 'block', atom: true,
  addAttributes: () => ({ tableId: { default: null, parseHTML: (el) => el.getAttribute('data-table-id'), renderHTML: (attrs) => ({ 'data-table-id': attrs.tableId }) } }),
  parseHTML: () => [{ tag: 'div[data-workspace-table]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', { ...HTMLAttributes, 'data-workspace-table': 'true' }],
});
const transform = { computed: null, override: { x: 0, y: 0, w: 300, h: 200, rotation: 0, zIndex: 1 } };
const base = { transform, createdAt: 1, updatedAt: 1 };
const sourceHtml = '<div data-workspace-table="true" data-table-id="table"></div>';
function editor(docId: string, html = '<p></p>') {
  return new Editor({ extensions: [StarterKit, TableAtom, DocTableClipboard.configure({ blockId: docId })], content: html,
    onUpdate: ({ editor }) => useWorkspaceStore.getState().updateBlock(docId, { data: { html: editor.getHTML() } }),
  });
}
function paste(ed: Editor, id: string) {
  const slice = new Slice(Fragment.from(ed.schema.nodes.workspaceTable.create({ tableId: id })), 0, 0);
  return ed.view.someProp('handlePaste', (handler) => handler(ed.view, new Event('paste') as ClipboardEvent, slice));
}

beforeEach(() => {
  useWorkspaceStore.setState({ isReadOnly: false, selectedBlockIds: ['target'], connectors: {}, blockOrder: ['source', 'target', 'table', 'image'], blocks: {
    source: { ...base, id: 'source', type: 'doc', data: { html: sourceHtml } },
    target: { ...base, id: 'target', type: 'doc', data: { html: '<p></p>' } },
    table: { ...base, id: 'table', type: 'table', embeddedInDocId: 'source', data: { rows: 1, cols: 1, cells: [['Value']], cellItems: { '0:0': [{ blockId: 'image', x: 0, y: 0, width: 40, height: 30 }] }, sheets: [{ id: 'sheet', name: 'Archived', data: { rows: 1, cols: 1, cells: [['Saved sheet']], cellItems: { '0:0': [{ blockId: 'archived-image', x: 0, y: 0, width: 40, height: 30 }] } } }] } },
    image: { ...base, id: 'image', type: 'image', data: { url: '/image.png' } },
    'archived-image': { ...base, id: 'archived-image', type: 'image', data: { url: '/archived.png' } },
  } as Record<string, CanvasBlock> });
});

describe('Document table clipboard dependencies', () => {
  it('copies another document table and its attachments independently without changing canvas selection', () => {
    const ed = editor('target');
    expect(paste(ed, 'table')).toBe(true);
    const ids = workspaceDocTableIds(ed.getHTML());
    expect(ids).toHaveLength(1); expect(ids[0]).not.toBe('table');
    const state = useWorkspaceStore.getState(), copy = state.blocks[ids[0]] as CanvasBlock<'table'>;
    expect(copy.embeddedInDocId).toBe('target');
    expect(copy.data.cells).toEqual([['Value']]);
    const attached = copy.data.cellItems!['0:0'][0].blockId;
    expect(attached).not.toBe('image'); expect(state.blocks[attached].type).toBe('image');
    const archived = copy.data.sheets![0].data.cellItems!['0:0'][0].blockId;
    expect(archived).not.toBe('archived-image'); expect(state.blocks[archived].type).toBe('image');
    expect(copy.data.sheets![0].data.cells).toEqual([['Saved sheet']]);
    expect(state.blocks.table.embeddedInDocId).toBe('source');
    expect(state.selectedBlockIds).toEqual(['target']);
    ed.destroy();
  });

  it('moves a cut table once after the source has released ownership', () => {
    const source = editor('source', sourceHtml);
    source.commands.setNodeSelection(0);
    source.view.someProp('handleDOMEvents', (events) => events.cut?.(source.view, new Event('cut')));
    source.commands.deleteSelection();
    expect(useWorkspaceStore.getState().blocks.table.embeddedInDocId).toBeUndefined();
    const target = editor('target');
    paste(target, 'table');
    expect(workspaceDocTableIds(target.getHTML())).toEqual(['table']);
    expect(useWorkspaceStore.getState().blocks.table.embeddedInDocId).toBe('target');
    source.destroy(); target.destroy();
  });

  it('shows unavailable content for foreign IDs and does not mutate a read-only board', () => {
    const ed = editor('target');
    expect(paste(ed, 'missing')).toBe(true);
    expect(ed.getText()).toContain('Table unavailable');
    useWorkspaceStore.setState({ isReadOnly: true });
    const before = Object.keys(useWorkspaceStore.getState().blocks);
    expect(paste(ed, 'table')).toBe(true);
    expect(Object.keys(useWorkspaceStore.getState().blocks)).toEqual(before);
    ed.destroy();
  });

  it('preserves mixed text pasted into a shared SlideDeck editor without cloning table dependencies', () => {
    useWorkspaceStore.setState((state) => ({ blocks: { ...state.blocks,
      target: { ...base, id: 'target', type: 'slideDeck', data: { slideOrder: ['slide'], slides: {
        slide: { id: 'slide', name: 'Slide', html: '<p></p>' },
      } } },
    } }));
    const before = useWorkspaceStore.getState().blocks;
    const ed = new Editor({ extensions: [StarterKit, TableAtom, DocTableClipboard.configure({ blockId: 'target' })], content: '<p></p>' });
    const slice = new Slice(Fragment.fromArray([
      ed.schema.nodes.paragraph.create(null, ed.schema.text('Before table', [ed.schema.marks.bold.create()])),
      ed.schema.nodes.workspaceTable.create({ tableId: 'table' }),
      ed.schema.nodes.paragraph.create(null, ed.schema.text('After table')),
    ]), 0, 0);
    const pasteMixed = () => ed.view.someProp('handlePaste', (handler) => handler(ed.view, new Event('paste') as ClipboardEvent, slice));
    try {
      expect(pasteMixed()).toBe(true);
      expect(ed.getText()).toBe('Before table\n\nTable unavailable in the pasted document.\n\nAfter table');
      expect(ed.getHTML()).toContain('<strong>Before table</strong>');
      expect(workspaceDocTableIds(ed.getHTML())).toEqual([]);
      expect(useWorkspaceStore.getState().blocks).toBe(before);
      const pasted = ed.getHTML();
      ed.setEditable(false);
      expect(pasteMixed()).toBe(true); expect(ed.getHTML()).toBe(pasted);
      ed.setEditable(true); useWorkspaceStore.setState({ isReadOnly: true });
      expect(pasteMixed()).toBe(true); expect(ed.getHTML()).toBe(pasted);
      expect(useWorkspaceStore.getState().blocks).toBe(before);
    } finally { ed.destroy(); }
  });
});
