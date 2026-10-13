"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, Images, LoaderCircle, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { getModelMaxInputImages, type ImageModelId } from "@/types/image-generation.types";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { resolveTransform, type CanvasBlock } from "../types/block";
import type { ImageFlowBlockData, ImageFlowImageInput } from "../types/imageFlow";
import type { WorkspaceResource } from "../types/assets";
import { createConnectorId } from "../types/connector";
import { isImageFlowBlock } from "../types/imageFlow";
import { useWorkspaceRemoteBoardId } from "../hooks/useWorkspaceRemoteBoardId";
import { uploadWorkspaceImageWithOriginal } from "../utils/imageUpload";

type Slot = "mainImage" | "referenceImage";
type Picker = { slot: Slot; source: "workspace" | "library" } | null;
type InputRef = { current: HTMLInputElement | null };
type Props = { block: CanvasBlock<"imageFlow">; imageBlocks: CanvasBlock<"image">[]; onChange: (patch: Partial<ImageFlowBlockData>) => void };

function blockInput(image: CanvasBlock<"image">): ImageFlowImageInput {
	return { url: image.data.url, downloadUrl: image.data.downloadUrl, name: image.data.alt || "Workspace image", resourceId: image.data.resourceId, blockId: image.id };
}

function selectedForFlow(flowId: string) {
	const blocks = Object.values(useWorkspaceStore.getState().blocks).filter((item): item is CanvasBlock<"imageFlow"> => isImageFlowBlock(item) && item.data.flowId === flowId && item.data.stepKind === "reference");
	return blocks.reduce((count, item) => count + (item.data.mainImages?.length ?? Number(Boolean(item.data.mainImage))) + (item.data.referenceImages?.length ?? Number(Boolean(item.data.referenceImage || item.data.referenceBlockId))), 0);
}

