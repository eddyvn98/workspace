export type InlineShortcut = "bold" | "italic" | "underline" | "strikethrough";

const INLINE_MARKERS: Record<InlineShortcut, readonly [string, string]> = {
  bold: ["**", "**"],
  italic: ["*", "*"],
  underline: ["++", "++"],
  strikethrough: ["~~", "~~"],
};

export interface MarkdownSelectionResult {
  value: string;
  start: number;
  end: number;
}

/** Indent the selected lines using the same tab/untab rule as the legacy
 * node editor. A collapsed selection on a list line indents that line; a
 * plain collapsed selection inserts a literal tab at the caret. */
export function indentMarkdownSelection(value: string, start: number, end: number, unindent: boolean): MarkdownSelectionResult {
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const selectedEnd = Math.max(end, start);
  const lines = value.slice(lineStart, selectedEnd).split("\n");
  let removed = 0;
  const nextLines = lines.map((line) => {
    if (!unindent) return `\t${line}`;
    const match = line.match(/^(?:\t| {1,2})/);
    if (!match) return line;
    removed += match[0].length;
    return line.slice(match[0].length);
  });
  return {
    value: `${value.slice(0, lineStart)}${nextLines.join("\n")}${value.slice(selectedEnd)}`,
    start: Math.max(lineStart, start + (unindent ? -Math.min(removed, start - lineStart) : 1)),
    end: Math.max(lineStart, end + (unindent ? -removed : lines.length)),
  };
}

export function toggleInlineMarkdown(
  value: string,
  style: InlineShortcut,
  start: number,
  end: number,
): MarkdownSelectionResult | null {
  if (start === end) return null;
  const [open, close] = INLINE_MARKERS[style];
  const wrapped = value.slice(Math.max(0, start - open.length), start) === open
    && value.slice(end, end + close.length) === close;
  if (wrapped) {
    return {
      value: `${value.slice(0, start - open.length)}${value.slice(start, end)}${value.slice(end + close.length)}`,
      start: start - open.length,
      end: end - open.length,
    };
  }
  return {
    value: `${value.slice(0, start)}${open}${value.slice(start, end)}${close}${value.slice(end)}`,
    start: start + open.length,
    end: end + open.length,
  };
}

const NUMBERED_LINE = /^(\s*)(\d+)([.)])(\s)(.*)$/;

/** Renumbers consecutive numbered-list lines after `fromLineIndex`, matching
 * legacy's renumberFollowingNumberedLines (app/mindmap/components/svg/
 * textSelectionFormatting.ts) — starts from the number on `fromLineIndex`
 * itself and stops at the first non-numbered line. */
function renumberFollowingNumberedLines(value: string, fromLineIndex: number): string {
  const lines = value.split("\n");
  const anchor = lines[fromLineIndex]?.match(NUMBERED_LINE);
  if (!anchor) return value;
  let nextNumber = Number(anchor[2]) + 1;
  for (let index = fromLineIndex + 1; index < lines.length; index += 1) {
    const match = lines[index].match(NUMBERED_LINE);
    if (!match) break;
    lines[index] = `${match[1]}${nextNumber}${match[3]}${match[4]}${match[5]}`;
    nextNumber += 1;
  }
  return lines.join("\n");
}

/**
 * Mirrors legacy's continueStructuredLine (app/mindmap/components/svg/
 * textSelectionFormatting.ts): Enter on a non-empty list line continues the
 * list (incrementing and renumbering a numbered marker instead of repeating
 * the same number); Enter on an already-empty list line exits the list
 * instead of stacking another empty marker underneath it.
 */
export function continueMarkdownList(value: string, start: number, end: number): MarkdownSelectionResult {
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEndIndex = value.indexOf("\n", end);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const line = value.slice(lineStart, lineEnd);
  const match = line.match(/^(\s*)([-*+]\s|>\s|\d+[.)]\s)/);
  if (!match) {
    return {
      value: `${value.slice(0, start)}\n${value.slice(end)}`,
      start: start + 1,
      end: start + 1,
    };
  }
  const [, indent, marker] = match;
  const hasContent = line.slice(match[0].length).trim().length > 0;
  if (!hasContent) {
    return {
      value: `${value.slice(0, lineStart)}${value.slice(lineEnd)}`,
      start: lineStart,
      end: lineStart,
    };
  }
  const numbered = marker.match(/^(\d+)([.)])\s$/);
  const nextPrefix = numbered ? `${indent}${Number(numbered[1]) + 1}${numbered[2]} ` : `${indent}${marker}`;
  const nextValue = `${value.slice(0, start)}\n${nextPrefix}${value.slice(end)}`;
  const caret = start + 1 + nextPrefix.length;
  if (!numbered) return { value: nextValue, start: caret, end: caret };
  const insertedLineIndex = (value.slice(0, start).match(/\n/g) ?? []).length + 1;
  return { value: renumberFollowingNumberedLines(nextValue, insertedLineIndex), start: caret, end: caret };
}

/**
 * Mirrors legacy's deleteEmptyNumberedLine: Backspace at the end of an
 * already-empty numbered-list line (nothing typed after the marker) removes
 * that line instead of just deleting one character, and renumbers whatever
 * numbered lines follow so the sequence stays contiguous. Returns null when
 * the caret isn't in that exact position, so the caller falls back to the
 * textarea's default Backspace behavior.
 */
export function deleteEmptyMarkdownNumberedLine(value: string, start: number, end: number): MarkdownSelectionResult | null {
  if (start !== end) return null;
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEndIndex = value.indexOf("\n", start);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  if (start !== lineEnd) return null;
  const match = value.slice(lineStart, lineEnd).match(NUMBERED_LINE);
  if (!match || match[5].trim()) return null;

  if (lineStart === 0) {
    const next = value.slice(lineEnd < value.length ? lineEnd + 1 : lineEnd);
    return { value: next, start: 0, end: 0 };
  }
  const merged = `${value.slice(0, lineStart - 1)}${value.slice(lineEnd)}`;
  const previousLineIndex = (value.slice(0, lineStart).match(/\n/g) ?? []).length - 1;
  const caret = lineStart - 1;
  return { value: renumberFollowingNumberedLines(merged, previousLineIndex), start: caret, end: caret };
}
