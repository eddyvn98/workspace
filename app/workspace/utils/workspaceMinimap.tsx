"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";

const MINIMAP_W = 200;
const MINIMAP_H = 150;
const INNER_PAD = 6;

export interface WorkspaceMinimapNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  branchColor: string;
}

export interface WorkspaceMinimapPath {
  id: string;
  d: string;
  color: string;
}

interface WorkspaceMinimapCanvasProps {
  nodes: WorkspaceMinimapNode[];
  paths: WorkspaceMinimapPath[];
  currentPan: React.MutableRefObject<{ x: number; y: number }>;
  currentZoom: React.MutableRefObject<number>;
  containerWidth: number;
  containerHeight: number;
  onNavigate: (newPan: { x: number; y: number }) => void;
  onClose: () => void;
  showChat?: boolean;
  chatWidth?: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

interface ContentProps {
  nodes: WorkspaceMinimapNode[];
  paths: WorkspaceMinimapPath[];
  groupTransform: string;
  scale: number;
}

const MinimapContent = memo(function MinimapContent({ nodes, paths, groupTransform, scale }: ContentProps) {
  return (
    <g transform={groupTransform}>
      {paths.map((path) => (
        <path key={path.id} d={path.d} stroke={path.color} strokeWidth={0.8 / scale} fill="none" opacity={0.5} />
      ))}
      {nodes.map((node) => (
        <rect
          key={node.id}
          x={node.x}
          y={node.y}
          width={Math.max(node.width, 2 / scale)}
          height={Math.max(node.height, 2 / scale)}
          fill={node.branchColor}
          opacity={0.75}
          rx={2 / scale}
        />
      ))}
    </g>
  );
});

export const WorkspaceMinimapCanvas = memo(function WorkspaceMinimapCanvas({
  nodes,
  paths,
  currentPan,
  currentZoom,
  containerWidth,
  containerHeight,
  onNavigate,
  onClose,
  showChat = false,
  chatWidth = 320,
  onMouseEnter,
  onMouseLeave,
}: WorkspaceMinimapCanvasProps) {
  const isDragging = useRef(false);
  const dragStartMinimap = useRef({ x: 0, y: 0 });
  const dragStartPan = useRef({ x: 0, y: 0 });
  const minimapRef = useRef<SVGSVGElement>(null);
  const viewportRectRef = useRef<SVGRectElement>(null);

  const boundsAndScale = useMemo(() => {
    if (nodes.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }
    const padding = 40;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    const scale = Math.min(
      (MINIMAP_W - INNER_PAD * 2) / (maxX - minX),
      (MINIMAP_H - INNER_PAD * 2) / (maxY - minY),
    );
    return { minX, minY, scale };
  }, [nodes]);

  const boundsRef = useRef(boundsAndScale);
  useEffect(() => { boundsRef.current = boundsAndScale; }, [boundsAndScale]);

  const containerWidthRef = useRef(containerWidth);
  const containerHeightRef = useRef(containerHeight);
  useEffect(() => { containerWidthRef.current = containerWidth; }, [containerWidth]);
  useEffect(() => { containerHeightRef.current = containerHeight; }, [containerHeight]);

  useEffect(() => {
    let rafId: number;
    const update = () => {
      const bounds = boundsRef.current;
      const rect = viewportRectRef.current;
      if (bounds && rect) {
        const { minX, minY, scale } = bounds;
        const pan = currentPan.current;
        const zoom = currentZoom.current;
        rect.setAttribute("x", String(INNER_PAD + (-pan.x / zoom - minX) * scale));
        rect.setAttribute("y", String(INNER_PAD + (-pan.y / zoom - minY) * scale));
        rect.setAttribute("width", String(Math.max((containerWidthRef.current / zoom) * scale, 4)));
        rect.setAttribute("height", String(Math.max((containerHeightRef.current / zoom) * scale, 4)));
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [currentPan, currentZoom]);

  const handleSvgClick = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    if (!boundsAndScale || isDragging.current) return;
    const { minX, minY, scale } = boundsAndScale;
    const rect = minimapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const worldX = minX + (event.clientX - rect.left - INNER_PAD) / scale;
    const worldY = minY + (event.clientY - rect.top - INNER_PAD) / scale;
    onNavigate({
      x: containerWidthRef.current / 2 - worldX * currentZoom.current,
      y: containerHeightRef.current / 2 - worldY * currentZoom.current,
    });
  }, [boundsAndScale, currentZoom, onNavigate]);

  const handleViewportMouseDown = useCallback((event: React.MouseEvent) => {
    if (!boundsAndScale) return;
    event.stopPropagation();
    isDragging.current = true;
    const rect = minimapRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragStartMinimap.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    dragStartPan.current = { ...currentPan.current };
    const { scale } = boundsAndScale;

    const onMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current) return;
      const currentRect = minimapRef.current?.getBoundingClientRect();
      if (!currentRect) return;
      const dMx = moveEvent.clientX - currentRect.left - dragStartMinimap.current.x;
      const dMy = moveEvent.clientY - currentRect.top - dragStartMinimap.current.y;
      onNavigate({
        x: dragStartPan.current.x - (dMx / scale) * currentZoom.current,
        y: dragStartPan.current.y - (dMy / scale) * currentZoom.current,
      });
    };
    const onUp = () => {
      setTimeout(() => { isDragging.current = false; }, 0);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [boundsAndScale, currentPan, currentZoom, onNavigate]);

  if (!boundsAndScale) return null;

  const { minX, minY, scale } = boundsAndScale;
  const groupTransform = `translate(${INNER_PAD - minX * scale} ${INNER_PAD - minY * scale}) scale(${scale})`;
  const minimapStyle: React.CSSProperties = {
    right: showChat ? `calc(${chatWidth}px + 1rem)` : "calc(var(--workspace-chat-width, 0px) + 1rem)",
  };

  return (
    <div
      style={minimapStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`absolute bottom-14 z-30 rounded-xl border bg-white/90 dark:bg-slate-900/90 border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden select-none transition-all duration-200 ease-in-out ${showChat ? "max-lg:bottom-[calc(65vh+1rem)] max-lg:right-4" : ""}`}
    >
      <button onClick={onClose} className="absolute top-1 right-1 z-10 w-5 h-5 flex items-center justify-center rounded text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Close minimap">✕</button>
      <svg ref={minimapRef} width={MINIMAP_W} height={MINIMAP_H} style={{ display: "block", cursor: "crosshair" }} onClick={handleSvgClick}>
        <MinimapContent nodes={nodes} paths={paths} groupTransform={groupTransform} scale={scale} />
        <rect ref={viewportRectRef} x={0} y={0} width={4} height={4} fill="rgba(59,130,246,0.1)" stroke="#3b82f6" strokeWidth={1.5} rx={2} style={{ cursor: "grab" }} onMouseDown={handleViewportMouseDown} />
      </svg>
    </div>
  );
});
