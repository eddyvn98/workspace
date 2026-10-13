"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDownUp, Check, Filter } from "lucide-react";

export type AssetSort = "created-desc" | "created-asc" | "updated-desc" | "updated-asc";

const SORT_OPTIONS: Array<{ value: AssetSort; label: string }> = [
	{ value: "created-desc", label: "Created: newest" },
	{ value: "created-asc", label: "Created: oldest" },
	{ value: "updated-desc", label: "Updated: newest" },
	{ value: "updated-asc", label: "Updated: oldest" },
];

type Props = {
	sort: AssetSort;
	setSort: (value: AssetSort) => void;
	fileType: string;
	setFileType: (value: string) => void;
	availableFileTypes: string[];
	showFileType: boolean;
};

export function AssetLibraryControls({ sort, setSort, fileType, setFileType, availableFileTypes, showFileType }: Props) {
	const [openMenu, setOpenMenu] = useState<"sort" | "filter" | null>(null);
	const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 224 });
	const menuRef = useRef<HTMLDivElement>(null);
	const sortButtonRef = useRef<HTMLButtonElement>(null);
	const filterButtonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!openMenu) return;
		const closeOutside = (event: MouseEvent) => {
			if (menuRef.current?.contains(event.target as Node) || sortButtonRef.current?.contains(event.target as Node) || filterButtonRef.current?.contains(event.target as Node)) return;
			setOpenMenu(null);
		};
		const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenMenu(null); };
		document.addEventListener("mousedown", closeOutside);
		window.addEventListener("keydown", closeOnEscape);
		return () => {
			document.removeEventListener("mousedown", closeOutside);
			window.removeEventListener("keydown", closeOnEscape);
		};
	}, [openMenu]);

	const toggleMenu = (kind: "sort" | "filter", button: HTMLButtonElement | null) => {
		if (!button) return;
		const rect = button.getBoundingClientRect();
		const width = Math.min(240, window.innerWidth - 16);
		const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
		const estimatedHeight = kind === "sort" ? 176 : Math.min(320, 44 + availableFileTypes.length * 44);
		const top = Math.min(rect.bottom + 4, window.innerHeight - estimatedHeight - 8);
		setMenuPosition({ top: Math.max(8, top), left, width });
		setOpenMenu((current) => current === kind ? null : kind);
	};
	const options = openMenu === "sort"
		? SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))
		: [{ value: "all", label: "All file types" }, ...availableFileTypes.map((value) => ({ value, label: value }))];
	const selectedValue = openMenu === "sort" ? sort : fileType;
	const setSelected = openMenu === "sort" ? (value: string) => setSort(value as AssetSort) : setFileType;

	return <>
		<div className="flex items-center gap-2 px-3 pt-3">
			<button ref={sortButtonRef} type="button" onClick={(event) => toggleMenu("sort", event.currentTarget)} title={`Sort: ${SORT_OPTIONS.find((option) => option.value === sort)?.label}`} aria-label="Sort assets" aria-expanded={openMenu === "sort"} aria-haspopup="menu" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${openMenu === "sort" ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200" : "text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}><ArrowDownUp className="h-4 w-4" /></button>
			{showFileType && <button ref={filterButtonRef} type="button" onClick={(event) => toggleMenu("filter", event.currentTarget)} title={fileType === "all" ? "Filter by file type" : `File type: ${fileType}`} aria-label="Filter by file type" aria-expanded={openMenu === "filter"} aria-haspopup="menu" className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${openMenu === "filter" || fileType !== "all" ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200" : "text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}><Filter className="h-4 w-4" />{fileType !== "all" && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-violet-600" />}</button>}
		</div>
		{openMenu && typeof document !== "undefined" && createPortal(
			<div ref={menuRef} role="menu" aria-label={openMenu === "sort" ? "Sort assets" : "Filter by file type"} style={{ position: "fixed", top: menuPosition.top, left: menuPosition.left, width: menuPosition.width, maxHeight: "min(320px, calc(100vh - 16px))" }} className="z-[130] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
				{options.map((option) => <button key={option.value} type="button" role="menuitemradio" aria-checked={selectedValue === option.value} onClick={() => { setSelected(option.value); setOpenMenu(null); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"><span className="flex h-4 w-4 shrink-0 items-center justify-center">{selectedValue === option.value && <Check className="h-4 w-4 text-violet-600" />}</span><span className="truncate">{option.label}</span></button>)}
			</div>, document.body)}
	</>;
}
