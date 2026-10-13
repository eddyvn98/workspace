"use client";

import React from "react";
import Image from "next/image";
import MessageFormatterServer from "./MessageFormatter.server";
import { FILE_EXTENSIONS } from "@/shared/fileExtensions";
import { FileText } from "lucide-react";
import ImageMessage from "@/components/features/image-editor/image-message";
import type { ImagePayloadInputs } from "@/types/image-generation.types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { FileAttachmentCard } from "@/components/features/chat/file-attachment-card";
import type { ImageItem } from "@/components/features/chat/chat-image-thumbnail-strip";


// ─── File block extraction from AI text ───────────────────────────────────────────

const DOC_EXT_PAT = "docx?|pdf|pptx?|xlsx?|md";

const TEXT_FILE_RE = new RegExp(
	`(?:\\[([^\\]]+\\.(?:${DOC_EXT_PAT}))\\]\\([^)\\n]*\\)|([^\\n\\r]+\\.(?:${DOC_EXT_PAT})))\\s*[\\n\\r]+Cloud Link[^\\n\\r]*:[\\s\\S]*?(https?:\\/\\/[^\\s\\n\\r]+)`,
	"gi",
);

function extractFileBlocksFromText(
	text: string,
): { name: string; url: string }[] {
	TEXT_FILE_RE.lastIndex = 0;
	const results: { name: string; url: string }[] = [];
	let m: RegExpExecArray | null;
	while ((m = TEXT_FILE_RE.exec(text)) !== null) {
		const name = (m[1] ?? m[2] ?? "").trim();
		const url = (m[3] ?? "").trim();
		if (name && url) results.push({ name, url });
	}
	return results;
}

// ─── Image extraction ─────────────────────────────────────────────────────────────

const IMAGE_EXT = /\.(jpe?g|png|gif|bmp|webp|svg)(\?[^\s)"]*)?($|\s)/i;

function extractImages(content: string): { urls: string[]; cleaned: string } {
	const urls: string[] = [];

	let cleaned = content.replace(
		/!\[[^\]]*\]\(([^)\s]+)\)/gi,
		(match, url: string) => {
			if (IMAGE_EXT.test(url)) {
				urls.push(url.replace(/\s+$/, ""));
				return "";
			}
			// Not an image URL — leave the markdown-image syntax intact instead
			// of silently deleting it (this used to unconditionally return ""
			// here, which ate any non-image `![label](url)` the model emitted).
			return match;
		},
	);

	cleaned = cleaned.replace(
		/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi,
		(match, url: string) => {
			if (IMAGE_EXT.test(url)) {
				urls.push(url.replace(/\s+$/, ""));
				return "";
			}
			return match;
		},
	);

	cleaned = cleaned.replace(/(https?:\/\/\S+)/gi, (url) => {
		const clean = url.replace(/[),\s]+$/, "");
		if (IMAGE_EXT.test(clean)) {
			urls.push(clean);
			return "";
		}
		return url;
	});

	cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
	return { urls: [...new Set(urls)], cleaned };
}

// ─── Props ──────────────────────────────────────────────────────────────────────────

interface Props {
	content: string;
	isUser?: boolean;
	isImageMode?: boolean;
	files?: { name: string; url: string }[];
	images?: { url: string }[];
	videos?: { url: string }[];
	audios?: { url: string }[];
	isLoading?: boolean;
	generationParams?: ImagePayloadInputs;
	userPrompt?: string;
	referenceImages?: string[];
	messageIndex?: number;
	onRetry?: (index: number) => void;
	onResume?: (index: number) => void;
	onReusePrompt?: (prompt: string, images?: string[], generationParams?: ImagePayloadInputs) => void;
	onOpenLightbox?: (url: string) => void;
	activeImageUrl?: string;
	imageItems?: ImageItem[];
	activeImageIndex?: number | null;
	onSelectActiveIndex?: (index: number) => void;
}

// ─── Helper Component for User Markdown ────────────────────────────────────────────

