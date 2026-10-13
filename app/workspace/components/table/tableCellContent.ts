import type {
  TableCellAlignment,
  TableCellContent,
  TableCellMarks,
  TableCellRun,
} from "../../types/table";

const ALIGNMENTS: TableCellAlignment[] = ["left", "center", "right"];

export function emptyTableCellContent(): TableCellContent {
  return { version: 1, blocks: [{ type: "paragraph", runs: [{ text: "" }] }] };
}

export function isTableCellContent(value: unknown): value is TableCellContent {
  return Boolean(value && typeof value === "object" && (value as TableCellContent).version === 1 && Array.isArray((value as TableCellContent).blocks));
}

export function textTableCellContent(text: string): TableCellContent {
  return {
    version: 1,
    blocks: text.split("\n").map((line) => ({
      type: "paragraph",
      runs: [{ text: line }],
    })),
  };
}

export function tableCellContentToPlainText(content: TableCellContent): string {
  return content.blocks.map((block) => block.runs.map((run) => run.text).join("")).join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function runStyle(run: TableCellRun): string {
  const styles: string[] = [];
  if (run.marks?.bold) styles.push("font-weight:700");
  if (run.marks?.italic) styles.push("font-style:italic");
  if (run.marks?.underline) styles.push("text-decoration:underline");
  if (run.fontSize && Number.isFinite(run.fontSize)) {
    styles.push(`font-size:${Math.max(8, Math.min(72, run.fontSize))}px`);
  }
  return styles.join(";");
}

export function tableCellContentToHtml(content: TableCellContent): string {
  const blocks = content.blocks.length ? content.blocks : emptyTableCellContent().blocks;
  return blocks
    .map((block) => {
      const align = block.align && ALIGNMENTS.includes(block.align) ? block.align : "left";
      const body = block.runs.length
        ? block.runs
            .map((run) => {
              const style = runStyle(run);
              return `<span${style ? ` style="${style}"` : ""}>${escapeHtml(run.text).replace(/\n/g, "<br>")}</span>`;
            })
            .join("")
        : "<br>";
      return `<div data-table-paragraph="true" style="text-align:${align}">${body || "<br>"}</div>`;
    })
    .join("");
}

function readAlignment(element: HTMLElement): TableCellAlignment | undefined {
  const value = element.style.textAlign as TableCellAlignment;
  return ALIGNMENTS.includes(value) ? value : undefined;
}

function readFontSize(element: HTMLElement): number | undefined {
  const raw = element.style.fontSize || element.getAttribute("size");
  if (!raw) return undefined;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return undefined;
  const size = element.style.fontSize
    ? parsed
    : ({ 1: 10, 2: 12, 3: 14, 4: 16, 5: 18, 6: 24, 7: 32 } as Record<number, number>)[parsed];
  return size ? Math.max(8, Math.min(72, size)) : undefined;
}

function collectRuns(root: Node): TableCellRun[] {
  const runs: TableCellRun[] = [];
  const visit = (node: Node, marks: TableCellMarks, fontSize?: number) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        runs.push({
          text: node.textContent,
          marks: Object.keys(marks).length ? { ...marks } : undefined,
          fontSize,
        });
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const nextMarks = {
      ...marks,
      ...(tag === "strong" || tag === "b" || element.style.fontWeight === "700" || element.style.fontWeight === "bold"
        ? { bold: true }
        : {}),
      ...(tag === "em" || tag === "i" || element.style.fontStyle === "italic" ? { italic: true } : {}),
      ...(tag === "u" || element.style.textDecoration.includes("underline") ? { underline: true } : {}),
    };
    if (tag === "br") {
      runs.push({ text: "\n", marks: Object.keys(nextMarks).length ? nextMarks : undefined, fontSize });
      return;
    }
    const nextSize = readFontSize(element) ?? fontSize;
    Array.from(node.childNodes).forEach((child) => visit(child, nextMarks, nextSize));
  };
  Array.from(root.childNodes).forEach((child) => visit(child, {}));
  return runs;
}

export function htmlToTableCellContent(html: string): TableCellContent {
  if (typeof DOMParser === "undefined") return emptyTableCellContent();
  const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = parsed.body.firstElementChild;
  if (!root) return emptyTableCellContent();
  const blocks = Array.from(root.children).some((element) => ["div", "p"].includes(element.tagName.toLowerCase()))
    ? Array.from(root.childNodes).reduce<TableCellContent["blocks"]>((result, child) => {
        if (child.nodeType === Node.ELEMENT_NODE && ["div", "p"].includes((child as HTMLElement).tagName.toLowerCase())) {
          result.push({ type: "paragraph", align: readAlignment(child as HTMLElement), runs: collectRuns(child) });
        } else {
          const inlineRoot = root.ownerDocument.createElement("div");
          inlineRoot.appendChild(child.cloneNode(true));
          const runs = collectRuns(inlineRoot);
          if (runs.some((run) => run.text.length > 0)) result.push({ type: "paragraph", runs });
        }
        return result;
      }, [])
    : [{ type: "paragraph" as const, align: readAlignment(root as HTMLElement), runs: collectRuns(root) }];
  const hasText = (block: TableCellContent["blocks"][number]) => block.runs.some((run) => run.text.replace(/\n/g, "").length > 0);
  const first = blocks.findIndex(hasText);
  const last = blocks.reduce((index, block, current) => (hasText(block) ? current : index), -1);
  const normalized = first < 0 ? blocks : blocks.slice(first, last + 1);
  return { version: 1, blocks: normalized.length ? normalized : emptyTableCellContent().blocks };
}
