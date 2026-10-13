import { useCallback, useEffect, useRef, useState } from "react";

/** Mirrors the legacy minimap: show briefly after zoom changes, then hide. */
export function useWorkspaceMinimapAutoShow(zoom: number) {
  const [showMinimap, setShowMinimap] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastZoomRef = useRef<number | null>(null);
  const hoveredRef = useRef(false);

  const scheduleHide = useCallback((delay = 2500) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!hoveredRef.current) setShowMinimap(false);
    }, delay);
  }, []);

  useEffect(() => {
    if (lastZoomRef.current !== null && lastZoomRef.current !== zoom) {
      setShowMinimap(true);
      scheduleHide();
    }
    lastZoomRef.current = zoom;
  }, [scheduleHide, zoom]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleMouseEnter = useCallback(() => {
    hoveredRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hoveredRef.current = false;
    scheduleHide();
  }, [scheduleHide]);

  return { showMinimap, setShowMinimap, handleMouseEnter, handleMouseLeave };
}
