"use client";

import React from "react";

export function renderShapeIcon(shapeValue: string) {
	const val = shapeValue || "rounded";
	return (
		<svg width="24" height="18" viewBox="0 0 28 20" fill="none" className="stroke-current w-5 h-4 flex-shrink-0">
			{val === "text" && <text x="14" y="14" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor" stroke="none">T</text>}
			{val === "rounded" && <rect x="2" y="3" width="24" height="14" rx="3" strokeWidth="1.8" />}
			{val === "rounded_rect" && <rect x="2" y="3" width="24" height="14" rx="1" strokeWidth="1.8" />}
			{val === "pill" && <rect x="2" y="3" width="24" height="14" rx="7" strokeWidth="1.8" />}
			{val === "circle" && <circle cx="14" cy="10" r="7" strokeWidth="1.8" />}
			{val === "oval" && <ellipse cx="14" cy="10" rx="11" ry="6" strokeWidth="1.8" />}
			{val === "underline" && <>
				<text x="14" y="11" textAnchor="middle" fontSize="10" fontWeight="bold" fill="currentColor" stroke="none">A</text>
				<line x1="2" y1="15" x2="26" y2="15" strokeWidth="1.8" />
			</>}
			{val === "diamond" && <polygon points="14,2 26,10 14,18 2,10" strokeWidth="1.8" />}
			{val === "hexagon" && <polygon points="8,2 20,2 26,10 20,18 8,18 2,10" strokeWidth="1.8" />}
			{val === "parallelogram" && <polygon points="6,2 26,2 22,18 2,18" strokeWidth="1.8" />}
			{val === "speech_bubble" && <path d="M 4,2 L 24,2 Q 26,2 26,4 L 26,13 Q 26,15 24,15 L 17,15 L 14,19 L 12,15 L 4,15 Q 2,15 2,13 L 2,4 Q 2,2 4,2 Z" strokeWidth="1.8" />}
			{val === "cylinder" && <>
				<ellipse cx="14" cy="5" rx="11" ry="3" strokeWidth="1.8" />
				<line x1="3" y1="5" x2="3" y2="16" strokeWidth="1.8" />
				<line x1="25" y1="5" x2="25" y2="16" strokeWidth="1.8" />
				<path d="M 3,16 C 3,20 25,20 25,16" strokeWidth="1.8" fill="none" />
			</>}
			{val === "cross" && <polygon points="10,2 18,2 18,6 26,6 26,14 18,14 18,18 10,18 10,14 2,14 2,6 10,6" strokeWidth="1.5" />}
			{val === "cloud_rect" && <path d="M3,17 C1.2,17 0,15.6 0.6,13.9 C1,12.6 2.2,11.7 3.7,11.6 C3.2,8.3 5.6,5.6 8.8,5.6 C9.9,2.6 12.6,0.8 15.7,1.4 C18,1.8 19.8,3.4 20.5,5.6 C24,5.1 26.8,7.8 26.8,11.1 C27.5,11.8 28,12.8 28,13.9 C28,15.7 26.6,17 24.8,17 Z" strokeWidth="1.8" strokeLinejoin="round" />}
		</svg>
	);
}
