"use client";

import { useState } from "react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type AIModel, AIModelGroups } from "@/lib/ai-models";
import { cn } from "@/lib/utils";
import { useMessageStore } from "@/stores/useMessageStore";
import { Image, File, ChevronDown, Check } from "lucide-react";

// ─── Capability badges ────────────────────────────────────────────────────────

function CapabilityBadge({ capability }: { capability: string }) {
	const isImage = capability === "image";
	return (
		<span
			className={cn(
				"inline-flex items-center justify-center w-5 h-5 rounded-md",
				isImage
					? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
					: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
			)}
			title={isImage ? "Supports images" : "Supports files"}
		>
			{isImage ? <Image className="w-3 h-3" /> : <File className="w-3 h-3" />}
		</span>
	);
}

// ─── Individual model row ─────────────────────────────────────────────────────

function ModelRow({
	model,
	isSelected,
	onSelect,
	compact,
	showCapabilities,
}: {
	model: AIModel;
	isSelected: boolean;
	onSelect: () => void;
	compact: boolean;
	showCapabilities: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"w-full flex items-center text-left",
				compact ? "gap-2 px-2 py-1.5 rounded-lg" : "gap-3 px-3 py-2.5 rounded-xl",
				"transition-colors duration-150",
				isSelected
					? "bg-orange-50 dark:bg-orange-950/40"
					: "hover:bg-slate-50 dark:hover:bg-slate-800/60",
			)}
		>
			{/* Provider icon */}
			<div className={cn(
				"flex-shrink-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
				compact ? "w-6 h-6 rounded-md" : "w-7 h-7 rounded-lg",
			)}>
				<span className={cn("leading-none", compact ? "text-sm" : "text-base")}>{model.icon}</span>
			</div>

			{/* Model name */}
			<span
				className={cn(
					"flex-1 font-medium truncate",
					compact ? "text-xs" : "text-sm",
					isSelected
						? "text-orange-700 dark:text-orange-300"
						: "text-slate-800 dark:text-slate-200",
				)}
			>
				{model.name}
			</span>

			{/* Right side: capabilities + checkmark */}
			<div className={cn("flex-shrink-0 flex items-center", compact ? "gap-1" : "gap-1.5")}>
				{showCapabilities && model.capabilities?.map((cap) => (
					<CapabilityBadge key={cap} capability={cap} />
				))}
				<span className={cn(compact ? "w-3.5 h-3.5" : "w-4 h-4", "flex items-center justify-center", isSelected ? "opacity-100" : "opacity-0")}>
					<Check className={compact ? "w-3 h-3 text-orange-500" : "w-3.5 h-3.5 text-orange-500"} />
				</span>
			</div>
		</button>
	);
}

// ─── Main launcher ────────────────────────────────────────────────────────────

export function AIActionLauncher({
	variant = "default",
	hiddenGroupIds = [],
	visibleModelIds,
	compact = false,
	showCapabilities = true,
	showLegend = true,
}: {
	variant?: "default" | "ghost";
	/** Provider groups hidden only in the caller's selector instance. */
	hiddenGroupIds?: readonly string[];
	/** Model IDs shown only in the caller's selector instance. */
	visibleModelIds?: readonly string[];
	compact?: boolean;
	showCapabilities?: boolean;
	showLegend?: boolean;
}) {
	const { selectedModel, setSelectedModel } = useMessageStore();
	const [open, setOpen] = useState(false);
	const hiddenGroups = new Set(hiddenGroupIds);
	const visibleModels = visibleModelIds ? new Set(visibleModelIds) : null;
	const visibleGroups = AIModelGroups
		.filter((group) => !hiddenGroups.has(group.id))
		.map((group) => ({
			...group,
			models: visibleModels ? group.models.filter((model) => visibleModels.has(model.id)) : group.models,
		}))
		.filter((group) => group.models.length > 0);

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						"inline-flex items-center gap-1.5 h-9 rounded-full text-xs font-medium transition-colors duration-150 focus:outline-none",
						variant === "ghost"
							? "bg-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
							: "bg-slate-50 border border-slate-200 text-slate-700 hover:bg-white hover:border-slate-300 hover:text-slate-900 dark:bg-slate-800/60 dark:border-orange-900/40 dark:text-slate-300 dark:hover:bg-orange-950/40 dark:hover:border-orange-700/60 dark:hover:text-orange-200"
					)}
					aria-label="Select AI model"
				>
					<span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
						{selectedModel?.icon}
					</span>
					<span className="max-w-[120px] truncate">{selectedModel?.name}</span>
					<ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
				</button>
			</DropdownMenuTrigger>

			<DropdownMenuContent
				align="start"
				sideOffset={6}
				className={cn(
					compact ? "w-64 p-1 rounded-xl" : "w-72 p-1.5 rounded-xl",
					compact
						? "max-h-[min(30vh,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto"
						: "max-h-[min(60vh,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto",
					"bg-white border-slate-200",
					"dark:bg-slate-900 dark:border-orange-900/30 dark:shadow-black/60",
				)}
			>
				<div className="space-y-0.5">
					{visibleGroups.map((group, groupIdx) => (
						<div key={group.id}>
							{/* Provider group header */}
							<div className={cn(compact ? "px-2 pt-1 pb-0.5" : "px-2.5 pt-1.5 pb-0.5")}>
								<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-orange-500/60">
									{group.name}
								</span>
							</div>

							{/* Models in this group */}
							{group.models.map((model) => (
								<ModelRow
									key={model.id}
									model={model}
									isSelected={selectedModel?.id === model.id}
									compact={compact}
									showCapabilities={showCapabilities}
									onSelect={() => {
										setSelectedModel(model);
										setOpen(false);
									}}
								/>
							))}

							{/* Divider between groups (not after the last one) */}
							{groupIdx < visibleGroups.length - 1 && (
								<div className="my-1.5 border-t border-slate-100 dark:border-slate-800" />
							)}
						</div>
					))}
				</div>

				{/* Legend */}
				{showLegend && <div className="mt-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2.5">
					<div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
						<span className="inline-flex items-center justify-center w-4 h-4 rounded bg-sky-100 dark:bg-sky-900/30">
							<File className="w-2.5 h-2.5 text-sky-600 dark:text-sky-400" />
						</span>
						File
					</div>
					<div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
						<span className="inline-flex items-center justify-center w-4 h-4 rounded bg-emerald-100 dark:bg-emerald-900/30">
							<Image className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
						</span>
						Image
					</div>
				</div>}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
