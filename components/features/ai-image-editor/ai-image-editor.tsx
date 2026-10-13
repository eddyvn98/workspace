"use client";

import React, {
	useCallback,
	useEffect,
	useLayoutEffect,
	useReducer,
	useRef,
	useState,
} from "react";
import Konva from "konva";
import {
	Stage,
	Layer,
	Image as KonvaImage,
	Line,
	Rect,
	Ellipse,
} from "react-konva";
import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	Bold,
	Download,
	Eraser,
	Highlighter,
	Italic,
	Loader2,
	Minus,
	Brush,
	Circle,
	Redo2,
	Square,
	Trash2,
	Type,
	Undo2,
	X,
	ChevronUp,
	ChevronDown,
	Settings2,
	MessageSquarePlus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useImageStore } from "@/stores/useImageStore";
import KonvaTextElement, { TextElement } from "./konva-text-element";

// ─── Types ────────────────────────────────────────────────────────────────────

type EditorTool =
	| "brush"
	| "rectangle"
	| "circle"
	| "line"
	| "text"
	| "highlight"
	| "eraser";

interface BrushShape {
	id: string;
	type: "brush";
	points: number[];
	color: string;
	strokeWidth: number;
	opacity: number;
}
interface EraserShape {
	id: string;
	type: "eraser";
	points: number[];
	strokeWidth: number;
}
interface RectShape {
	id: string;
	type: "rectangle";
	x: number;
	y: number;
	w: number;
	h: number;
	color: string;
	strokeWidth: number;
	opacity: number;
}
interface EllipseShape {
	id: string;
	type: "circle";
	cx: number;
	cy: number;
	rx: number;
	ry: number;
	color: string;
	strokeWidth: number;
	opacity: number;
}
interface LineShape {
	id: string;
	type: "line";
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	color: string;
	strokeWidth: number;
	opacity: number;
}
interface HighlightShape {
	id: string;
	type: "highlight";
	x: number;
	y: number;
	w: number;
	h: number;
	color: string;
}

type DrawnShape =
	| BrushShape
	| EraserShape
	| RectShape
	| EllipseShape
	| LineShape
	| HighlightShape;

