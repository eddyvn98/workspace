"use client";

import React, { memo, useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
	Check,
	Copy,
	CornerUpLeft,
	Download,
	Pencil,
	ZoomIn,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	ChevronDown,
} from "lucide-react";
import ImageEditorModal from "@/components/features/ai-image-editor/image-editor-modal";
import type { ImagePayloadInputs } from "@/types/image-generation.types";
import { cn } from "@/lib/utils";

// Reserves the correct box size before the browser has decoded the image, so
// it never renders at a tiny fallback size while loading (e.g. "4:3" -> "4 / 3").
function parseAspectRatioCss(ratio?: string): string | undefined {
	const match = ratio?.match(/^(\d+)\s*:\s*(\d+)$/);
	return match ? `${match[1]} / ${match[2]}` : undefined;
}

// ─── Download helper ──────────────────────────────────────────────────────────

async function triggerDownload(url: string) {
	try {
		const res = await fetch(url);
		if (!res.ok) throw new Error("fetch failed");
		const blob = await res.blob();
		const ext =
			blob.type === "image/png"
				? "png"
				: blob.type === "image/jpeg"
					? "jpg"
					: "png";
		const objectUrl = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = objectUrl;
		a.download = `ai-image-${Date.now()}.${ext}`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
	} catch {
		// CORS fallback
		window.open(url, "_blank");
	}
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

interface LightboxProps {
	url: string;
	onClose: () => void;
}

function Lightbox({ url, onClose }: LightboxProps) {
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	return createPortal(
		<div
			className="fixed inset-0 z-[150] bg-black/85 flex items-center justify-center p-4"
			onClick={onClose}
		>
			<img
				src={url}
				alt="Full size"
				className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
				style={{ maxHeight: "calc(100dvh - 2rem)" }}
				onClick={(e) => e.stopPropagation()}
			/>
		</div>,
		document.body,
	);
}

// ─── Thumbnail Row ───────────────────────────────────────────────────────────

export interface ThumbnailRowProps {
	images: Array<{ url: string }>;
	activeIndex: number;
	onSelect: (index: number) => void;
	className?: string;
	vertical?: boolean;
}

export function ThumbnailRow({ images, activeIndex, onSelect, className, vertical = false }: ThumbnailRowProps) {
	const THUMB_SIZE = 64;
	const THUMB_GAP = 8;
	const WHEEL_COOLDOWN_MS = 120;
	const viewportRef = useRef<HTMLDivElement>(null);
	const lastWheelAtRef = useRef(0);
	const [viewportSize, setViewportSize] = useState(0);

	useEffect(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;

		const updateViewportSize = () => {
			setViewportSize(vertical ? viewport.clientHeight : viewport.clientWidth);
		};

		updateViewportSize();
		const resizeObserver = new ResizeObserver(() => {
			updateViewportSize();
		});
		resizeObserver.observe(viewport);

		return () => {
			resizeObserver.disconnect();
		};
	}, [vertical]);

	if (!images || images.length === 0) return null;

	const stepSize = THUMB_SIZE + THUMB_GAP;
	const maxIndex = images.length - 1;

	const clampIndex = (index: number) => Math.max(0, Math.min(maxIndex, index));

	const handlePrev = (e: React.MouseEvent) => {
		e.stopPropagation();
		onSelect(clampIndex(activeIndex - 1));
	};

	const handleNext = (e: React.MouseEvent) => {
		e.stopPropagation();
		onSelect(clampIndex(activeIndex + 1));
	};

	const handleWheel = (e: React.WheelEvent) => {
		e.preventDefault();
		e.stopPropagation();

		const now = Date.now();
		if (now - lastWheelAtRef.current < WHEEL_COOLDOWN_MS) return;
		lastWheelAtRef.current = now;

		const primaryDelta = vertical
			? e.deltaY
			: Math.abs(e.deltaX) > Math.abs(e.deltaY)
				? e.deltaX
				: e.deltaY;
		if (primaryDelta === 0) return;

		const targetIndex = primaryDelta > 0
			? clampIndex(activeIndex + 1)
			: clampIndex(activeIndex - 1);
		if (targetIndex !== activeIndex) {
			onSelect(targetIndex);
		}
	};

	const targetOffset = viewportSize / 2 - THUMB_SIZE / 2 - activeIndex * stepSize;
	const trackTransform = vertical
		? `translate3d(0, ${targetOffset}px, 0)`
		: `translate3d(${targetOffset}px, 0, 0)`;

	return (
		<div
			className={cn(
				"flex gap-2.5 select-none pointer-events-auto",
				vertical ? "flex-col items-center min-h-0 py-2 px-1" : "items-center py-2 px-3 w-full",
				className
			)}
			onClick={(e) => e.stopPropagation()}
		>
			{images.length > 1 && (
				<button
					type="button"
					onClick={handlePrev}
					className="p-1.5 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
				>
					{vertical ? <ChevronUp className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
				</button>
			)}

			<div
				className={cn(
					"relative flex flex-1 min-h-0 min-w-0",
					vertical ? "self-stretch flex-col" : "h-16",
				)}
			>
				<div
					ref={viewportRef}
					onWheel={handleWheel}
					className={cn(
						"relative flex-1 min-h-0 min-w-0 overflow-hidden",
						vertical ? "self-stretch" : "h-16",
					)}
				>
					<div
						className={cn(
							"absolute inset-0 flex",
							vertical ? "justify-center" : "items-center",
						)}
					>
						<div
							className={cn(
								"flex items-center gap-2 will-change-transform",
								vertical ? "flex-col w-16" : "flex-row",
							)}
							style={{
								transform: trackTransform,
								transition: "transform 180ms ease-out",
							}}
						>
							{images.map((img, idx) => {
								const isActive = idx === activeIndex;
								return (
									<button
										key={`${img.url}-${idx}`}
										type="button"
										data-index={idx}
										data-thumbnail="true"
										onClick={(e) => {
											e.stopPropagation();
											onSelect(idx);
										}}
										style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
										className={cn(
											"relative rounded-xl overflow-hidden border transition-all duration-200 shrink-0",
											isActive
												? "border-transparent opacity-100"
												: "border-white/20 opacity-60 hover:opacity-100 hover:border-white/50"
										)}
									>
										<div
											aria-hidden="true"
											className="pointer-events-none h-full w-full bg-center bg-no-repeat"
											style={{
												backgroundImage: `url("${img.url}")`,
												backgroundSize: "cover",
												transform: "scale(1.08)",
											}}
										/>
									</button>
								);
							})}
						</div>
					</div>
				</div>
				<div
					aria-hidden="true"
					data-center-frame="true"
					className={cn(
						"pointer-events-none absolute z-10 h-16 w-16 rounded-xl border border-orange-500/80 ring-2 ring-orange-500/55 shadow-[0_0_0_1px_rgba(255,255,255,0.18)]",
						vertical
							? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
							: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
					)}
				/>
			</div>

			{images.length > 1 && (
				<button
					type="button"
					onClick={handleNext}
					className="p-1.5 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
				>
					{vertical ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
				</button>
			)}
		</div>
	);
}

// ─── ImageMessage ─────────────────────────────────────────────────────────────

export interface ImageMessageProps {
	url: string;
	alt?: string;
	isImageMode?: boolean;
	generationParams?: ImagePayloadInputs;
	userPrompt?: string;
	messageIndex?: number;
	onRetry?: (index: number) => void;
	onResume?: (index: number) => void;
	onReusePrompt?: (prompt: string, images?: string[], generationParams?: ImagePayloadInputs) => void;
	onOpenLightbox?: (url: string) => void;
	imageItems?: Array<{ url: string }>;
	activeImageIndex?: number | null;
	onSelectActiveIndex?: (index: number) => void;
}

// Shared base classes for all action buttons
const BTN_BASE =
	"shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-md " +
	"text-white text-[11px] font-medium backdrop-blur-sm transition-colors " +
	"bg-black/60 hover:bg-black/80";

function ImageMessage({
	url,
	alt = "AI generated image",
	isImageMode = false,
	onOpenLightbox,
	generationParams,
	userPrompt,
	onReusePrompt,
	imageItems = [],
	activeImageIndex = null,
	onSelectActiveIndex,
}: ImageMessageProps) {
	// Reserves box space before/while the image loads (generationParams is only
	// available for messages created in this session, not history loaded from
	// the backend) — replaced with the real ratio once the image decodes so
	// nothing gets stretched/cropped against a wrong guess.
	const [loadedRatio, setLoadedRatio] = useState<string | undefined>(undefined);
	const [lightboxOpen, setLightboxOpen] = useState(false);
	const [editorOpen, setEditorOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	const [copyError, setCopyError] = useState(false);

	// The component isn't remounted when the active image switches within the
	// same message slot, so the previous image's decoded ratio must be cleared.
	useEffect(() => {
		setLoadedRatio(undefined);
	}, [url]);

	const openLightbox = useCallback(() => setLightboxOpen(true), []);
	const closeLightbox = useCallback(() => setLightboxOpen(false), []);
	const openEditor = useCallback(() => setEditorOpen(true), []);
	const closeEditor = useCallback(() => setEditorOpen(false), []);

	// Copy the actual image bitmap to clipboard so it can be pasted into
	// Paint, Photoshop, Word, Discord, Telegram, etc.
	const handleCopyImage = useCallback(async () => {
		try {
			// Route through the internal proxy so the OSS CORS restriction never
			// reaches the browser — the server fetches the image without restrictions.
			const res = await fetch(`/api/proxy/file?url=${encodeURIComponent(url)}`);
			if (!res.ok) throw new Error("fetch failed");
			const blob = await res.blob();

			// Clipboard API only accepts image/png, so convert non-PNG images via canvas
			let pngBlob: Blob = blob;
			if (blob.type !== "image/png") {
				const imageBitmap = await createImageBitmap(blob);
				const canvas = document.createElement("canvas");
				canvas.width = imageBitmap.width;
				canvas.height = imageBitmap.height;
				const ctx = canvas.getContext("2d");
				ctx!.drawImage(imageBitmap, 0, 0);
				pngBlob = await new Promise<Blob>((resolve, reject) => {
					canvas.toBlob(
						(b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
						"image/png",
					);
				});
			}

			await navigator.clipboard.write([
				new ClipboardItem({ "image/png": pngBlob }),
			]);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			setCopyError(true);
			setTimeout(() => setCopyError(false), 2000);
		}
	}, [url]);

	const currentUrlIndex = imageItems.findIndex((item) => item.url === url);
	const activeIndex = activeImageIndex !== null && activeImageIndex !== undefined && activeImageIndex !== -1
		? activeImageIndex 
		: (currentUrlIndex !== -1 ? currentUrlIndex : 0);

	const handleSelect = useCallback((idx: number) => {
		if (isImageMode && onSelectActiveIndex) {
			onSelectActiveIndex(idx);
		} else if (onOpenLightbox && imageItems[idx]) {
			onOpenLightbox(imageItems[idx].url);
		}
	}, [isImageMode, onSelectActiveIndex, onOpenLightbox, imageItems]);

	return (
		<>
			{/* ── Image card ── */}
			<div className="relative my-3 w-full flex justify-center" onClick={(e) => e.stopPropagation()}>
				<div
					className="relative max-w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-lg group"
					style={{
						height: isImageMode ? "var(--image-max-height, calc(100dvh - 230px))" : "82dvh",
						aspectRatio:
							loadedRatio ??
							parseAspectRatioCss(generationParams?.aspect_ratio) ??
							"4 / 3",
					}}
				>
					<img
						src={url}
						alt={alt}
						className="block w-full h-full cursor-zoom-in"
						style={{ objectFit: "contain" }}
						onLoad={(e) => {
							const img = e.currentTarget;
							if (img.naturalWidth && img.naturalHeight) {
								setLoadedRatio(`${img.naturalWidth} / ${img.naturalHeight}`);
							}
						}}
						onClick={() => onOpenLightbox ? onOpenLightbox(url) : openLightbox()}
					/>

					{/* ── Utility buttons (View · Save · Copy · Edit · Reuse) overlaid top-right ── */}
					<div 
						className={cn(
							"absolute right-3 top-3 z-30 flex gap-1.5 pointer-events-auto transition-opacity duration-200",
							"opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
						)}
					>
						<button
							onClick={(e) => {
								e.stopPropagation();
								onOpenLightbox ? onOpenLightbox(url) : openLightbox();
							}}
							title="View full size"
							className={BTN_BASE}
						>
							<ZoomIn className="w-3.5 h-3.5 shrink-0" />
							<span className="hidden sm:inline">View</span>
						</button>

						<button
							onClick={(e) => {
								e.stopPropagation();
								triggerDownload(url);
							}}
							title="Download image"
							className={BTN_BASE}
						>
							<Download className="w-3.5 h-3.5 shrink-0" />
							<span className="hidden sm:inline">Save</span>
						</button>

						<button
							onClick={(e) => {
								e.stopPropagation();
								handleCopyImage();
							}}
							title={
								copied
									? "Copied!"
									: copyError
										? "Copy failed — check browser permissions"
										: "Copy image to clipboard"
							}
							className={BTN_BASE}
						>
							{copied ? (
								<Check className="w-3.5 h-3.5 shrink-0 text-green-400" />
							) : copyError ? (
								<Copy className="w-3.5 h-3.5 shrink-0 text-red-400" />
							) : (
								<Copy className="w-3.5 h-3.5 shrink-0" />
							)}
							<span className="hidden sm:inline">
								{copied ? "Copied!" : copyError ? "Failed" : "Copy"}
							</span>
						</button>

						<button
							onClick={(e) => {
								e.stopPropagation();
								openEditor();
							}}
							title="Open AI image editor"
							className={
								"shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-md " +
								"text-white text-[11px] font-medium backdrop-blur-sm transition-colors " +
								"bg-orange-500 hover:bg-orange-400 shadow-md shadow-orange-500/30"
							}
						>
							<Pencil className="w-3.5 h-3.5 shrink-0" />
							<span className="hidden sm:inline">Edit</span>
						</button>

						{onReusePrompt && userPrompt && (
							<button
								onClick={(e) => {
									e.stopPropagation();
									onReusePrompt(userPrompt, url ? [url] : [], generationParams);
								}}
								title="Reuse prompt and settings"
								className={BTN_BASE}
							>
								<CornerUpLeft className="w-3.5 h-3.5 shrink-0" />
								<span className="hidden sm:inline">Reuse</span>
							</button>
						)}
					</div>

					{/* ── Thumbnail Row overlaid bottom ── */}
					{imageItems.length > 0 && (
						<div
							className={cn(
								"absolute inset-x-0 bottom-3 z-20 px-3 pointer-events-none flex justify-center transition-opacity duration-200",
								"opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
							)}
						>
							<ThumbnailRow
								images={imageItems}
								activeIndex={activeIndex}
								onSelect={handleSelect}
								className="max-w-[90%]"
							/>
						</div>
					)}
				</div>
			</div>

			{/* ── Lightbox ── */}
			{lightboxOpen && <Lightbox url={url} onClose={closeLightbox} />}

			{/* ── AI Image Editor modal (same page, no navigation) ── */}
			<ImageEditorModal
				isOpen={editorOpen}
				onClose={closeEditor}
				imageUrl={url}
			/>
		</>
	);
}

export default memo(ImageMessage);
