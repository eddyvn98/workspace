"use client";

import * as React from "react";
import { Check } from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

interface ThumbnailPreviewTooltipProps {
	thumbnail: string;
	label: string;
	isSelected: boolean;
	onImageError: () => void;
}

export function ThumbnailPreviewTooltip({
	thumbnail,
	label,
	isSelected,
	onImageError,
}: ThumbnailPreviewTooltipProps) {
	const [previewOpen, setPreviewOpen] = React.useState(false);
	const triggerRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		if (!previewOpen) return;

		const closeWhenOutsideTrigger = (event: PointerEvent | MouseEvent) => {
			const rect = triggerRef.current?.getBoundingClientRect();
			if (!rect) {
				setPreviewOpen(false);
				return;
			}

			const isInsideTrigger =
				event.clientX >= rect.left &&
				event.clientX <= rect.right &&
				event.clientY >= rect.top &&
				event.clientY <= rect.bottom;

			if (!isInsideTrigger) {
				setPreviewOpen(false);
			}
		};

		document.addEventListener("pointermove", closeWhenOutsideTrigger, true);
		document.addEventListener("mousemove", closeWhenOutsideTrigger, true);

		return () => {
			document.removeEventListener("pointermove", closeWhenOutsideTrigger, true);
			document.removeEventListener("mousemove", closeWhenOutsideTrigger, true);
		};
	}, [previewOpen]);

	return (
		<TooltipProvider delayDuration={150} disableHoverableContent>
			<Tooltip
				open={previewOpen}
				onOpenChange={setPreviewOpen}
				disableHoverableContent
			>
				<TooltipTrigger asChild>
					<div
						ref={triggerRef}
						className="aspect-[4/3] w-full relative bg-slate-100 dark:bg-slate-800 rounded-t-xl overflow-hidden group/thumb cursor-pointer"
						onPointerEnter={() => setPreviewOpen(true)}
						onPointerLeave={() => setPreviewOpen(false)}
						onMouseEnter={() => setPreviewOpen(true)}
						onMouseLeave={() => setPreviewOpen(false)}
						onPointerCancel={() => setPreviewOpen(false)}
						onBlur={() => setPreviewOpen(false)}
					>
						<img
							src={thumbnail}
							alt={label}
							draggable={false}
							className="h-full w-full object-cover transition-transform duration-300 group-hover/thumb:scale-105"
							onError={onImageError}
						/>
						<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-6 pb-2 px-2.5">
							<p className="text-[11px] font-bold text-white drop-shadow-sm truncate text-left">
								{label}
							</p>
						</div>
						{isSelected && (
							<div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm animate-in zoom-in-50 duration-200">
								<Check className="h-3 w-3 stroke-[3]" />
							</div>
						)}
					</div>
				</TooltipTrigger>
				<TooltipContent side="right" align="center" className="pointer-events-none p-0 border-0 bg-transparent shadow-2xl z-[9999] overflow-hidden rounded-xl animate-in zoom-in-95 duration-200">
					<div className="flex flex-col bg-slate-900 border border-slate-850 rounded-xl p-1.5 shadow-2xl">
						<img src={thumbnail} alt={label} draggable={false} className="w-64 h-64 object-cover rounded-lg" />
						<p className="text-[10px] font-semibold text-slate-200 mt-1 px-1 text-center truncate w-64">{label}</p>
					</div>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