function UserMarkdown({ content }: { content: string }) {
	return (
		<ReactMarkdown
			remarkPlugins={[remarkGfm, remarkBreaks]}
			components={{
				p: ({ children }: any) => (
					<p className="my-1.5 first:mt-0 last:mb-0 text-[14px] leading-relaxed text-gray-900 dark:text-gray-100 [overflow-wrap:anywhere] break-words min-w-0">
						{children}
					</p>
				),
				strong: ({ children }: any) => (
					<strong className="font-semibold text-gray-900 dark:text-gray-100">
						{children}
					</strong>
				),
				em: ({ children }: any) => (
					<em className="italic text-gray-800 dark:text-gray-200">
						{children}
					</em>
				),
				code: ({ inline, children, className, ...props }: any) => {
					if (!inline) {
						const rawCode = Array.isArray(children)
							? children.join("")
							: String(children);
						return (
							<pre className="mt-2 mb-1 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 p-3 overflow-x-auto text-[12px] max-w-full min-w-0">
								<code className="font-mono text-gray-900 dark:text-gray-100 [overflow-wrap:anywhere] break-all">
									{rawCode}
								</code>
							</pre>
						);
					}
					return (
						<code
							className="px-1.5 py-[2px] rounded bg-gray-200 dark:bg-gray-700 text-[0.85em] font-mono break-all [overflow-wrap:anywhere] text-gray-900 dark:text-gray-100"
							{...props}
						>
							{children}
						</code>
					);
				},
				ul: ({ children }: any) => (
					<ul className="my-1.5 pl-4 list-disc space-y-1 text-gray-900 dark:text-gray-100 min-w-0 max-w-full">
						{children}
					</ul>
				),
				ol: ({ children }: any) => (
					<ol className="my-1.5 pl-4 list-decimal space-y-1 text-gray-900 dark:text-gray-100 min-w-0 max-w-full">
						{children}
					</ol>
				),
				li: ({ children }: any) => (
					<li className="text-[14px] leading-relaxed [overflow-wrap:anywhere] break-words min-w-0">
						{children}
					</li>
				),
				a: ({ href, children }: any) => (
					<a
						href={href}
						target="_blank"
						rel="noopener noreferrer"
						className="text-blue-600 dark:text-blue-400 underline underline-offset-2 decoration-blue-300/70 hover:decoration-blue-500 break-all [overflow-wrap:anywhere]"
					>
						{children}
					</a>
				),
			}}
		>
			{content}
		</ReactMarkdown>
	);
}

// ─── Main Component ─────────────────────────────────────────────────────────────────

