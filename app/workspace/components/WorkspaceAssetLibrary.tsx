"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Images, Link2, LoaderCircle, Plus, Search, Trash2, Video, X } from "lucide-react";
import { AssetLibraryControls, type AssetSort } from "./AssetLibraryControls";
import { type LibraryImage } from "./WorkspaceAssetLibraryImageGrid";
import { WorkspaceAssetLibraryResults } from "./WorkspaceAssetLibraryResults";
import type { AssetLibraryTab, LibraryLink, LibraryVideo, WorkspaceResource } from "../types/assets";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { createBlockId, createDualTransform, type CanvasBlock } from "../types/block";
import { isImageFlowBlock } from "../types/imageFlow";
import { getLegacyTableTransform } from "../utils/workspaceTablePlacement";
import { useWorkspaceRemoteBoardId } from "../hooks/useWorkspaceRemoteBoardId";
import { getImageFlowAssetLabel } from "../utils/imageFlowLabels";

function sortAssets<T extends { createdAt: string | number; updatedAt: string | number }>(items: T[], sort: AssetSort): T[] {
	const key = sort.startsWith("created") ? "createdAt" : "updatedAt";
	const direction = sort.endsWith("asc") ? 1 : -1;
	return [...items].sort((a, b) => (new Date(a[key]).getTime() - new Date(b[key]).getTime()) * direction);
}

function formatDate(value: string | number): string {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString();
}

