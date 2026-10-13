import React from "react";
import type { TableCellContent, TableCellRun } from "../../types/table";

interface TableCellContentViewProps {
  content: TableCellContent;
  align: "left" | "center" | "right";
  fontSize: number;
}

function Run({ run }: { run: TableCellRun }) {
  return (
    <span
      style={{
        fontWeight: run.marks?.bold ? 700 : undefined,
        fontStyle: run.marks?.italic ? "italic" : undefined,
        textDecoration: run.marks?.underline ? "underline" : undefined,
        fontSize: run.fontSize ? `${run.fontSize}px` : undefined,
      }}
    >
      {run.text.split("\n").map((part, index) => (
        <React.Fragment key={`${index}-${part}`}>
          {index > 0 && <br />}
          {part}
        </React.Fragment>
      ))}
    </span>
  );
}

export function TableCellContentView({ content, align, fontSize }: TableCellContentViewProps) {
  const blocks = content.blocks.length ? content.blocks : [{ type: "paragraph" as const, runs: [{ text: "" }] }];
  return (
    <div className="h-full w-full whitespace-pre-wrap break-words overflow-hidden px-2 py-1.5" style={{ fontSize: `${fontSize}px`, lineHeight: 1.4 }}>
      {blocks.map((block, index) => (
        <div key={index} style={{ textAlign: block.align ?? align, minHeight: "1.4em" }}>
          {block.runs.map((run, runIndex) => <Run key={runIndex} run={run} />)}
        </div>
      ))}
    </div>
  );
}
