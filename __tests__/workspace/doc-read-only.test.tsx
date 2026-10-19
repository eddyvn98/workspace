// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBoardViewerRole } from '@/app/workspace/hooks/useBoardViewerRole';
import { useWorkspaceStore } from '@/app/workspace/store/useWorkspaceStore';
import { TableBlock } from '@/app/workspace/renderers/TableBlock';
import type { CanvasBlock } from '@/app/workspace/types/block';

const remote = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/app/workspace/hooks/workspaceBoardApi', () => ({ fetchRemoteBoard: remote.fetch }));
vi.mock('@/app/workspace/hooks/useWorkspaceRemoteBoardId', () => ({ useWorkspaceRemoteBoardId: (id: string) => id }));

const table: CanvasBlock<'table'> = {
  id: 'table', type: 'table', data: { rows: 1, cols: 1, cells: [['Visible value']], headerRow: true },
  transform: { computed: null, override: { x: 0, y: 0, w: 300, h: 160, rotation: 0, zIndex: 1 } },
  createdAt: 1, updatedAt: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ isReadOnly: false, blocks: { table }, selectedBlockIds: ['table'], pendingEditTableCell: null });
});
afterEach(cleanup);

describe('Office document viewer integration', () => {
  it('keeps a validated viewer locked during failed refresh and clears the lock for a different board', async () => {
    const view = renderHook(({ id, viewer }) => useBoardViewerRole(id, viewer), { initialProps: { id: 'board', viewer: true } });
    expect(useWorkspaceStore.getState().isReadOnly).toBe(true);
    expect(remote.fetch).not.toHaveBeenCalled();
    remote.fetch.mockRejectedValueOnce(new Error('Offline'));
    await act(async () => view.rerender({ id: 'board', viewer: false }));
    expect(useWorkspaceStore.getState().isReadOnly).toBe(true);
    remote.fetch.mockResolvedValueOnce({ viewerRole: 'EDITOR' });
    await act(async () => view.rerender({ id: 'another-board', viewer: false }));
    expect(useWorkspaceStore.getState().isReadOnly).toBe(false);
  });

  it.each(['extension', 'store'] as const)('prevents cell editors and structural controls under the %s read-only guard', (guard) => {
    useWorkspaceStore.setState({ isReadOnly: guard === 'store' });
    const onChange = vi.fn();
    const view = render(<TableBlock block={table} isSelected readOnly={guard === 'extension'} onChange={onChange} />);
    const cell = screen.getByRole('gridcell');
    fireEvent.click(cell);
    fireEvent.doubleClick(cell);
    fireEvent.contextMenu(cell.closest('td')!);
    expect(view.container.querySelector('[contenteditable="true"]')).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(view.container.querySelector('button')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Visible value')).toBeTruthy();
  });

  it('still permits cell editing for an editor', () => {
    const view = render(<TableBlock block={table} isSelected onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('gridcell'));
    expect(view.container.querySelector('[contenteditable="true"]')).not.toBeNull();
  });
});
