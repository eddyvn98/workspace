"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Play, Settings2, Sparkles, Type } from "lucide-react";
import { toast } from "sonner";
import { ALL_MODELS, getModelMaxInputImages, MODEL_ASPECT_RATIOS, MODEL_LABELS, MODEL_RESOLUTIONS, type ImageModelId, type ImagePayloadInputs } from "@/types/image-generation.types";
import type { BlockRendererProps } from "./registry";
import { resolveTransform, type CanvasBlock } from "../types/block";
import { createConnectorId } from "../types/connector";
import { isImageFlowBlock, type ImageFlowAdvancedLevel } from "../types/imageFlow";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { addNextImageFlowStep, removeImageFlowOptionGroup, resetAdvancedDescendants } from "../utils/imageFlowSteps";
import { runImageFlowBlock } from "../utils/imageFlowExecution";
import { ImageFlowAdvancedOptions, getAvailableOptionGroups, getOptionGroupLabel } from "./ImageFlowAdvancedOptions";
import { ImageFlowReferenceInputs } from "./ImageFlowReferenceInputs";

const titles = { prompt: "Image prompt", reference: "Reference image", advanced: "Advanced", generate: "Generate images" } as const;
const fieldClass = "rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-xs dark:border-slate-700 dark:bg-slate-950";

