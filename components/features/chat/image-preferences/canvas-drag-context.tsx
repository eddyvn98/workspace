"use client";

import * as React from "react";

/**
 * Whether the Advanced options panel is currently rendered inside Pair
 * Canvas (which has a canvas next to it to drop a field onto) rather than
 * the main chat composer (which doesn't). The shared field components
 * (VisualGridSelector, GroupedTypeSelector, LightingWeatherSelector) read
 * this to decide whether to show their drag grip at all.
 */
const CanvasDragContext = React.createContext(false);

export function CanvasDragProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
	return <CanvasDragContext.Provider value={enabled}>{children}</CanvasDragContext.Provider>;
}

export function useCanvasDragEnabled(): boolean {
	return React.useContext(CanvasDragContext);
}