export function ImageFlowReferenceInputs({ block, imageBlocks, onChange }: Props) {
	const boardId = useWorkspaceStore((state) => state.boardId);
	const remoteBoardId = useWorkspaceRemoteBoardId(boardId);
	const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
	const storeBlocks = useWorkspaceStore((state) => state.blocks);
	const connectors = useWorkspaceStore((state) => state.connectors);
	const updateBlockTransform = useWorkspaceStore((state) => state.updateBlockTransform);
	const [picker, setPicker] = useState<Picker>(null);
	const [resources, setResources] = useState<WorkspaceResource[]>([]);
	const [loading, setLoading] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [query, setQuery] = useState("");
	const mainFileRef = useRef<HTMLInputElement>(null);
	const referenceFileRef = useRef<HTMLInputElement>(null);
	const legacyImageBlock = block.data.referenceBlockId ? imageBlocks.find((image) => image.id === block.data.referenceBlockId) : undefined;
	const legacyReference = legacyImageBlock ? blockInput(legacyImageBlock) : undefined;
	const values: Record<Slot, ImageFlowImageInput[]> = {
		mainImage: block.data.mainImages ?? (block.data.mainImage ? [block.data.mainImage] : []),
		referenceImage: block.data.referenceImages ?? (block.data.referenceImage ? [block.data.referenceImage] : legacyReference ? [legacyReference] : []),
	};
	const model = useMemo(() => {
		const queue = [block.id];
		const visited = new Set<string>();
		while (queue.length) {
			const id = queue.shift()!;
			if (visited.has(id)) continue;
			visited.add(id);
			const candidate = storeBlocks[id];
			if (isImageFlowBlock(candidate) && candidate.data.stepKind === "generate" && candidate.data.flowId === block.data.flowId) return (candidate.data.settings?.model as ImageModelId | undefined) ?? "Auto";
			Object.values(connectors).filter((edge) => edge.kind === "image-flow" && edge.fromBlockId === id).forEach((edge) => queue.push(edge.toBlockId));
		}
		return "Auto" as const;
	}, [block.data.flowId, block.id, connectors, storeBlocks]);
	const maxImages = getModelMaxInputImages(model);
	const desiredHeight = 210 + Math.max(0, Math.max(values.mainImage.length, values.referenceImage.length) - 1) * 74 + (picker ? 210 : 0);
	useEffect(() => {
		if (isReadOnly) return;
		const currentHeight = resolveTransform(block.transform, { x: 0, y: 0, w: 360, h: 260, rotation: 0, zIndex: 0 }).h;
		if (Math.abs(currentHeight - desiredHeight) > 12) updateBlockTransform(block.id, { h: desiredHeight }, "override");
	}, [block.id, block.transform, desiredHeight, isReadOnly, updateBlockTransform]);

	useEffect(() => {
		if (picker?.source !== "library" || !remoteBoardId) return;
		const controller = new AbortController();
		setLoading(true);
		fetch(`/api/workspaces/${encodeURIComponent(remoteBoardId)}/resources`, { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) throw new Error(`Could not load the image library (${response.status}).`);
				const payload = await response.json() as { resources?: WorkspaceResource[] };
				setResources(Array.isArray(payload.resources) ? payload.resources.filter((item) => item.kind === "IMAGE") : []);
			})
			.catch((error: unknown) => { if (!controller.signal.aborted) toast.error(error instanceof Error ? error.message : "Could not load the image library."); })
			.finally(() => { if (!controller.signal.aborted) setLoading(false); });
		return () => controller.abort();
	}, [picker?.source, remoteBoardId]);

	const addInput = (slot: Slot, value: ImageFlowImageInput) => {
		if ([...values.mainImage, ...values.referenceImage].some((item) => item.blockId && item.blockId === value.blockId || item.resourceId && item.resourceId === value.resourceId || !item.blockId && !item.resourceId && item.url === value.url)) {
			toast.error("This image is already added to the flow.");
			return;
		}
		if (selectedForFlow(block.data.flowId) >= maxImages) {
			toast.error(`${model} allows up to ${maxImages} total input images for this flow.`);
			return;
		}
		const next = [...values[slot], value];
		if (slot === "mainImage") onChange({ mainImages: next, mainImage: undefined });
		else onChange({ referenceImages: next, referenceImage: undefined, referenceBlockId: undefined });
		if (value.blockId) {
			const state = useWorkspaceStore.getState();
			if (Object.values(state.connectors).some((edge) => edge.kind === "image-flow" && edge.fromBlockId === value.blockId && edge.toBlockId === block.id)) return;
			const added = state.addConnector({ id: createConnectorId(), kind: "image-flow", fromBlockId: value.blockId, toBlockId: block.id, lineType: "curved", strokeColor: "#8b5cf6", dashed: true, arrowEnd: true });
			if (!added) toast.error("Image selected, but its connector could not be added. You can still use the image in this step.");
		}
	};
	const removeInput = (slot: Slot, index: number) => {
		const value = values[slot][index];
		const next = values[slot].filter((_, itemIndex) => itemIndex !== index);
		if (slot === "mainImage") onChange({ mainImages: next, mainImage: undefined });
		else onChange({ referenceImages: next, referenceImage: undefined, referenceBlockId: undefined });
		const stillUsed = [...next, ...(slot === "mainImage" ? values.referenceImage : values.mainImage)].some((item) => item.blockId === value?.blockId);
		if (value?.blockId && !stillUsed) {
			const state = useWorkspaceStore.getState();
			Object.values(state.connectors).filter((edge) => edge.fromBlockId === value.blockId && edge.toBlockId === block.id && edge.kind === "image-flow").forEach((edge) => state.removeConnector(edge.id));
		}
	};
	const upload = async (slot: Slot, files: FileList | File[]) => {
		const available = Math.max(0, maxImages - selectedForFlow(block.data.flowId));
		const selected = Array.from(files).slice(0, available);
		if (!selected.length) { toast.error(`${model} allows up to ${maxImages} total input images for this flow.`); return; }
		if (selected.length < files.length) toast.error(`Only ${available} more image(s) fit this model's input limit.`);
		setUploading(true);
		try {
			for (const file of selected) {
				const saved = await uploadWorkspaceImageWithOriginal(file);
				if (!saved) throw new Error("Could not upload this image to Workspace.");
				addInput(slot, { ...saved, name: file.name });
			}
		} catch (error) { toast.error(error instanceof Error ? error.message : "Could not upload this image."); }
		finally { setUploading(false); }
	};
	const selectResource = (resource: WorkspaceResource) => {
		if (!picker || !remoteBoardId) return;
		const url = `/api/workspaces/${encodeURIComponent(remoteBoardId)}/resources/${encodeURIComponent(resource.id)}`;
		addInput(picker.slot, { url, downloadUrl: url, name: resource.filename, resourceId: resource.id });
		setPicker(null);
		setQuery("");
	};

	const slotCard = (slot: Slot, title: string, inputRef: InputRef) => {
		const items = values[slot];
		const pickerImages = picker?.slot === slot && picker.source === "workspace" ? imageBlocks : [];
		const pickerResources = picker?.slot === slot && picker.source === "library" ? resources : [];
		const filterQuery = query.trim().toLowerCase();
		return <section key={slot} className="min-w-0">
			<header className="mb-1.5 flex items-center justify-between gap-1"><strong className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</strong><button type="button" onClick={() => { setPicker(picker?.slot === slot ? null : { slot, source: "workspace" }); setQuery(""); }} disabled={isReadOnly || selectedForFlow(block.data.flowId) >= maxImages} aria-label="Choose from Workspace or Library" title="Choose from Workspace or Library" className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"><Images className="h-3.5 w-3.5" /></button></header>
			<div onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes("Files")) { event.preventDefault(); event.stopPropagation(); } }} onDrop={(event) => { if (isReadOnly || !event.dataTransfer.files.length) return; event.preventDefault(); event.stopPropagation(); void upload(slot, event.dataTransfer.files); }} className="flex min-h-[84px] flex-wrap items-start gap-1.5">
				{items.map((value, index) => <div key={`${value.blockId ?? value.resourceId ?? value.url}-${index}`} className="relative h-[84px] w-[64px] overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><img src={value.url} alt={value.name || title} className="h-full w-full object-cover" /><button type="button" title={`Remove ${value.name || title}`} aria-label={`Remove ${value.name || title}`} onClick={() => removeInput(slot, index)} disabled={isReadOnly} className="absolute right-1 top-1 rounded bg-white/90 p-1 text-slate-600 shadow hover:text-red-600"><Trash2 className="h-3 w-3" /></button></div>)}
				<button type="button" onClick={() => inputRef.current?.click()} disabled={isReadOnly || uploading || selectedForFlow(block.data.flowId) >= maxImages} title={`Add ${title.toLowerCase()}`} className="flex h-[84px] w-[64px] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-200 text-center text-[10px] text-slate-400 hover:border-violet-300 hover:text-violet-600 disabled:opacity-50 dark:border-slate-700"><Upload className="h-4 w-4" /><span>{slot === "mainImage" ? "Add Image" : "Reference"}</span></button>
			</div>
			<input ref={(element) => { inputRef.current = element; }} type="file" accept="image/*" multiple className="hidden" disabled={isReadOnly || uploading || selectedForFlow(block.data.flowId) >= maxImages} onChange={(event) => { if (event.target.files) void upload(slot, event.target.files); event.currentTarget.value = ""; }} />
			{uploading && <LoaderCircle className="mt-1 h-3.5 w-3.5 animate-spin text-violet-600" />}
			{picker?.slot === slot && <div className="mt-2 rounded-lg border border-violet-200 bg-white p-2 shadow-lg dark:border-violet-800 dark:bg-slate-900"><div className="mb-2 flex items-center gap-1"><button type="button" onClick={() => setPicker({ slot, source: "workspace" })} className={`rounded px-2 py-1 text-[10px] ${picker.source === "workspace" ? "bg-violet-100 text-violet-700" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}><Images className="mr-1 inline h-3 w-3" />Workspace</button><button type="button" onClick={() => setPicker({ slot, source: "library" })} className={`rounded px-2 py-1 text-[10px] ${picker.source === "library" ? "bg-violet-100 text-violet-700" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}><FolderOpen className="mr-1 inline h-3 w-3" />Library</button><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search…" className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950" /><button type="button" onClick={() => setPicker(null)} aria-label="Close image picker" className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-3.5 w-3.5" /></button></div><div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto">
				{pickerImages.filter((image) => (image.data.alt || "Workspace image").toLowerCase().includes(filterQuery)).map((image) => <button key={image.id} type="button" onClick={() => { addInput(slot, blockInput(image)); setPicker(null); }} className="overflow-hidden rounded-lg border border-slate-200 text-left hover:border-violet-400 dark:border-slate-700"><img src={image.data.url} alt={image.data.alt || "Workspace image"} className="h-20 w-full object-cover" /><span className="block truncate px-1.5 py-1 text-[10px]">{image.data.alt || "Workspace image"}</span></button>)}
				{pickerResources.filter((resource) => resource.filename.toLowerCase().includes(filterQuery)).map((resource) => <button key={resource.id} type="button" onClick={() => selectResource(resource)} className="overflow-hidden rounded-lg border border-slate-200 text-left hover:border-violet-400 dark:border-slate-700"><img src={`/api/workspaces/${encodeURIComponent(remoteBoardId ?? "")}/resources/${encodeURIComponent(resource.id)}`} alt={resource.filename} className="h-20 w-full object-cover" /><span className="block truncate px-1.5 py-1 text-[10px]">{resource.filename}</span></button>)}
				</div>{picker.source === "workspace" && pickerImages.length === 0 && <p className="py-3 text-center text-xs text-slate-500">No images on this canvas yet.</p>}{picker.source === "library" && loading && <p className="py-3 text-center text-xs text-slate-500">Loading library…</p>}{picker.source === "library" && !remoteBoardId && <p className="py-3 text-center text-xs text-slate-500">Save the workspace to browse library images.</p>}{picker.source === "library" && !loading && remoteBoardId && pickerResources.length === 0 && <p className="py-3 text-center text-xs text-slate-500">No library images found.</p>}</div>}
		</section>;
	};

	return <div className="grid grid-cols-2 gap-2">{slotCard("mainImage", "Main image", mainFileRef)}{slotCard("referenceImage", "Reference", referenceFileRef)}</div>;
}
