"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Download, Info, Plus, Trash2 } from "lucide-react";
import type { WorkspaceResource } from "../types/assets";
import { WorkspaceImagePreview } from "./WorkspaceImagePreview";

export type LibraryImage = {
	key: string;
	name: string;
	url: string;
	resourceId?: string;
	flowLabel?: string;
	source: "canvas" | "resource";
	createdAt: string | number;
	updatedAt: string | number;
	block?: import("../types/block").CanvasBlock<"image">;
	resource?: WorkspaceResource;
};

function getDownloadName(image: LibraryImage) {
	const rawName = image.resource?.filename || image.name || image.block?.data.alt || "workspace-image";
	const name = rawName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim() || "workspace-image";
	if (/\.[a-z\d]{2,5}$/i.test(name)) return name;
	const source = image.block?.data.downloadUrl || image.url;
	const extension = source.match(/\.(png|jpe?g|webp|gif|avif)(?:[?#]|$)/i)?.[1];
	return `${name}${extension ? `.${extension}` : ".png"}`;
}

type Props = {
	images: LibraryImage[];
	isReadOnly: boolean;
	deletingId: string;
	formatDate: (value: string | number) => string;
	addImage: (image: LibraryImage) => void;
	removeCanvasImage: (image: LibraryImage) => void;
	deleteStoredResource: (resource: NonNullable<LibraryImage["resource"]>) => void;
	deleteSelectedImages: (images: LibraryImage[]) => void;
};

export function WorkspaceAssetLibraryImageGrid({ images, isReadOnly, deletingId, formatDate, addImage, removeCanvasImage, deleteStoredResource, deleteSelectedImages }: Props) {
	const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
	const [anchorKey, setAnchorKey] = useState("");
	const [infoKey, setInfoKey] = useState("");
	const [previewKey, setPreviewKey] = useState("");
	const gridRef = useRef<HTMLDivElement>(null);
	const selectedImage = images.find((image) => image.key === infoKey);
	const selectedImages = images.filter((image) => selectedKeys.includes(image.key));
	const previewImage = images.find((image) => image.key === previewKey);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (previewKey || event.metaKey || event.ctrlKey || event.altKey) return;
			const target = event.target as HTMLElement | null;
			if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
			if (event.key.toLowerCase() !== "i") return;
			const current = selectedKeys.at(-1);
			if (!current) return;
			event.preventDefault();
			setInfoKey((value) => value === current ? "" : current);
		};
		const onOutsideClick = (event: globalThis.MouseEvent) => {
			if (infoKey && !gridRef.current?.contains(event.target as Node)) setInfoKey("");
		};
		window.addEventListener("keydown", onKeyDown);
		document.addEventListener("mousedown", onOutsideClick);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("mousedown", onOutsideClick);
		};
	}, [infoKey, previewKey, selectedKeys]);

	const selectImage = (image: LibraryImage, event: ReactMouseEvent<HTMLButtonElement>) => {
		const index = images.findIndex((item) => item.key === image.key);
		const anchorIndex = images.findIndex((item) => item.key === anchorKey);
		if (event.shiftKey && anchorIndex >= 0) {
			const range = images.slice(Math.min(index, anchorIndex), Math.max(index, anchorIndex) + 1).map((item) => item.key);
			setSelectedKeys((current) => event.ctrlKey || event.metaKey ? [...new Set([...current, ...range])] : range);
		} else if (event.ctrlKey || event.metaKey) {
			setSelectedKeys((current) => current.includes(image.key) ? current.filter((key) => key !== image.key) : [...current, image.key]);
			setAnchorKey(image.key);
		} else {
			setSelectedKeys([image.key]);
			setAnchorKey(image.key);
		}
		setInfoKey("");
	};

	return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
		<div ref={gridRef} className="contents">
			{selectedImages.length > 0 && <div className="col-span-full flex items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm dark:border-violet-900 dark:bg-violet-950/40">
				<span className="text-slate-700 dark:text-slate-200">{selectedImages.length} selected</span>
				<div className="flex items-center gap-1">
					<button type="button" onClick={() => setSelectedKeys([])} title="Clear selection" aria-label="Clear selection" className="rounded-md p-2 text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-900"><span className="text-xs">Clear</span></button>
					<button type="button" disabled={isReadOnly || Boolean(deletingId)} onClick={() => deleteSelectedImages(selectedImages)} title="Delete selected images" aria-label={`Delete ${selectedImages.length} selected images`} className="flex items-center gap-1 rounded-md p-2 text-red-600 hover:bg-white disabled:opacity-50 dark:hover:bg-slate-900"><Trash2 className="h-4 w-4" /><span className="text-xs">Delete</span></button>
				</div>
			</div>}
		{images.map((image) => {
			const selected = selectedKeys.includes(image.key);
			const actionsVisible = selected;
			return <article key={image.key} className={`group relative aspect-square overflow-hidden rounded-xl border bg-slate-100 dark:bg-slate-900 ${selected ? "border-violet-500 ring-2 ring-violet-200 dark:ring-violet-900" : "border-slate-200 dark:border-slate-800"}`}>
				<button type="button" onClick={(event) => selectImage(image, event)} onDoubleClick={() => { setSelectedKeys([image.key]); setPreviewKey(image.key); setInfoKey(""); }} aria-label={`Select ${image.name}; double-click to view`} aria-pressed={selected} className="absolute inset-0 z-0 h-full w-full cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"><Image src={image.url} alt="" fill unoptimized sizes="(max-width: 440px) 33vw, 140px" className="object-cover" /></button>
				<div className={`pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-black/35 via-transparent to-black/35 transition-opacity ${actionsVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`} />
				<div className={`pointer-events-none absolute inset-1 z-20 flex flex-col justify-between transition-opacity ${actionsVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}>
					<div className="flex justify-between gap-1">
						<button type="button" onClick={() => { setSelectedKeys([image.key]); setAnchorKey(image.key); setInfoKey((current) => current === image.key ? "" : image.key); }} title="Image information (I)" aria-label={`Image information: ${image.name}`} aria-expanded={infoKey === image.key} className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/90 text-slate-700 shadow hover:bg-white sm:h-9 sm:w-9"><Info className="h-4 w-4" /></button>
						<button type="button" disabled={isReadOnly} onClick={() => addImage(image)} title="Add to canvas" aria-label={`Add ${image.name} to canvas`} className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/90 text-violet-700 shadow hover:bg-white disabled:opacity-50 sm:h-9 sm:w-9"><Plus className="h-4 w-4" /></button>
					</div>
					<div className="flex justify-between gap-1">
						<a href={image.block?.data.downloadUrl || image.url} download={getDownloadName(image)} title="Download image" aria-label={`Download ${image.name}`} className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/90 text-slate-700 shadow hover:bg-white sm:h-9 sm:w-9"><Download className="h-4 w-4" /></a>
						{image.source === "canvas" ? <button type="button" disabled={isReadOnly} onClick={() => removeCanvasImage(image)} title="Remove from canvas" aria-label={`Remove ${image.name} from canvas`} className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/90 text-red-600 shadow hover:bg-white disabled:opacity-50 sm:h-9 sm:w-9"><Trash2 className="h-4 w-4" /></button> : <button type="button" disabled={isReadOnly || deletingId === image.resource?.id} onClick={() => image.resource && deleteStoredResource(image.resource)} title="Delete stored image" aria-label={`Delete ${image.name}`} className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/90 text-red-600 shadow hover:bg-white disabled:opacity-50 sm:h-9 sm:w-9"><Trash2 className="h-4 w-4" /></button>}
					</div>
				</div>
			</article>;
		})}
		{selectedImage && <aside className="col-span-full rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-950">
			<p className="break-words font-medium text-slate-900 dark:text-slate-100">{selectedImage.name}</p>
			<p className="mt-1 text-xs text-slate-500">{selectedImage.flowLabel ?? (selectedImage.source === "canvas" ? "On canvas" : "Uploaded")}</p>
			<p className="mt-1 text-xs text-slate-500">Created {formatDate(selectedImage.createdAt)} · Updated {formatDate(selectedImage.updatedAt)}</p>
		</aside>}
		</div>
		{previewImage && <WorkspaceImagePreview image={previewImage} showInfo={false} formatDate={formatDate} onClose={() => setPreviewKey("")} onToggleInfo={() => {}} />}
	</div>;
}
