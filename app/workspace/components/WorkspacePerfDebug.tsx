"use client";

import { useEffect } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { isWorkspacePerfDebugEnabled, workspacePerfLog } from "../utils/workspacePerfDebug";

export function WorkspacePerfDebug() {
  useEffect(() => {
    if (!isWorkspacePerfDebugEnabled()) return;

    let rafId = 0;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let lastFrameAt = performance.now();
    let frameCount = 0;
    let maxFrameGap = 0;
    let cameraUpdates = 0;
    let storeUpdates = 0;
    let longTasks = 0;
    let longTaskTime = 0;

    const stop = () => {
      cancelAnimationFrame(rafId);
      if (intervalId !== null) clearInterval(intervalId);
      observer?.disconnect();
      unsubscribe();
    };

    const tick = (now: number) => {
      const frameGap = now - lastFrameAt;
      lastFrameAt = now;
      frameCount += 1;
      maxFrameGap = Math.max(maxFrameGap, frameGap);
      if (frameGap >= 50) {
        workspacePerfLog("frame-gap", { frameGapMs: Math.round(frameGap), frameCount });
      }
      rafId = requestAnimationFrame(tick);
    };

    const unsubscribe = useWorkspaceStore.subscribe((state, previous) => {
      storeUpdates += 1;
      if (state.camera !== previous.camera) cameraUpdates += 1;
    });

    const observer = typeof PerformanceObserver !== "undefined"
      ? new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks += 1;
          longTaskTime += entry.duration;
          workspacePerfLog("long-task", { durationMs: Math.round(entry.duration), startTimeMs: Math.round(entry.startTime) });
        }
      })
      : null;
    try {
      observer?.observe({ type: "longtask", buffered: true });
    } catch {
      // Long-task entries are not supported in every browser/test runtime.
    }

    workspacePerfLog("start", {
      blocks: Object.keys(useWorkspaceStore.getState().blocks).length,
      connectors: Object.keys(useWorkspaceStore.getState().connectors).length,
      domBlocks: document.querySelectorAll("[data-block-id]").length,
      domPaths: document.querySelectorAll("[data-workspace-canvas] svg path").length,
    });
    rafId = requestAnimationFrame(tick);
    intervalId = setInterval(() => {
      const state = useWorkspaceStore.getState();
      workspacePerfLog("sample", {
        frameCount,
        maxFrameGapMs: Math.round(maxFrameGap),
        cameraUpdates,
        storeUpdates,
        longTasks,
        longTaskTimeMs: Math.round(longTaskTime),
        blocks: Object.keys(state.blocks).length,
        connectors: Object.keys(state.connectors).length,
        domBlocks: document.querySelectorAll("[data-block-id]").length,
        domPaths: document.querySelectorAll("[data-workspace-canvas] svg path").length,
        camera: state.camera,
      });
      frameCount = 0;
      maxFrameGap = 0;
      cameraUpdates = 0;
      storeUpdates = 0;
      longTasks = 0;
      longTaskTime = 0;
    }, 1000);

    return stop;
  }, []);

  return null;
}
