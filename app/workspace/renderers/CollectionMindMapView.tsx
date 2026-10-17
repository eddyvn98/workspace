"use client";
import React, { useMemo, useState } from "react";
import { Background, Controls, MiniMap, Position, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { CollectionBlockPayload, CollectionRecord } from "../collections/model";
import { recordTitle, setParent } from "../collections/model";
import { layoutMindMap } from "./collectionMindMapLayout";
import { visibleMindMapSelection } from "./collectionMindMapSelection";
import { hintClass, inputClass } from "./CollectionFieldEditor";

interface Props { rows: CollectionRecord[]; data: CollectionBlockPayload; readOnly: boolean;
  onChange: (next: CollectionBlockPayload) => void; }

export function MindMapView({ rows, data, readOnly, onChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 200;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const graph = useMemo(() => layoutMindMap(rows, PAGE_SIZE, currentPage * PAGE_SIZE), [rows, currentPage]);
  const labels = useMemo(() => new Map(rows.map(record => [record.id, recordTitle(data, record)])), [rows, data]);
  const nodes = useMemo<Node[]>(() => graph.nodes.map(item => ({
    id: item.id, position: { x: item.x, y: item.y },
    data: { label: labels.get(item.id) ?? "Untitled" },
    sourcePosition: Position.Right, targetPosition: Position.Left,
    draggable: !readOnly, selectable: true,
  })), [graph, labels, readOnly]);
  const edges = useMemo<Edge[]>(() => graph.edges.map(link => ({
    id: link.source + ">" + link.target, source: link.source, target: link.target,
    type: "smoothstep", animated: false,
  })), [graph]);
  const selected = visibleMindMapSelection(rows, selectedId, currentPage, PAGE_SIZE);
  const selectRecord = (id: string) => {
    setSelectedId(id);
    const index = rows.findIndex(row => row.id === id);
    if (index >= 0) setPage(Math.floor(index / PAGE_SIZE));
  };
  const parentChoice = selected?.parentId && rows.some(item => item.id === selected.parentId)
    ? selected.parentId : "";
  const dropParent = (movedId: string, x: number, y: number) => {
    if (readOnly) return;
    const targets = graph.nodes.filter(item => item.id !== movedId).map(item => ({
      id: item.id, distance: Math.hypot(item.x - x, item.y - y),
    })).sort((a, b) => a.distance - b.distance);
    // Reparent only on an intentional near-node drop. The engine prevents cycles.
    if ((targets[0]?.distance ?? Infinity) > 130) return;
    const next = setParent(data, movedId, targets[0].id);
    if (next !== data) onChange(next);
  };
  return <div className="flex h-full min-h-[420px] flex-col gap-2" data-testid="collection-mindmap">
    <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
      <span className={hintClass}>Drag background to pan, scroll to zoom, or drop a node near another node to change its parent.</span>
      <select aria-label="Mind Map selected record" className={inputClass} value={selected?.id ?? ""}
        onChange={event => selectRecord(event.target.value)}>
        {rows.map(row => <option key={row.id} value={row.id}>{labels.get(row.id) ?? "Untitled"}</option>)}
      </select>
      {pageCount > 1 && <span className="flex items-center gap-1" aria-label="Mind Map pages">
        <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <span>Page {currentPage + 1} of {pageCount} ({rows.length} records)</span>
        <button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>Next</button>
      </span>}
      {selected && <label>Parent of {recordTitle(data, selected)}
        <select aria-label={"Parent of " + recordTitle(data, selected)}
          className={inputClass + " ml-2"} disabled={readOnly}
          value={parentChoice}
          onChange={event => {
            const next = setParent(data, selected.id, event.target.value || null);
            if (next !== data) onChange(next);
          }}>
          <option value="">Root</option>
          {rows.filter(item => item.id !== selected.id).map(item =>
            <option key={item.id} value={item.id}>{labels.get(item.id) ?? "Untitled"}</option>)}
        </select>
      </label>}
    </div>
    {selected?.parentId && !graph.nodes.some(node => node.id === selected.parentId) && <span className={hintClass}>Parent is outside this page; the saved relationship is unchanged.</span>}
    <div className="min-h-[380px] flex-1 overflow-hidden rounded border" data-testid="collection-mindmap-graph">
      <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.15} maxZoom={2}
        nodesDraggable={!readOnly} nodesConnectable={false} selectNodesOnDrag={false}
        onNodeDragStop={(_event, node) => dropParent(node.id, node.position.x, node.position.y)}
        onNodeClick={(_event, node) => selectRecord(node.id)}
        proOptions={{ hideAttribution: true }}>
        <Background />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  </div>;
}
