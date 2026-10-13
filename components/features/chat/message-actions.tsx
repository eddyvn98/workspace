"use client";

import { useState, useCallback } from "react";
import { Check, Copy, RotateCcw, RefreshCw, CornerUpLeft, Pencil, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { IMessage } from "@/interface/IMessage";
import type { ImagePayloadInputs } from "@/types/image-generation.types";
import { copyTextToClipboard } from "@/lib/utils/copy-text-to-clipboard";

interface MessageActionsProps {
	message: IMessage;
	messageIndex: number;
	onReuse?: (content: string, images?: string[], generationParams?: ImagePayloadInputs) => void;
	/** Generation params from the following assistant message — used to restore settings on Reuse */
	reuseGenerationParams?: ImagePayloadInputs;
	onRetry?: (messageIndex: number) => void;
	onResume?: (messageIndex: number) => void;
	onRestoreChat?: () => void;
	onEditRequest?: () => void;
	retryMessageIndex?: number;
	canRetry?: boolean;
}

function ActionButton({
	onClick,
	title,
	children,
	className,
}: {
	onClick: () => void;
	title: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={title}
			className={cn(
				"flex items-center gap-1 rounded-md px-1.5 py-0.5",
				"text-gray-400 dark:text-gray-500",
				"hover:text-gray-600 dark:hover:text-gray-300",
				"hover:bg-gray-100 dark:hover:bg-slate-800",
				"transition-colors duration-150",
				className,
			)}
		>
			{children}
		</button>
	);
}

export function MessageActions({
	message,
	onReuse,
	reuseGenerationParams,
	onRetry,
	onEditRequest,
	retryMessageIndex,
}: MessageActionsProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		// The tick is confirmation, so it may only appear when the text really
		// reached the clipboard. `navigator.clipboard` is unavailable on a plain
		// HTTP page and rejects when the tab is not focused or permission is
		// refused — showing the tick regardless told people their text was copied
		// when pasting would give them nothing. The helper falls back to the
		// legacy path and reports whether either one worked; the same fix already
		// landed on the mindmap chat panel's copy button.
		if (await copyTextToClipboard(message.content)) {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	}, [message.content]);

	if (message.isLoading) return null;

	const isUser = message.role === "user";

	return (
		<div
			className={cn(
				"flex items-center gap-0.5 mt-0.5",
				isUser ? "justify-end" : "justify-start",
			)}
		>
			{isUser ? (
				<>
					{/* Edit & Resend — opens inline textarea in the message bubble */}
					{onEditRequest && (
						<ActionButton onClick={onEditRequest} title="Edit & Resend">
							<Pencil size={12} />
						</ActionButton>
					)}
					{/* Retry — immediately resends the original prompt */}
					{onRetry && retryMessageIndex !== undefined && (
						<ActionButton
							onClick={() => onRetry(retryMessageIndex)}
							title="Retry"
						>
							<RotateCcw size={12} />
						</ActionButton>
					)}
					{/* Copy */}
					<ActionButton onClick={handleCopy} title={copied ? "Copied!" : "Copy"}>
						{copied ? (
							<Check size={12} className="text-green-500" />
						) : (
							<Copy size={12} />
						)}
					</ActionButton>
					{/* Reuse — prefills the bottom input for further editing before sending */}
					{onReuse && (
						<ActionButton
							onClick={() => onReuse(message.content, message.images, reuseGenerationParams)}
							title="Reuse"
						>
							<CornerUpLeft size={12} />
						</ActionButton>
					)}
				</>
			) : (
				<>
					{/* Copy */}
					<ActionButton onClick={handleCopy} title={copied ? "Copied!" : "Copy"}>
						{copied ? (
							<Check size={12} className="text-green-500" />
						) : (
							<Copy size={12} />
						)}
					</ActionButton>
				</>
			)}
		</div>
	);
}
