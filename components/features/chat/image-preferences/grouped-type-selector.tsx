import * as React from "react";
import { Check, ChevronDown, GripVertical, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCanvasDragEnabled } from "./canvas-drag-context";
import { PAIR_FIELD_DRAG_MIME } from "./draggable-field-wrapper";

export interface GroupedSubtypeOption {
	value: string;
	label: string;
	thumbnail?: string;
}

export interface GroupedGroupOption {
	value: string;
	label: string;
	subtypes: GroupedSubtypeOption[];
}

interface GroupedTypeSelectorProps {
	value: string;
	onChange: (value: string) => void;
	groups: GroupedGroupOption[];
	label?: string;
	placeholder?: string;
	/** Pair Canvas fieldKey this row corresponds to (see OptionFieldNode) — shows a drag grip next to the label when inside Pair Canvas's Advanced panel. */
	dragFieldKey?: string;
}

export function GroupedTypeSelector({
	value,
	onChange,
	groups,
	label = "Type",
	placeholder = "Type custom type or select from below...",
	dragFieldKey,
}: GroupedTypeSelectorProps) {
	const canvasDragEnabled = useCanvasDragEnabled();
	const containerRef = React.useRef<HTMLDivElement>(null);
	const [isSuggestionsOpen, setIsSuggestionsOpen] = React.useState(false);

	// Flatten all subtypes for search suggestions
	const allSubtypes = React.useMemo(() => {
		return groups.flatMap(group =>
			group.subtypes.map(sub => ({
				...sub,
				groupLabel: group.label,
				groupValue: group.value
			}))
		);
	}, [groups]);

	// Filter suggestions based on current value
	const suggestions = React.useMemo(() => {
		if (!value.trim()) return [];
		const query = value.toLowerCase();
		return allSubtypes.filter(
			sub => sub.label.toLowerCase().includes(query) || sub.value.toLowerCase().includes(query)
		);
	}, [allSubtypes, value]);

	// Handle click outside suggestions container to close it
	React.useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
				setIsSuggestionsOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		onChange(e.target.value);
		setIsSuggestionsOpen(true);
	};

	return (
		<div ref={containerRef} className="space-y-2.5 rounded-2xl border border-slate-100 bg-slate-50/40 p-3.5 dark:border-slate-800/40 dark:bg-slate-900/30 relative">
			<label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 flex items-center gap-1">
				<Layers className="w-3 h-3 text-slate-400" />
				{label}
				{canvasDragEnabled && dragFieldKey && (
					<span
						draggable
						onDragStart={(e) => {
							e.dataTransfer.setData(PAIR_FIELD_DRAG_MIME, JSON.stringify({ fieldKey: dragFieldKey }));
							e.dataTransfer.effectAllowed = "copy";
						}}
						title="Kéo vào canvas để tạo node"
						className="cursor-grab normal-case text-slate-300 hover:text-slate-500 active:cursor-grabbing dark:text-slate-600"
					>
						<GripVertical className="h-3 w-3" />
					</span>
				)}
			</label>

			{/* Search & Custom Input */}
			<div className="relative">
				<input
					type="text"
					value={value}
					onChange={handleInputChange}
					onFocus={() => setIsSuggestionsOpen(true)}
					placeholder={placeholder}
					className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-[11px] shadow-sm transition-all focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200 dark:focus:ring-orange-500"
				/>

				{/* Floating Search Suggestions */}
				{isSuggestionsOpen && suggestions.length > 0 && (
					<div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-lg backdrop-blur-sm z-[10000] dark:border-slate-800 dark:bg-slate-900/95 custom-scrollbar">
						{suggestions.map((sub) => {
							const isSelected = value === sub.value || value.startsWith(sub.value + " ");
							return (
								<button
									key={sub.value}
									type="button"
									onClick={() => {
										onChange(sub.value);
										setIsSuggestionsOpen(false);
									}}
									className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
								>
									<div className="flex flex-col">
										<span className="font-semibold">{sub.label}</span>
										<span className="text-[9px] text-slate-400 dark:text-slate-500">{sub.groupLabel}</span>
									</div>
									{isSelected && (
										<Check className="h-3 w-3 text-orange-500" />
									)}
								</button>
							);
						})}
					</div>
				)}
			</div>

			{/* Popover buttons in grid */}
			<div className="grid grid-cols-3 gap-2">
				{groups.map((group) => {
					// Check if any subtype in this group is active
					const activeSubtype = group.subtypes.find(
						(sub) => value === sub.value || value.startsWith(sub.value + " ")
					);
					const isActive = !!activeSubtype;

					return (
						<Popover key={group.value}>
							<PopoverTrigger asChild>
								<button
									type="button"
									className={cn(
										"flex items-center justify-between px-2.5 py-2 h-10 rounded-xl border text-[10px] font-bold transition-all w-full min-w-0",
										isActive
											? "bg-orange-500 border-orange-500 text-white shadow-sm dark:bg-orange-600 dark:border-orange-600"
											: "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
									)}
								>
									<span className="truncate mr-1">{isActive ? activeSubtype.label : group.label}</span>
									<ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
								</button>
							</PopoverTrigger>
							<PopoverContent className="z-[9999] max-h-[var(--radix-popover-content-available-height)] w-[calc(100vw-2rem)] max-w-[300px] overflow-y-auto border-slate-200 p-3 shadow-2xl dark:border-slate-800" align="start">
								<div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
									{group.label} Options
								</div>
								<div className="grid grid-cols-2 gap-2 max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
									{group.subtypes.map((sub) => {
										const isSelected = value === sub.value || value.startsWith(sub.value + " ");
										const hasThumb = sub.thumbnail;
										return (
											<button
												key={sub.value}
												type="button"
												onClick={() => {
													onChange(sub.value);
												}}
												className={cn(
													"group relative flex flex-col rounded-xl border bg-white transition-all hover:shadow-md dark:bg-slate-900 overflow-hidden",
													isSelected
														? "border-orange-500 ring-1 ring-orange-500 font-semibold"
														: "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
												)}
											>
												{hasThumb ? (
													<div className="aspect-[4/3] w-full relative bg-slate-100 dark:bg-slate-850 overflow-hidden">
														<img src={sub.thumbnail} alt={sub.label} draggable={false} className="h-full w-full object-cover" />
														<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
															<p className="text-[9px] font-bold text-white truncate text-left">{sub.label}</p>
														</div>
														{isSelected && (
															<div className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-white">
																<Check className="h-2.5 w-2.5 stroke-[3]" />
															</div>
														)}
													</div>
												) : (
													<div className="p-2 flex w-full items-center justify-between text-left h-full min-h-[40px]">
														<span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate">{sub.label}</span>
														{isSelected && <Check className="h-3 w-3 text-orange-500" />}
													</div>
												)}
											</button>
										);
									})}
								</div>
							</PopoverContent>
						</Popover>
					);
				})}
			</div>
		</div>
	);
}