function formatSize(value: string): string {
	const bytes = Number(value);
	if (!Number.isFinite(bytes) || bytes < 0) return "";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WorkspaceAssetLibrary() {
	const [open, setOpen] = useState(false);
	const [tab, setTab] = useState<AssetLibraryTab>("images");
	const [query, setQuery] = useState("");
	const [searchOpen, setSearchOpen] = useState(false);
	const searchRef = useRef<HTMLInputElement>(null);
	const [sort, setSort] = useState<AssetSort>("created-desc");
	const [fileType, setFileType] = useState("all");
	const [resources, setResources] = useState<WorkspaceResource[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const boardId = useWorkspaceStore((state) => state.boardId);
	const remoteBoardId = useWorkspaceRemoteBoardId(boardId);
	const blocks = useWorkspaceStore((state) => state.blocks);
	const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
	const addBlock = useWorkspaceStore((state) => state.addBlock);
	const removeBlock = useWorkspaceStore((state) => state.removeBlock);
	const removeConnector = useWorkspaceStore((state) => state.removeConnector);
	const setSelection = useWorkspaceStore((state) => state.setSelection);
	const [deletingId, setDeletingId] = useState("");
	useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);

	useEffect(() => {
		if (!open || !remoteBoardId) return;
		const controller = new AbortController();
		setLoading(true);
		setError("");
		fetch(`/api/workspaces/${encodeURIComponent(remoteBoardId)}/resources`, { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) throw new Error(`Could not load assets (${response.status}).`);
				const data = await response.json() as { resources?: WorkspaceResource[] };
				setResources(Array.isArray(data.resources) ? data.resources : []);
			})
			.catch((reason: unknown) => {
				if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load assets.");
			})
			.finally(() => { if (!controller.signal.aborted) setLoading(false); });
		return () => controller.abort();
	}, [open, remoteBoardId]);

	const images = useMemo<LibraryImage[]>(() => {
		const canvasImages = Object.values(blocks)
			.filter((block): block is CanvasBlock<"image"> => block.type === "image")
			.filter((block) => Boolean(block.data.url))
			.map((block) => ({
				key: `block:${block.id}`,
				name: getImageFlowAssetLabel(blocks, block),
				url: block.data.url,
				resourceId: block.data.resourceId,
				flowLabel: block.data.imageFlowOrigin ? getImageFlowAssetLabel(blocks, block) : undefined,
				source: "canvas" as const,
				createdAt: block.createdAt,
				updatedAt: block.updatedAt,
				block,
			}));
		const knownResources = new Set(canvasImages.map((image) => image.resourceId).filter(Boolean));
		const names = new Set(canvasImages.map((image) => image.name.trim().toLocaleLowerCase()));
		const resourceImages = resources
			.filter((resource) => resource.kind === "IMAGE" && !knownResources.has(resource.id) && !names.has(resource.filename.trim().toLocaleLowerCase()))
			.map((resource) => ({
				key: `resource:${resource.id}`,
				name: resource.filename,
				url: `/api/workspaces/${encodeURIComponent(boardId)}/resources/${encodeURIComponent(resource.id)}`,
				resourceId: resource.id,
				source: "resource" as const,
				createdAt: resource.createdAt,
				updatedAt: resource.updatedAt,
				resource,
			}));
		return [...canvasImages, ...resourceImages];
	}, [blocks, resources, boardId]);

	const documents = useMemo(() => resources.filter((resource) => resource.kind === "DOCUMENT" && !resource.mimeType.startsWith("video/")), [resources]);
	const videos = useMemo<LibraryVideo[]>(() => {
		const canvasVideos = Object.values(blocks).flatMap((block) => {
			if (block.type !== "file") return [];
			const fileData = block.data as CanvasBlock<"file">["data"];
			if (!fileData.mimeType.startsWith("video/")) return [];
			return [{ key: `block:${block.id}`, name: fileData.filename, mimeType: fileData.mimeType, resourceId: fileData.resourceId, createdAt: block.createdAt, updatedAt: block.updatedAt, block: block as CanvasBlock<"file"> }];
		});
		const knownResources = new Set(canvasVideos.map((video) => video.resourceId));
		const storedVideos = resources.filter((resource) => resource.mimeType.startsWith("video/") && !knownResources.has(resource.id))
			.map((resource) => ({ key: `resource:${resource.id}`, name: resource.filename, mimeType: resource.mimeType, resourceId: resource.id, createdAt: resource.createdAt, updatedAt: resource.updatedAt, resource }));
		return [...canvasVideos, ...storedVideos];
	}, [blocks, resources]);
	const links = useMemo<LibraryLink[]>(() => Object.values(blocks).flatMap((block) => {
		if (block.type !== "link") return [];
		const linkData = block.data as CanvasBlock<"link">["data"];
		if (!linkData.url) return [];
		return [{ key: block.id, name: linkData.title || linkData.url, url: linkData.url, createdAt: block.createdAt, updatedAt: block.updatedAt, block: block as CanvasBlock<"link"> }];
	}), [blocks]);
	const searchText = query.toLocaleLowerCase().trim();
	const globalSearch = Boolean(searchText);
	const filteredImages = sortAssets(images.filter((item) => `${item.name} ${item.flowLabel ?? ""}`.toLocaleLowerCase().includes(searchText)), sort);
	const filteredDocuments = sortAssets(documents.filter((item) => `${item.filename} ${item.mimeType}`.toLocaleLowerCase().includes(searchText) && (fileType === "all" || item.mimeType === fileType)), sort);
	const filteredVideos = sortAssets(videos.filter((item) => `${item.name} ${item.mimeType}`.toLocaleLowerCase().includes(searchText) && (fileType === "all" || item.mimeType === fileType)), sort);
	const filteredLinks = sortAssets(links.filter((item) => `${item.name} ${item.url}`.toLocaleLowerCase().includes(searchText)), sort);
	const availableFileTypes = [...new Set((globalSearch || tab === "videos" ? videos : documents).map((item) => item.mimeType).concat(globalSearch ? documents.map((item) => item.mimeType) : []))].sort();
	const libraryTabs = [
		{ id: "images", label: "Images", Icon: Images, count: images.length },
		{ id: "documents", label: "Documents", Icon: FileText, count: documents.length },
		{ id: "videos", label: "Videos", Icon: Video, count: videos.length },
		{ id: "links", label: "Links", Icon: Link2, count: links.length },
	] as const;

	const addImage = (image: LibraryImage) => {
		if (isReadOnly) return;
		const state = useWorkspaceStore.getState();
		const placement = getLegacyTableTransform(state.blocks);
		const id = createBlockId();
		const now = Date.now();
		const data = image.block
			? { ...image.block.data }
			: { url: image.url, downloadUrl: image.url, alt: image.name, resourceId: image.resourceId, fit: "contain" as const };
		addBlock({ id, type: "image", transform: createDualTransform({ ...placement, w: 280, h: 210 }), data, createdAt: now, updatedAt: now });
		setSelection([id]);
	};

	const addDocument = (resource: WorkspaceResource) => {
		if (isReadOnly || !remoteBoardId) return;
		const state = useWorkspaceStore.getState();
		const id = createBlockId();
		const now = Date.now();
		const placement = getLegacyTableTransform(state.blocks);
		const previewArtifact = resource.latestVersion.previewArtifact;
		addBlock({
			id,
			type: "file",
			transform: createDualTransform({ ...placement, h: previewArtifact?.status === "READY" || resource.mimeType === "application/pdf" ? 400 : 120 }),
			data: { resourceId: resource.id, filename: resource.filename, mimeType: resource.mimeType, sizeBytes: resource.latestVersion.sizeBytes, previewArtifact: previewArtifact ?? undefined },
			createdAt: now,
			updatedAt: now,
		});
		setSelection([id]);
	};

	const removeCanvasImage = (image: LibraryImage) => {
		if (isReadOnly || !image.block) return;
		const referenced = Object.values(useWorkspaceStore.getState().blocks).some((block) =>
			isImageFlowBlock(block) && block.data.stepKind === "reference" && block.data.referenceBlockId === image.block?.id,
		);
		if (referenced) {
			setError("This image is a reference in another flow. Remove that reference before removing the image.");
			return;
		}
		if (!window.confirm(`Remove “${image.name}” from this canvas?`)) return;
		const state = useWorkspaceStore.getState();
		Object.values(state.connectors).filter((edge) => edge.fromBlockId === image.block?.id || edge.toBlockId === image.block?.id).forEach((edge) => removeConnector(edge.id));
		removeBlock(image.block.id);
	};

	const deleteStoredResource = async (resource: WorkspaceResource) => {
		if (isReadOnly || !remoteBoardId || deletingId) return;
		const placed = Object.values(useWorkspaceStore.getState().blocks).some((block) =>
			(block.type === "image" && (block as CanvasBlock<"image">).data.resourceId === resource.id)
			|| (block.type === "file" && (block as CanvasBlock<"file">).data.resourceId === resource.id),
		);
		if (placed) {
			setError("Remove this asset from every canvas block and save the Workspace before deleting the stored file.");
			return;
		}
		if (!window.confirm(`Permanently delete “${resource.filename}” from this Workspace?${resource.sourceDocumentId ? " Its indexed chat knowledge will also be removed." : ""}`)) return;
		setDeletingId(resource.id);
		setError("");
		try {
			const response = await fetch(`/api/workspaces/${encodeURIComponent(remoteBoardId)}/resources/${encodeURIComponent(resource.id)}`, { method: "DELETE" });
			const result = await response.json().catch(() => ({})) as { error?: string };
			if (!response.ok) throw new Error(response.status === 409 ? "This asset is still referenced by the saved canvas. Remove those blocks and save the Workspace first." : result.error || `Could not delete asset (${response.status}).`);
			setResources((current) => current.filter((item) => item.id !== resource.id));
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : "Could not delete asset.");
		} finally {
			setDeletingId("");
		}
	};

	const deleteSelectedImages = async (selected: LibraryImage[]) => {
		if (isReadOnly || !selected.length || deletingId) return;
		const state = useWorkspaceStore.getState();
		const canvasImages = selected.filter((image) => image.source === "canvas" && image.block);
		const resourcesToDelete = selected.filter((image) => image.source === "resource" && image.resource).map((image) => image.resource!);
		const referencedImage = canvasImages.find((image) => Object.values(state.blocks).some((block) =>
			isImageFlowBlock(block) && block.data.stepKind === "reference" && block.data.referenceBlockId === image.block?.id,
		));
		if (referencedImage) {
			setError(`“${referencedImage.name}” is referenced by another flow. Remove that reference before deleting selected images.`);
			return;
		}
		const placedResource = resourcesToDelete.find((resource) => Object.values(state.blocks).some((block) =>
			(block.type === "image" && (block as CanvasBlock<"image">).data.resourceId === resource.id)
			|| (block.type === "file" && (block as CanvasBlock<"file">).data.resourceId === resource.id),
		));
		if (placedResource) {
			setError(`“${placedResource.filename}” is still used on the canvas. Remove it from every block and save before deleting selected images.`);
			return;
		}
		if (resourcesToDelete.length && !remoteBoardId) return;
		if (!window.confirm(`Delete ${selected.length} selected image${selected.length === 1 ? "" : "s"}? Canvas images will be removed from this board; uploaded files will be permanently deleted.`)) return;
		setDeletingId("multiple");
		setError("");
		try {
			for (const resource of resourcesToDelete) {
				const response = await fetch(`/api/workspaces/${encodeURIComponent(remoteBoardId!)}/resources/${encodeURIComponent(resource.id)}`, { method: "DELETE" });
				const result = await response.json().catch(() => ({})) as { error?: string };
				if (!response.ok) throw new Error(response.status === 409 ? `“${resource.filename}” is still referenced by the saved canvas.` : result.error || `Could not delete “${resource.filename}” (${response.status}).`);
				setResources((current) => current.filter((item) => item.id !== resource.id));
			}
			for (const image of canvasImages) {
				if (!image.block) continue;
				const current = useWorkspaceStore.getState();
				Object.values(current.connectors).filter((edge) => edge.fromBlockId === image.block?.id || edge.toBlockId === image.block?.id).forEach((edge) => removeConnector(edge.id));
				removeBlock(image.block.id);
			}
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : "Could not delete selected images.");
		} finally {
			setDeletingId("");
		}
	};

	return <>
		<button type="button" onClick={() => setOpen(true)} title="Asset library" aria-label="Asset library" aria-haspopup="dialog" aria-expanded={open} className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors ${open ? "bg-orange-500/10 text-orange-600" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"}`}>
			<Images className="h-4 w-4" />
		</button>
		{open && typeof document !== "undefined" && createPortal(
			<div className="fixed inset-0 z-[120]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
				<section role="dialog" aria-label="Asset library" className="absolute inset-y-3 right-3 flex w-[min(440px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950">
					<header className="flex items-center justify-between gap-0 border-b border-slate-200 px-1 py-2 dark:border-slate-800 sm:gap-1 sm:px-2">
						<div className="flex min-w-0 items-center gap-0 sm:gap-1">
							<h2 className="truncate text-sm font-semibold text-slate-900 dark:text-white sm:px-1 sm:text-base">Asset library</h2>
							<button type="button" onClick={() => { setSearchOpen((value) => !value); if (searchOpen) setQuery(""); }} title={searchOpen ? "Close search" : "Search all assets"} aria-label={searchOpen ? "Close asset search" : "Search all assets"} aria-expanded={searchOpen} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 sm:h-9 sm:w-9"><Search className="h-4 w-4" /></button>
						</div>
						<div className="flex shrink-0 items-center gap-0 sm:gap-0.5" role="tablist" aria-label="Asset types">
							{libraryTabs.map(({ id, label, Icon }) => <button key={id} type="button" role="tab" title={label} aria-label={label} onClick={() => { setTab(id); setFileType("all"); }} aria-selected={tab === id} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${tab === id ? "bg-violet-100 font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-200" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"}`}><Icon className="h-4 w-4" /></button>)}
							<button type="button" onClick={() => setOpen(false)} aria-label="Close asset library" className="ml-0 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 sm:ml-1 sm:h-9 sm:w-9"><X className="h-4 w-4" /></button>
						</div>
					</header>
					{searchOpen && <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-800"><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search all assets…" aria-label="Search all asset types" className="h-10 w-full rounded-lg border border-slate-200 bg-transparent px-3 text-sm text-slate-900 outline-none focus:border-violet-400 dark:border-slate-800 dark:text-white" /></div>}
					<AssetLibraryControls sort={sort} setSort={setSort} fileType={fileType} setFileType={setFileType} availableFileTypes={availableFileTypes} showFileType={globalSearch || tab === "documents" || tab === "videos"} />
					{loading && <div className="flex items-center gap-2 p-4 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading stored assets…</div>}
					{error && <p role="alert" className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
					<div className="min-h-0 flex-1 overflow-y-auto p-3">
						<WorkspaceAssetLibraryResults tab={tab} globalSearch={globalSearch} images={filteredImages} documents={filteredDocuments} videos={filteredVideos} links={filteredLinks} isReadOnly={isReadOnly} deletingId={deletingId} formatDate={formatDate} formatSize={formatSize} addImage={addImage} removeCanvasImage={removeCanvasImage} deleteStoredResource={deleteStoredResource} deleteSelectedImages={deleteSelectedImages} addDocument={addDocument} selectBlock={(blockId) => setSelection([blockId])} />
						{!loading && !error && (globalSearch ? filteredImages.length + filteredDocuments.length + filteredVideos.length + filteredLinks.length === 0 : tab === "images" ? filteredImages.length === 0 : tab === "documents" ? filteredDocuments.length === 0 : tab === "videos" ? filteredVideos.length === 0 : filteredLinks.length === 0) && <p className="py-10 text-center text-sm text-slate-500">{remoteBoardId || (tab !== "documents" && tab !== "videos") ? "No matching assets yet. Upload, import, or create them on the canvas." : "Save this Workspace once to show its stored files."}</p>}
					</div>
				</section>
			</div>, document.body)}
	</>;
}
