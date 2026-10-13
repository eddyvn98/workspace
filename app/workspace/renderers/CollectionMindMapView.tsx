"use client";
import React, { useMemo, useState } from "react";
import { Background, Controls, MiniMap, Position, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { CollectionBlockPayload, CollectionRecord } from "../collections/model";
import { recordTitle, setParent } from "../collections/model";
import { layoutMindMap } from "./collectionMindMapLayout";
import { inputClass } from "./CollectionFieldEditor";

interface Props { rows: CollectionRecord[]; data: CollectionBlockPayload; readOnly: boolean;
  onChange: (next: CollectionBlockPayload) => void; }

export function MindMapView({ rows, data, readOnly, onChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const graph = useMemo(() => layoutMindMap(rows), [rows]);
  const labels = useMemo(() => new Map(rows.map(record => [record.id, recordTitle(data, record)])), [rows, data]);
  const nodes = useMemo<Node[]>(() => graph.nodes.map(item => ({
    id: item.id, position: { x: item.x, y: item.y },
    data: { label: labels.get(item.id) ?? "Untitled" },
    sourcePosition: Position.Right, targetPosition: Position.Left,
    draggable: false, selectable: true,
  })), [graph, labels]);
  const edges = useMemo<Edge[]>(() => graph.edges.map(link => ({
    id: link.source + ">" + link.target, source: link.source, target: link.target,
    type: "smoothstep", animated: false,
  })), [graph]);
  const selected = rows.find(item => item.id === selectedId) ?? rows[0];
  const parentChoice = selected?.parentId && graph.nodes.some(item => item.id === selected.parentId)
    ? selected.parentId : "";
  return <div className="flex h-full min-h-[420px] flex-col gap-2" data-testid="collection-mindmap">
    <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
      <span>Drag to pan, scroll to zoom, select a node to change its parent.</span>
      {graph.truncated > 0 && <span className="text-amber-600">
        Displaying first 200 records; {graph.truncated} not drawn
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
          {graph.nodes.filter(item => item.id !== selected.id).map(item =>
            <option key={item.id} value={item.id}>{labels.get(item.id) ?? "Untitled"}</option>)}
        </select>
      </label>}
    </div>
    <div className="min-h-[380px] flex-1 overflow-hidden rounded border" data-testid="collection-mindmap-graph">
      <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.15} maxZoom={2}
        nodesDraggable={false} nodesConnectable={false} selectNodesOnDrag={false}
        onNodeClick={(_event, node) => setSelectedId(node.id)}
        proOptions={{ hideAttribution: true }}>
        <Background />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  </div>;
}
