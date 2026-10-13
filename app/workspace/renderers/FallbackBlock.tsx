"use client";

import React from "react";
import type { BlockRendererProps } from "./registry";

export const FallbackBlock: React.FC<BlockRendererProps> = ({
  block,
  isSelected,
}) => {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        borderRadius: "6px",
        backgroundColor: "#f8fafc",
        border: isSelected ? "2px solid #ef4444" : "1px dashed #94a3b8",
        padding: "8px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "#64748b",
        fontSize: "12px",
        userSelect: "none",
        textAlign: "center",
      }}
    >
      <span style={{ fontWeight: 600 }}>Unknown block type</span>
      <span style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>
        {String(block?.type ?? "unknown")}
      </span>
    </div>
  );
};
