"use client";

import { FileText, Images, Link2, Plus, Trash2, Video } from "lucide-react";
import { WorkspaceAssetLibraryImageGrid, type LibraryImage } from "./WorkspaceAssetLibraryImageGrid";
import type { AssetLibraryTab, LibraryLink, LibraryVideo, WorkspaceResource } from "../types/assets";

type Props = {
	tab: AssetLibraryTab;
	globalSearch: boolean;
	images: LibraryImage[];
	documents: WorkspaceResource[];
	videos: LibraryVideo[];
	links: LibraryLink[];
	isReadOnly: boolean;
	deletingId: string;
	formatDate: (value: string | number) => string;
	formatSize: (value: string) => string;
	addImage: (image: LibraryImage) => void;
	removeCanvasImage: (image: LibraryImage) => void;
	deleteStoredResource: (resource: WorkspaceResource) => void;
	deleteSelectedImages: (images: LibraryImage[]) => void;
	addDocument: (resource: WorkspaceResource) => void;
	selectBlock: (blockId: string) => void;
};

const GROUPS = [
	{ id: "images", label: "Images", Icon: Images },
	{ id: "documents", label: "Documents", Icon: FileText },
	{ id: "videos", label: "Videos", Icon: Video },
	{ id: "links", label: "Links", Icon: Link2 },
] as const;

function isSafeExternalUrl(value: string): boolean {
	try {
		return ["http:", "https:"].includes(new URL(value).protocol);
	} catch {
		return false;
	}
}

function DocumentRow({ resource, isReadOnly, deletingId, formatDate, formatSize, addDocument, deleteStoredResource }: Pick<Props, "isReadOnly" | "deletingId" | "formatDate" | "formatSize" | "addDocument" | "deleteStoredResource"> & { resource: WorkspaceResource }) {
	return <article className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
		<FileText className="h-8 w-8 shrink-0 text-slate-400" />
		<div className="min-w-0 flex-1">
			<p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100" title={resource.filename}>{resource.filename}</p>
			<p className="text-xs text-slate-500">{resource.mimeType} · {formatSize(resource.latestVersion.sizeBytes)}{resource.sourceDocumentId ? " · Available to chat" : ""}</p>
			<p className="text-[10px] text-slate-400">Created {formatDate(resource.createdAt)} · Updated {formatDate(resource.updatedAt)}</p>
		</div>
		<button type="button" disabled={isReadOnly} onClick={() => addDocument(resource)} title="Add to canvas" aria-label={`Add ${resource.filename} to canvas`} className="rounded-lg p-2 text-violet-700 hover:bg-violet-100 disabled:opacity-50 dark:text-violet-300 dark:hover:bg-violet-950"><Plus className="h-4 w-4" /></button>
		<button type="button" disabled={isReadOnly || deletingId === resource.id} onClick={() => deleteStoredResource(resource)} title="Delete stored document" aria-label={`Delete ${resource.filename}`} className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /></button>
	</article>;
}

function VideoRow({ video, props }: { video: LibraryVideo; props: Props }) {
	return <article className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
		<Video className="h-8 w-8 shrink-0 text-slate-400" />
		<div className="min-w-0 flex-1">
			<p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100" title={video.name}>{video.name}</p>
			<p className="text-xs text-slate-500">{video.mimeType}</p>
			<p className="text-[10px] text-slate-400">Created {props.formatDate(video.createdAt)} · Updated {props.formatDate(video.updatedAt)}</p>
		</div>
		{video.resource && <>
			<button type="button" disabled={props.isReadOnly} onClick={() => props.addDocument(video.resource!)} title="Add to canvas" aria-label={`Add ${video.name} to canvas`} className="rounded-lg p-2 text-violet-700 hover:bg-violet-100 disabled:opacity-50 dark:text-violet-300 dark:hover:bg-violet-950"><Plus className="h-4 w-4" /></button>
			<button type="button" disabled={props.isReadOnly || props.deletingId === video.resource.id} onClick={() => props.deleteStoredResource(video.resource!)} title="Delete stored video" aria-label={`Delete ${video.name}`} className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /></button>
		</>}
		{video.block && <button type="button" onClick={() => props.selectBlock(video.block!.id)} title="Select on canvas" aria-label={`Select ${video.name} on canvas`} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><Images className="h-4 w-4" /></button>}
	</article>;
}

function LinkRow({ link, formatDate }: { link: LibraryLink; formatDate: Props["formatDate"] }) {
	return <article className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
		<Link2 className="h-7 w-7 shrink-0 text-slate-400" />
		<div className="min-w-0 flex-1">
			<p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100" title={link.name}>{link.name}</p>
			<p className="truncate text-xs text-slate-500" title={link.url}>{link.url}</p>
			<p className="text-[10px] text-slate-400">Created {formatDate(link.createdAt)} · Updated {formatDate(link.updatedAt)}</p>
		</div>
		{isSafeExternalUrl(link.url) && <a href={link.url} target="_blank" rel="noopener noreferrer" title="Open link" aria-label={`Open ${link.name}`} className="rounded-lg p-2 text-violet-700 hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-950"><Link2 className="h-4 w-4" /></a>}
	</article>;
}

export function WorkspaceAssetLibraryResults(props: Props) {
	const { tab, globalSearch, images, documents, videos, links } = props;
	const visibleGroups = globalSearch ? GROUPS : GROUPS.filter((group) => group.id === tab);
	return <div className="space-y-5">
		{visibleGroups.map(({ id, label, Icon }) => {
			const count = id === "images" ? images.length : id === "documents" ? documents.length : id === "videos" ? videos.length : links.length;
			if (!count) return null;
			return <section key={id} aria-label={label}>
				{globalSearch && <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Icon className="h-4 w-4" />{label}<span className="font-normal">{count}</span></h3>}
				{id === "images" && <WorkspaceAssetLibraryImageGrid images={images} isReadOnly={props.isReadOnly} deletingId={props.deletingId} formatDate={props.formatDate} addImage={props.addImage} removeCanvasImage={props.removeCanvasImage} deleteStoredResource={props.deleteStoredResource} deleteSelectedImages={props.deleteSelectedImages} />}
				{id === "documents" && <div className="space-y-2">{documents.map((resource) => <DocumentRow key={resource.id} resource={resource} {...props} />)}</div>}
				{id === "videos" && <div className="space-y-2">{videos.map((video) => <VideoRow key={video.key} video={video} props={props} />)}</div>}
				{id === "links" && <div className="space-y-2">{links.map((link) => <LinkRow key={link.key} link={link} formatDate={props.formatDate} />)}</div>}
			</section>;
		})}
	</div>;
}
