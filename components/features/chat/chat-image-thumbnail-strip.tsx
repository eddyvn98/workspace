"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Copy, Check, CornerUpLeft, ChevronLeft, ChevronRight, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { IMessage } from "@/interface/IMessage";
import type { ImagePayloadInputs } from "@/types/image-generation.types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MessageActions } from "./message-actions";
import { useImageSettingsStore } from "@/stores/useImageSettingsStore";

const IMAGE_EXT = /\.(jpe?g|png|gif|bmp|webp|svg)(\?[^\s)"]*)?($|\s)/i;

function getCleanedAssistantText(content: string): string {
	if (!content) return "";
	let cleaned = content.replace(/!\[[^\]]*\]\([^)]+\)/gi, "");
	cleaned = cleaned.replace(/https?:\/\/\S+\.(?:jpe?g|png|gif|bmp|webp|svg)(?:\?[^\s"')]*)?/gi, "");
	return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

function OutputCaption({ text, onReuse }: { text: string; onReuse: (t: string) => void }) {
	const [copied, setCopied] = useState(false);
	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch { /* noop */ }
	}
	return (
		<div className="mt-1 px-0.5 flex items-start gap-1 group/output">
			<Tooltip>
				<TooltipTrigger asChild>
					<p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-3 break-words whitespace-pre-wrap flex-1 min-w-0 cursor-text italic select-text">
						{text}
					</p>
				</TooltipTrigger>
				<TooltipContent side="left" align="start" className="max-w-[340px] p-0 select-text">
					<div className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 text-xs leading-relaxed select-text">
						{text}
					</div>
				</TooltipContent>
			</Tooltip>
			<div className="flex flex-col gap-0.5 opacity-0 group-hover/output:opacity-100 transition-opacity flex-shrink-0">
				<button
					type="button"
					onClick={handleCopy}
					title="Copy output text"
					className="p-0.5 rounded text-slate-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors"
				>
					{copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
				</button>
				<button
					type="button"
					onClick={() => onReuse(text)}
					title="Use as prompt"
					className="p-0.5 rounded text-slate-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors"
				>
					<CornerUpLeft className="w-3 h-3" />
				</button>
			</div>
		</div>
	);
}

function getCleanImageUrl(url: string | undefined | null): string {
	if (!url) return "";
	let targetUrl = url;

	if (url.includes("/api/proxy/file?url=")) {
		try {
			const parts = url.split("url=");
			if (parts.length > 1) {
				targetUrl = decodeURIComponent(parts[1]);
			}
		} catch {
			// noop
		}
	}

	return targetUrl.split("?")[0].split("#")[0].trim();
}

function extractContentImageUrls(content: string): string[] {
	const urls: string[] = [];
	content.replace(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi, (_, url: string) => {
		if (IMAGE_EXT.test(url)) urls.push(url.replace(/\s+$/, ""));
		return "";
	});
	return urls;
}

function getMessageImageUrls(msg: IMessage): string[] {
	const fromImages = msg.images ?? [];
	const fromContent = extractContentImageUrls(msg.content ?? "");
	return [...new Set([...fromImages, ...fromContent])];
}

export interface ImageItem {
	url: string;
	/** The user prompt that produced this image. */
	prompt: string;
	/** The AI-generated output text (description) for this image. */
	outputText: string;
	messageId: string;
	referenceImageUrl?: string;
	generationParams?: ImagePayloadInputs;
	isReference?: boolean;
}

/**
 * Flatten every assistant-generated image into a single ordered list, each
 * paired with the nearest preceding user prompt. One message with N images
 * yields N items, so the thumbnail strip and lightbox share the same indexing.
 */
export function buildImageItems(messages: IMessage[]): ImageItem[] {
	const items: ImageItem[] = [];
	for (let i = 0; i < messages.length; i++) {
		const msg = messages[i];
		if (msg.role !== "assistant") continue;
		const urls = getMessageImageUrls(msg);

		let prompt = "";
		let userImages: string[] = [];
		for (let j = i - 1; j >= 0; j--) {
			if (messages[j].role === "user") {
				prompt = messages[j].content ?? "";
				userImages = messages[j].images ?? [];
				break;
			}
		}

		const outputText = getCleanedAssistantText(msg.content ?? "");
		const referenceImageUrls =
			msg.generationParams?.reference_image_urls?.length
				? msg.generationParams.reference_image_urls
				: msg.generationParams?.reference_image_url
					? [msg.generationParams.reference_image_url]
					: [];
		const referenceImageUrl = referenceImageUrls[0];

		// Combine and filter unique reference images
		const refImages = [
			...userImages,
			...referenceImageUrls,
		].filter((url, idx, arr) => arr.indexOf(url) === idx);

		// Skip the turn entirely only when there's truly nothing to show for
		// it: no output AND no uploaded image to fall back to, and it's not
		// still loading (buildHistoryEntries keeps loading/error turns alive
		// via their reference thumbnails instead of a real output image).
		if (urls.length === 0 && refImages.length === 0 && !msg.isLoading) continue;

		for (const refUrl of refImages) {
			items.push({
				url: refUrl,
				prompt,
				outputText,
				messageId: msg.id,
				referenceImageUrl,
				generationParams: msg.generationParams,
				isReference: true,
			});
		}

		for (const url of urls) {
			items.push({
				url,
				prompt,
				outputText,
				messageId: msg.id,
				referenceImageUrl,
				generationParams: msg.generationParams,
			});
		}
	}
	return items;
}

interface HistoryEntry {
	key: string;
	userMessage: IMessage;
	assistantMessage: IMessage;
	userIndex: number;
	assistantIndex: number;
	mainImages: Array<{ url: string; itemIndex: number }>;
	referenceImages: Array<{ url: string; itemIndex: number }>;
}

function buildHistoryEntries(messages: IMessage[], items: ImageItem[]): HistoryEntry[] {
	const mainImagesByMessageId = new Map<string, Array<{ url: string; itemIndex: number }>>();
	const refImagesByMessageId = new Map<string, Array<{ url: string; itemIndex: number }>>();

	items.forEach((item, itemIndex) => {
		if (item.isReference) {
			const list = refImagesByMessageId.get(item.messageId) ?? [];
			list.push({ url: item.url, itemIndex });
			refImagesByMessageId.set(item.messageId, list);
		} else {
			const list = mainImagesByMessageId.get(item.messageId) ?? [];
			list.push({ url: item.url, itemIndex });
			mainImagesByMessageId.set(item.messageId, list);
		}
	});

	const entries: HistoryEntry[] = [];
	for (let i = 0; i < messages.length; i++) {
		const assistantMessage = messages[i];
		if (assistantMessage.role !== "assistant") continue;

		const mainImages = mainImagesByMessageId.get(assistantMessage.id) ?? [];
		const referenceImages = refImagesByMessageId.get(assistantMessage.id) ?? [];
		// Keep the turn visible while loading, or once it has a real output,
		// or — on failure — as long as there's at least an uploaded image to
		// show in the placeholder box; only drop it if there's truly nothing.
		if (mainImages.length === 0 && referenceImages.length === 0 && !assistantMessage.isLoading) continue;

		let userIndex = i - 1;
		while (userIndex >= 0 && messages[userIndex].role !== "user") userIndex--;
		if (userIndex < 0) continue;

		const userMessage = messages[userIndex];

		entries.push({
			key: `${userMessage.id}-${assistantMessage.id}`,
			userMessage,
			assistantMessage,
			userIndex,
			assistantIndex: i,
			mainImages,
			referenceImages,
		});
	}

	return entries;
}

interface Props {
	messages: IMessage[];
	items: ImageItem[];
	activeIndex: number | null;
	onOpen: (index: number) => void;
	onAttachImage: (url: string) => void;
	onEditPrompt: (prompt: string) => void;
	onRetry: (messageIndex: number) => void;
	onReusePrompt: (prompt: string, images?: string[], generationParams?: ImagePayloadInputs) => void;
	/** Opens a fresh, unrelated chat pre-loaded with the given image URLs. */
	onOpenNewChatWithImages: (urls: string[]) => void;
}

export function ChatImageThumbnailStrip({
	messages,
	items,
	activeIndex,
	onOpen,
	onAttachImage,
	onEditPrompt,
	onRetry,
	onReusePrompt,
	onOpenNewChatWithImages,
}: Props) {
	const [width, setWidth] = useState(320);
	const [isResizing, setIsResizing] = useState(false);
	const [isHidden, setIsHidden] = useState(false);
	const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

	const toggleSelected = useCallback((itemIndex: number) => {
		setSelectedIndices((prev) => {
			const next = new Set(prev);
			if (next.has(itemIndex)) next.delete(itemIndex);
			else next.add(itemIndex);
			return next;
		});
	}, []);

	// History Flow always shows every image in the conversation — mode only
	// changes what kind of generation request the composer will send next
	// (Advanced Options → MODE), it no longer hides/filters what's displayed
	// here. Filtering by "branch root" turned out to be more confusing than
	// helpful in practice: it hid images and required a separate "Back to
	// all" escape hatch to undo.
	const historyEntries = useMemo(() => buildHistoryEntries(messages, items), [messages, items]);

	const viewCounts = useMemo(() => {
		const counts = new Map<string, number>();
		messages.forEach((msg) => {
			if (msg.role === "assistant" && msg.generationParams?.reference_image_url) {
				const refUrl = getCleanImageUrl(msg.generationParams.reference_image_url);
				counts.set(refUrl, (counts.get(refUrl) || 0) + 1);
			}
		});
		return counts;
	}, [messages]);

	const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
		setIsResizing(true);
		mouseDownEvent.preventDefault();
	}, []);

	const stopResizing = useCallback(() => {
		setIsResizing(false);
	}, []);

	const resize = useCallback((mouseMoveEvent: MouseEvent) => {
		if (!isResizing) return;
		const newWidth = window.innerWidth - mouseMoveEvent.clientX;
		if (newWidth >= 220 && newWidth <= 520) {
			setWidth(newWidth);
		}
	}, [isResizing]);

	useEffect(() => {
		if (isResizing) {
			window.addEventListener("mousemove", resize);
			window.addEventListener("mouseup", stopResizing);
		}
		return () => {
			window.removeEventListener("mousemove", resize);
			window.removeEventListener("mouseup", stopResizing);
		};
	}, [isResizing, resize, stopResizing]);

	if (historyEntries.length === 0) return null;

	return (
		<TooltipProvider delayDuration={150}>
			<div
				style={{ width: isHidden ? "40px" : `${width}px` }}
				className={cn(
					"relative flex flex-col shrink-0 border-l border-slate-200 dark:border-orange-900/30 bg-white/55 dark:bg-slate-900/60 overflow-y-auto py-4 px-2 gap-4 items-stretch",
					isResizing && "select-none"
				)}
			>
				{/* Resize handle */}
				<div
					onMouseDown={startResizing}
					className={cn(
						"absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-orange-500/50 transition-colors z-30",
						isResizing && "bg-orange-500 w-1.5",
						isHidden && "pointer-events-none opacity-0",
					)}
				/>

				{/* Toggle button */}
				<button
					type="button"
					onClick={() => setIsHidden((value) => !value)}
					className={cn(
						"absolute left-2 top-4 z-40 inline-flex h-7 w-7 items-center justify-center rounded-full border shadow-sm transition-colors",
						"border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900",
					)}
					aria-label={isHidden ? "Show history flow" : "Hide history flow"}
					title={isHidden ? "Show history flow" : "Hide history flow"}
				>
					{isHidden ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
				</button>

				{!isHidden && (
					<>
						<span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 text-left w-full pl-9 mt-1">
							History Flow
						</span>

						{/* ── Entry list — Google Flow style, no card borders ── */}
						<div className="flex flex-col gap-0 w-full min-w-0 items-stretch px-1">
							{historyEntries.map((entry, entryIndex) => {
								const isActive = entry.assistantMessage.isLoading || entry.mainImages.some(({ itemIndex }) => itemIndex === activeIndex);
								const cleanedText = getCleanedAssistantText(entry.assistantMessage.content ?? "");
								return (
									<div
										key={entry.key}
										className={cn(
											"w-full flex flex-col gap-0 py-3 transition-colors",
											entryIndex > 0 && "border-t border-slate-100 dark:border-slate-800/60",
											isActive && "opacity-100",
										)}
									>
										{/* ── Main images — full width, naked (no card border) ── */}
										<div className="flex flex-col gap-1.5">
											{entry.mainImages.length === 0 ? (
												<div className="relative w-full aspect-square rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-950/40 flex flex-col items-center justify-center border border-slate-200/60 dark:border-slate-800/40 p-4 gap-2.5 shadow-sm">
													{entry.referenceImages.length > 0 && (
														<div
															className="history-flow-reference-scroll absolute left-1.5 right-1.5 top-1.5 z-20 flex gap-1.5 overflow-x-auto pb-1"
															onWheel={(event) => {
																if (event.deltaY === 0) return;
																event.preventDefault();
																event.currentTarget.scrollLeft += event.deltaY;
															}}
															onMouseLeave={(event) => {
																event.currentTarget.scrollLeft = 0;
															}}
														>
															{entry.referenceImages.map(({ url: refUrl, itemIndex: refItemIndex }, refIndex) => (
																<div
																	key={`${entry.key}-loading-ref-${refIndex}`}
																	className={cn(
																"history-flow-reference-thumbnail group/ref relative w-14 h-14 shrink-0 rounded-md overflow-hidden border border-white/60 shadow-md cursor-pointer transition-all",
																		refItemIndex === activeIndex
																			? "ring-2 ring-orange-500 ring-offset-1 ring-offset-black"
																			: "hover:opacity-90"
																	)}
																	onClick={(e) => {
																		e.stopPropagation();
																		onOpen(refItemIndex);
																	}}
																>
																	{/* eslint-disable-next-line @next/next/no-img-element */}
																	<div className="h-full w-full bg-[linear-gradient(45deg,rgba(148,163,184,0.12)_25%,transparent_25%,transparent_75%,rgba(148,163,184,0.12)_75%,rgba(148,163,184,0.12)),linear-gradient(45deg,rgba(148,163,184,0.12)_25%,transparent_25%,transparent_75%,rgba(148,163,184,0.12)_75%,rgba(148,163,184,0.12))] bg-[length:12px_12px] bg-[position:0_0,6px_6px] dark:bg-[linear-gradient(45deg,rgba(51,65,85,0.45)_25%,transparent_25%,transparent_75%,rgba(51,65,85,0.45)_75%,rgba(51,65,85,0.45)),linear-gradient(45deg,rgba(51,65,85,0.45)_25%,transparent_25%,transparent_75%,rgba(51,65,85,0.45)_75%,rgba(51,65,85,0.45))]">
																		<img src={refUrl} alt="" className="pointer-events-none h-full w-full object-cover" />
																	</div>
																</div>
															))}
														</div>
													)}
													<div className="relative flex flex-col items-center justify-center w-full h-full gap-2.5">
														{entry.assistantMessage.isLoading ? (
															<>
																<div className="relative flex items-center justify-center w-8 h-8">
																	<div className="absolute inset-0 rounded-full border-2 border-orange-500/20 animate-pulse" />
																	<div className="absolute inset-0 rounded-full border-2 border-t-orange-500 animate-spin" />
																</div>
																<span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 animate-pulse">
																	Generating image...
																</span>
															</>
														) : (
															<>
																<div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-100 dark:bg-red-950/40">
																	<span className="text-red-500 text-sm leading-none">!</span>
																</div>
																<span className="text-[11px] font-medium text-red-500 dark:text-red-400 text-center px-2">
																	Generation failed
																</span>
															</>
														)}
													</div>
												</div>
											) : (
												entry.mainImages.map(({ url, itemIndex }, imageIndex) => {
													const isSelected = itemIndex === activeIndex;
													const item = items[itemIndex];
													return (
														<div
															key={`${entry.key}-main-${imageIndex}`}
															className={cn(
																"group relative w-full rounded-xl overflow-hidden transition-all cursor-pointer",
																isSelected
																	? "ring-2 ring-orange-500/70 ring-offset-1 ring-offset-white dark:ring-offset-slate-900"
																	: "hover:opacity-90",
															)}
														>
															{/* Click to open */}
															<button
																type="button"
																onClick={() => onOpen(itemIndex)}
																className="absolute inset-0 z-10"
																aria-label="Open generated image"
															/>

															{/* eslint-disable-next-line @next/next/no-img-element */}
															<div className="relative w-full overflow-hidden bg-[linear-gradient(45deg,rgba(148,163,184,0.12)_25%,transparent_25%,transparent_75%,rgba(148,163,184,0.12)_75%,rgba(148,163,184,0.12)),linear-gradient(45deg,rgba(148,163,184,0.12)_25%,transparent_25%,transparent_75%,rgba(148,163,184,0.12)_75%,rgba(148,163,184,0.12))] bg-[length:16px_16px] bg-[position:0_0,8px_8px] dark:bg-[linear-gradient(45deg,rgba(51,65,85,0.4)_25%,transparent_25%,transparent_75%,rgba(51,65,85,0.4)_75%,rgba(51,65,85,0.4)),linear-gradient(45deg,rgba(51,65,85,0.4)_25%,transparent_25%,transparent_75%,rgba(51,65,85,0.4)_75%,rgba(51,65,85,0.4))]">
																<img src={url} alt="" className="pointer-events-none w-full h-auto object-contain block" />
															</div>

															{/* Select for "Open new chat with these images" */}
															<button
																type="button"
											title="Select image"
																onClick={(e) => {
																	e.stopPropagation();
																	toggleSelected(itemIndex);
																}}
																className={cn(
																	"absolute left-1.5 bottom-1.5 z-20 flex h-5 w-5 items-center justify-center rounded-full border transition-all",
																	selectedIndices.has(itemIndex)
																		? "bg-orange-500 border-orange-500 text-white"
																		: "bg-black/35 border-white/60 text-transparent hover:bg-black/50",
																)}
															>
																<Check className="h-3 w-3" />
															</button>

															{/* Branched views badge */}
															{viewCounts.get(getCleanImageUrl(url)) && (
																<button
																	type="button"
																	title="View camera angles"
																	onClick={(e) => {
																		e.stopPropagation();
																		onOpen(itemIndex);
																		useImageSettingsStore.getState().setMainMode("View Creator");
																	}}
																	className="absolute right-2 bottom-2 z-20 flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-950/70 hover:bg-orange-500/90 text-white font-medium text-[10px] transition-all shadow-md backdrop-blur-sm pointer-events-auto border border-white/10"
																>
																	<Camera className="w-3 h-3 shrink-0" />
																	<span>{viewCounts.get(getCleanImageUrl(url))} views</span>
																</button>
															)}

															{/* Ref thumbnails — overlaid top-left, only on first image of entry */}
															{entry.referenceImages.length > 0 && imageIndex === 0 && (
														<div
															className="history-flow-reference-scroll absolute left-1.5 right-1.5 top-1.5 z-20 flex gap-1.5 overflow-x-auto pb-1"
															onWheel={(event) => {
																if (event.deltaY === 0) return;
																event.preventDefault();
																event.currentTarget.scrollLeft += event.deltaY;
															}}
															onMouseLeave={(event) => {
																event.currentTarget.scrollLeft = 0;
															}}
														>
																	{entry.referenceImages.map(({ url: refUrl, itemIndex: refItemIndex }, refIndex) => (
																		<div
																			key={`${entry.key}-ref-${refIndex}`}
																			className={cn(
																"history-flow-reference-thumbnail group/ref relative w-14 h-14 shrink-0 rounded-md overflow-hidden border border-white/60 shadow-md cursor-pointer transition-all",
																				refItemIndex === activeIndex
																					? "ring-2 ring-orange-500 ring-offset-1 ring-offset-black"
																					: "hover:opacity-90"
																			)}
																			onClick={(e) => {
																				e.stopPropagation();
																				onOpen(refItemIndex);
																			}}
																		>
																			{/* eslint-disable-next-line @next/next/no-img-element */}
																			<div className="h-full w-full bg-[linear-gradient(45deg,rgba(148,163,184,0.12)_25%,transparent_25%,transparent_75%,rgba(148,163,184,0.12)_75%,rgba(148,163,184,0.12)),linear-gradient(45deg,rgba(148,163,184,0.12)_25%,transparent_25%,transparent_75%,rgba(148,163,184,0.12)_75%,rgba(148,163,184,0.12))] bg-[length:12px_12px] bg-[position:0_0,6px_6px] dark:bg-[linear-gradient(45deg,rgba(51,65,85,0.45)_25%,transparent_25%,transparent_75%,rgba(51,65,85,0.45)_75%,rgba(51,65,85,0.45)),linear-gradient(45deg,rgba(51,65,85,0.45)_25%,transparent_25%,transparent_75%,rgba(51,65,85,0.45)_75%,rgba(51,65,85,0.45))]">
																				<img src={refUrl} alt="" className="pointer-events-none h-full w-full object-cover" />
																			</div>
																			{/* Attach button — top-right, show on hover */}
																			<button
																				type="button"
																				onClick={(e) => {
																					e.stopPropagation();
																					onAttachImage(refUrl);
																				}}
																						className="absolute right-1 bottom-1 z-20 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 group-hover/ref:opacity-100 transition-all hover:bg-orange-500"
																				title="Attach ref image"
																			>
																				<Plus className="h-3 w-3" />
																			</button>
																		</div>
																	))}
																</div>
															)}

															{/* Attach button — top-right, show on hover */}
															<button
																type="button"
																onClick={(e) => {
																	e.stopPropagation();
																	onAttachImage(item?.url || url);
																}}
																className="absolute right-1.5 top-1.5 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-orange-500"
																title="Attach image"
															>
																<Plus className="h-3.5 w-3.5" />
															</button>
														</div>
													);
												})
											)}
										</div>

										{/* ── Caption row: prompt text + action icons ── */}
										<div className="flex items-start justify-between gap-1 mt-1.5 px-0.5">
											{entry.userMessage.content ? (
												<Tooltip>
													<TooltipTrigger asChild>
														<p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-2 break-words whitespace-pre-wrap flex-1 cursor-text min-w-0 select-text">
															{entry.userMessage.content}
														</p>
													</TooltipTrigger>
													<TooltipContent side="left" align="start" className="max-w-[340px] p-0 select-text">
														<div className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 text-xs leading-relaxed select-text">
															{entry.userMessage.content}
														</div>
													</TooltipContent>
												</Tooltip>
											) : (
												<span className="flex-1" />
											)}
											{!entry.assistantMessage.isLoading && entry.userIndex !== -1 && (
												<div className="flex-shrink-0">
													<MessageActions
														message={entry.userMessage}
														messageIndex={entry.userIndex}
														onEditRequest={() => onEditPrompt(entry.userMessage.content)}
														onRetry={onRetry}
														onReuse={onReusePrompt}
														retryMessageIndex={entry.assistantIndex}
														reuseGenerationParams={entry.assistantMessage.generationParams}
													/>
												</div>
											)}
										</div>

										{/* ── AI output text — visible caption with copy ── */}
										{cleanedText && (
											<OutputCaption text={cleanedText} onReuse={onEditPrompt} />
										)}
									</div>
								);
							})}
						</div>

						{selectedIndices.size > 0 && (
							<div className="sticky bottom-0 z-30 -mx-1 mt-2 flex items-center justify-between gap-2 rounded-xl border border-orange-200 bg-white/95 dark:bg-slate-900/95 dark:border-orange-900/40 backdrop-blur-sm px-3 py-2 shadow-lg">
								<span className="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
									{selectedIndices.size} image(s) selected
								</span>
								<div className="flex items-center gap-2 shrink-0">
									<button
										type="button"
										onClick={() => setSelectedIndices(new Set())}
										className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
									>
										Hủy
									</button>
									<button
										type="button"
										onClick={() => {
											const urls = items
												.filter((_, idx) => selectedIndices.has(idx))
												.map((it) => it.url);
											onOpenNewChatWithImages(urls);
											setSelectedIndices(new Set());
										}}
										className="inline-flex items-center gap-1.5 rounded-full bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-3 py-1.5 transition-colors whitespace-nowrap"
									>
										<Plus className="w-3.5 h-3.5" />
										Mở chat mới
									</button>
								</div>
							</div>
						)}
					</>
				)}
			</div>
		</TooltipProvider>
	);
}
