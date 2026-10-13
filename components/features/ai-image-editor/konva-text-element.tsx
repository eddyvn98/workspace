"use client";

import React, { useEffect, useRef } from "react";
import { Text as KonvaText, Transformer } from "react-konva";
import Konva from "konva";

export interface TextElement {
	id: string;
	x: number;
	y: number;
	text: string;
	fontSize: number;
	fontStyle: string; // "normal" | "bold" | "italic" | "bold italic"
	align: "left" | "center" | "right";
	color: string;
	rotation: number;
	width: number;
	opacity: number;
}

interface KonvaTextElementProps {
	el: TextElement;
	isSelected: boolean;
	isEditing: boolean;
	onSelect: (id: string) => void;
	onDoubleClick: (id: string) => void;
	onChange: (updated: TextElement) => void;
}

export default function KonvaTextElement({
	el,
	isSelected,
	isEditing,
	onSelect,
	onDoubleClick,
	onChange,
}: KonvaTextElementProps) {
	const textRef = useRef<Konva.Text>(null);
	const trRef = useRef<Konva.Transformer>(null);

	useEffect(() => {
		if (isSelected && !isEditing && trRef.current && textRef.current) {
			trRef.current.nodes([textRef.current]);
			trRef.current.getLayer()?.batchDraw();
		}
	}, [isSelected, isEditing]);

	return (
		<>
			<KonvaText
				ref={textRef}
				x={el.x}
				y={el.y}
				text={el.text}
				fontSize={el.fontSize}
				fontStyle={el.fontStyle}
				align={el.align}
				fill={el.color}
				rotation={el.rotation}
				width={el.width}
				opacity={el.opacity}
				draggable={isSelected && !isEditing}
				visible={!isEditing}
				onMouseDown={(e: any) => {
					e.cancelBubble = true;
					onSelect(el.id);
				}}
				onDblClick={(e: any) => {
					e.cancelBubble = true;
					if (e.target.getStage()) {
						e.target.getStage().container().style.cursor = "default";
					}
					onDoubleClick(el.id);
				}}
				onTap={(e: any) => {
					e.cancelBubble = true;
					onSelect(el.id);
				}}
				onDragEnd={(e: any) => {
					onChange({ ...el, x: e.target.x(), y: e.target.y() });
				}}
				onTransformEnd={() => {
					const node = textRef.current;
					if (!node) return;
					const scaleX = node.scaleX();
					node.scaleX(1);
					node.scaleY(1);
					onChange({
						...el,
						x: node.x(),
						y: node.y(),
						rotation: node.rotation(),
						width: Math.max(20, node.width() * scaleX),
						fontSize: Math.max(8, Math.round(el.fontSize * scaleX)),
					});
				}}
			/>

			{isSelected && !isEditing && (
				<Transformer
					ref={trRef}
					rotateEnabled
					enabledAnchors={[
						"top-left", "top-center", "top-right",
						"middle-left", "middle-right",
						"bottom-left", "bottom-center", "bottom-right",
					]}
					boundBoxFunc={(_: any, newBox: any) => ({
						...newBox,
						width: Math.max(20, newBox.width),
						height: Math.max(10, newBox.height),
					})}
					anchorFill="#ffffff"
					anchorStroke="#3b82f6"
					anchorSize={8}
					anchorCornerRadius={2}
					borderStroke="#3b82f6"
					borderStrokeWidth={1.5}
					rotateAnchorOffset={20}
				/>
			)}
		</>
	);
}
