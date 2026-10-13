"use client";

import * as React from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/** MIME type used to carry the dragged field's key onto the Pair Canvas drop target. */
export const PAIR_FIELD_DRAG_MIME = "application/x-pair-field";

interface DraggableFieldWrapperProps {
	fieldKey: string;
	children: React.ReactNode;
	className?: string;
	/** Set false to render children with no grip/wrapper at all (e.g. outside Pair Canvas, where there's no canvas to drop onto). Defaults true. */
	enabled?: boolean;
}

/**
 * Wraps an existing settings row (Model selector, a Style dropdown, the
 * Negative Prompt textarea, ...) with a small grip handle so the exact
 * control already rendered in the panel — not a separate stand-in — can be
 * dragged onto the Pair Canvas to materialize as a node there. Only the grip
 * initiates the drag; the control underneath keeps working normally.
 */
export function DraggableFieldWrapper({ fieldKey, children, className, enabled = true }: DraggableFieldWrapperProps) {
	if (!enabled) return <>{children}</>;
	return (
		<div className={cn("group/drag relative flex items-start gap-1", className)}>
			<div
				draggable
				onDragStart={(e) => {
					e.dataTransfer.setData(PAIR_FIELD_DRAG_MIME, JSON.stringify({ fieldKey }));
					e.dataTransfer.effectAllowed = "copy";
				}}
				title="Kéo vào canvas để tạo node"
				className="mt-1 flex h-5 w-3.5 shrink-0 cursor-grab items-center justify-center rounded text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing group-hover/drag:opacity-100 dark:text-slate-600 dark:hover:bg-slate-800"
			>
				<GripVertical className="h-3.5 w-3.5" />
			</div>
			<div className="min-w-0 flex-1">{children}</div>
		</div>
	);
}
