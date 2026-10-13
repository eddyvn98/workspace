/** Parses delimiter-separated text (CSV/TSV) per RFC 4180: quoted fields may
 * contain delimiters, doubled quotes and embedded newlines. */
export function parseDelimitedText(text: string, delimiter: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let touched = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === "\"" && source[index + 1] === "\"") { field += "\""; index += 1; }
      else if (char === "\"") quoted = false;
      else field += char;
      continue;
    }
    if (char === "\"" && field === "") { quoted = true; touched = true; }
    else if (char === delimiter) { row.push(field); field = ""; touched = true; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      if (touched || field !== "") { row.push(field); rows.push(row); }
      row = []; field = ""; touched = false;
    } else { field += char; touched = true; }
  }
  if (touched || field !== "") { row.push(field); rows.push(row); }
  return rows;
}

function splitPipeRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < trimmed.length; index += 1) {
    if (trimmed[index] === "\\" && trimmed[index + 1] === "|") { current += "|"; index += 1; }
    else if (trimmed[index] === "|") { cells.push(current.trim()); current = ""; }
    else current += trimmed[index];
  }
  cells.push(current.trim());
  return cells;
}

const isDelimiterRow = (line: string) => splitPipeRow(line).every((cell) => /^:?-+:?$/.test(cell));

/** Parses the first GitHub-style pipe table (a header line followed by a `| --- |`
 * delimiter line). Only that delimiter line is dropped; prose before the table and
 * lines after it that lack a pipe are ignored, and data rows made of dashes are kept. */
export function parseMarkdownPipeTable(text: string): string[][] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line, index) => line.includes("|") && index + 1 < lines.length && lines[index + 1].includes("|") && isDelimiterRow(lines[index + 1]));
  if (start < 0) return [];
  const rows = [lines[start]];
  for (let index = start + 2; index < lines.length && lines[index].includes("|"); index += 1) rows.push(lines[index]);
  return rows.map(splitPipeRow).map((cells) => cells.map((cell) => cell.replace(/<br\s*\/?>/gi, "\n")));
}

/** Renders rows as a GitHub-style pipe table (first row is the header). */
export function renderMarkdownPipeTable(rows: string[][]): string {
  if (!rows.length) return "";
  const cols = Math.max(1, ...rows.map((row) => row.length));
  const escape = (value: string) => value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
  const line = (row: string[]) => `| ${Array.from({ length: cols }, (_, col) => escape(row[col] ?? "")).join(" | ")} |`;
  return [line(rows[0]), `| ${Array(cols).fill("---").join(" | ")} |`, ...rows.slice(1).map(line)].join("\n");
}

export type TableImportFormat = "csv" | "tsv" | "markdown";

export function parseTableImportText(format: TableImportFormat, text: string): string[][] {
  if (format === "markdown") return parseMarkdownPipeTable(text);
  return parseDelimitedText(text, format === "tsv" ? "\t" : ",");
}
