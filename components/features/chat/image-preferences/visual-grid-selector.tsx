"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ImagePreferenceOption } from "./image-preference.constants";
import { ThumbnailPreviewTooltip } from "./thumbnail-preview-tooltip";
import { useCanvasDragEnabled } from "./canvas-drag-context";
import { PAIR_FIELD_DRAG_MIME } from "./draggable-field-wrapper";

interface VisualGridSelectorProps {
	value: string;
	onChange: (val: string) => void;
	options: ImagePreferenceOption[];
	placeholder?: string;
	label?: string;
	className?: string;
	editable?: boolean;
	multiple?: boolean;
	layout?: "grid" | "list";
	searchable?: boolean;
	/** Pair Canvas fieldKey this row corresponds to (see OptionFieldNode) — shows a drag grip next to the label when inside Pair Canvas's Advanced panel. */
	dragFieldKey?: string;
}

export function VisualGridSelector({
	value,
	onChange,
	options,
	placeholder = "Select an option",
	label,
	className,
	editable = false,
	multiple = false,
	layout = "grid",
	searchable = true,
	dragFieldKey,
}: VisualGridSelectorProps) {
	const canvasDragEnabled = useCanvasDragEnabled();
	const [open, setOpen] = React.useState(false);
	const [searchQuery, setSearchQuery] = React.useState("");
	const [collapsedGroups, setCollapsedGroups] = React.useState<Record<string, boolean>>({});

	const [failedImages, setFailedImages] = React.useState<Record<string, boolean>>({});

	const selectedOptions = React.useMemo(() => {
		if (!multiple) {
			const found = options.find((opt) => opt.value === value);
			return found ? [found] : [];
		}
		const values = value ? value.split(",").map((v) => v.trim()).filter(Boolean) : [];
		return options.filter((opt) => values.includes(opt.value));
	}, [value, options, multiple]);

	const hasThumbnail = (option: ImagePreferenceOption) => {
		return option.thumbnail && !failedImages[option.thumbnail];
	};

	const filteredOptions = React.useMemo(() => {
		if (!searchQuery) return options;
		const query = searchQuery.toLowerCase();
		return options.filter(
			(opt) =>
				opt.label.toLowerCase().includes(query) ||
				opt.value.toLowerCase().includes(query)
		);
	}, [options, searchQuery]);

	const hasGroups = React.useMemo(() => {
		return options.some((opt) => opt.group);
	}, [options]);

	const groupedOptions = React.useMemo(() => {
		if (!hasGroups) return null;
		const groups: Record<string, ImagePreferenceOption[]> = {};
		filteredOptions.forEach((opt) => {
			const gName = opt.group || "Other";
			if (!groups[gName]) {
				groups[gName] = [];
			}
			groups[gName].push(opt);
		});
		return groups;
	}, [filteredOptions, hasGroups]);

	const toggleGroup = (groupName: string) => {
		setCollapsedGroups((prev) => ({
			...prev,
			[groupName]: !prev[groupName],
		}));
	};

	return (
		<div className={cn("flex flex-col w-full space-y-1", className)}>
			{label && (
				<div className="flex items-center gap-1">
					{canvasDragEnabled && dragFieldKey && (
						<span
							draggable
							onDragStart={(e) => {
								e.dataTransfer.setData(PAIR_FIELD_DRAG_MIME, JSON.stringify({ fieldKey: dragFieldKey }));
								e.dataTransfer.effectAllowed = "copy";
							}}
							title="Kéo vào canvas để tạo node"
							className="cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing dark:text-slate-600"
						>
							<GripVertical className="h-3 w-3" />
						</span>
					)}
					<label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
						{label}
					</label>
				</div>
			)}
			<Popover open={open} onOpenChange={(val) => {
				setOpen(val);
				if (!val) setSearchQuery("");
			}}>
				<div className="flex h-10 w-full items-center overflow-hidden rounded-md border border-slate-200 bg-white text-xs shadow-sm transition-all hover:bg-slate-50 focus-within:ring-1 focus-within:ring-orange-500 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-800/80">
					<div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
						{multiple ? (
							selectedOptions.length > 0 ? (
								<div className="flex items-center gap-1.5 overflow-hidden flex-wrap max-h-8 py-0.5">
									{selectedOptions.slice(0, 2).map((opt) => (
										<div key={opt.value} className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/60 px-2 py-0.5 rounded text-[10px] font-medium max-w-[120px] truncate border dark:border-slate-800">
											{hasThumbnail(opt) && (
												<div className="h-3.5 w-3.5 flex-shrink-0 rounded-sm overflow-hidden border">
													<img src={opt.thumbnail} className="h-full w-full object-cover" />
												</div>
											)}
											<span className="truncate">{opt.label}</span>
										</div>
									))}
									{selectedOptions.length > 2 && (
										<span className="text-[10px] text-slate-400 font-medium shrink-0">
											+{selectedOptions.length - 2}
										</span>
									)}
								</div>
							) : (
								<span className="truncate text-muted-foreground">{placeholder}</span>
							)
						) : (
							<>
								{selectedOptions[0] && hasThumbnail(selectedOptions[0]) ? (
									<div className="h-6 w-6 flex-shrink-0 rounded overflow-hidden border dark:border-slate-700">
										<img
											src={selectedOptions[0].thumbnail}
											alt=""
											className="h-full w-full object-cover"
											onError={() => {
												if (selectedOptions[0].thumbnail) {
													setFailedImages((prev) => ({ ...prev, [selectedOptions[0].thumbnail!]: true }));
												}
											}}
										/>
									</div>
								) : null}
								{editable ? (
									<input
										value={value}
										onChange={(e) => onChange(e.target.value)}
										placeholder={placeholder}
										className={cn(
											"h-6 min-w-0 flex-1 bg-transparent text-xs outline-none",
											!value && "text-muted-foreground",
										)}
									/>
								) : (
									<span className={cn("truncate", !selectedOptions[0] && "text-muted-foreground")}>
										{selectedOptions[0] ? selectedOptions[0].label : value ? value : placeholder}
									</span>
								)}
							</>
						)}
					</div>
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label={`Open ${label ?? placeholder}`}
							className="flex h-full w-10 shrink-0 items-center justify-center border-l border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/80"
						>
							<ChevronDown className="h-4 w-4 opacity-50" />
						</button>
					</PopoverTrigger>
				</div>
				<PopoverContent 
					className="w-[calc(100vw-2rem)] max-w-[420px] p-0 shadow-2xl border-slate-200 dark:border-slate-800" 
					align="start" 
					sideOffset={8}
				>
					<div className="border-b bg-slate-50/80 px-3 py-2.5 dark:bg-slate-900/80 flex flex-col gap-2">
						<h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
							{placeholder}
						</h4>
						{layout !== "list" && searchable && (
							<input
								type="text"
								placeholder="Search options..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="w-full h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:ring-1 focus:ring-orange-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
								autoFocus
							/>
						)}
					</div>
					<div className="overflow-y-auto max-h-[400px] p-3 custom-scrollbar scroll-smooth">
						{filteredOptions.length === 0 ? (
							<div className="text-center py-6 text-xs text-slate-400 dark:text-slate-500">
								No options found
							</div>
						) : hasGroups && groupedOptions ? (
							<div className="space-y-4">
								{Object.entries(groupedOptions).map(([groupName, groupItems]) => {
									const isCollapsed = !!collapsedGroups[groupName];
									return (
										<div key={groupName} className="space-y-2">
											<button
												type="button"
												onClick={() => toggleGroup(groupName)}
												className="flex w-full items-center justify-between text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1 border-b border-slate-100 dark:border-slate-800 pb-1 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
											>
												<span>{groupName}</span>
												{isCollapsed ? (
													<ChevronRight className="w-3 h-3" />
												) : (
													<ChevronDown className="w-3 h-3" />
												)}
											</button>
											{!isCollapsed && (
												<div className={cn(
													layout === "list" 
														? "flex flex-col gap-1 w-full" 
														: "grid grid-cols-3 gap-2 animate-in fade-in slide-in-from-top-1 duration-200"
												)}>
													{groupItems.map((option) => {
														const isSelected = multiple
															? (value ? value.split(",").map((v) => v.trim()).includes(option.value) : false)
															: option.value === value;
														const showThumb = layout !== "list" && hasThumbnail(option);
														return (
															<button
																key={option.value}
																onClick={() => {
																	if (multiple) {
																		const values = value ? value.split(",").map((v) => v.trim()).filter(Boolean) : [];
																		const index = values.indexOf(option.value);
																		let nextValues: string[];
																		if (index > -1) {
																			nextValues = values.filter((v) => v !== option.value);
																		} else {
																			nextValues = [...values, option.value];
																		}
																		onChange(nextValues.join(", "));
																	} else {
																		onChange(value === option.value ? "" : option.value);
																		setOpen(false);
																	}
																}}
																className={cn(
																	layout === "list"
																		? "group relative flex w-full items-center justify-between gap-3 px-3 py-2 text-left rounded-lg border bg-white transition-all hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/80"
																		: "group relative flex min-h-14 flex-col rounded-xl border bg-white transition-all hover:shadow-md hover:z-30 dark:bg-slate-900",
																	showThumb && "bg-transparent dark:bg-transparent",
																	isSelected
																		? "border-orange-500 ring-1 ring-orange-500 font-semibold"
																		: layout === "list"
																			? "border-slate-100 hover:border-slate-200 dark:border-slate-800/40 dark:hover:border-slate-800"
																			: "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
																)}
															>
																{showThumb ? (
																	<ThumbnailPreviewTooltip
																		thumbnail={option.thumbnail!}
																		label={option.label}
																		isSelected={isSelected}
																		onImageError={() => {
																			if (option.thumbnail) {
																				setFailedImages((prev) => ({ ...prev, [option.thumbnail!]: true }));
																			}
																		}}
																	/>
																) : (
																	<div className="flex w-full items-center justify-between gap-2 text-left">
																		<p className="text-[11px] font-medium leading-snug text-slate-700 dark:text-slate-200">
																			{option.label}
																		</p>
																		{isSelected && (
																			<Check className="h-3.5 w-3.5 shrink-0 text-orange-500 dark:text-orange-400 stroke-[3]" />
																		)}
																	</div>
																)}
															</button>
														);
													})}
												</div>
											)}
										</div>
									);
								})}
							</div>
						) : (
							<div className={cn(
								layout === "list" 
									? "flex flex-col gap-1 w-full" 
									: "grid grid-cols-3 gap-2 animate-in fade-in duration-200"
							)}>
								{filteredOptions.map((option) => {
									const isSelected = multiple
										? (value ? value.split(",").map((v) => v.trim()).includes(option.value) : false)
										: option.value === value;
									const showThumb = layout !== "list" && hasThumbnail(option);
									return (
										<button
											key={option.value}
											onClick={() => {
												if (multiple) {
													const values = value ? value.split(",").map((v) => v.trim()).filter(Boolean) : [];
													const index = values.indexOf(option.value);
													let nextValues: string[];
													if (index > -1) {
														nextValues = values.filter((v) => v !== option.value);
													} else {
														nextValues = [...values, option.value];
													}
													onChange(nextValues.join(", "));
												} else {
													onChange(value === option.value ? "" : option.value);
													setOpen(false);
												}
											}}
											className={cn(
												layout === "list"
													? "group relative flex w-full items-center justify-between gap-3 px-3 py-2 text-left rounded-lg border bg-white transition-all hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/80"
													: "group relative flex min-h-14 flex-col rounded-xl border bg-white transition-all hover:shadow-md hover:z-30 dark:bg-slate-900",
												showThumb && "bg-transparent dark:bg-transparent",
												isSelected
													? "border-orange-500 ring-1 ring-orange-500 font-semibold"
													: layout === "list"
														? "border-slate-100 hover:border-slate-200 dark:border-slate-800/40 dark:hover:border-slate-800"
														: "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
											)}
										>
											{showThumb ? (
												<ThumbnailPreviewTooltip
													thumbnail={option.thumbnail!}
													label={option.label}
													isSelected={isSelected}
													onImageError={() => {
														if (option.thumbnail) {
															setFailedImages((prev) => ({ ...prev, [option.thumbnail!]: true }));
														}
													}}
												/>
											) : (
												<div className="flex w-full items-center justify-between gap-2 text-left">
													<p className="text-[11px] font-medium leading-snug text-slate-700 dark:text-slate-200">
														{option.label}
													</p>
													{isSelected && (
														<Check className="h-3.5 w-3.5 shrink-0 text-orange-500 dark:text-orange-400 stroke-[3]" />
													)}
												</div>
											)}
										</button>
									);
								})}
							</div>
						)}

					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}
