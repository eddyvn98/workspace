"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SlideDeckBlock } from "@/app/workspace/renderers/SlideDeckBlock";
import { useWorkspaceStore } from "@/app/workspace/store/useWorkspaceStore";
import { createDualTransform, type CanvasBlock } from "@/app/workspace/types/block";
import { normalizeSlideScene } from "@/app/workspace/types/slideScene";
import { defaultSceneChart } from "@/app/workspace/types/slideSceneChart";
import { defaultSceneGradient, defaultSceneShadow } from "@/app/workspace/types/slideScenePaint";
import type { SlideDeckPayload } from "@/app/workspace/types/slide";

const SCENE_1 = normalizeSlideScene({
  version: 2,
  objects: [
    {
      id: "title-1", kind: "text", text: "Slide Studio Overview", x: 80, y: 60, w: 900, h: 90, rotation: 0,
      fontSize: 54, fontWeight: "bold", color: "#0F172A"
    },
    {
      id: "card-1", kind: "shape", shapeKind: "roundRect", x: 80, y: 180, w: 480, h: 420, rotation: 0,
      fill: "#2563EB", gradient: defaultSceneGradient(), shadow: defaultSceneShadow(), radius: 24
    },
    {
      id: "chart-1", kind: "chart", x: 600, y: 180, w: 600, h: 420, rotation: 0,
      chart: {
        ...defaultSceneChart(),
        type: "column",
        title: "Quarterly Performance",
        categories: ["Q1", "Q2", "Q3", "Q4"],
        series: [
          { name: "Target", color: "#94A3B8", values: [100, 120, 140, 160] },
          { name: "Achieved", color: "#16A34A", values: [105, 118, 148, 175] }
        ]
      }
    }
  ]
})!;

const SCENE_2 = normalizeSlideScene({
  version: 2,
  objects: [
    {
      id: "title-2", kind: "text", text: "Product Architecture", x: 80, y: 60, w: 900, h: 90, rotation: 0,
      fontSize: 48, fontWeight: "bold", color: "#0F172A"
    },
    {
      id: "table-2", kind: "table", x: 80, y: 180, w: 1120, h: 400, rotation: 0,
      table: {
        rows: [
          [{ text: "Component", bold: true, fill: "#F1F5F9" }, { text: "Scope", bold: true, fill: "#F1F5F9" }, { text: "Status", bold: true, fill: "#F1F5F9" }],
          [{ text: "Slide Canvas" }, { text: "Container queries, height-aware fit" }, { text: "Verified", color: "#16A34A" }],
          [{ text: "Slide Rail" }, { text: "Vertical on desktop, horizontal on mobile" }, { text: "Verified", color: "#16A34A" }],
          [{ text: "Inspector" }, { text: "Separated Layers & Format tabs" }, { text: "Verified", color: "#16A34A" }]
        ],
        columnWidths: [300, 520, 300],
        rowHeights: [80, 80, 80, 80],
        merges: [],
        headerRow: true
      }
    }
  ]
})!;

const INITIAL_DECK: SlideDeckPayload = {
  title: "Production Slide Studio Demo",
  aspectRatio: "16:9",
  activeSlideId: "slide-1",
  slideOrder: ["slide-1", "slide-2"],
  showSlideNumbers: true,
  slides: {
    "slide-1": { id: "slide-1", name: "Overview", html: "<p>Overview</p>", scene: SCENE_1, backgroundColor: "#FFFFFF" },
    "slide-2": { id: "slide-2", name: "Architecture", html: "<p>Architecture</p>", scene: SCENE_2, backgroundColor: "#F8FAFC" }
  }
};

const BLOCK_ID = "slide-block-1";
const SLIDE_BLOCK: CanvasBlock<"slideDeck"> = {
  id: BLOCK_ID,
  type: "slideDeck",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  transform: createDualTransform({ x: 40, y: 40, w: 1200, h: 720, rotation: 0, zIndex: 1 }),
  data: INITIAL_DECK
};

export default function SlideAcceptanceClient() {
  const searchParams = useSearchParams();
  const autoStudio = searchParams?.get("studio") === "1";
  const [ready, setReady] = useState(false);
  const block = useWorkspaceStore(s => s.blocks[BLOCK_ID]) as CanvasBlock<"slideDeck"> | undefined;

  useEffect(() => {
    useWorkspaceStore.setState({
      boardId: "slide-acceptance",
      blocks: { [BLOCK_ID]: SLIDE_BLOCK },
      blockOrder: [BLOCK_ID],
      selectedBlockIds: [BLOCK_ID],
      isReadOnly: false
    });
    setReady(true);
  }, []);

  if (!ready || !block) return <div className="p-8">Loading slide acceptance environment...</div>;

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-100" data-testid="slide-acceptance-container">
      <SlideDeckBlock
        block={block}
        isSelected={true}
        readOnly={false}
        onChange={patch => {
          const current = useWorkspaceStore.getState().blocks[BLOCK_ID];
          if (current?.type === "slideDeck") {
            useWorkspaceStore.getState().updateBlock(BLOCK_ID, {
              data: { ...current.data, ...patch }
            });
          }
        }}
      />
    </div>
  );
}
