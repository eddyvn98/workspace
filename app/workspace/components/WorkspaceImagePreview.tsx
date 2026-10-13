"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import type { LibraryImage } from "./WorkspaceAssetLibraryImageGrid";

type Props = {
	image: LibraryImage;
	showInfo: boolean;
	formatDate: (value: string | number) => string;
	onClose: () => void;
	onToggleInfo: (visible: boolean) => void;
};

export function WorkspaceImagePreview({ image, showInfo, formatDate, onClose, onToggleInfo }: Props) {
	const infoRef = useRef<HTMLElement>(null);
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
			if (event.key.toLowerCase() === "i" && !event.metaKey && !event.ctrlKey && !event.altKey) {
				const target = event.target as HTMLElement | null;
				if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
				event.preventDefault();
				onToggleInfo(!showInfo);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose, onToggleInfo, showInfo]);
	if (typeof document === "undefined") return null;
	return createPortal(
		<div role="presentation" className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 p-3 sm:p-8" onMouseDown={(event) => {
			if (infoRef.current?.contains(event.target as Node)) return;
			if (showInfo) onToggleInfo(false);
			else if (event.target === event.currentTarget) onClose();
		}}>
			<div role="dialog" aria-modal="true" aria-label={`Image preview: ${image.name}`} className="relative flex h-full w-full items-center justify-center">
				<Image src={image.url} alt={image.name} fill unoptimized sizes="100vw" className="object-contain" />
				<div className="absolute right-0 top-0 z-10 flex gap-2">
					<button type="button" onClick={() => onToggleInfo(!showInfo)} title="Image information (I)" aria-label="Image information" aria-pressed={showInfo} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25"><Info className="h-5 w-5" /></button>
					<button type="button" onClick={onClose} title="Close (Esc)" aria-label="Close image preview" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25"><X className="h-5 w-5" /></button>
				</div>
				{showInfo && <aside ref={infoRef} className="absolute bottom-0 left-0 z-10 max-h-[45%] w-full max-w-sm overflow-y-auto rounded-xl bg-white/95 p-4 text-sm text-slate-800 shadow-xl backdrop-blur dark:bg-slate-950/95 dark:text-slate-100">
					<p className="break-words font-semibold">{image.name}</p>
					<p className="mt-1 text-slate-500">{image.flowLabel ?? (image.source === "canvas" ? "On canvas" : "Uploaded")}</p>
					<p className="mt-2 text-xs text-slate-500">Created {formatDate(image.createdAt)} · Updated {formatDate(image.updatedAt)}</p>
				</aside>}
			</div>
		</div>, document.body);
}
