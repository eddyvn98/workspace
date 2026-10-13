"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ListPlus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { createBlockId, createDualTransform, resolveTransform, type CanvasBlock } from "../types/block";
import { createConnectorId } from "../types/connector";
import type { ImageFlowBlockData } from "../types/imageFlow";
import { isImageFlowBlock } from "../types/imageFlow";
import { useFloatingToolbarPosition } from "../hooks/useFloatingToolbarPosition";
import { getModeOptionFields } from "../renderers/imageFlowOptionFields";
import { insertImageFlowOptionGroup } from "../utils/imageFlowSteps";
import { addCustomImageFlowBlock } from "../utils/imageFlowCustomBlocks";

export function WorkspaceImageFlowToolbar({ onClose }: { onClose: () => void }) {
	const blocks = useWorkspaceStore((state) => state.blocks);
	const connectors = useWorkspaceStore((state) => state.connectors);
	const selectedBlockIds = useWorkspaceStore((state) => state.selectedBlockIds);
	const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
	const anchorBlockId = selectedBlockIds.find((id) => isImageFlowBlock(blocks[id])) ?? null;
	const { toolbarRef, style } = useFloatingToolbarPosition(anchorBlockId);
	const [, setToolbarSizeVersion] = useState(0);
	const flowIds = useMemo(() => [...new Set(Object.values(blocks).filter(isImageFlowBlock).map((block) => block.data.flowId))], [blocks]);
	const selectedFlowId = useMemo(() => {
		for (const id of selectedBlockIds) {
			const block = blocks[id];
			if (isImageFlowBlock(block)) return block.data.flowId;
			const image = block?.type === "image" ? block as CanvasBlock<"image"> : undefined;
			if (image?.data.imageFlowOrigin) return image.data.imageFlowOrigin.flowId;
		}
		return undefined;
	}, [blocks, selectedBlockIds]);
	const [flowId, setFlowId] = useState("");
	const [customMenuOpen, setCustomMenuOpen] = useState(false);
	const activeFlowId = selectedFlowId || flowId;
	const activeFlow = useMemo(() => {
		const flowBlocks = Object.values(blocks).filter((block) => isImageFlowBlock(block) && block.data.flowId === activeFlowId) as CanvasBlock<"imageFlow">[];
		const generator = flowBlocks.find((block) => block.data.stepKind === "generate");
		if (!generator) return { mainMode: undefined, subMode: undefined };
		const upstream = new Map<string, CanvasBlock<"imageFlow">>();
		const queue = [generator.id];
		const visited = new Set(queue);
		while (queue.length) {
			const currentId = queue.shift()!;
			const incoming = Object.values(connectors).filter((edge) => edge.kind === "image-flow" && edge.toBlockId === currentId);
			for (const edge of incoming) {
				const previous = blocks[edge.fromBlockId];
				if (!isImageFlowBlock(previous) || previous.data.stepKind === "reference" || visited.has(previous.id)) continue;
				visited.add(previous.id);
				upstream.set(previous.id, previous as CanvasBlock<"imageFlow">);
				queue.push(previous.id);
			}
		}
		const ancestors = [...upstream.values()];
		const mode = (ancestors.find((block) => block.data.advancedLevel === "mode") ?? flowBlocks.find((block) => block.data.advancedLevel === "mode"))?.data.settings?.main_mode;
		const subMode = (ancestors.find((block) => block.data.advancedLevel === "submode") ?? flowBlocks.find((block) => block.data.advancedLevel === "submode"))?.data.settings?.sub_mode;
		return { mainMode: typeof mode === "string" ? mode : undefined, subMode: typeof subMode === "string" ? subMode : undefined };
	}, [activeFlowId, blocks, connectors]);
	const orderedOptionFields = useMemo(() => getModeOptionFields(activeFlow.mainMode, activeFlow.subMode), [activeFlow.mainMode, activeFlow.subMode]);
	const contextParents = useMemo(() => selectedBlockIds.map((id) => blocks[id]).filter((block) => isImageFlowBlock(block) && block.data.flowId === activeFlowId && block.data.stepKind === "advanced" && (block.data.advancedLevel === "submode" || block.data.advancedLevel === "group")) as CanvasBlock<"imageFlow">[], [activeFlowId, blocks, selectedBlockIds]);
	const skippedByContext = useMemo(() => [...new Set(contextParents.flatMap((parent) => parent.data.skippedOptionGroups ?? []))]
		.map((key) => ({ key, label: key === "custom_text" ? "Custom prompt block" : orderedOptionFields.find((field) => field.key === key)?.label ?? key.replaceAll("_", " "), parents: contextParents.filter((parent) => parent.data.skippedOptionGroups?.includes(key)).map((parent) => parent.id) })), [contextParents, orderedOptionFields]);
	useEffect(() => {
		const element = toolbarRef.current;
		if (!element || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => setToolbarSizeVersion((version) => version + 1));
		observer.observe(element);
		return () => observer.disconnect();
	}, [toolbarRef]);
	useEffect(() => {
		if (!flowIds.length) return;
		if (!flowIds.includes(flowId)) setFlowId(flowIds[0]);
	}, [flowId, flowIds]);

	const canvasCenter = () => {
		const rect = document.querySelector<HTMLElement>("[data-workspace-canvas]")?.getBoundingClientRect();
		const camera = useWorkspaceStore.getState().camera;
		return { x: rect ? (rect.width / 2 - camera.x) / camera.zoom : 400, y: rect ? (rect.height / 2 - camera.y) / camera.zoom : 300 };
	};
	const makeBlock = (data: ImageFlowBlockData, x: number, y: number, width: number, height: number, zIndex: number): CanvasBlock<"imageFlow"> => ({
		id: createBlockId(), type: "imageFlow",
		transform: createDualTransform({ x, y, w: width, h: height, rotation: 0, zIndex }),
		data, createdAt: Date.now(), updatedAt: Date.now(),
	});
	const connect = (from: string, to: string) => useWorkspaceStore.getState().addConnector({
		id: createConnectorId(), kind: "image-flow", fromBlockId: from, toBlockId: to, lineType: "curved", arrowEnd: true,
	});
	const createImage = () => {
		if (isReadOnly) return;
		const state = useWorkspaceStore.getState();
		const id = createBlockId();
		const center = canvasCenter();
		const existing = Object.values(state.blocks).filter(isImageFlowBlock);
		const existingPrompts = existing.filter((block) => block.data.stepKind === "prompt");
		const x = existingPrompts.length
			? Math.min(...existingPrompts.map((block) => resolveTransform(block.transform, { x: 0, y: 0, w: 360, h: 240, rotation: 0, zIndex: 0 }).x))
			: center.x - 650;
		const y = existing.length
			? Math.max(...existing.map((block) => { const rect = resolveTransform(block.transform, { x: 0, y: 0, w: 360, h: 240, rotation: 0, zIndex: 0 }); return rect.y + rect.h; })) + 160
			: center.y - 130;
		const z = Object.keys(state.blocks).length + 1;
		const prompt: ImageFlowBlockData = { flowId: id, stepKind: "prompt" };
		const reference: ImageFlowBlockData = { flowId: id, stepKind: "reference" };
		const generate: ImageFlowBlockData = { flowId: id, stepKind: "generate", settings: { model: "Auto", aspect_ratio: "1:1", resolution: "1K", seed: "Random", custom_seed: 0, enhance_prompt: "Yes", image_count: 1 } };
		const promptBlock = makeBlock(prompt, x, y, 360, 240, z);
		const referenceBlock = makeBlock(reference, x + 440, y, 360, 240, z + 1);
		const generateBlock = makeBlock(generate, x + 880, y, 400, 380, z + 2);
		[ promptBlock, referenceBlock, generateBlock ].forEach((block) => state.addBlock(block));
		const promptConnected = connect(promptBlock.id, referenceBlock.id);
		const referenceConnected = promptConnected && connect(referenceBlock.id, generateBlock.id);
		if (!promptConnected || !referenceConnected) toast.error("The image flow was created, but a connection could not be added.");
		setFlowId(id);
		state.setSelection([promptBlock.id, referenceBlock.id, generateBlock.id]);
	};
	const addCustomOption = (optionGroup: string) => {
		if (isReadOnly || !activeFlowId || !contextParents.length) return;
		try {
			if (optionGroup === "custom_text") addCustomImageFlowBlock(contextParents.map((parent) => parent.id), true);
			else insertImageFlowOptionGroup(activeFlowId, optionGroup, contextParents.map((parent) => parent.id));
			setCustomMenuOpen(false);
		} catch (error) { toast.error(error instanceof Error ? error.message : "Could not add this custom option."); }
	};
	const addBlankCustomBlock = () => {
		if (isReadOnly || !contextParents.length) return;
		try { addCustomImageFlowBlock(contextParents.map((parent) => parent.id)); setCustomMenuOpen(false); }
		catch (error) { toast.error(error instanceof Error ? error.message : "Could not add a custom block."); }
	};
	const close = () => onClose();
	if (typeof document === "undefined") return null;

	return createPortal(
		<div ref={toolbarRef} style={style ?? { left: "50%", top: 112 }} className={`fixed z-[70] w-max max-w-[calc(100vw-1.5rem)] rounded-2xl border border-violet-200 bg-white/95 p-2 shadow-xl backdrop-blur dark:border-violet-900 dark:bg-slate-900/95 ${style ? "" : "-translate-x-1/2"}`} role="toolbar" aria-label="Image Flow tools" onPointerDown={(event) => event.stopPropagation()}>
			<div className="flex items-center justify-end gap-2">
				<button type="button" onClick={createImage} disabled={isReadOnly} aria-label="New flow" title="New flow" className="rounded-lg bg-violet-600 p-2 text-white hover:bg-violet-700 disabled:opacity-50"><Sparkles className="h-4 w-4" /></button>
				<button type="button" onClick={() => setCustomMenuOpen((open) => !open)} disabled={isReadOnly} aria-label="Custom blocks" title="Custom blocks" className="rounded-lg border border-violet-100 p-2 text-slate-700 hover:bg-violet-50 disabled:opacity-50 dark:border-violet-900 dark:text-slate-200 dark:hover:bg-violet-950"><ListPlus className="h-4 w-4" /></button>
				<button type="button" onClick={close} aria-label="Close Image Flow tools" title="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
			</div>
			{customMenuOpen && <div className="absolute right-2 top-full mt-2 max-h-[min(70vh,32rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-violet-200 bg-white p-3 shadow-2xl dark:border-violet-900 dark:bg-slate-900">
				<button type="button" onClick={addBlankCustomBlock} disabled={!contextParents.length} className="mb-3 flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-xs font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"><ListPlus className="h-4 w-4 text-violet-600" />Add empty custom block</button>
				{contextParents.length ? <>{skippedByContext.length > 0 ? <section className="rounded-lg bg-violet-50 p-2 dark:bg-violet-950/40"><h3 className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">Skipped from this step</h3><div className="space-y-1">{skippedByContext.map((item) => <button key={`${item.key}:${item.parents.join(",")}`} type="button" onClick={() => addCustomOption(item.key)} className="flex w-full rounded-md px-2 py-1.5 text-left text-xs text-violet-800 hover:bg-violet-100 dark:text-violet-200 dark:hover:bg-violet-900">{item.label}</button>)}</div></section> : <p className="py-2 text-xs text-slate-500">No skipped child blocks on this step.</p>}</> : <p className="py-2 text-xs text-slate-500">Select a Submode or option block first. New blocks will be added after it.</p>}
			</div>}
		</div>, document.body,
	);
}