interface HistorySnapshot {
	shapes: DrawnShape[];
	texts: TextElement[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TOOLS: { id: EditorTool; Icon: React.ElementType; label: string }[] = [
	{ id: "brush", Icon: Brush, label: "Brush" },
	{ id: "rectangle", Icon: Square, label: "Rect" },
	{ id: "circle", Icon: Circle, label: "Circle" },
	{ id: "line", Icon: Minus, label: "Line" },
	{ id: "text", Icon: Type, label: "Text" },
	{ id: "highlight", Icon: Highlighter, label: "Highlight" },
	{ id: "eraser", Icon: Eraser, label: "Eraser" },
];

const COLOR_SWATCHES = [
	"#ef4444",
	"#f97316",
	"#eab308",
	"#22c55e",
	"#3b82f6",
	"#a855f7",
	"#ffffff",
	"#000000",
];

const FONT_FAMILIES = [
	"sans-serif",
	"serif",
	"monospace",
	"Georgia",
	"Arial",
	"Verdana",
];

const MAX_HISTORY = 50;
const DEFAULT_FONT_SIZE = 24;

// ─── Shape renderer ───────────────────────────────────────────────────────────

function renderShape(shape: DrawnShape): React.ReactNode {
	switch (shape.type) {
		case "brush":
			return (
				<Line
					key={shape.id}
					points={shape.points}
					stroke={shape.color}
					strokeWidth={shape.strokeWidth}
					lineCap="round"
					lineJoin="round"
					tension={0.5}
					opacity={shape.opacity}
				/>
			);
		case "eraser":
			return (
				<Line
					key={shape.id}
					points={shape.points}
					stroke="rgba(0,0,0,1)"
					strokeWidth={shape.strokeWidth * 3}
					lineCap="round"
					lineJoin="round"
					globalCompositeOperation="destination-out"
				/>
			);
		case "rectangle":
			return (
				<Rect
					key={shape.id}
					x={shape.x}
					y={shape.y}
					width={shape.w}
					height={shape.h}
					stroke={shape.color}
					strokeWidth={shape.strokeWidth}
					fill="transparent"
					opacity={shape.opacity}
				/>
			);
		case "circle":
			return (
				<Ellipse
					key={shape.id}
					x={shape.cx}
					y={shape.cy}
					radiusX={Math.max(0.1, shape.rx)}
					radiusY={Math.max(0.1, shape.ry)}
					stroke={shape.color}
					strokeWidth={shape.strokeWidth}
					fill="transparent"
					opacity={shape.opacity}
				/>
			);
		case "line":
			return (
				<Line
					key={shape.id}
					points={[shape.x1, shape.y1, shape.x2, shape.y2]}
					stroke={shape.color}
					strokeWidth={shape.strokeWidth}
					lineCap="round"
					opacity={shape.opacity}
				/>
			);
		case "highlight":
			return (
				<Rect
					key={shape.id}
					x={shape.x}
					y={shape.y}
					width={shape.w}
					height={shape.h}
					fill={shape.color}
					opacity={0.38}
				/>
			);
	}
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Detect if current viewport is "mobile" (width < 768px) */
function useIsMobile() {
	const [isMobile, setIsMobile] = useState(false);
	useEffect(() => {
		const mq = window.matchMedia("(max-width: 767px)");
		setIsMobile(mq.matches);
		const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, []);
	return isMobile;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Collapsible section used inside the desktop right panel */
function PanelSection({
	title,
	children,
	defaultOpen = true,
}: {
	title: string;
	children: React.ReactNode;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div>
			<button
				onClick={() => setOpen((v) => !v)}
				className="flex items-center justify-between w-full mb-2 group"
			>
				<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider group-hover:text-slate-400 transition-colors">
					{title}
				</p>
				{open ? (
					<ChevronUp className="w-3 h-3 text-slate-600" />
				) : (
					<ChevronDown className="w-3 h-3 text-slate-600" />
				)}
			</button>
			{open && children}
		</div>
	);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface AiImageEditorProps {
	initialImageUrl?: string;
	onClose?: () => void;
}

export default function AiImageEditor({
	initialImageUrl,
	onClose,
}: AiImageEditorProps = {}) {
	const stageRef = useRef<Konva.Stage>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const isMobile = useIsMobile();

	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	// Mobile bottom panel open state
	const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false);

	// Image
	const [konvaImage, setKonvaImage] = useState<HTMLImageElement | null>(null);
	const [naturalW, setNaturalW] = useState(0);
	const [naturalH, setNaturalH] = useState(0);
	const [stageW, setStageW] = useState(0);
	const [stageH, setStageH] = useState(0);
	const [outputW, setOutputW] = useState(1024);
	const [outputH, setOutputH] = useState(1024);

	// Tools
	const [activeTool, setActiveTool] = useState<EditorTool>("brush");
	const [brushColor, setBrushColor] = useState("#ef4444");
	const [brushSize, setBrushSize] = useState(4);
	const [opacity, setOpacity] = useState(100);
	const [customColor, setCustomColor] = useState("#ef4444");

	// Drawing shapes
	const [shapes, setShapes] = useState<DrawnShape[]>([]);
	const liveShapeRef = useRef<DrawnShape | null>(null);
	const [, forceRender] = useReducer((c: number) => c + 1, 0);

	// Text elements
	const [textElements, setTextElements] = useState<TextElement[]>([]);
	const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
	const [editingTextId, setEditingTextId] = useState<string | null>(null);
	const [editingValue, setEditingValue] = useState("");
	const editingOverlayRef = useRef<HTMLTextAreaElement>(null);

	// Text styling controls
	const [textFontSize, setTextFontSize] = useState(DEFAULT_FONT_SIZE);
	const [textBold, setTextBold] = useState(false);
	const [textItalic, setTextItalic] = useState(false);
	const [textAlign, setTextAlign] = useState<"left" | "center" | "right">(
		"left",
	);

	// History
	const historyRef = useRef<HistorySnapshot[]>([{ shapes: [], texts: [] }]);
	const historyIdxRef = useRef(0);
	const [canUndo, setCanUndo] = useState(false);
	const [canRedo, setCanRedo] = useState(false);

	// Drawing tracking
	const isDrawingRef = useRef(false);
	const startPosRef = useRef({ x: 0, y: 0 });

	const [isUploading, setIsUploading] = useState(false);
	const addExternalImage = useImageStore((s: any) => s.addExternalImage);

	// ── Sync text style controls when a text element is selected ───────────────

	useEffect(() => {
		if (!selectedTextId) return;
		const el = textElements.find((t) => t.id === selectedTextId);
		if (!el) return;
		setTextFontSize(el.fontSize);
		setTextBold(el.fontStyle.includes("bold"));
		setTextItalic(el.fontStyle.includes("italic"));
		setTextAlign(el.align);
		setBrushColor(el.color);
	}, [selectedTextId]);

	// ── Focus text editing overlay ──────────────────────────────────────────────

	useEffect(() => {
		if (!editingTextId) return;
		const t = setTimeout(() => {
			const ta = editingOverlayRef.current;
			if (!ta) return;
			ta.focus();
			ta.select();
		}, 0);
		return () => clearTimeout(t);
	}, [editingTextId]);

	// ── Load image ──────────────────────────────────────────────────────────────

	useEffect(() => {
		if (!initialImageUrl) return;
		setKonvaImage(null);
		setNaturalW(0);
		setNaturalH(0);

		const load = (withCors: boolean) => {
			const img = new Image();
			if (withCors) img.crossOrigin = "anonymous";
			img.onload = () => {
				setKonvaImage(img);
				setNaturalW(img.naturalWidth);
				setNaturalH(img.naturalHeight);
				setOutputW(img.naturalWidth);
				setOutputH(img.naturalHeight);
			};
			img.onerror = () => {
				if (withCors) load(false);
			};
			img.src = initialImageUrl;
		};
		load(true);
	}, [initialImageUrl]);

	// ── Stage display size ──────────────────────────────────────────────────────

	const updateStageSize = useCallback(() => {
		const el = containerRef.current;
		if (!el || !naturalW || !naturalH) return;
		// On mobile, use tighter padding
		const padding = isMobile ? 8 : 32;
		const cw = el.clientWidth - padding;
		const ch = el.clientHeight - padding;
		if (cw <= 0 || ch <= 0) return;
		const scale = Math.min(cw / naturalW, ch / naturalH, 1);
		setStageW(Math.round(naturalW * scale));
		setStageH(Math.round(naturalH * scale));
	}, [naturalW, naturalH, isMobile]);

	useLayoutEffect(() => {
		updateStageSize();
	}, [updateStageSize]);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const obs = new ResizeObserver(updateStageSize);
		obs.observe(el);
		return () => obs.disconnect();
	}, [updateStageSize]);

	// ── History helpers ─────────────────────────────────────────────────────────

	const pushHistory = useCallback((snap: HistorySnapshot) => {
		const branch = historyRef.current.slice(0, historyIdxRef.current + 1);
		branch.push(snap);
		if (branch.length > MAX_HISTORY)
			branch.splice(0, branch.length - MAX_HISTORY);
		historyRef.current = branch;
		historyIdxRef.current = branch.length - 1;
		setCanUndo(historyIdxRef.current > 0);
		setCanRedo(false);
	}, []);

	const handleUndo = useCallback(() => {
		if (historyIdxRef.current <= 0) return;
		historyIdxRef.current--;
		const snap = historyRef.current[historyIdxRef.current];
		setShapes(snap.shapes);
		setTextElements(snap.texts);
		setCanUndo(historyIdxRef.current > 0);
		setCanRedo(true);
	}, []);

	const handleRedo = useCallback(() => {
		if (historyIdxRef.current >= historyRef.current.length - 1) return;
		historyIdxRef.current++;
		const snap = historyRef.current[historyIdxRef.current];
		setShapes(snap.shapes);
		setTextElements(snap.texts);
		setCanRedo(historyIdxRef.current < historyRef.current.length - 1);
		setCanUndo(true);
	}, []);

	const handleClear = useCallback(() => {
		const empty: HistorySnapshot = { shapes: [], texts: [] };
		setShapes([]);
		setTextElements([]);
		setSelectedTextId(null);
		setEditingTextId(null);
		pushHistory(empty);
		toast.success("Canvas cleared");
	}, [pushHistory]);

	// ── Text helpers ────────────────────────────────────────────────────────────

	const newId = () =>
		`s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

	const makeFontStyle = (bold: boolean, italic: boolean) => {
		if (bold && italic) return "bold italic";
		if (bold) return "bold";
		if (italic) return "italic";
		return "normal";
	};

	const commitTextEdit = useCallback(
		(nextTexts?: TextElement[]) => {
			const texts = nextTexts ?? textElements;
			if (!editingTextId) return;
			const trimmed = editingValue.trim();
			let updated: TextElement[];
			if (!trimmed) {
				updated = texts.filter((t) => t.id !== editingTextId);
			} else {
				updated = texts.map((t) =>
					t.id === editingTextId ? { ...t, text: trimmed } : t,
				);
			}
			setTextElements(updated);
			pushHistory({ shapes, texts: updated });
			setEditingTextId(null);
			setEditingValue("");
		},
		[editingTextId, editingValue, shapes, pushHistory],
	);

	// ── Pointer helpers ─────────────────────────────────────────────────────────

	const getPos = (): { x: number; y: number } | null =>
		stageRef.current?.getPointerPosition() ?? null;

	// ── Mouse / touch handlers ──────────────────────────────────────────────────

	const handlePointerDown = useCallback(
		(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
			if ("button" in e.evt && (e.evt as MouseEvent).button !== 0) return;

			const clickedOnStage = e.target === e.target.getStage();

			if (activeTool === "text") {
				if (editingTextId) {
					commitTextEdit();
					return;
				}
				if (selectedTextId && clickedOnStage) {
					setSelectedTextId(null);
					return;
				}
				if (clickedOnStage) {
					const pos = getPos();
					if (!pos) return;
					const id = newId();
					const fontStyle = makeFontStyle(textBold, textItalic);
					const newEl: TextElement = {
						id,
						x: pos.x,
						y: pos.y,
						text: "Text",
						fontSize: textFontSize,
						fontStyle,
						align: textAlign,
						color: brushColor,
						rotation: 0,
						width: 200,
						opacity: opacity / 100,
					};
					const nextTexts = [...textElements, newEl];
					setTextElements(nextTexts);
					setSelectedTextId(id);
					setEditingTextId(id);
					setEditingValue("Text");
				}
				return;
			}

			if (selectedTextId) setSelectedTextId(null);

			const pos = getPos();
			if (!pos) return;
			startPosRef.current = pos;
			isDrawingRef.current = true;

			const col = brushColor;
			const sw = brushSize;
			const op = opacity / 100;
			const id = newId();

			let shape: DrawnShape;
			switch (activeTool) {
				case "brush":
					shape = {
						id,
						type: "brush",
						points: [pos.x, pos.y],
						color: col,
						strokeWidth: sw,
						opacity: op,
					};
					break;
				case "eraser":
					shape = {
						id,
						type: "eraser",
						points: [pos.x, pos.y],
						strokeWidth: sw,
					};
					break;
				case "rectangle":
					shape = {
						id,
						type: "rectangle",
						x: pos.x,
						y: pos.y,
						w: 0,
						h: 0,
						color: col,
						strokeWidth: sw,
						opacity: op,
					};
					break;
				case "circle":
					shape = {
						id,
						type: "circle",
						cx: pos.x,
						cy: pos.y,
						rx: 0,
						ry: 0,
						color: col,
						strokeWidth: sw,
						opacity: op,
					};
					break;
				case "line":
					shape = {
						id,
						type: "line",
						x1: pos.x,
						y1: pos.y,
						x2: pos.x,
						y2: pos.y,
						color: col,
						strokeWidth: sw,
						opacity: op,
					};
					break;
				case "highlight":
					shape = {
						id,
						type: "highlight",
						x: pos.x,
						y: pos.y,
						w: 0,
						h: 0,
						color: col,
					};
					break;
				default:
					return;
			}

			liveShapeRef.current = shape;
			forceRender();
		},

		[
			activeTool,
			brushColor,
			brushSize,
			opacity,
			selectedTextId,
			editingTextId,
			textElements,
			textFontSize,
			textBold,
			textItalic,
			textAlign,
			commitTextEdit,
		],
	);

	const handlePointerMove = useCallback(
		(_e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
			if (!isDrawingRef.current) return;
			const pos = getPos();
			if (!pos) return;
			const prev = liveShapeRef.current;
			if (!prev) return;
			const start = startPosRef.current;

			let next: DrawnShape;
			switch (prev.type) {
				case "brush":
				case "eraser":
					next = { ...prev, points: [...prev.points, pos.x, pos.y] };
					break;
				case "rectangle":
				case "highlight":
					next = {
						...prev,
						x: Math.min(start.x, pos.x),
						y: Math.min(start.y, pos.y),
						w: Math.abs(pos.x - start.x),
						h: Math.abs(pos.y - start.y),
					};
					break;
				case "circle":
					next = {
						...prev,
						cx: (start.x + pos.x) / 2,
						cy: (start.y + pos.y) / 2,
						rx: Math.abs(pos.x - start.x) / 2,
						ry: Math.abs(pos.y - start.y) / 2,
					};
					break;
				case "line":
					next = { ...prev, x2: pos.x, y2: pos.y };
					break;
				default:
					return;
			}

			liveShapeRef.current = next;
			forceRender();
		},

		[],
	);

	const handlePointerUp = useCallback(() => {
		if (!isDrawingRef.current) return;
		isDrawingRef.current = false;
		const shape = liveShapeRef.current;
		liveShapeRef.current = null;
		if (!shape) {
			forceRender();
			return;
		}
		setShapes((ss) => {
			const next = [...ss, shape];
			pushHistory({ shapes: next, texts: textElements });
			return next;
		});
	}, [pushHistory, textElements]);

	// ── Text element event handlers ─────────────────────────────────────────────

	const handleTextSelect = useCallback(
		(id: string) => {
			if (activeTool !== "text") return;
			setSelectedTextId(id);
		},
		[activeTool],
	);

	const handleTextChange = useCallback(
		(updated: TextElement) => {
			setTextElements((prev) => {
				const next = prev.map((t) =>
					t.id === updated.id ? updated : t,
				);
				pushHistory({ shapes, texts: next });
				return next;
			});
		},
		[shapes, pushHistory],
	);

	const handleTextDoubleClick = useCallback(
		(id: string) => {
			const el = textElements.find((t) => t.id === id);
			if (!el) return;
			setEditingTextId(id);
			setEditingValue(el.text);
		},
		[textElements],
	);

	const editingElement = editingTextId
		? (textElements.find((t) => t.id === editingTextId) ?? null)
		: null;

	// ── Apply text style changes to selected element ────────────────────────────

	const applyTextStyle = useCallback(
		(patch: Partial<TextElement>) => {
			if (!selectedTextId) return;
			setTextElements((prev) => {
				const next = prev.map((t) =>
					t.id === selectedTextId ? { ...t, ...patch } : t,
				);
				pushHistory({ shapes, texts: next });
				return next;
			});
		},
		[selectedTextId, shapes, pushHistory],
	);

	// ── Delete selected text ────────────────────────────────────────────────────

	const deleteSelectedText = useCallback(() => {
		if (!selectedTextId) return;
		setTextElements((prev) => {
			const next = prev.filter((t) => t.id !== selectedTextId);
			pushHistory({ shapes, texts: next });
			return next;
		});
		setSelectedTextId(null);
	}, [selectedTextId, shapes, pushHistory]);

	// ── Export ──────────────────────────────────────────────────────────────────

	const getExportDataUrl = useCallback((): string | null => {
		const stage = stageRef.current;
		if (!stage || stageW <= 0) return null;
		const pixelRatio = naturalW > 0 ? naturalW / stageW : 1;
		return stage.toDataURL({ pixelRatio, mimeType: "image/png" });
	}, [naturalW, stageW]);

	const handleDownload = useCallback(() => {
		const dataUrl = getExportDataUrl();
		if (!dataUrl) return;
		const a = document.createElement("a");
		a.href = dataUrl;
		a.download = `edited-${Date.now()}.png`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}, [getExportDataUrl]);

	const handleUseInChat = useCallback(async () => {
		// Hide selection controls so they don't appear in the exported image
		const stage = stageRef.current;
		const transformers = stage?.find("Transformer") ?? [];
		transformers.forEach((tr) => tr.hide());
		stage?.batchDraw();

		const dataUrl = getExportDataUrl();

		transformers.forEach((tr) => tr.show());
		stage?.batchDraw();

		if (!dataUrl) return;
		setIsUploading(true);
		try {
			const byteStr = atob(dataUrl.split(",")[1]);
			const buf = new Uint8Array(byteStr.length);
			for (let i = 0; i < byteStr.length; i++)
				buf[i] = byteStr.charCodeAt(i);
			const blob = new Blob([buf], { type: "image/png" });
			const filename = `edited-${Date.now()}.png`;
			const file = new File([blob], filename, { type: "image/png" });
			const formData = new FormData();
			formData.append("Image", file);
			const res = await fetch("/api/oss", {
				method: "POST",
				body: formData,
			});
			const resData = await res.json();
			if (!res.ok || !resData.url)
				throw new Error(resData?.error ?? "Upload failed");
			addExternalImage(resData.url, filename);
			toast.success("Edited image added to chat!");
			onClose?.();
		} catch (err: any) {
			toast.error(
				err instanceof Error ? err.message : "Failed to upload",
			);
		} finally {
			setIsUploading(false);
		}
	}, [getExportDataUrl, addExternalImage, onClose]);

	// ── Keyboard shortcuts ──────────────────────────────────────────────────────

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const inInput =
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				e.target instanceof HTMLSelectElement;

			if (inInput) return;

			const mod = e.ctrlKey || e.metaKey;
			if (mod && e.key === "z" && !e.shiftKey) {
				e.preventDefault();
				handleUndo();
				return;
			}
			if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
				e.preventDefault();
				handleRedo();
				return;
			}
			if (e.key === "Escape") {
				onClose?.();
				return;
			}

			if (activeTool === "text" && selectedTextId) {
				if (e.key === "Delete" || e.key === "Backspace") {
					e.preventDefault();
					deleteSelectedText();
					return;
				}
				const step = e.shiftKey ? 10 : 1;
				if (e.key === "ArrowLeft") {
					e.preventDefault();
					applyTextStyle({
						x:
							(textElements.find((t) => t.id === selectedTextId)
								?.x ?? 0) - step,
					});
				}
				if (e.key === "ArrowRight") {
					e.preventDefault();
					applyTextStyle({
						x:
							(textElements.find((t) => t.id === selectedTextId)
								?.x ?? 0) + step,
					});
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					applyTextStyle({
						y:
							(textElements.find((t) => t.id === selectedTextId)
								?.y ?? 0) - step,
					});
				}
				if (e.key === "ArrowDown") {
					e.preventDefault();
					applyTextStyle({
						y:
							(textElements.find((t) => t.id === selectedTextId)
								?.y ?? 0) + step,
					});
				}
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [
		handleUndo,
		handleRedo,
		onClose,
		activeTool,
		selectedTextId,
		deleteSelectedText,
		applyTextStyle,
		textElements,
	]);

	// ── Cursor ──────────────────────────────────────────────────────────────────

	const cursor =
		activeTool === "text"
			? "text"
			: activeTool === "eraser"
				? "cell"
				: "crosshair";

	// ── Shared panel content (used in both desktop right panel & mobile sheet) ──

	const isTextTool = activeTool === "text";

	const ToolsPanel = (
		<div className="grid grid-cols-4 gap-1.5 sm:grid-cols-3 md:grid-cols-3">
			{TOOLS.map(({ id, Icon, label }) => (
				<button
					key={id}
					onClick={() => {
						setActiveTool(id);
						if (id !== "text") {
							setSelectedTextId(null);
							setEditingTextId(null);
						}
					}}
					title={label}
					className={cn(
						"flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-medium transition-all",
						activeTool === id
							? "bg-orange-500 text-white shadow-md shadow-orange-500/30"
							: "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200",
					)}
				>
					<Icon className="w-4 h-4" />
					<span>{label}</span>
				</button>
			))}
		</div>
	);

	const TextPanel = isTextTool && (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<span className="text-[11px] text-slate-400">Size</span>
				<input
					type="number"
					min={8}
					max={200}
					value={textFontSize}
					onChange={(e) => {
						const v = Math.max(
							8,
							Math.min(200, Number(e.target.value)),
						);
						setTextFontSize(v);
						if (selectedTextId) applyTextStyle({ fontSize: v });
					}}
					className="w-14 bg-white/5 border border-white/10 rounded text-[11px] text-slate-300 px-1.5 py-0.5 text-right"
				/>
			</div>
			<div className="flex gap-1.5 flex-wrap">
				<button
					onClick={() => {
						const next = !textBold;
						setTextBold(next);
						if (selectedTextId)
							applyTextStyle({
								fontStyle: makeFontStyle(next, textItalic),
							});
					}}
					className={cn(
						"flex items-center justify-center w-8 h-8 rounded text-[13px] font-bold transition-all",
						textBold
							? "bg-orange-500 text-white"
							: "bg-white/5 text-slate-400 hover:bg-white/10",
					)}
					title="Bold"
				>
					<Bold className="w-3.5 h-3.5" />
				</button>
				<button
					onClick={() => {
						const next = !textItalic;
						setTextItalic(next);
						if (selectedTextId)
							applyTextStyle({
								fontStyle: makeFontStyle(textBold, next),
							});
					}}
					className={cn(
						"flex items-center justify-center w-8 h-8 rounded text-[13px] transition-all",
						textItalic
							? "bg-orange-500 text-white"
							: "bg-white/5 text-slate-400 hover:bg-white/10",
					)}
					title="Italic"
				>
					<Italic className="w-3.5 h-3.5" />
				</button>
				{(["left", "center", "right"] as const).map((a) => {
					const Icon =
						a === "left"
							? AlignLeft
							: a === "center"
								? AlignCenter
								: AlignRight;
					return (
						<button
							key={a}
							onClick={() => {
								setTextAlign(a);
								if (selectedTextId)
									applyTextStyle({ align: a });
							}}
							className={cn(
								"flex items-center justify-center w-8 h-8 rounded transition-all",
								textAlign === a
									? "bg-orange-500 text-white"
									: "bg-white/5 text-slate-400 hover:bg-white/10",
							)}
							title={`Align ${a}`}
						>
							<Icon className="w-3.5 h-3.5" />
						</button>
					);
				})}
			</div>
			{selectedTextId && (
				<button
					onClick={deleteSelectedText}
					className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-red-500/20 hover:bg-red-500/40 text-red-400 text-[11px] transition-all"
				>
					<Trash2 className="w-3 h-3" />
					Delete text
				</button>
			)}
		</div>
	);

	const ColorPanel = (
		<div className="space-y-2">
			<div className="grid grid-cols-8 gap-1 sm:grid-cols-4">
				{COLOR_SWATCHES.map((c) => (
					<button
						key={c}
						onClick={() => {
							setBrushColor(c);
							if (isTextTool && selectedTextId)
								applyTextStyle({ color: c });
						}}
						title={c}
						style={{ backgroundColor: c }}
						className={cn(
							"w-7 h-7 rounded-full border-2 transition-all",
							brushColor === c
								? "border-white scale-110"
								: "border-transparent hover:border-white/40",
						)}
					/>
				))}
			</div>
			<div className="flex items-center gap-2">
				<div
					className="w-5 h-5 rounded-full border border-white/20 flex-shrink-0"
					style={{ backgroundColor: customColor }}
				/>
				<label className="text-[11px] text-slate-400 cursor-pointer hover:text-slate-200 transition-colors">
					Custom color
					<input
						type="color"
						value={customColor}
						onChange={(e) => {
							setCustomColor(e.target.value);
							setBrushColor(e.target.value);
							if (isTextTool && selectedTextId)
								applyTextStyle({ color: e.target.value });
						}}
						className="sr-only"
					/>
				</label>
			</div>
		</div>
	);

	const SizePanel = !isTextTool && (
		<div>
			<div className="flex items-center justify-between mb-1.5">
				<span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
					Size
				</span>
				<span className="text-[11px] text-slate-400 tabular-nums">
					{brushSize}
				</span>
			</div>
			<input
				type="range"
				min={1}
				max={40}
				value={brushSize}
				onChange={(e) => setBrushSize(Number(e.target.value))}
				className="w-full accent-orange-500"
			/>
		</div>
	);

	const OpacityPanel = (
		<div>
			<div className="flex items-center justify-between mb-1.5">
				<span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
					Opacity
				</span>
				<span className="text-[11px] text-slate-400 tabular-nums">
					{opacity}
				</span>
			</div>
			<input
				type="range"
				min={10}
				max={100}
				value={opacity}
				onChange={(e) => {
					const v = Number(e.target.value);
					setOpacity(v);
					if (isTextTool && selectedTextId)
						applyTextStyle({ opacity: v / 100 });
				}}
				className="w-full accent-orange-500"
			/>
		</div>
	);

	// ── Render ──────────────────────────────────────────────────────────────────

	const showStage = mounted && stageW > 0 && stageH > 0;

	return (
		<div className="flex flex-col h-full bg-[#0f0f12] text-white select-none overflow-hidden">
			{/* ── Top bar ── */}
			<div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 border-b border-white/10 flex-shrink-0 min-w-0">
				{onClose && (
					<button
						onClick={onClose}
						title="Close (Esc)"
						className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
					>
						<X className="w-4 h-4" />
					</button>
				)}

				<span className="text-xs sm:text-sm font-semibold text-slate-200 mr-1 truncate hidden sm:block">
					Image Markup Editor
				</span>

				<div className="flex items-center gap-2 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] sm:text-xs text-slate-400 tabular-nums flex-shrink-0">
					<span>
						{outputW} × {outputH}
					</span>
				</div>

				<div className="flex-1" />

				{/* Undo / Redo */}
				<button
					onClick={handleUndo}
					disabled={!canUndo}
					title="Undo (Ctrl+Z)"
					className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:bg-white/10 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
				>
					<Undo2 className="w-3.5 h-3.5" />
					<span className="hidden md:inline">Undo</span>
				</button>

				<button
					onClick={handleRedo}
					disabled={!canRedo}
					title="Redo (Ctrl+Y)"
					className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:bg-white/10 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
				>
					<Redo2 className="w-3.5 h-3.5" />
					<span className="hidden md:inline">Redo</span>
				</button>

				<button
					onClick={handleClear}
					title="Clear all annotations"
					className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:bg-white/10 hover:text-slate-200 transition-all"
				>
					<Trash2 className="w-3.5 h-3.5" />
					<span className="hidden md:inline">Clear</span>
				</button>

				<button
					onClick={handleDownload}
					title="Download annotated image as PNG"
					className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium transition-all"
				>
					<Download className="w-3.5 h-3.5" />
					<span className="hidden sm:inline">Download</span>
				</button>

				<button
					onClick={handleUseInChat}
					disabled={isUploading}
					title="Upload and add to chat"
					className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-xs font-medium shadow-md shadow-orange-500/30 disabled:opacity-50 transition-all flex-shrink-0"
				>
					{isUploading ? (
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
					) : (
						<MessageSquarePlus className="w-3.5 h-3.5" />
					)}
					<span className="hidden sm:inline">
						{isUploading ? "Uploading…" : "Use in Chat"}
					</span>
				</button>
			</div>

			{/* ── Main area ── */}
			<div className="flex flex-1 min-h-0 overflow-hidden">
				{/* Canvas area */}
				<div
					ref={containerRef}
					className="flex-1 flex items-center justify-center p-2 sm:p-4 overflow-hidden"
					style={{
						position: "relative",
						backgroundImage:
							"linear-gradient(45deg,#1c1c20 25%,transparent 25%)," +
							"linear-gradient(-45deg,#1c1c20 25%,transparent 25%)," +
							"linear-gradient(45deg,transparent 75%,#1c1c20 75%)," +
							"linear-gradient(-45deg,transparent 75%,#1c1c20 75%)",
						backgroundSize: "16px 16px",
						backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
					}}
				>
					{showStage ? (
						<div
							style={{
								position: "relative",
								width: stageW,
								height: stageH,
								boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
							}}
						>
							<Stage
								ref={stageRef}
								width={stageW}
								height={stageH}
								style={{ cursor, display: "block" }}
								onMouseDown={handlePointerDown}
								onMouseMove={handlePointerMove}
								onMouseUp={handlePointerUp}
								onMouseLeave={handlePointerUp}
								onTouchStart={handlePointerDown}
								onTouchMove={handlePointerMove}
								onTouchEnd={handlePointerUp}
							>
								<Layer listening={false}>
									{konvaImage && (
										<KonvaImage
											image={konvaImage}
											x={0}
											y={0}
											width={stageW}
											height={stageH}
										/>
									)}
								</Layer>

								<Layer>
									{shapes.map(renderShape)}
									{liveShapeRef.current &&
										renderShape(liveShapeRef.current)}
									{textElements.map((el) => (
										<KonvaTextElement
											key={el.id}
											el={el}
											isSelected={
												selectedTextId === el.id
											}
											isEditing={editingTextId === el.id}
											onSelect={handleTextSelect}
											onDoubleClick={
												handleTextDoubleClick
											}
											onChange={handleTextChange}
										/>
									))}
								</Layer>
							</Stage>

							{/* Inline text editing overlay */}
							{editingElement &&
								(() => {
									const el = editingElement;
									const fs = el.fontSize;
									return (
										<textarea
											ref={editingOverlayRef}
											value={editingValue}
											rows={1}
											onChange={(e) => {
												setEditingValue(e.target.value);
												e.target.style.height = "auto";
												e.target.style.height = `${e.target.scrollHeight}px`;
											}}
											onKeyDown={(e) => {
												if (e.key === "Escape") {
													setEditingTextId(null);
													setEditingValue("");
												}
												if (
													e.key === "Enter" &&
													!e.shiftKey
												) {
													e.preventDefault();
													commitTextEdit();
												}
											}}
											onBlur={() => commitTextEdit()}
											style={{
												position: "absolute",
												left: el.x,
												top: el.y,
												width: el.width,
												fontSize: fs,
												fontWeight:
													el.fontStyle.includes(
														"bold",
													)
														? "bold"
														: "normal",
												fontStyle:
													el.fontStyle.includes(
														"italic",
													)
														? "italic"
														: "normal",
												textAlign: el.align,
												color: el.color,
												caretColor: el.color,
												lineHeight: 1.2,
												background: "rgba(0,0,0,0.15)",
												border: "1.5px solid #3b82f6",
												borderRadius: 2,
												outline: "none",
												padding: "2px 4px",
												margin: 0,
												resize: "none",
												overflow: "hidden",
												zIndex: 10,
												transform: `rotate(${el.rotation}deg)`,
												transformOrigin: "top left",
												opacity: 1,
												cursor: "text",
											}}
										/>
									);
								})()}
						</div>
					) : (
						<div className="flex items-center justify-center w-full h-full text-slate-600 text-sm">
							{initialImageUrl ? (
								<div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
							) : (
								"No image loaded"
							)}
						</div>
					)}
				</div>

				{/* ── Desktop right panel (hidden on mobile) ── */}
				<div className="hidden md:flex w-52 flex-shrink-0 bg-[#18181c] border-l border-white/10 overflow-y-auto flex-col gap-5 p-4">
					<PanelSection title="Tools">{ToolsPanel}</PanelSection>
					{isTextTool && (
						<PanelSection title="Text">{TextPanel}</PanelSection>
					)}
					<PanelSection title="Color">{ColorPanel}</PanelSection>
					{SizePanel && (
						<PanelSection title="Size">{SizePanel}</PanelSection>
					)}
					<PanelSection title="Opacity">{OpacityPanel}</PanelSection>
				</div>
			</div>

			{/* ── Mobile bottom toolbar ── */}
			<div className="md:hidden flex-shrink-0 bg-[#18181c] border-t border-white/10">
				{/* Scrollable tool row */}
				<div className="flex items-center gap-1 px-2 py-2 overflow-x-auto scrollbar-none">
					{TOOLS.map(({ id, Icon, label }) => (
						<button
							key={id}
							onClick={() => {
								setActiveTool(id);
								if (id !== "text") {
									setSelectedTextId(null);
									setEditingTextId(null);
								}
							}}
							title={label}
							className={cn(
								"flex-shrink-0 flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all",
								activeTool === id
									? "bg-orange-500 text-white"
									: "bg-white/5 text-slate-400",
							)}
						>
							<Icon className="w-4 h-4" />
							<span>{label}</span>
						</button>
					))}

					{/* Divider */}
					<div className="w-px h-8 bg-white/10 mx-1 flex-shrink-0" />

					{/* Color quick-pick */}
					{COLOR_SWATCHES.slice(0, 6).map((c) => (
						<button
							key={c}
							onClick={() => {
								setBrushColor(c);
								if (isTextTool && selectedTextId)
									applyTextStyle({ color: c });
							}}
							style={{ backgroundColor: c }}
							className={cn(
								"flex-shrink-0 w-6 h-6 rounded-full border-2 transition-all",
								brushColor === c
									? "border-white"
									: "border-transparent",
							)}
						/>
					))}

					{/* Custom color */}
					<label className="flex-shrink-0 cursor-pointer">
						<div
							className="w-6 h-6 rounded-full border-2 border-dashed border-white/30"
							style={{ backgroundColor: customColor }}
						/>
						<input
							type="color"
							value={customColor}
							onChange={(e) => {
								setCustomColor(e.target.value);
								setBrushColor(e.target.value);
								if (isTextTool && selectedTextId)
									applyTextStyle({ color: e.target.value });
							}}
							className="sr-only"
						/>
					</label>

					{/* Options toggle */}
					<div className="w-px h-8 bg-white/10 mx-1 flex-shrink-0" />
					<button
						onClick={() => setMobileOptionsOpen((v) => !v)}
						className={cn(
							"flex-shrink-0 flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all",
							mobileOptionsOpen
								? "bg-white/15 text-white"
								: "bg-white/5 text-slate-400",
						)}
					>
						<Settings2 className="w-4 h-4" />
						<span>Options</span>
					</button>
				</div>

				{/* Expandable options panel */}
				{mobileOptionsOpen && (
					<div className="border-t border-white/10 px-4 py-3 space-y-3 max-h-56 overflow-y-auto">
						{/* Size slider */}
						{!isTextTool && (
							<div>
								<div className="flex items-center justify-between mb-1">
									<span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
										Size
									</span>
									<span className="text-[11px] text-slate-400 tabular-nums">
										{brushSize}
									</span>
								</div>
								<input
									type="range"
									min={1}
									max={40}
									value={brushSize}
									onChange={(e) =>
										setBrushSize(Number(e.target.value))
									}
									className="w-full accent-orange-500"
								/>
							</div>
						)}

						{/* Opacity slider */}
						<div>
							<div className="flex items-center justify-between mb-1">
								<span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
									Opacity
								</span>
								<span className="text-[11px] text-slate-400 tabular-nums">
									{opacity}
								</span>
							</div>
							<input
								type="range"
								min={10}
								max={100}
								value={opacity}
								onChange={(e) => {
									const v = Number(e.target.value);
									setOpacity(v);
									if (isTextTool && selectedTextId)
										applyTextStyle({ opacity: v / 100 });
								}}
								className="w-full accent-orange-500"
							/>
						</div>

						{/* Text controls for mobile */}
						{isTextTool && (
							<div>
								<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
									Text
								</p>
								<div className="flex items-center gap-2 flex-wrap">
									<div className="flex items-center gap-1.5">
										<span className="text-[11px] text-slate-400">
											Size
										</span>
										<input
											type="number"
											min={8}
											max={200}
											value={textFontSize}
											onChange={(e) => {
												const v = Math.max(
													8,
													Math.min(
														200,
														Number(e.target.value),
													),
												);
												setTextFontSize(v);
												if (selectedTextId)
													applyTextStyle({
														fontSize: v,
													});
											}}
											className="w-14 bg-white/5 border border-white/10 rounded text-[11px] text-slate-300 px-1.5 py-0.5 text-right"
										/>
									</div>
									{[
										{
											icon: (
												<Bold className="w-3.5 h-3.5" />
											),
											active: textBold,
											onClick: () => {
												const next = !textBold;
												setTextBold(next);
												if (selectedTextId)
													applyTextStyle({
														fontStyle:
															makeFontStyle(
																next,
																textItalic,
															),
													});
											},
											title: "Bold",
										},
										{
											icon: (
												<Italic className="w-3.5 h-3.5" />
											),
											active: textItalic,
											onClick: () => {
												const next = !textItalic;
												setTextItalic(next);
												if (selectedTextId)
													applyTextStyle({
														fontStyle:
															makeFontStyle(
																textBold,
																next,
															),
													});
											},
											title: "Italic",
										},
									].map((btn, i) => (
										<button
											key={i}
											onClick={btn.onClick}
											title={btn.title}
											className={cn(
												"flex items-center justify-center w-8 h-8 rounded transition-all",
												btn.active
													? "bg-orange-500 text-white"
													: "bg-white/5 text-slate-400",
											)}
										>
											{btn.icon}
										</button>
									))}
									{selectedTextId && (
										<button
											onClick={deleteSelectedText}
											className="flex items-center gap-1 px-2 py-1.5 rounded bg-red-500/20 text-red-400 text-[11px]"
										>
											<Trash2 className="w-3 h-3" />
											Delete
										</button>
									)}
								</div>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
