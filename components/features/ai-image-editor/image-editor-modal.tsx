"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";

// Konva/react-konva are heavy canvas libs only needed once the editor is
// actually opened — dynamic-import so they don't bundle into every page
// that can render an ImageEditorModal (e.g. the Assistant chat shell).
const AiImageEditor = dynamic(() => import("./ai-image-editor"), {
	ssr: false,
});

interface ImageEditorModalProps {
	isOpen: boolean;
	onClose: () => void;
	imageUrl: string;
}

export default function ImageEditorModal({ isOpen, onClose, imageUrl }: ImageEditorModalProps) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	// ESC key closes the modal
	useEffect(() => {
		if (!isOpen) return;
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [isOpen, onClose]);

	if (!isOpen || !mounted) return null;

	// Portal to document.body so the fixed overlay is in the root stacking
	// context and clears ancestor overflow/transform constraints on mobile Safari.
	return createPortal(
		<div role="dialog" aria-modal="true" className="fixed inset-0 z-[160] flex h-dvh flex-col overflow-hidden bg-[#0f0f12]">
			<AiImageEditor
				key={imageUrl}
				initialImageUrl={imageUrl}
				onClose={onClose}
			/>
		</div>,
		document.body,
	);
}
