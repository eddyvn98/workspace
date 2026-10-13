"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface PreviewBlock {
  id: string;
  type?: string;
  parentId?: string;
  data?: Record<string, unknown>;
}

function blockLabel(block: PreviewBlock): string {
  const data = block.data ?? {};
  if (block.type === "text") return String(data.markdown || "Untitled");
  if (block.type === "table") return "Table";
  if (block.type === "image") return String(data.alt || data.url || "Image");
  if (block.type === "shape") return String(data.shapeKind || "Shape");
  if (block.type === "link") return String(data.title || data.url || "Link");
  if (block.type === "path") return "Freehand drawing";
  return block.type || "Block";
}

function PreviewRow({ block, childrenByParent, depth = 0 }: {
  block: PreviewBlock;
  childrenByParent: Map<string, PreviewBlock[]>;
  depth?: number;
}) {
  const children = childrenByParent.get(block.id) ?? [];
  const [expanded, setExpanded] = useState(depth < 2);
  return (
    <div style={{ marginLeft: depth * 14 }}>
      <div className="flex items-center gap-1 py-0.5 text-xs">
        {children.length > 0 ? (
          <button type="button" onClick={() => setExpanded((value) => !value)} className="shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : <span className="h-3 w-3 shrink-0" />}
        <span className="truncate text-slate-700 dark:text-slate-300">{blockLabel(block)}</span>
      </div>
      {expanded && children.map((child) => <PreviewRow key={child.id} block={child} childrenByParent={childrenByParent} depth={depth + 1} />)}
    </div>
  );
}

export function WorkspaceSnapshotPreview({ blocks, blockOrder }: { blocks: Record<string, unknown>; blockOrder: string[] }) {
  const { roots, childrenByParent } = useMemo(() => {
    const typed = new Map<string, PreviewBlock>();
    Object.entries(blocks).forEach(([id, value]) => {
      if (value && typeof value === "object") typed.set(id, { ...(value as PreviewBlock), id });
    });
    const childrenByParent = new Map<string, PreviewBlock[]>();
    typed.forEach((block) => {
      if (block.parentId && typed.has(block.parentId)) {
        childrenByParent.set(block.parentId, [...(childrenByParent.get(block.parentId) ?? []), block]);
      }
    });
    const roots = blockOrder
      .map((id) => typed.get(id))
      .filter((block): block is PreviewBlock =>
        Boolean(block && (!block.parentId || !typed.has(block.parentId))),
      );
    return { roots, childrenByParent };
  }, [blocks, blockOrder]);

  if (roots.length === 0) return <p className="text-xs text-slate-400">This version has no blocks.</p>;
  return <div>{roots.map((root) => <PreviewRow key={root.id} block={root} childrenByParent={childrenByParent} />)}</div>;
}