export function ImageFlowBlock({ block, onChange }: BlockRendererProps<"imageFlow">) {
	const blocks = useWorkspaceStore((state) => state.blocks);
	const connectors = useWorkspaceStore((state) => state.connectors);
	const updateBlockTransform = useWorkspaceStore((state) => state.updateBlockTransform);
	const imageBlocks = useMemo(() => Object.values(blocks).filter((item): item is CanvasBlock<"image"> => item.type === "image"), [blocks]);
	const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
	const settings = block.data.settings ?? {};
	const model = (settings.model as ImageModelId | undefined) ?? "Auto";
	const [progress, setProgress] = useState("");
	const [busy, setBusy] = useState(false);
	const [confirm4K, setConfirm4K] = useState(false);
	const promptRef = useRef<HTMLTextAreaElement>(null);
	const reconciledImageOutputs = useRef(false);
	const reconciledLegacySkip = useRef(false);
	useEffect(() => {
		if (reconciledImageOutputs.current || isReadOnly || block.data.stepKind !== "generate") return;
		reconciledImageOutputs.current = true;
		const state = useWorkspaceStore.getState();
		const outputs = Object.values(state.blocks).filter((item): item is CanvasBlock<"image"> => item.type === "image")
			.filter((image) => image.data.imageFlowOrigin?.generateBlockId === block.id);
		for (const image of outputs) {
			if (Object.values(state.connectors).some((edge) => edge.fromBlockId === block.id && edge.toBlockId === image.id)) continue;
			state.addConnector({
				id: createConnectorId(), kind: "image-flow", fromBlockId: block.id, toBlockId: image.id,
				lineType: "curved", strokeColor: "#8b5cf6", dashed: true, arrowEnd: true,
			});
		}
	}, [block.data.stepKind, block.id, isReadOnly]);
	useEffect(() => {
		if (reconciledLegacySkip.current || isReadOnly || block.data.stepKind !== "advanced" || block.data.advancedLevel !== "group" || !block.data.skipped) return;
		reconciledLegacySkip.current = true;
		try { removeImageFlowOptionGroup(block.id); }
		catch (error) { toast.error(error instanceof Error ? error.message : "Could not remove this skipped option."); }
	}, [block.data.advancedLevel, block.data.skipped, block.data.stepKind, block.id, isReadOnly]);
	useEffect(() => {
		if (block.data.stepKind !== "prompt") return;
		const textarea = promptRef.current;
		if (!textarea) return;
		textarea.style.height = "auto";
		const contentHeight = Math.min(textarea.scrollHeight, 320);
		textarea.style.height = `${contentHeight}px`;
		const height = Math.max(240, Math.min(520, contentHeight + 130));
		const currentHeight = resolveTransform(block.transform, { x: 0, y: 0, w: 360, h: 240, rotation: 0, zIndex: 0 }).h;
		if (!isReadOnly && Math.abs(currentHeight - height) > 2) updateBlockTransform(block.id, { h: height }, "override");
	}, [block.data.prompt, block.data.stepKind, block.id, block.transform, isReadOnly, updateBlockTransform]);
	useEffect(() => {
		const layoutVersion = block.data.optionGroup === "lighting" ? 5 : block.data.optionGroup === "custom_text" ? 4 : 3;
		if (block.data.stepKind !== "advanced" || block.data.advancedLevel !== "group" || block.data.layoutVersion === layoutVersion) return;
		updateBlockTransform(block.id, { h: block.data.optionGroup === "lighting" ? 430 : block.data.optionGroup === "custom_text" ? 220 : 260 }, "override");
		onChange({ layoutVersion });
	}, [block.data.advancedLevel, block.data.layoutVersion, block.data.optionGroup, block.data.stepKind, block.id, onChange, updateBlockTransform]);
	useEffect(() => {
		if (block.data.stepKind !== "generate") return;
		const currentHeight = resolveTransform(block.transform, { x: 0, y: 0, w: 360, h: 260, rotation: 0, zIndex: 0 }).h;
		if (!isReadOnly && currentHeight > 340) updateBlockTransform(block.id, { h: 320 }, "override");
	}, [block.data.stepKind, block.id, block.transform, isReadOnly, updateBlockTransform]);
	const updateSettings = (patch: Partial<ImagePayloadInputs>) => onChange({ settings: { ...settings, ...patch } });
	const Icon = block.data.stepKind === "prompt" ? Type : block.data.stepKind === "reference" ? ImagePlus : block.data.stepKind === "generate" ? Sparkles : Settings2;
	const modeSettings = useMemo(() => {
		let merged: Partial<ImagePayloadInputs> = { ...settings };
		let parentId = block.data.parentBlockId;
		while (parentId) {
			const parent = blocks[parentId];
			if (!isImageFlowBlock(parent)) break;
			merged = { ...(parent.data.settings ?? {}), ...merged };
			parentId = parent.data.parentBlockId;
		}
		return merged;
	}, [block.data.parentBlockId, blocks, settings]);
	const usedByAncestors = useMemo(() => {
		const used = new Set<string>();
		let parentId = block.data.parentBlockId;
		while (parentId) {
			const parent = blocks[parentId];
			if (!isImageFlowBlock(parent)) break;
			if (parent.data.stepKind === "advanced" && parent.data.advancedLevel === "group" && parent.data.optionGroup) used.add(parent.data.optionGroup);
			parentId = parent.data.parentBlockId;
		}
		return used;
	}, [block.data.parentBlockId, blocks]);
	const availableGroups = useMemo(() => getAvailableOptionGroups(modeSettings.main_mode, modeSettings.sub_mode).filter((group) => !usedByAncestors.has(group)), [modeSettings.main_mode, modeSettings.sub_mode, usedByAncestors]);
	const selectedOptionGroup = block.data.optionGroup ?? availableGroups[0];
	const hasAdvancedSteps = useMemo(() => {
		if (block.data.stepKind !== "generate") return false;
		let currentId = block.id;
		const visited = new Set<string>();
		while (!visited.has(currentId)) {
			visited.add(currentId);
			const incoming = Object.values(connectors).find((edge) => edge.kind === "image-flow" && edge.toBlockId === currentId);
			const previous = incoming ? blocks[incoming.fromBlockId] : undefined;
			if (!isImageFlowBlock(previous)) return false;
			if (previous.data.stepKind === "advanced") return true;
			currentId = previous.id;
		}
		return false;
	}, [block.data.stepKind, block.id, blocks, connectors]);
	const run = async () => {
		setBusy(true);
		setProgress("Preparing flow…");
		try { await runImageFlowBlock(block.id, setProgress); }
		catch (error) {
			const message = error instanceof Error ? error.message : "Could not run this flow.";
			setProgress(message);
			toast.error(message);
		} finally { setBusy(false); }
	};
	const addAdvancedOptions = () => {
		const previous = Object.values(useWorkspaceStore.getState().connectors)
			.find((edge) => edge.kind === "image-flow" && edge.toBlockId === block.id);
		const source = previous ? useWorkspaceStore.getState().blocks[previous.fromBlockId] : undefined;
		if (!isImageFlowBlock(source) || source.data.stepKind !== "reference" || source.data.flowId !== block.data.flowId) {
			toast.error("Connect this flow’s Reference block to Generate before adding Advanced options.");
			return;
		}
		try { addNextImageFlowStep(source.id, "mode"); }
		catch (error) { toast.error(error instanceof Error ? error.message : "Could not add Advanced options."); }
	};
	const changeMode = (patch: Partial<ImagePayloadInputs>) => {
		const previous = settings.main_mode;
		updateSettings(patch);
		if (patch.main_mode && patch.main_mode !== previous) {
			const nextId = addNextImageFlowStep(block.id, "submode");
			resetAdvancedDescendants(nextId);
			const child = useWorkspaceStore.getState().blocks[nextId];
			if (isImageFlowBlock(child)) useWorkspaceStore.getState().updateBlock(nextId, { data: { ...child.data, settings: { ...child.data.settings, sub_mode: "" } } });
		}
	};
	const changeSubmode = (patch: Partial<ImagePayloadInputs>) => {
		if (patch.sub_mode === settings.sub_mode) return;
		updateSettings(patch);
		resetAdvancedDescendants(block.id);
		const firstGroup = patch.sub_mode ? getAvailableOptionGroups(modeSettings.main_mode, patch.sub_mode)[0] : undefined;
		if (firstGroup) {
			const nextId = addNextImageFlowStep(block.id, "group");
			const child = useWorkspaceStore.getState().blocks[nextId];
			if (isImageFlowBlock(child)) useWorkspaceStore.getState().updateBlock(nextId, { data: { ...child.data, optionGroup: firstGroup } });
		}
	};
	const createFollowingOption = () => {
		const currentGroup = selectedOptionGroup;
		if (!currentGroup) return;
		const index = availableGroups.indexOf(currentGroup);
		const nextGroup = availableGroups.slice(index + 1).find((group) => group !== currentGroup);
		if (!nextGroup) return;
		try {
			const nextId = addNextImageFlowStep(block.id, "group");
			const child = useWorkspaceStore.getState().blocks[nextId];
			if (isImageFlowBlock(child) && !child.data.optionGroup) useWorkspaceStore.getState().updateBlock(nextId, { data: { ...child.data, optionGroup: nextGroup } });
		} catch (error) { toast.error(error instanceof Error ? error.message : "Could not add the next option group."); }
	};
	const changeGroupValue = (patch: Partial<ImagePayloadInputs>) => {
		const currentGroup = selectedOptionGroup;
		if (currentGroup && !block.data.optionGroup) onChange({ optionGroup: currentGroup, settings: { ...settings, ...patch }, skipped: false });
		else onChange({ settings: { ...settings, ...patch }, skipped: false });
		if (currentGroup && (patch[currentGroup as keyof ImagePayloadInputs] ?? settings[currentGroup as keyof ImagePayloadInputs])) createFollowingOption();
	};
	const skipGroup = () => {
		try {
			if (!removeImageFlowOptionGroup(block.id)) toast.error("This option block could not be removed.");
		} catch (error) { toast.error(error instanceof Error ? error.message : "Could not remove this option."); }
	};

	return <div className="flex h-full flex-col gap-2 rounded-xl border border-violet-200 bg-white p-3 text-slate-800 shadow-sm dark:border-violet-800 dark:bg-slate-900 dark:text-slate-100" data-image-flow-step={block.data.stepKind} onPointerDown={(event) => {
		if (event.target instanceof Element && event.target.closest("button, input, textarea, select, [role='button'], [contenteditable='true']")) event.stopPropagation();
	}}>
		<header className="flex items-center gap-2 border-b border-violet-100 pb-2 dark:border-violet-900">
			<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"><Icon className="h-4 w-4" /></span>
			<div className="min-w-0 flex-1"><strong className="block text-sm">{block.data.customPrompt ? "Custom prompt" : block.data.stepKind === "advanced" && block.data.advancedLevel === "submode" ? "Submode" : block.data.stepKind === "advanced" && block.data.advancedLevel === "group" ? getOptionGroupLabel(selectedOptionGroup, modeSettings.main_mode, modeSettings.sub_mode) : titles[block.data.stepKind]}</strong><span className="text-[10px] text-violet-600 dark:text-violet-300">Image Flow</span></div>
			{block.data.skipped && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">Skipped</span>}
		</header>
			{block.data.stepKind === "prompt" && <label className="flex min-h-0 flex-1 flex-col gap-1 text-xs font-medium">Prompt<textarea ref={promptRef} data-workspace-wheel-lock="true" value={block.data.prompt ?? ""} onChange={(event) => onChange({ prompt: event.target.value })} disabled={isReadOnly} rows={5} maxLength={4000} placeholder={block.data.customPrompt ? "Write a custom image prompt…" : "Describe the image to generate…"} className="min-h-24 max-h-80 w-full resize-none overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-normal outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-950" /></label>}
		{block.data.stepKind === "reference" && <ImageFlowReferenceInputs block={block} imageBlocks={imageBlocks} onChange={onChange} />}
		{block.data.stepKind === "advanced" && <div className={`min-h-0 overflow-y-auto ${block.data.advancedLevel === "group" ? "" : "flex-1"}`}><ImageFlowAdvancedOptions level={block.data.advancedLevel ?? "mode"} settings={settings} parentSettings={modeSettings} optionGroup={selectedOptionGroup} skipped={block.data.skipped} manualText={block.data.manualText ?? ""} disabled={isReadOnly} onManualTextChange={(manualText) => onChange({ manualText })} onChange={block.data.advancedLevel === "mode" ? changeMode : block.data.advancedLevel === "submode" ? changeSubmode : block.data.advancedLevel === "group" ? changeGroupValue : updateSettings} /></div>}
		{block.data.stepKind === "advanced" && block.data.advancedLevel === "group" && !block.data.skipped && <button type="button" onClick={skipGroup} disabled={isReadOnly} title="Remove this step from the flow. Add it again from Custom options." className="rounded border border-slate-200 px-2 py-1 text-left text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Skip this option</button>}
		{block.data.stepKind === "generate" && <div className="space-y-1.5">
			{!hasAdvancedSteps && <button type="button" onClick={addAdvancedOptions} disabled={isReadOnly || busy} className="flex h-7 w-full items-center justify-center gap-1.5 rounded-lg border border-violet-200 px-2 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950"><Settings2 className="h-3 w-3" />Add Advanced options</button>}
			<label className="flex flex-col gap-0.5 text-[11px]">Model<select value={model} onChange={(event) => {
				const nextModel = event.target.value as ImageModelId;
				const nextRatio = MODEL_ASPECT_RATIOS[nextModel].includes(settings.aspect_ratio as never) ? settings.aspect_ratio : MODEL_ASPECT_RATIOS[nextModel][0];
				const nextResolution = MODEL_RESOLUTIONS[nextModel].includes(settings.resolution as never) ? settings.resolution : MODEL_RESOLUTIONS[nextModel][0];
				updateSettings({ model: nextModel, aspect_ratio: nextRatio, resolution: nextResolution });
			}} disabled={isReadOnly || busy} className={`${fieldClass} h-8`}>{(["Auto", ...ALL_MODELS] as ImageModelId[]).map((item) => <option key={item} value={item}>{MODEL_LABELS[item]}</option>)}</select></label>
			<div className="grid grid-cols-3 gap-1.5">
				<label className="flex min-w-0 flex-col gap-0.5 text-[10px]">Aspect ratio<select value={settings.aspect_ratio ?? "1:1"} onChange={(event) => updateSettings({ aspect_ratio: event.target.value })} disabled={isReadOnly || busy} className={`${fieldClass} h-8`}>{MODEL_ASPECT_RATIOS[model].map((value) => <option key={value}>{value}</option>)}</select></label>
				<label className="flex min-w-0 flex-col gap-0.5 text-[10px]">Resolution<select value={settings.resolution ?? "1K"} onChange={(event) => { const resolution = event.target.value as ImagePayloadInputs["resolution"]; if (resolution === "4K" && settings.resolution !== "4K") setConfirm4K(true); else updateSettings({ resolution }); }} disabled={isReadOnly || busy} className={`${fieldClass} h-8`}>{MODEL_RESOLUTIONS[model].map((value) => <option key={value}>{value}</option>)}</select></label>
				<label className="flex min-w-0 flex-col gap-0.5 text-[10px]">Images<select value={settings.image_count ?? 1} onChange={(event) => updateSettings({ image_count: Number(event.target.value) })} disabled={isReadOnly || busy} className={`${fieldClass} h-8`}>{[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
			</div>
			<p className="text-[10px] text-slate-500 dark:text-slate-400" title="The Image Generator applies this model-specific limit to combined main and reference inputs.">Up to {getModelMaxInputImages(model)} input images · {MODEL_RESOLUTIONS[model].join(" / ")} output</p>
			{(block.data.runMessage || progress) && <p role="status" className={`text-[10px] ${block.data.runStatus === "error" ? "text-red-600" : "text-slate-500 dark:text-slate-400"}`}>{progress || block.data.runMessage}</p>}
			<button type="button" onClick={run} disabled={isReadOnly || busy} className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-2 text-[11px] font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}{busy ? "Generating…" : "Generate new images"}</button>
			{confirm4K && <div role="alertdialog" aria-modal="true" aria-label="Confirm 4K generation" className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-sm rounded-xl bg-white p-4 text-sm shadow-xl dark:bg-slate-900"><p className="mb-4 text-slate-700 dark:text-slate-200">4K generations are significantly more expensive. Use 4K for final output rather than drafts. Continue?</p><div className="flex justify-end gap-2"><button type="button" onClick={() => setConfirm4K(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700">Cancel</button><button type="button" onClick={() => { updateSettings({ resolution: "4K" }); setConfirm4K(false); }} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white">Confirm 4K</button></div></div></div>}
		</div>}
	</div>;
}
