import { Extension } from '@tiptap/react';
import { Fragment, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { toast } from 'sonner';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { cloneWorkspaceTableForDocument } from '../utils/workspaceDocTableClone';

let lastCut: { ids: Set<string>; at: number } | null = null;

function tableIds(slice: Slice): Set<string> {
  const ids = new Set<string>();
  slice.content.descendants((node) => {
    if (node.type.name === 'workspaceTable' && typeof node.attrs.tableId === 'string') ids.add(node.attrs.tableId);
  });
  return ids;
}

/** Clipboard table nodes receive independent board dependencies; a local cut may transfer its released table. */
export const DocTableClipboard = Extension.create<{ blockId: string }>({
  name: 'docTableClipboard',
  addOptions: () => ({ blockId: '' }),
  addProseMirrorPlugins() {
    const docId = this.options.blockId;
    return [new Plugin({
      key: new PluginKey('workspaceDocTableClipboard'),
      props: {
        handleDOMEvents: {
          copy: () => { lastCut = null; return false; },
          cut: (view) => { lastCut = { ids: tableIds(view.state.selection.content()), at: Date.now() }; return false; },
        },
        handlePaste: (view, _event, slice) => {
          const ids = tableIds(slice);
          if (!ids.size) return false;
          const initial = useWorkspaceStore.getState();
          if (!view.editable || initial.isReadOnly) return true;
          const mapped = new Map<string, string>(), createdIds: string[] = [];
          const transferred: Array<{ id: string; owner: string | undefined }> = [];
          try {
            // Other editor surfaces preserve the slice with visible table fallbacks, without acquiring dependencies.
            for (const id of initial.blocks[docId]?.type === 'doc' ? ids : []) {
              const table = useWorkspaceStore.getState().blocks[id];
              if (table?.type !== 'table') continue;
              const move = lastCut && Date.now() - lastCut.at < 60000 && lastCut.ids.has(id) && !table.embeddedInDocId;
              if (move) {
                transferred.push({ id, owner: table.embeddedInDocId });
                useWorkspaceStore.getState().updateBlock(id, { embeddedInDocId: docId });
                mapped.set(id, id);
              } else {
                const copy = cloneWorkspaceTableForDocument(id, docId);
                if (copy) { mapped.set(id, copy.tableId); createdIds.push(...copy.createdIds); }
              }
            }
            const remap = (fragment: Fragment): Fragment => {
              const nodes: ProseMirrorNode[] = [];
              fragment.forEach((node) => {
                if (node.type.name === 'workspaceTable') {
                  const id = mapped.get(String(node.attrs.tableId));
                  nodes.push(id ? node.type.create({ ...node.attrs, tableId: id })
                    : view.state.schema.nodes.paragraph.create(null, view.state.schema.text('Table unavailable in the pasted document.')));
                } else nodes.push(node.content.size ? node.copy(remap(node.content)) : node);
              });
              return Fragment.fromArray(nodes);
            };
            const content = new Slice(remap(slice.content), slice.openStart, slice.openEnd);
            view.dispatch(view.state.tr.replaceSelection(content).setMeta('paste', true).setMeta('uiEvent', 'paste').scrollIntoView());
            lastCut = null;
            return true;
          } catch (error) {
            const state = useWorkspaceStore.getState();
            const created = new Set(createdIds);
            for (const connector of Object.values(state.connectors)) {
              if (created.has(connector.fromBlockId) || created.has(connector.toBlockId)) state.removeConnector(connector.id);
            }
            createdIds.forEach((id) => state.removeBlock(id));
            for (const item of transferred) state.updateBlock(item.id, { embeddedInDocId: item.owner });
            toast.error(error instanceof Error ? error.message : 'The embedded table could not be pasted.');
            return true;
          }
        },
      },
    })];
  },
});
