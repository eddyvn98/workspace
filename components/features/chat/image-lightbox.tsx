"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
	Check,
	ChevronLeft,
	ChevronRight,
	Copy,
	Download,
	Pencil,
	X,
} from "lucide-react";
import ImageEditorModal from "@/components/features/ai-image-editor/image-editor-modal";
import { ThumbnailRow } from "@/components/features/image-editor/image-message";
import { cn } from "@/lib/utils";

export interface LightboxImage {
	url: string;
	prompt: string;
}

interface ImageLightboxProps {
	images: LightboxImage[];
	index: number;
	onClose: () => void;
	onIndexChange: (index: number) => void;
}

// ─── Download helper ──────────────────────────────────────────────────────────

async function triggerDownload(url: string) {
	try {
		const res = await fetch(`/api/proxy/file?url=${encodeURIComponent(url)}`);
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
		window.open(url, "_blank");
	}
}

const BTN_BASE =
	"shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg " +
	"text-white text-[12px] font-medium backdrop-blur-sm transition-colors " +
	"bg-white/10 hover:bg-white/20";

export function ImageLightbox({
	images,
	index,
	onClose,
	onIndexChange,
}: ImageLightboxProps) {
	const [editorOpen, setEditorOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	const [copyError, setCopyError] = useState(false);
	const [isFullScreen, setIsFullScreen] = useState(true);
	const [scale, setScale] = useState(1);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [isDragging, setIsDragging] = useState(false);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
	const [offsetStart, setOffsetStart] = useState({ x: 0, y: 0 });

	const scaleRef = useRef(1);
	const offsetRef = useRef({ x: 0, y: 0 });
	const containerRef = useRef<HTMLDivElement>(null);
	const hasMovedRef = useRef(false);

	useEffect(() => {
		scaleRef.current = scale;
	}, [scale]);

	useEffect(() => {
		offsetRef.current = offset;
	}, [offset]);

	// Reset scale and offset when image index changes
	useEffect(() => {
		setScale(1);
		setOffset({ x: 0, y: 0 });
	}, [index]);

	// Native wheel listener for zooming
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const handleWheel = (e: WheelEvent) => {
			e.preventDefault();
			const parentRect = container.getBoundingClientRect();
			const mx = e.clientX - parentRect.left;
			const my = e.clientY - parentRect.top;

			// transformOrigin is "center center", so offset is relative to container
			// center. Use cursor position relative to container center for correct
			// zoom-toward-cursor behaviour.
			const relX = mx - parentRect.width / 2;
			const relY = my - parentRect.height / 2;

			const currentScale = scaleRef.current;
			const currentOffset = offsetRef.current;

			// Smooth zoom using exponent based on deltaY
			const zoomSpeed = 0.0015;
			let nextScale = currentScale * Math.exp(-e.deltaY * zoomSpeed);

			nextScale = Math.max(1, Math.min(10, nextScale));

			if (nextScale <= 1.01) {
				setScale(1);
				setOffset({ x: 0, y: 0 });
			} else {
				const factor = nextScale / currentScale;
				const nextOffsetX = relX - (relX - currentOffset.x) * factor;
				const nextOffsetY = relY - (relY - currentOffset.y) * factor;

				setScale(nextScale);
				setOffset({ x: nextOffsetX, y: nextOffsetY });
			}
		};

		container.addEventListener("wheel", handleWheel, { passive: false });
		return () => {
			container.removeEventListener("wheel", handleWheel);
		};
	}, []);

	const handlePointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
		if (scale <= 1) return;
		e.preventDefault();
		hasMovedRef.current = false;
		setIsDragging(true);
		setDragStart({ x: e.clientX, y: e.clientY });
		setOffsetStart({ ...offset });
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLImageElement>) => {
		if (!isDragging) return;
		e.preventDefault();
		const dx = e.clientX - dragStart.x;
		const dy = e.clientY - dragStart.y;
		if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
			hasMovedRef.current = true;
		}
		setOffset({
			x: offsetStart.x + dx,
			y: offsetStart.y + dy,
		});
	};

	const handlePointerUp = (e: React.PointerEvent<HTMLImageElement>) => {
		if (!isDragging) return;
		setIsDragging(false);
		(e.target as HTMLElement).releasePointerCapture(e.pointerId);
	};

	const handleImageClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (hasMovedRef.current) return;

		if (scale > 1) {
			setScale(1);
			setOffset({ x: 0, y: 0 });
		} else {
			setScale(2.5);
		}
	};

	const current = images[index];
	const hasPrev = index > 0;
	const hasNext = index < images.length - 1;

	const goPrev = useCallback(() => {
		if (index > 0) onIndexChange(index - 1);
	}, [index, onIndexChange]);
	const goNext = useCallback(() => {
		if (index < images.length - 1) onIndexChange(index + 1);
	}, [index, images.length, onIndexChange]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (editorOpen) return;
			if (e.key === "Escape") onClose();
			else if (e.key === "ArrowLeft") goPrev();
			else if (e.key === "ArrowRight") goNext();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onClose, goPrev, goNext, editorOpen]);

	const handleCopyImage = useCallback(async () => {
		if (!current) return;
		try {
			const res = await fetch(
				`/api/proxy/file?url=${encodeURIComponent(current.url)}`,
			);
			if (!res.ok) throw new Error("fetch failed");
			const blob = await res.blob();

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
	}, [current]);

	if (!current) return null;

	return createPortal(
		<div
			className="fixed inset-0 z-[150] flex h-dvh flex-col bg-black/90"
			onClick={onClose}
		>
			{/* ── Top bar ── */}
			<div
				className={cn(
					"flex items-center justify-between px-4 py-3 text-white/90",
					isFullScreen ? "absolute top-0 left-0 right-0 z-30" : ""
				)}
				onClick={(e) => e.stopPropagation()}
			>
				<span className="text-[13px] font-medium tabular-nums">
					{index + 1} / {images.length}
				</span>
				<button
					onClick={onClose}
					title="Close (Esc)"
					className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
				>
					<X className="h-5 w-5" />
				</button>
			</div>

			{/* ── Image stage ── */}
			<div
				ref={containerRef}
				className={cn(
					"relative flex flex-1 min-h-0 items-center justify-center px-4 overflow-hidden",
					isFullScreen && images.length > 1 ? "pr-24" : ""
				)}
			>
				{hasPrev && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							goPrev();
						}}
						title="Previous (←)"
						className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
					>
						<ChevronLeft className="h-6 w-6" />
					</button>
				)}

				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={current.url}
					alt={current.prompt || "Full size"}
					className={cn(
						"max-w-full max-h-full w-auto h-auto min-w-0 min-h-0 object-contain rounded-lg shadow-2xl touch-none select-none",
						isFullScreen ? "rounded-none border-none" : "",
						scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
					)}
					style={{
						transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
						transformOrigin: "center center",
						transition: isDragging 
							? "none" 
							: "transform 0.1s ease-out, max-height 0.3s ease-out, rounded-md 0.3s ease-out",
					}}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerCancel={handlePointerUp}
					onClick={handleImageClick}
				/>

				{hasNext && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							goNext();
						}}
						title="Next (→)"
						className={cn(
						"absolute top-1/2 -translate-y-1/2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-200",
						isFullScreen && images.length > 1 ? "right-24" : "right-4"
					)}
					>
						<ChevronRight className="h-6 w-6" />
					</button>
				)}
			</div>

			{/* ── Vertical thumbnail strip (fullscreen only) ── */}
			{isFullScreen && images.length > 1 && (
				<div
					className="absolute right-4 inset-y-0 z-20 flex flex-col py-14 w-[88px] pointer-events-none"
					onClick={(e) => e.stopPropagation()}
				>
					<ThumbnailRow
						images={images}
						activeIndex={index}
						onSelect={onIndexChange}
						vertical
						className="rounded-2xl bg-black/60 border border-white/10 backdrop-blur-md pointer-events-auto w-full flex-1 min-h-0"
					/>
				</div>
			)}

			{/* ── Bottom bar: prompt + actions ── */}
			<div
				className={cn(
					"flex flex-col gap-2 px-4 py-3",
					isFullScreen ? "absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/80 to-transparent" : ""
				)}
				onClick={(e) => e.stopPropagation()}
			>
				{!isFullScreen && images.length > 1 && (
					<ThumbnailRow
						images={images}
						activeIndex={index}
						onSelect={onIndexChange}
						className="rounded-2xl border bg-white/5 border-white/10"
					/>
				)}
				{current.prompt && !isFullScreen && (
					<p className="text-[13px] text-white/70 leading-relaxed max-w-2xl line-clamp-2">
						{current.prompt}
					</p>
				)}

				<div className={cn("flex gap-2 shrink-0", isFullScreen && "justify-end")}>
					<button
						onClick={() => triggerDownload(current.url)}
						title="Download image"
						className={BTN_BASE}
					>
						<Download className="w-4 h-4 shrink-0" />
						<span className="hidden sm:inline">Save</span>
					</button>

					<button
						onClick={handleCopyImage}
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
							<Check className="w-4 h-4 shrink-0 text-green-400" />
						) : (
							<Copy
								className={`w-4 h-4 shrink-0 ${copyError ? "text-red-400" : ""}`}
							/>
						)}
						<span className="hidden sm:inline">
							{copied ? "Copied!" : copyError ? "Failed" : "Copy"}
						</span>
					</button>

					<button
						onClick={() => setEditorOpen(true)}
						title="Open AI image editor"
						className={
							"shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg " +
							"text-white text-[12px] font-medium backdrop-blur-sm transition-colors " +
							"bg-orange-500 hover:bg-orange-400 shadow-md shadow-orange-500/30"
						}
					>
						<Pencil className="w-4 h-4 shrink-0" />
						<span className="hidden sm:inline">Edit</span>
					</button>
				</div>
			</div>

			{/* ── AI Image Editor modal ── */}
			<ImageEditorModal
				isOpen={editorOpen}
				onClose={() => setEditorOpen(false)}
				imageUrl={current.url}
			/>
		</div>,
		document.body,
	);
}