export default function MessageFormatter({
	content,
	isUser = false,
	isImageMode = false,
	files = [],
	images = [],
	videos = [],
	audios = [],
	isLoading = false,
	generationParams,
	userPrompt,
	referenceImages = [],
	messageIndex,
	onRetry,
	onResume,
	onReusePrompt,
	onOpenLightbox,
	activeImageUrl,
	imageItems = [],
	activeImageIndex = null,
	onSelectActiveIndex,
}: Props) {
	const [showDetails, setShowDetails] = React.useState(false);

	// ── USER BUBBLE ────────────────────────────────────────────────────────────────────

	if (isUser) {
		const imageFiles = files.filter((f) =>
			FILE_EXTENSIONS.IMAGES.some((ext) =>
				f.name.trim().toLowerCase().endsWith(ext),
			),
		);
		const docFiles = files.filter((f) =>
			FILE_EXTENSIONS.DOCUMENTS.some((ext) =>
				f.name.trim().toLowerCase().endsWith(ext),
			),
		);

		const hasImages = imageFiles.length > 0;
		const hasDocs = docFiles.length > 0;
		const hasUploadedImages = images.length > 0;

		return (
			<div className="flex flex-col items-end gap-1.5 w-full min-w-0 overflow-hidden">
				{/* Attached image files */}
				{hasImages && (
					<div className="flex flex-wrap justify-end gap-2 max-w-full min-w-0">
						{imageFiles.map((file, i) => (
							<div
								key={i}
								className="group relative w-[100px] h-[100px] sm:w-[120px] sm:h-[120px] flex-shrink-0 rounded-2xl overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700 shadow-sm"
							>
								<Image
									src={file.url}
									alt={file.name}
									width={120}
									height={120}
									className="object-cover w-full h-full"
								/>
								<div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-1.5">
									<span className="text-[10px] text-white font-medium leading-tight truncate w-full">
										{file.name}
									</span>
								</div>
							</div>
						))}
					</div>
				)}

				{/* Uploaded inline images */}
				{hasUploadedImages && (
					<div
						className={`flex flex-wrap justify-end gap-2 min-w-0${images.length > 1 ? " max-w-[420px]" : " max-w-full"}`}
					>
						{images.map((image, i) => (
							<div
								key={i}
								className="group relative w-[260px] max-w-full flex-shrink-0 rounded-2xl overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700 shadow-sm"
							>
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img
									src={image.url}
									alt={`Attachment ${i + 1}`}
									className="block w-full h-auto"
								/>
							</div>
						))}
					</div>
				)}

				{/* Uploaded video files */}
				{videos.length > 0 && (
					<div className="flex flex-col items-end gap-2 w-full min-w-0">
						{videos.map((video, i) => (
							<video
								key={i}
								src={video.url}
								controls
								className="w-full max-w-[360px] rounded-2xl border border-gray-200 dark:border-gray-800"
							/>
						))}
					</div>
				)}

				{/* Uploaded audio files */}
				{audios.length > 0 && (
					<div className="flex flex-col items-end gap-2 w-full min-w-0">
						{audios.map((audio, i) => (
							<audio
								key={i}
								src={audio.url}
								controls
								className="w-full max-w-[360px]"
							/>
						))}
					</div>
				)}

				{/* Document chips */}
				{hasDocs && (
					<div className="flex flex-wrap justify-end gap-1.5 max-w-full min-w-0">
						{docFiles.map((file, i) => {
							const ext =
								file.name.split(".").pop()?.toUpperCase() ??
								"FILE";
							const extColors: Record<string, string> = {
								PDF: "bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400",
								DOCX: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400",
								DOC: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400",
								XLSX: "bg-green-50 text-green-600 dark:bg-green-950/60 dark:text-green-400",
								CSV: "bg-green-50 text-green-600 dark:bg-green-950/60 dark:text-green-400",
								TXT: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
							};
							const badgeClass =
								extColors[ext] ??
								"bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";

							return (
								<div
									key={i}
									title={file.name}
									className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700/60 rounded-2xl px-3 py-2 shadow-sm max-w-[220px] min-w-0"
								>
									<div
										className={`flex items-center justify-center w-6 h-6 rounded-lg flex-shrink-0 ${badgeClass}`}
									>
										<FileText className="w-3.5 h-3.5" />
									</div>
									<div className="flex flex-col min-w-0">
										<span className="text-[12px] font-medium truncate text-gray-800 dark:text-gray-200">
											{file.name.replace(/\.[^.]+$/, "")}
										</span>
										<span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-medium">
											{ext}
										</span>
									</div>
								</div>
							);
						})}
					</div>
				)}

				{content && (
					<div
						className="
							w-fit max-w-full min-w-0
							relative isolate z-10
							rounded-[22px] rounded-tr-[6px]
							px-4 py-3
							text-[14px] leading-relaxed
							text-gray-900 dark:text-gray-100
							bg-white dark:bg-gray-800
							border border-gray-300 dark:border-gray-600
							shadow-[0_4px_18px_rgba(0,0,0,0.1)]
							[overflow-wrap:anywhere]
							overflow-hidden
						"
					>
						<UserMarkdown content={content} />
					</div>
				)}
			</div>
		);
	}

	// ── ASSISTANT MESSAGE ──────────────────────────────────────────────────────────────

	// If message_files gave us structured file data, use that; otherwise scan the
	// raw text so the streaming case (where message_files is often absent) works too.
	const allFiles =
		files.length > 0 ? files : extractFileBlocksFromText(content);

	const { urls: imageUrls, cleaned: textContent } = extractImages(content);
	let allImageUrls = [
		...new Set([
			...referenceImages,
			...images.map((img) => img.url),
			...imageUrls,
		]),
	];

	if (isImageMode) {
		// While no history entry is actively selected, don't fall back to
		// rendering every candidate URL (main + reference + inline) at once.
		allImageUrls = activeImageUrl
			? allImageUrls.filter((url) => url === activeImageUrl)
			: [];
	}

	return (
		<div className="w-full min-w-0">
			{allImageUrls.length > 0 && (
				<div className="flex flex-col gap-3 mb-3 w-full min-w-0">
					{allImageUrls.map((url, i) => (
						<div key={isImageMode ? `img-${i}` : `img-${i}-${url}`} className="w-full min-w-0">
							<ImageMessage
								url={url}
								isImageMode={isImageMode}
								generationParams={generationParams}
								userPrompt={userPrompt}
								messageIndex={messageIndex}
								onRetry={onRetry}
								onResume={onResume}
								onReusePrompt={onReusePrompt}
								onOpenLightbox={onOpenLightbox}
								imageItems={imageItems}
								activeImageIndex={activeImageIndex}
								onSelectActiveIndex={onSelectActiveIndex}
							/>
						</div>
					))}
				</div>
			)}
			{/* Render text content and files naturally only when NOT in image mode.
			    The artifact leads and the explanation follows, so a generated-file
			    answer reads as "here's what I made" then "here's what's in it"
			    instead of prose followed by an unrelated-looking card. */}
			{!isImageMode && (textContent || allFiles.length > 0) && (
				<>
					{allFiles.length > 0 && (
						<div
							className={`flex flex-col gap-2${textContent ? " mb-3" : ""}`}
						>
							{allFiles.map((file, i) => (
								<FileAttachmentCard
									key={`ai-file-${i}`}
									fileName={file.name}
									fileUrl={file.url}
								/>
							))}
						</div>
					)}

					{textContent && (
						<MessageFormatterServer
							content={textContent}
							skipFileDetect={allFiles.length > 0}
						/>
					)}
				</>
			)}

			{isLoading && <span className="streaming-cursor" />}
		</div>
	);
}
