"use client";

import React from "react";

export interface SelectionRectangleProps {
  rect: {
    x: number;
    y: number;
    w: number;
    h: number;
  } | null;
}

export function SelectionRectangle({ rect }: SelectionRectangleProps) {
  if (!rect) return null;

  return (
    <div
      className="fixed pointer-events-none z-50 border border-blue-500 bg-blue-500/20"
      style={{
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.w}px`,
        height: `${rect.h}px`,
      }}
    />
  );
}
